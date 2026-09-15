/**
 * Step 2 of the pipeline: turn one repository snapshot into catalog entries.
 *
 * The extraction is deliberately convention driven rather than clever. Each of
 * the four services follows the same NestJS layering (controller / consumer ->
 * use case or manager -> repository or Kafka manager), so we read the
 * decorators and constructor signatures that encode that layering and resolve
 * the rest through a repo wide class index.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	CtorParam,
	ParsedFile,
	constructorParams,
	enumReferences,
	exportedClasses,
	findDecorator,
	getDecorators,
	leadingComment,
	lineOf,
	methodName,
	methodsOf,
	parseFile,
	textOf,
	thisCalls,
	toTitle,
	ts,
	typeNamesIn,
	unwrapType,
	walkFiles,
} from './ast.js';
import { DocsConfig, RepoConfig } from './config.js';
import {
	Consumer,
	Dependency,
	DependencyKind,
	Endpoint,
	MongoCollection,
	HttpClient,
	Schema,
	SchemaField,
	SchemaLayer,
	SourceRef,
	UseCase,
} from './model.js';
import { attachCollectionUsage, extractMongoCollections } from './extract-collections.js';
import { attachHttpUsage, extractHttpClients } from './extract-http.js';
import { RepoProvenance } from './sync.js';

const TOPIC_PATTERN = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+){1,5}$/;

const HTTP_METHOD_DECORATORS: Record<string, string> = {
	Get: 'GET',
	Post: 'POST',
	Put: 'PUT',
	Patch: 'PATCH',
	Delete: 'DELETE',
	Head: 'HEAD',
	Options: 'OPTIONS',
	All: 'ANY',
};

/** Path fragment -> downstream system id from repos.config.json. */
const SYSTEM_BY_PATH: [RegExp, string][] = [
	[/\/d03\//, 'd03'],
	[/\/d64\//, 'd64'],
	[/dataSources|\/queries\//, 'd64'],
	[/mongoDb|\.mongo\.repository|infrastructure\/database/, 'mongo'],
	[/redis/i, 'redis'],
	[/eventServiceBus|\/producers?\//, 'kafka'],
	[/\/sap\//, 'sap'],
	[/\/pns\//, 'pns'],
	[/\/ikm\//, 'ikm'],
	[/\/gsso\//, 'gsso'],
	[/\/prc\//, 'prc'],
	[/\/thanos\//, 'thanos'],
	[/\/camara\//, 'camara'],
	[/\/atn\//, 'atn'],
	[/\/ctm\//, 'ctm'],
	[/\/mpay\//, 'mpay'],
	[/\/aaf\//, 'aaf'],
	[/\/ac\//, 'ac'],
	[/esb-gateway/, 'esb-gateway'],
	[/channel-cms/, 'cms'],
	[/\/email\//, 'email'],
	[/\/storage\/|minio/i, 'storage'],
	[/\/openApi\//, 'openapi-master-data'],
	[/\/dt\//, 'd03'],
];

/**
 * Kafka publish call sites. We only trust a topic when it appears inside the
 * argument list of one of these calls, otherwise a class that merely imports a
 * topic enum would look like a publisher.
 */
const PRODUCER_CALL_PATTERN =
	/\.(request|requestMany|publisher|publish|produce|produceMessage|sendKafkaMessage|sendMessage)\s*(?:<[^<>()]*>)?\s*\(/g;

export interface ClassIndexEntry {
	name: string;
	file: string;
	line: number;
	kind: DependencyKind;
	system?: string;
	deps: CtorParam[];
	/** Constructor property name -> injected class name. */
	depsByProp: Map<string, string>;
	/** Method name -> method body text, for call-graph walking. */
	methodText: Map<string, string>;
	/** Public method names, used to describe manager fan-out. */
	methods: string[];
}

/** Substring inside the balanced parentheses that start at `openIndex`. */
function balancedArgs(text: string, openIndex: number): string {
	let depth = 0;
	for (let i = openIndex; i < text.length; i++) {
		const ch = text[i];
		if (ch === '(') depth++;
		else if (ch === ')') {
			depth--;
			if (depth === 0) return text.slice(openIndex + 1, i);
		}
	}
	return text.slice(openIndex + 1, Math.min(text.length, openIndex + 400));
}

/** `this.someHelper(...)` calls on the same class. */
function selfCalls(text: string): string[] {
	return [
		...new Set(
			[...text.matchAll(/this\.([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1]),
		),
	];
}

export interface RepoExtraction {
	repoId: string;
	useCases: UseCase[];
	endpoints: Endpoint[];
	consumers: Consumer[];
	schemas: Schema[];
	collections: MongoCollection[];
	httpClients: HttpClient[];
	/** topic string -> alias metadata */
	topicAliases: Map<string, { enumName: string; member: string; source: SourceRef }[]>;
	classIndex: Map<string, ClassIndexEntry>;
	/** resolved class name -> transitive topics produced */
	classTopics: Map<string, string[]>;
	classSystems: Map<string, string[]>;
	fileCount: number;
	envVars: { name: string; comment?: string }[];
	readme: string | null;
	consumerGroupsByController: Map<string, string[]>;
}

function classifyByPath(file: string, className: string): { kind: DependencyKind; system?: string } {
	const system = SYSTEM_BY_PATH.find(([re]) => re.test(`/${file}`))?.[1];

	if (/\.use-case\.ts$|use-case\.ts$|\.use\.case\.ts$/.test(file) || /UseCase$/.test(className)) {
		return { kind: 'use-case' };
	}
	if (/Manager$/.test(className)) return { kind: 'manager', system };
	if (/Repository$/.test(className)) {
		if (system === 'mongo') return { kind: 'mongo-repository', system };
		return { kind: 'http-repository', system: system ?? 'd03' };
	}
	if (/ProducerService$|RequestReplyService$/.test(className)) {
		return { kind: 'kafka-producer', system: 'kafka' };
	}
	if (/CacheService$|RedisService$/.test(className)) return { kind: 'cache', system: 'redis' };
	if (/Logger|Metric|GracefulShutdown|FlushSummaryLog|MessageContextService/.test(className)) {
		return { kind: 'logging' };
	}
	if (/Service$/.test(className)) return { kind: 'service', system };
	if (/Helper$|Util$|Utils$/.test(className)) return { kind: 'helper' };
	return { kind: 'unknown', system };
}

function sourceRef(repo: RepoConfig, prov: RepoProvenance, file: string, line: number): SourceRef {
	return {
		repoId: repo.id,
		file,
		line,
		url: `${repo.github}/blob/${prov.commit.sha}/${file}#L${line}`,
	};
}

function domainFromPath(repo: RepoConfig, file: string): string {
	const parts = file.split('/');
	// src/domains/<domain>/...
	const domainsIdx = parts.indexOf('domains');
	if (domainsIdx >= 0 && parts[domainsIdx + 1]) return parts[domainsIdx + 1];
	// src/controllers/legacyApi/<feature>/...
	if (parts[1] === 'controllers' && parts[2]) {
		return parts[3] && parts[2] !== 'healthcheck' ? `${parts[2]}/${parts[3]}` : parts[2];
	}
	// src/consumers/<feature>/...
	if (parts[1] === 'consumers' && parts[2]) return parts[2];
	// src/loyaltyManagement/<group>/...
	if (parts[1] === 'loyaltyManagement') {
		const group = parts[2] ?? 'loyaltyManagement';
		if (group === 'externalServices' && parts[3]) return `externalServices/${parts[3]}`;
		return group;
	}
	if (parts[1] === 'infrastructure' && parts[2]) return `infrastructure/${parts[2]}`;
	return parts[1] ?? 'root';
}

function decoratorRules(decorators: string[]): string[] {
	const rules: string[] = [];
	for (const d of decorators) {
		const name = /^@([A-Za-z0-9_]+)/.exec(d)?.[1];
		if (!name) continue;
		const arg = /\(([\s\S]*)\)$/.exec(d)?.[1]?.trim() ?? '';
		switch (name) {
			case 'IsNotEmpty':
				rules.push('required, cannot be empty');
				break;
			case 'IsDefined':
				rules.push('must be present');
				break;
			case 'IsOptional':
				rules.push('optional');
				break;
			case 'IsString':
				rules.push('string');
				break;
			case 'IsNumber':
			case 'IsInt':
				rules.push('number');
				break;
			case 'IsBoolean':
				rules.push('boolean');
				break;
			case 'IsArray':
				rules.push('array');
				break;
			case 'ArrayNotEmpty':
				rules.push('array must not be empty');
				break;
			case 'ArrayUnique':
				rules.push('array items must be unique');
				break;
			case 'IsEmail':
				rules.push('valid email');
				break;
			case 'IsDateString':
				rules.push('ISO date string');
				break;
			case 'IsEnum':
				rules.push(`one of ${arg.split(',')[0] || 'enum'}`);
				break;
			case 'MaxLength':
				rules.push(`max length ${arg.split(',')[0]}`);
				break;
			case 'MinLength':
				rules.push(`min length ${arg.split(',')[0]}`);
				break;
			case 'Length':
				rules.push(`length ${arg}`);
				break;
			case 'Min':
				rules.push(`minimum ${arg.split(',')[0]}`);
				break;
			case 'Max':
				rules.push(`maximum ${arg.split(',')[0]}`);
				break;
			case 'Matches':
				rules.push(`matches ${arg.split(/,(?![^[]*])/)[0]}`);
				break;
			case 'ValidateNested':
				rules.push('nested object is validated');
				break;
			case 'ValidateIf':
				rules.push(`conditionally required when ${arg}`);
				break;
			case 'IsMobilePhone':
			case 'IsPhoneNumber':
				rules.push('phone number');
				break;
			case 'Type':
				break;
			default:
				if (name.startsWith('Is') || name.startsWith('Validate')) rules.push(toTitle(name));
		}
	}
	return [...new Set(rules)];
}

function apiPropertyMeta(decorators: string[]): { description?: string; example?: string; required?: boolean } {
	const api = decorators.find(d => d.startsWith('@ApiProperty') || d.startsWith('@ApiPropertyOptional'));
	if (!api) return {};
	const description = /description:\s*(['"`])([\s\S]*?)\1/.exec(api)?.[2];
	const example = /example:\s*(['"`])([\s\S]*?)\1/.exec(api)?.[2] ?? /example:\s*([^,}\n]+)/.exec(api)?.[1]?.trim();
	const requiredRaw = /required:\s*(true|false)/.exec(api)?.[1];
	return {
		description,
		example: example?.slice(0, 200),
		required: requiredRaw ? requiredRaw === 'true' : undefined,
	};
}

function schemaLayer(file: string, name: string): SchemaLayer {
	if (/\.controller\.dto\.ts$|dtos\/controllers?\//.test(file)) {
		return /Response$/.test(name) ? 'http-response' : 'http-request';
	}
	if (/use-case\.dto\.ts$|dtos\/useCases?\/|useCases?\/dtos\//.test(file)) return 'use-case';
	if (/\.consumer\.dto\.ts$|dtos\/consumers?\//.test(file)) return 'kafka-event';
	if (/\.service\.dto\.ts$|dtos\/services?\//.test(file)) return 'service';
	if (/entities|\.interface\.ts$|persistences|infrastructure\/database/.test(file)) return 'persistence';
	if (/d03|d64|sap|pns|ikm|externals|repositories/.test(file)) return 'downstream';
	if (/manager\.dto|eventServiceBus/.test(file)) return 'kafka-event';
	return 'shared';
}

function isSchemaFile(file: string): boolean {
	if (!file.endsWith('.ts') || file.endsWith('.d.ts')) return false;
	if (/\.spec\.ts$|\.test\.ts$/.test(file)) return false;
	return (
		/\.dto\.ts$/.test(file) ||
		/\/dtos?\//.test(file) ||
		/\.interface\.ts$/.test(file) ||
		/\/entities\//.test(file) ||
		/\/types?\//.test(file) ||
		/\/enums?\//.test(file) ||
		/\.enum\.ts$/.test(file) ||
		/sid\.type\.ts$/.test(file)
	);
}

function isUseCaseFile(file: string): boolean {
	return /(^|\/)[^/]*use[-.]?case\.ts$/.test(file) && !/\.dto\.ts$|\.spec\.ts$/.test(file);
}

export function extractRepo(
	config: DocsConfig,
	repo: RepoConfig,
	prov: RepoProvenance,
	snapshotRoot: string,
): RepoExtraction {
	const srcRoot = resolve(snapshotRoot);
	const files = walkFiles(srcRoot, rel => rel.startsWith('src/') && rel.endsWith('.ts'));
	const parsedCache = new Map<string, ParsedFile>();
	const parse = (rel: string): ParsedFile => {
		let p = parsedCache.get(rel);
		if (!p) {
			p = parseFile(srcRoot, rel);
			parsedCache.set(rel, p);
		}
		return p;
	};

	// ---------------------------------------------------------------- topics
	// enum member -> topic string, keyed both as `Enum.MEMBER` and `MEMBER`
	const enumMemberToTopic = new Map<string, string>();
	const topicAliases = new Map<string, { enumName: string; member: string; source: SourceRef }[]>();

	const registerTopic = (
		topic: string,
		enumName: string,
		member: string,
		file: string,
		line: number,
	) => {
		enumMemberToTopic.set(`${enumName}.${member}`, topic);
		if (!enumMemberToTopic.has(member)) enumMemberToTopic.set(member, topic);
		const list = topicAliases.get(topic) ?? [];
		if (!list.some(a => a.enumName === enumName && a.member === member)) {
			list.push({ enumName, member, source: sourceRef(repo, prov, file, line) });
		}
		topicAliases.set(topic, list);
	};

	const collectEnums = (file: ParsedFile, node: ts.Node, prefix: string[]) => {
		node.forEachChild(child => {
			if (ts.isModuleDeclaration(child) && child.body) {
				const name = ts.isIdentifier(child.name) ? child.name.text : textOf(file, child.name);
				collectEnums(file, child.body, [...prefix, name]);
				return;
			}
			if (ts.isModuleBlock(child)) {
				collectEnums(file, child, prefix);
				return;
			}
			if (ts.isEnumDeclaration(child)) {
				const enumName = child.name.text;
				const qualified = [...prefix, enumName].join('.');
				for (const member of child.members) {
					if (!member.initializer || !ts.isStringLiteral(member.initializer)) continue;
					const value = member.initializer.text;
					if (!TOPIC_PATTERN.test(value)) continue;
					const memberName = ts.isIdentifier(member.name)
						? member.name.text
						: textOf(file, member.name);
					const line = lineOf(file, member);
					registerTopic(value, enumName, memberName, file.path, line);
					if (qualified !== enumName) registerTopic(value, qualified, memberName, file.path, line);
				}
			}
		});
	};

	const enumFiles = new Set<string>([
		...repo.topicEnumFiles.filter(f => existsSync(resolve(srcRoot, f))),
		...files.filter(f => /\.enum\.ts$/.test(f) || /\/enums?\//.test(f)),
	]);
	for (const rel of enumFiles) collectEnums(parse(rel), parse(rel).source, []);

	const resolveTopicFromText = (text: string): string[] => {
		const topics = new Set<string>();
		for (const ref of enumReferences(text)) {
			const topic =
				enumMemberToTopic.get(`${ref.enumName}.${ref.member}`) ??
				enumMemberToTopic.get(ref.member);
			if (topic) topics.add(topic);
		}
		for (const m of text.matchAll(/(['"`])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+){1,5})\1/g)) {
			if (TOPIC_PATTERN.test(m[2]) && /\.(pty|bff|cdc|cmd)\.|^mfaf\.|^esb\.|^sid\./.test(m[2])) {
				topics.add(m[2]);
			}
		}
		return [...topics];
	};

	/** Topics published by the publish call sites inside one chunk of code. */
	const publishedIn = (text: string): string[] => {
		const topics = new Set<string>();
		PRODUCER_CALL_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = PRODUCER_CALL_PATTERN.exec(text))) {
			const open = match.index + match[0].length - 1;
			for (const topic of resolveTopicFromText(balancedArgs(text, open))) topics.add(topic);
		}
		return [...topics];
	};

	// ----------------------------------------------------------- class index
	const classIndex = new Map<string, ClassIndexEntry>();
	for (const rel of files) {
		if (/\.spec\.ts$|\.test\.ts$|\.module\.ts$/.test(rel)) continue;
		const file = parse(rel);
		for (const cls of exportedClasses(file)) {
			const name = cls.name!.text;
			if (classIndex.has(name)) continue;
			const { kind, system } = classifyByPath(rel, name);
			const deps = constructorParams(cls, file);
			const methodText = new Map<string, string>();
			for (const m of methodsOf(cls)) methodText.set(methodName(m, file), textOf(file, m));
			classIndex.set(name, {
				name,
				file: rel,
				line: lineOf(file, cls),
				kind,
				system,
				deps,
				depsByProp: new Map(deps.map(d => [d.name, unwrapType(d.type)])),
				methodText,
				methods: [...methodText.keys()].filter(n => !n.startsWith('_')),
			});
		}
	}

	/**
	 * Walks the actual call graph - `this.dep.method()` and `this.helper()` - to
	 * work out what a single method really publishes and which downstream
	 * systems it really reaches. Attributing per method rather than per class
	 * matters a lot here: shared services such as CampaignService expose dozens
	 * of unrelated methods, and a class level union would claim that every use
	 * case publishes every topic in the repo.
	 */
	interface Reach {
		topics: Set<string>;
		systems: Set<string>;
	}
	const reachCache = new Map<string, Reach>();
	const MAX_CALL_DEPTH = 5;

	const reachOf = (className: string, method: string, depth: number, stack: Set<string>): Reach => {
		const key = `${className}#${method}`;
		const cached = reachCache.get(key);
		if (cached) return cached;
		const result: Reach = { topics: new Set(), systems: new Set() };
		const entry = classIndex.get(className);
		if (!entry || depth > MAX_CALL_DEPTH || stack.has(key)) return result;
		stack.add(key);

		const text = entry.methodText.get(method);
		if (text) {
			for (const t of publishedIn(text)) result.topics.add(t);
			for (const helper of selfCalls(text)) {
				if (helper === method || !entry.methodText.has(helper)) continue;
				const inner = reachOf(className, helper, depth, stack);
				inner.topics.forEach(t => result.topics.add(t));
				inner.systems.forEach(s => result.systems.add(s));
			}
			for (const call of thisCalls(text)) {
				const depClass = entry.depsByProp.get(call.property);
				if (!depClass) continue;
				const depEntry = classIndex.get(depClass);
				if (!depEntry) continue;
				if (depEntry.system) result.systems.add(depEntry.system);
				const inner = reachOf(depClass, call.method, depth + 1, stack);
				inner.topics.forEach(t => result.topics.add(t));
				inner.systems.forEach(s => result.systems.add(s));
			}
		}

		for (const t of result.topics) {
			result.systems.add('kafka');
			if (t.startsWith('mfaf.')) result.systems.add('mfaf');
		}
		stack.delete(key);
		reachCache.set(key, result);
		return result;
	};

	/** Everything a class reaches through any of its public methods. */
	const classTopics = new Map<string, string[]>();
	const classSystems = new Map<string, string[]>();
	for (const [name, entry] of classIndex) {
		const topics = new Set<string>();
		const systems = new Set<string>();
		if (entry.system) systems.add(entry.system);
		for (const method of entry.methodText.keys()) {
			const reach = reachOf(name, method, 0, new Set());
			reach.topics.forEach(t => topics.add(t));
			reach.systems.forEach(s => systems.add(s));
		}
		classTopics.set(name, [...topics]);
		classSystems.set(name, [...systems]);
	}

	const dependencyOf = (param: CtorParam): Dependency => {
		const type = unwrapType(param.type);
		const entry = classIndex.get(type);
		if (!entry) {
			const guess = classifyByPath('', type);
			return { name: param.name, type, kind: guess.kind, system: guess.system };
		}
		return {
			name: param.name,
			type,
			kind: entry.kind,
			system: entry.system,
			targetId: entry.kind === 'use-case' ? `${repo.id}:${type}` : undefined,
		};
	};

	// --------------------------------------------------------------- schemas
	const schemas: Schema[] = [];
	const schemaByName = new Map<string, Schema>();
	const addSchema = (schema: Schema) => {
		if (schemaByName.has(schema.name)) return;
		schemaByName.set(schema.name, schema);
		schemas.push(schema);
	};

	for (const rel of files.filter(isSchemaFile)) {
		const file = parse(rel);
		const layer = schemaLayer(rel, '');
		file.source.forEachChild(node => {
			if (ts.isClassDeclaration(node) && node.name) {
				const name = node.name.text;
				const heritage =
					node.heritageClauses?.flatMap(h => h.types.map(t => textOf(file, t))) ?? [];
				const fields: SchemaField[] = [];
				for (const member of node.members) {
					if (!ts.isPropertyDeclaration(member) || !member.name) continue;
					const fname = ts.isIdentifier(member.name)
						? member.name.text
						: textOf(file, member.name).replace(/['"]/g, '');
					const decorators = getDecorators(member, file).map(d => d.text.replace(/\s+/g, ' '));
					const typeText = member.type ? textOf(file, member.type) : 'unknown';
					const meta = apiPropertyMeta(decorators);
					fields.push({
						name: fname,
						type: typeText.replace(/\s+/g, ' '),
						optional: !!member.questionToken || meta.required === false,
						decorators,
						rules: decoratorRules(decorators),
						description: meta.description,
						example: meta.example,
						refs: typeNamesIn(typeText),
						comment: leadingComment(file, member),
					});
				}
				addSchema({
					id: `${repo.id}:${name}`,
					name,
					repoId: repo.id,
					kind: 'class',
					layer: schemaLayer(rel, name),
					extends: heritage,
					fields,
					source: sourceRef(repo, prov, rel, lineOf(file, node)),
					usedBy: [],
				});
			} else if (ts.isInterfaceDeclaration(node)) {
				const name = node.name.text;
				const fields: SchemaField[] = [];
				for (const member of node.members) {
					if (!ts.isPropertySignature(member) || !member.name) continue;
					const fname = ts.isIdentifier(member.name)
						? member.name.text
						: textOf(file, member.name).replace(/['"]/g, '');
					const typeText = member.type ? textOf(file, member.type) : 'unknown';
					fields.push({
						name: fname,
						type: typeText.replace(/\s+/g, ' '),
						optional: !!member.questionToken,
						decorators: [],
						rules: [],
						refs: typeNamesIn(typeText),
						comment: leadingComment(file, member),
					});
				}
				addSchema({
					id: `${repo.id}:${name}`,
					name,
					repoId: repo.id,
					kind: 'interface',
					layer: schemaLayer(rel, name),
					extends: node.heritageClauses?.flatMap(h => h.types.map(t => textOf(file, t))) ?? [],
					fields,
					source: sourceRef(repo, prov, rel, lineOf(file, node)),
					usedBy: [],
				});
			} else if (ts.isEnumDeclaration(node)) {
				const name = node.name.text;
				addSchema({
					id: `${repo.id}:${name}`,
					name,
					repoId: repo.id,
					kind: 'enum',
					layer: schemaLayer(rel, name),
					extends: [],
					fields: [],
					enumMembers: node.members.map(m => ({
						name: ts.isIdentifier(m.name) ? m.name.text : textOf(file, m.name),
						value: m.initializer ? textOf(file, m.initializer).replace(/['"]/g, '') : '',
					})),
					source: sourceRef(repo, prov, rel, lineOf(file, node)),
					usedBy: [],
				});
			} else if (ts.isTypeAliasDeclaration(node)) {
				const name = node.name.text;
				addSchema({
					id: `${repo.id}:${name}`,
					name,
					repoId: repo.id,
					kind: 'type',
					layer: schemaLayer(rel, name),
					extends: [],
					fields: [],
					typeText: textOf(file, node.type).replace(/\s+/g, ' ').slice(0, 1200),
					source: sourceRef(repo, prov, rel, lineOf(file, node)),
					usedBy: [],
				});
			}
			void layer;
		});
	}

	const schemaIdFor = (typeText: string | null | undefined): string | null => {
		if (!typeText) return null;
		const base = unwrapType(typeText).replace(/\[\]$/, '').trim();
		if (schemaByName.has(base)) return schemaByName.get(base)!.id;
		const first = typeNamesIn(base)[0];
		if (first && schemaByName.has(first)) return schemaByName.get(first)!.id;
		return null;
	};

	// ----------------------------------------------------------- collections
	const collections = extractMongoCollections({
		repo,
		prov,
		files,
		parse,
		schemaIdFor,
		schemaFields: id => (id ? (schemaByName.get(id.split(':')[1] ?? '')?.fields ?? []) : []),
		domainFromPath: file => domainFromPath(repo, file),
	});

	const httpClients = extractHttpClients({
		repo,
		prov,
		files,
		parse,
		domainFromPath: file => domainFromPath(repo, file),
	});

	// ------------------------------------------------------------- use cases
	const useCases: UseCase[] = [];
	const useCaseByClass = new Map<string, UseCase>();

	for (const rel of files.filter(isUseCaseFile)) {
		const file = parse(rel);
		for (const cls of exportedClasses(file)) {
			const className = cls.name!.text;
			const classText = textOf(file, cls);
			const methods = methodsOf(cls);
			const entry =
				methods.find(m => methodName(m, file) === 'execute') ??
				methods.find(m => /^(handle|run|process)$/.test(methodName(m, file))) ??
				methods[0];
			const entryName = entry ? methodName(entry, file) : 'execute';
			const inputType = entry?.parameters[0]?.type
				? textOf(file, entry.parameters[0].type!)
				: null;
			const outputType = entry?.type ? unwrapType(textOf(file, entry.type)) : null;

			const deps = constructorParams(cls, file).map(dependencyOf);
			const reach = reachOf(className, entryName, 0, new Set());
			const closure = { topics: new Set(reach.topics), systems: new Set(reach.systems) };
			// A repository or cache that is injected but only used from a branch we
			// could not resolve is still part of this use case's blast radius.
			for (const dep of deps) {
				if (dep.system && dep.kind !== 'kafka-producer') closure.systems.add(dep.system);
			}

			const errors = [
				...new Set(
					[...classText.matchAll(/throw new ([A-Za-z0-9_]+)\(([\s\S]{0,120}?)\)/g)].map(m =>
						`${m[1]}(${m[2].replace(/\s+/g, ' ').trim().slice(0, 90)})`,
					),
				),
			].slice(0, 12);

			const calls = [
				...new Set(
					thisCalls(classText)
						.map(c => deps.find(d => d.name === c.property)?.type)
						.filter((t): t is string => !!t && /UseCase$|Manager$|Service$/.test(t)),
				),
			];

			const uc: UseCase = {
				id: `${repo.id}:${className}`,
				name: className.replace(/UseCase$/, ''),
				className,
				repoId: repo.id,
				domain: domainFromPath(repo, rel),
				title: toTitle(className.replace(/(Consumer)?UseCase$/, '')),
				source: sourceRef(repo, prov, rel, lineOf(file, cls)),
				loc: classText.split('\n').length,
				entryMethod: entryName,
				inputType: inputType ? inputType.replace(/\s+/g, ' ') : null,
				outputType: outputType || null,
				inputSchemaId: schemaIdFor(inputType),
				outputSchemaId: schemaIdFor(outputType),
				dependencies: deps,
				producesTopics: [...closure.topics].sort(),
				systems: [...closure.systems].sort(),
				invokedBy: [],
				calls,
				collectionAccess: [],
				httpAccess: [],
				errors,
				tags: [],
			};
			useCases.push(uc);
			useCaseByClass.set(className, uc);
		}
	}

	// ------------------------------------------------------------- endpoints
	const endpoints: Endpoint[] = [];
	const controllerFiles = files.filter(
		f => /\.controller\.ts$/.test(f) && !/consumer/i.test(f) && !/\.spec\.ts$/.test(f),
	);

	for (const rel of controllerFiles) {
		const file = parse(rel);
		for (const cls of exportedClasses(file)) {
			const controllerDecorator = findDecorator(cls, file, 'Controller');
			if (!controllerDecorator) continue;
			const arg = controllerDecorator.args[0] ?? '';
			let basePath = '';
			let version: string | null = null;
			if (/^['"`]/.test(arg)) {
				basePath = arg.replace(/['"`]/g, '');
			} else {
				basePath = /path:\s*['"`]([^'"`]*)['"`]/.exec(arg)?.[1] ?? '';
				version = /version:\s*['"`]([^'"`]*)['"`]/.exec(arg)?.[1] ?? null;
			}
			const tags =
				findDecorator(cls, file, 'ApiTags')
					?.args.map(a => a.replace(/['"`]/g, ''))
					.filter(Boolean) ?? [];
			const classGuards =
				findDecorator(cls, file, 'UseGuards')?.args.map(a => a.replace(/\(.*\)/, '')) ?? [];

			const excluded = (repo.apiPrefixExcludes ?? []).some(
				ex => basePath === ex || basePath.startsWith(`${ex}/`),
			);
			const segments = [
				!excluded && repo.apiPrefix ? repo.apiPrefix : '',
				version ? `v${version}` : '',
				basePath,
			].filter(Boolean);

			for (const method of methodsOf(cls)) {
				const decorators = getDecorators(method, file);
				const httpDecorator = decorators.find(d => HTTP_METHOD_DECORATORS[d.name]);
				if (!httpDecorator) continue;
				const routePath = (httpDecorator.args[0] ?? '').replace(/['"`]/g, '');
				const fullPath = `/${[...segments, routePath].filter(Boolean).join('/')}`.replace(
					/\/+/g,
					'/',
				);
				const handler = methodName(method, file);
				const methodText = textOf(file, method);

				const permissions =
					decorators
						.find(d => d.name === 'RequiredPermissions')
						?.args.map(a => a.trim()) ?? [];
				const guards = [
					...classGuards,
					...(decorators.find(d => d.name === 'UseGuards')?.args.map(a => a.replace(/\(.*\)/, '')) ??
						[]),
				];
				const summary =
					/summary:\s*['"`]([^'"`]+)['"`]/.exec(
						decorators.find(d => d.name === 'ApiOperation')?.text ?? '',
					)?.[1] ?? null;

				const requestSchemas: Endpoint['requestSchemas'] = [];
				for (const param of method.parameters) {
					const paramDecorators = getDecorators(param, file);
					const typeText = param.type ? textOf(file, param.type) : '';
					for (const d of paramDecorators) {
						let location: 'body' | 'query' | 'param' | 'header' | null = null;
						if (/^(Body|ValidateBody)$/.test(d.name)) location = 'body';
						else if (/^(Query|ValidateQuery)$/.test(d.name)) location = 'query';
						else if (/^(Param|Params|ValidateParams)$/.test(d.name)) location = 'param';
						else if (/^(Headers|ValidateHeader)$/.test(d.name)) location = 'header';
						if (!location) continue;
						const dtoFromDecorator = d.args[0] && /^[A-Z]/.test(d.args[0]) ? d.args[0] : null;
						const type = (dtoFromDecorator ?? unwrapType(typeText) ?? '').trim();
						if (!type) continue;
						requestSchemas.push({ location, type, schemaId: schemaIdFor(type) });
					}
				}

				const responseSchemas: Endpoint['responseSchemas'] = [];
				for (const d of decorators) {
					if (!/^Api(Response|OkResponse|CreatedResponse|BadRequestResponse|ConflictResponse|NotFoundResponse|UnauthorizedResponse|InternalServerErrorResponse)$/.test(d.name)) {
						continue;
					}
					const text = d.text;
					const type = /type:\s*\[?([A-Za-z0-9_]+)\]?/.exec(text)?.[1];
					if (!type) continue;
					const status =
						/status:\s*HttpStatus\.([A-Z_]+)/.exec(text)?.[1] ??
						d.name.replace(/^Api/, '').replace(/Response$/, '');
					responseSchemas.push({ status, type, schemaId: schemaIdFor(type) });
				}
				if (method.type) {
					const type = unwrapType(textOf(file, method.type));
					if (type && schemaIdFor(type) && !responseSchemas.some(r => r.type === type)) {
						responseSchemas.unshift({ status: 'OK', type, schemaId: schemaIdFor(type) });
					}
				}

				const ctorDeps = constructorParams(cls, file);
				const invokedUseCases = [
					...new Set(
						thisCalls(methodText)
							.map(c => ctorDeps.find(d => d.name === c.property)?.type)
							.map(t => (t ? unwrapType(t) : null))
							.filter((t): t is string => !!t && useCaseByClass.has(t)),
					),
				];

				const id = `${repo.id}:${HTTP_METHOD_DECORATORS[httpDecorator.name]} ${fullPath}#${handler}`;
				endpoints.push({
					id,
					repoId: repo.id,
					domain: domainFromPath(repo, rel),
					method: HTTP_METHOD_DECORATORS[httpDecorator.name],
					path: fullPath,
					controller: cls.name!.text,
					handler,
					summary: summary ?? leadingComment(file, method) ?? null,
					tags,
					permissions,
					guards: [...new Set(guards)],
					auth: guards.length > 0 && !/NoAuth/.test(methodText),
					requestSchemas,
					responseSchemas,
					useCaseIds: invokedUseCases.map(t => `${repo.id}:${t}`),
					source: sourceRef(repo, prov, rel, lineOf(file, method)),
					deprecated: /@deprecated/i.test(textOf(file, method)),
				});
				for (const t of invokedUseCases) useCaseByClass.get(t)?.invokedBy.push(id);
			}
		}
	}

	// ------------------------------------------------------------- consumers
	const consumerGroupsByController = new Map<string, string[]>();
	for (const rel of files.filter(f => /\.module\.ts$/.test(f))) {
		const file = parse(rel);
		const text = file.text;
		for (const m of text.matchAll(
			/const\s+([A-Za-z0-9_]+)(?:Controllers)?\s*[:=][^=]*=\s*\[([\s\S]*?)\]/g,
		)) {
			const groupName = m[1].replace(/Controllers?$/, '');
			for (const c of m[2].matchAll(/([A-Za-z0-9_]+Controller)/g)) {
				const list = consumerGroupsByController.get(c[1]) ?? [];
				if (!list.includes(groupName)) list.push(groupName);
				consumerGroupsByController.set(c[1], list);
			}
		}
	}

	const consumers: Consumer[] = [];
	for (const rel of files) {
		if (/\.spec\.ts$/.test(rel)) continue;
		const file = parse(rel);
		if (!/@EntryPoint\s*\(|@EventPattern\s*\(|@MessagePattern\s*\(/.test(file.text)) continue;
		for (const cls of exportedClasses(file)) {
			const ctorDeps = constructorParams(cls, file);
			for (const method of methodsOf(cls)) {
				const decorators = getDecorators(method, file);
				const entryDecorator = decorators.find(d =>
					['EntryPoint', 'EventPattern', 'MessagePattern'].includes(d.name),
				);
				if (!entryDecorator) continue;
				const topicArg = entryDecorator.args[0] ?? '';
				const topic =
					(/^['"`]/.test(topicArg) ? topicArg.replace(/['"`]/g, '') : null) ??
					resolveTopicFromText(topicArg)[0] ??
					null;
				if (!topic) continue;

				const handler = methodName(method, file);
				const methodText = textOf(file, method);
				const payloadParam = method.parameters.find(p => {
					const ds = getDecorators(p, file).map(d => d.name);
					return ds.some(d => /ToObjectDecorator|Payload|Body/.test(d));
				});
				const payloadType = payloadParam?.type
					? unwrapType(textOf(file, payloadParam.type))
					: null;

				const invokedUseCases = [
					...new Set(
						thisCalls(methodText)
							.map(c => ctorDeps.find(d => d.name === c.property)?.type)
							.map(t => (t ? unwrapType(t) : null))
							.filter((t): t is string => !!t),
					),
				];
				const controllerName = cls.name!.text;
				const id = `${repo.id}:consume ${topic}#${controllerName}.${handler}`;

				// agg-common (and a few handlers elsewhere) call a manager straight
				// from the consumer instead of going through a *.use-case.ts file.
				// Promote those managers into use cases so every flow has a body
				// instead of dead-ending at the consumer.
				const isReplyListener = /publishReply\s*\(/.test(methodText);
				for (const invoked of invokedUseCases) {
					if (useCaseByClass.has(invoked) || isReplyListener) continue;
					if (/RequestReplyService|Logger|Metric/.test(invoked)) continue;
					const entryClass = classIndex.get(invoked);
					if (!entryClass || !/Manager$|Service$/.test(invoked)) continue;
					// Reply plumbing is not business logic.
					if (entryClass.kind === 'kafka-producer' || /RequestReply|Logger|Metric/.test(invoked)) {
						continue;
					}
					const called = thisCalls(methodText).find(
						c => ctorDeps.find(d => d.name === c.property)?.type === invoked,
					);
					const managerReach = called
						? reachOf(invoked, called.method, 0, new Set())
						: {
								topics: new Set(classTopics.get(invoked) ?? []),
								systems: new Set(classSystems.get(invoked) ?? []),
							};
					const uc: UseCase = {
						id: `${repo.id}:${invoked}`,
						name: invoked,
						className: invoked,
						repoId: repo.id,
						domain: domainFromPath(repo, entryClass.file),
						title: toTitle(called?.method ?? invoked.replace(/Manager$|Service$/, '')),
						source: sourceRef(repo, prov, entryClass.file, entryClass.line),
						loc: 0,
						entryMethod: called?.method ?? 'handle',
						inputType: payloadType,
						outputType: null,
						inputSchemaId: schemaIdFor(payloadType),
						outputSchemaId: null,
						dependencies: entryClass.deps.map(dependencyOf),
						producesTopics: [...managerReach.topics].sort(),
						systems: [...managerReach.systems].sort(),
						invokedBy: [],
						calls: entryClass.deps
							.map(d => unwrapType(d.type))
							.filter(d => /Manager$|Service$/.test(d)),
						collectionAccess: [],
						httpAccess: [],
						errors: [],
						tags: ['manager'],
					};
					useCases.push(uc);
					useCaseByClass.set(invoked, uc);
				}

				const resolvedUseCaseIds = invokedUseCases
					.filter(t => useCaseByClass.has(t))
					.map(t => `${repo.id}:${t}`);

				consumers.push({
					id,
					repoId: repo.id,
					domain: domainFromPath(repo, rel),
					topic,
					controller: controllerName,
					handler,
					payloadType,
					payloadSchemaId: schemaIdFor(payloadType),
					useCaseIds: resolvedUseCaseIds,
					consumerGroups: consumerGroupsByController.get(controllerName) ?? [],
					isReplyListener,
					source: sourceRef(repo, prov, rel, lineOf(file, method)),
				});
				for (const t of invokedUseCases) useCaseByClass.get(t)?.invokedBy.push(id);
			}
		}
	}

	attachCollectionUsage(useCases, collections, classIndex);
	attachHttpUsage(useCases, httpClients, classIndex);

	// -------------------------------------------------------------- metadata
	const envVars: { name: string; comment?: string }[] = [];
	const envFile = resolve(snapshotRoot, 'example.env');
	if (existsSync(envFile)) {
		let pendingComment: string | undefined;
		for (const line of readFileSync(envFile, 'utf8').split('\n')) {
			const trimmed = line.trim();
			if (trimmed.startsWith('#')) {
				pendingComment = trimmed.replace(/^#+\s*/, '');
				continue;
			}
			const m = /^([A-Z][A-Z0-9_]*)=/.exec(trimmed);
			if (m) {
				envVars.push({ name: m[1], comment: pendingComment });
				pendingComment = undefined;
			}
		}
	}

	const readmeFile = resolve(snapshotRoot, 'README.md');
	const readme = existsSync(readmeFile)
		? readFileSync(readmeFile, 'utf8').slice(0, 4000)
		: null;

	void config;

	return {
		repoId: repo.id,
		useCases,
		endpoints,
		consumers,
		schemas,
		collections,
		httpClients,
		topicAliases,
		classIndex,
		classTopics,
		classSystems,
		fileCount: files.length,
		envVars,
		readme,
		consumerGroupsByController,
	};
}
