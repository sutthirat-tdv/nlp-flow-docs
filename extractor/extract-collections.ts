/**
 * Mongo collection catalog: names as they are created, repository methods
 * that insert vs query them, and how documents point at other collections.
 *
 * These services use the native driver (`db.collection(...)`), not Mongoose
 * `@Schema`. Collection names live on string constants (`FOO_COLLECTION`) or
 * a `collectionName` property on `*MongoRepository`.
 */
import { posix } from 'node:path';

import {
	ParsedFile,
	constructorOf,
	exportedClasses,
	getDecorators,
	isPublicMethod,
	lineOf,
	methodName,
	methodsOf,
	textOf,
	thisCalls,
	ts,
	typeNamesIn,
	unwrapType,
} from './ast.js';
import { RepoConfig } from './config.js';
import {
	CollectionAccess,
	CollectionColumn,
	CollectionLink,
	CollectionOpKind,
	CollectionOperation,
	MongoCollection,
	SourceRef,
	UseCase,
} from './model.js';
import { RepoProvenance } from './sync.js';

const DRIVER_CALLS = [
	'insertOne',
	'insertMany',
	'findOne',
	'find',
	'updateOne',
	'updateMany',
	'findOneAndUpdate',
	'findOneAndReplace',
	'findOneAndDelete',
	'deleteOne',
	'deleteMany',
	'replaceOne',
	'countDocuments',
	'estimatedDocumentCount',
	'aggregate',
	'bulkWrite',
	'distinct',
] as const;

export interface ClassWalkEntry {
	name: string;
	kind: string;
	file: string;
	depsByProp: Map<string, string>;
	methodText: Map<string, string>;
	methods: string[];
}

export interface ExtractCollectionsArgs {
	repo: RepoConfig;
	prov: RepoProvenance;
	files: string[];
	parse: (rel: string) => ParsedFile;
	schemaIdFor: (typeText: string | null | undefined) => string | null;
	schemaFields: (schemaId: string | null) => { name: string; type: string; refs: string[] }[];
	domainFromPath: (file: string) => string;
}

function sourceRef(repo: RepoConfig, prov: RepoProvenance, file: string, line: number): SourceRef {
	return {
		repoId: repo.id,
		file,
		line,
		url: `${repo.github}/blob/${prov.commit.sha}/${file}#L${line}`,
	};
}

function driverCallsIn(text: string): string[] {
	const found: string[] = [];
	for (const name of DRIVER_CALLS) {
		const re = new RegExp(`\\.${name}\\s*(?:<[^>]*>)?\\s*\\(`);
		if (re.test(text)) found.push(name);
	}
	return found;
}

export function classifyOpKind(method: string, body: string): CollectionOpKind {
	const drivers = driverCallsIn(body);
	if (drivers.includes('insertOne') || drivers.includes('insertMany')) return 'create';
	if (/upsert\s*:\s*true/.test(body) || /upsert/i.test(method)) return 'upsert';
	if (
		drivers.includes('deleteOne') ||
		drivers.includes('deleteMany') ||
		drivers.includes('findOneAndDelete')
	) {
		return 'delete';
	}
	if (
		drivers.includes('updateOne') ||
		drivers.includes('updateMany') ||
		drivers.includes('findOneAndUpdate') ||
		drivers.includes('findOneAndReplace') ||
		drivers.includes('replaceOne') ||
		drivers.includes('bulkWrite')
	) {
		return 'update';
	}
	const n = method.toLowerCase();
	if (/^(create|insert|save)/.test(n)) return 'create';
	if (/upsert/.test(n)) return 'upsert';
	if (/^(delete|remove|purge|destroy|softdelete)/.test(n)) return 'delete';
	if (/^(update|set|patch|replace|increment|decrement|merge|bind|unbind|atomic)/.test(n)) {
		return 'update';
	}
	if (/^(find|get|list|count|query|search|exists|has|lookup|retrieve|load|read|aggregate|cursor)/.test(n)) {
		return 'read';
	}
	if (
		drivers.includes('findOne') ||
		drivers.includes('find') ||
		drivers.includes('countDocuments') ||
		drivers.includes('aggregate') ||
		drivers.includes('distinct')
	) {
		return 'read';
	}
	return 'other';
}

function namedImports(file: ParsedFile): Map<string, string> {
	const map = new Map<string, string>();
	for (const stmt of file.source.statements) {
		if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
		if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const spec = stmt.moduleSpecifier.text;
		const named = stmt.importClause.namedBindings;
		if (named && ts.isNamedImports(named)) {
			for (const el of named.elements) {
				map.set(el.name.text, spec);
			}
		}
	}
	return map;
}

function resolveImport(spec: string, fromRel: string, fileSet: Set<string>): string | null {
	const candidates: string[] = [];
	if (spec.startsWith('.')) {
		candidates.push(posix.normalize(posix.join(posix.dirname(fromRel), spec)));
	} else if (spec.startsWith('~loyalty/')) {
		candidates.push(`src/loyaltyManagement/${spec.slice('~loyalty/'.length)}`);
		candidates.push(`src/loyalty/${spec.slice('~loyalty/'.length)}`);
	} else if (spec.startsWith('~')) {
		candidates.push(`src/${spec.slice(1)}`);
	} else {
		return null;
	}
	for (const raw of candidates) {
		const base = raw.replace(/\\/g, '/').replace(/\.js$/, '');
		for (const ext of ['', '.ts', '/index.ts']) {
			const path = `${base}${ext}`.replace(/\.ts\.ts$/, '.ts');
			if (fileSet.has(path)) return path;
		}
	}
	return null;
}

function stringConstIn(file: ParsedFile, name: string): string | null {
	let found: string | null = null;
	const visit = (node: ts.Node) => {
		if (found) return;
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
			if (node.initializer && ts.isStringLiteral(node.initializer)) {
				found = node.initializer.text;
				return;
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(file.source);
	return found;
}

function resolveNameToString(
	identifier: string,
	file: ParsedFile,
	parse: (rel: string) => ParsedFile,
	fileSet: Set<string>,
): string | null {
	const local = stringConstIn(file, identifier);
	if (local) return local;
	const spec = namedImports(file).get(identifier);
	if (!spec) return null;
	const rel = resolveImport(spec, file.path, fileSet);
	if (!rel) return null;
	try {
		return stringConstIn(parse(rel), identifier);
	} catch {
		return null;
	}
}

function injectToken(param: ts.ParameterDeclaration, file: ParsedFile): string | null {
	const deco = getDecorators(param, file).find(d => d.name === 'Inject');
	if (!deco?.args[0]) return null;
	return deco.args[0].replace(/^['"`]|['"`]$/g, '');
}

function collectionCallArgs(text: string): { entity: string | null; arg: string }[] {
	const out: { entity: string | null; arg: string }[] = [];
	for (const m of text.matchAll(
		/\.collection\s*(?:<\s*([A-Za-z0-9_]+)\s*>)?\s*\(\s*([^)\n]+?)\s*\)/g,
	)) {
		out.push({ entity: m[1] ?? null, arg: m[2].trim() });
	}
	return out;
}

function entityFromCollectionType(text: string): string | null {
	return /Collection\s*<\s*([A-Za-z0-9_]+)\s*>/.exec(text)?.[1] ?? null;
}

function isMongoRepoFile(file: string, className: string): boolean {
	if (/\.spec\.ts$|\.test\.ts$/.test(file)) return false;
	return (
		/\.mongo\.repository\.ts$/.test(file) ||
		(/MongoRepository$/.test(className) && /mongo/i.test(file))
	);
}

function stripRef(name: string): string {
	return name.replace(/(Refs?|Ids?)$/, '');
}

function camel(name: string): string {
	return name.charAt(0).toLowerCase() + name.slice(1);
}

function columnsFor(
	coll: MongoCollection,
	schemaFields: { name: string; type: string; optional?: boolean }[],
): CollectionColumn[] {
	const fkNames = new Set(
		coll.related
			.filter(r => r.kind !== 'same-name')
			.map(r => r.via.split(':')[0]?.trim())
			.filter(Boolean),
	);
	if (schemaFields.length) {
		return schemaFields.map(field => ({
			name: field.name,
			type: unwrapType(field.type).replace(/\s+/g, ' ').slice(0, 48),
			optional: field.optional ?? false,
			pk: field.name === 'id' || field.name === '_id',
			fk:
				fkNames.has(field.name) ||
				[...fkNames].some(via => via === field.name || via.startsWith(`${field.name}:`)),
		}));
	}
	const columns: CollectionColumn[] = [
		{ name: 'id', type: 'string', optional: false, pk: true, fk: false },
	];
	for (const rel of coll.related.filter(r => r.kind !== 'same-name')) {
		const name = rel.via.split(':')[0]?.trim();
		if (!name || columns.some(c => c.name === name)) continue;
		columns.push({ name, type: 'string', optional: true, pk: false, fk: true });
	}
	return columns;
}

export function extractMongoCollections(args: ExtractCollectionsArgs): MongoCollection[] {
	const { repo, prov, files, parse, schemaIdFor, schemaFields, domainFromPath } = args;
	const fileSet = new Set(files);
	const collections: MongoCollection[] = [];

	for (const rel of files) {
		if (!/\.mongo\.repository\.ts$/.test(rel) && !/mongoDb\/.*repositories/.test(rel)) continue;
		if (/\.spec\.ts$|\.test\.ts$/.test(rel)) continue;
		const file = parse(rel);
		for (const cls of exportedClasses(file)) {
			const className = cls.name!.text;
			if (!isMongoRepoFile(rel, className)) continue;
			if (/PurgeData/.test(className)) continue;

			const classText = textOf(file, cls);
			let collectionName: string | null = null;
			let entityName: string | null = entityFromCollectionType(classText);

			for (const member of cls.members) {
				if (!ts.isPropertyDeclaration(member) || !member.name) continue;
				const pname = ts.isIdentifier(member.name) ? member.name.text : textOf(file, member.name);
				if (pname !== 'collectionName' || !member.initializer) continue;
				if (ts.isStringLiteral(member.initializer)) {
					collectionName = member.initializer.text;
				} else if (ts.isIdentifier(member.initializer)) {
					collectionName = resolveNameToString(member.initializer.text, file, parse, fileSet);
				}
			}

			const calls = collectionCallArgs(classText);
			for (const call of calls) {
				if (call.entity && !entityName) entityName = call.entity;
				const arg = call.arg.replace(/\s+/g, ' ');
				if (/^['"`]/.test(arg)) {
					collectionName = collectionName ?? arg.replace(/['"`]/g, '');
				} else if (arg === 'this.collectionName') {
					// already resolved from the property
				} else if (/^[A-Z][A-Z0-9_]+$/.test(arg)) {
					collectionName =
						collectionName ?? resolveNameToString(arg, file, parse, fileSet);
				}
			}

			if (!collectionName) continue;

			let connection: string | null = null;
			const ctor = constructorOf(cls);
			if (ctor) {
				for (const param of ctor.parameters) {
					const typeText = param.type ? textOf(file, param.type) : '';
					if (!/MongoProperty|Db|MongoClient/.test(typeText)) continue;
					connection = injectToken(param, file) ?? connection;
				}
			}

			const operations: CollectionOperation[] = [];
			for (const method of methodsOf(cls)) {
				if (!isPublicMethod(method)) continue;
				const name = methodName(method, file);
				if (name === 'constructor') continue;
				const body = textOf(file, method);
				operations.push({
					name,
					kind: classifyOpKind(name, body),
					driverCalls: driverCallsIn(body),
					source: sourceRef(repo, prov, rel, lineOf(file, method)),
				});
			}

			const importedCollectionConsts: string[] = [];
			for (const [local, spec] of namedImports(file)) {
				if (!/_COLLECTION$/.test(local)) continue;
				const value = resolveNameToString(local, file, parse, fileSet);
				if (value && value !== collectionName) importedCollectionConsts.push(value);
				void spec;
			}

			collections.push({
				id: `${repo.id}:${collectionName}`,
				repoId: repo.id,
				name: collectionName,
				domain: domainFromPath(rel),
				connection,
				repositoryClass: className,
				repositoryFile: rel,
				entityName,
				entitySchemaId: schemaIdFor(entityName),
				operations,
				usedByUseCaseIds: [],
				related: importedCollectionConsts.map(name => ({
					collectionId: `${repo.id}:${name}`,
					via: name,
					kind: 'import' as const,
				})),
				fields: [],
				source: sourceRef(repo, prov, rel, lineOf(file, cls)),
			});
		}
	}

	const byId = new Map(collections.map(c => [c.id, c]));
	const byEntity = new Map<string, MongoCollection>();
	for (const c of collections) {
		if (c.entityName) byEntity.set(c.entityName, c);
	}

	for (const coll of collections) {
		const fields = schemaFields(coll.entitySchemaId);
		for (const field of fields) {
			const typeCandidates = [
				...field.refs,
				...typeNamesIn(field.type),
				stripRef(unwrapType(field.type)),
			];
			for (const typeName of typeCandidates) {
				const target = byEntity.get(typeName) ?? byEntity.get(stripRef(typeName));
				if (!target || target.id === coll.id) continue;
				if (coll.related.some(r => r.collectionId === target.id && r.kind === 'type')) continue;
				coll.related.push({
					collectionId: target.id,
					via: `${field.name}: ${typeName}`,
					kind: 'type',
				});
			}
			const fieldKey = field.name.replace(/Ids?$/, '');
			for (const other of collections) {
				if (other.id === coll.id) continue;
				const nameHit =
					fieldKey === other.name ||
					fieldKey === camel(other.entityName ?? '') ||
					field.name === `${other.name}Id` ||
					field.name === `${camel(other.entityName ?? '')}Id`;
				if (!nameHit) continue;
				if (coll.related.some(r => r.collectionId === other.id)) continue;
				coll.related.push({
					collectionId: other.id,
					via: field.name,
					kind: 'field',
				});
			}
		}

		coll.related = coll.related.filter(r => byId.has(r.collectionId) || r.kind === 'import');
		coll.related = coll.related.filter(r => r.collectionId !== coll.id);
		coll.fields = columnsFor(coll, schemaFields(coll.entitySchemaId));
	}

	const merged = new Map<string, MongoCollection>();
	for (const coll of collections) {
		const existing = merged.get(coll.id);
		if (!existing) {
			merged.set(coll.id, coll);
			continue;
		}
		const opNames = new Set(existing.operations.map(o => o.name));
		for (const op of coll.operations) {
			if (!opNames.has(op.name)) existing.operations.push(op);
		}
		for (const rel of coll.related) {
			if (!existing.related.some(r => r.collectionId === rel.collectionId && r.via === rel.via)) {
				existing.related.push(rel);
			}
		}
		if (!existing.repositoryClass.includes(coll.repositoryClass)) {
			existing.repositoryClass = `${existing.repositoryClass}, ${coll.repositoryClass}`;
		}
		if (!existing.fields.length && coll.fields.length) existing.fields = coll.fields;
	}

	return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * After use cases (including synthetic managers) exist, walk each class's
 * call graph and record which Mongo repository methods actually run.
 */
export function attachCollectionUsage(
	useCases: UseCase[],
	collections: MongoCollection[],
	classIndex: Map<string, ClassWalkEntry>,
): void {
	const byClass = new Map<string, MongoCollection>();
	for (const c of collections) byClass.set(c.repositoryClass, c);

	const kindOf = (coll: MongoCollection, method: string): CollectionOpKind =>
		coll.operations.find(o => o.name === method)?.kind ?? classifyOpKind(method, '');

	const selfCallsIn = (text: string): string[] => [
		...new Set([...text.matchAll(/this\.([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1])),
	];

	const walk = (
		className: string,
		method: string,
		depth: number,
		seen: Set<string>,
		into: Map<string, Map<string, CollectionOpKind>>,
	) => {
		if (depth > 4) return;
		const entry = classIndex.get(className);
		if (!entry) return;
		const key = `${className}#${method}`;
		if (seen.has(key)) return;
		seen.add(key);
		const text = entry.methodText.get(method);
		if (!text) return;
		for (const call of thisCalls(text)) {
			const depType = entry.depsByProp.get(call.property);
			if (!depType) continue;
			const coll = byClass.get(unwrapType(depType));
			if (coll) {
				const ops = into.get(coll.id) ?? new Map();
				ops.set(call.method, kindOf(coll, call.method));
				into.set(coll.id, ops);
				continue;
			}
			walk(unwrapType(depType), call.method, depth + 1, seen, into);
		}
		for (const helper of selfCallsIn(text)) {
			if (entry.methodText.has(helper)) walk(className, helper, depth + 1, seen, into);
		}
	};

	for (const uc of useCases) {
		const into = new Map<string, Map<string, CollectionOpKind>>();
		walk(uc.className, uc.entryMethod, 0, new Set(), into);

		const access: CollectionAccess[] = [...into.entries()].map(([collectionId, ops]) => ({
			collectionId,
			operations: [...ops.entries()].map(([name, kind]) => ({ name, kind })),
		}));
		uc.collectionAccess = access;

		for (const a of access) {
			const coll = collections.find(c => c.id === a.collectionId);
			if (coll && !coll.usedByUseCaseIds.includes(uc.id)) coll.usedByUseCaseIds.push(uc.id);
		}

		for (const dep of uc.dependencies) {
			if (dep.kind !== 'mongo-repository') continue;
			const coll = byClass.get(unwrapType(dep.type));
			if (coll) dep.targetId = coll.id;
		}
	}
}

/**
 * Cross-repo: the BFFs keep local copies of some TMF658 collection names.
 * Link those as "same-name" so a reader can jump between the system of
 * record and the read model.
 */
export function linkSameNameCollections(all: MongoCollection[]): void {
	const byName = new Map<string, MongoCollection[]>();
	for (const c of all) {
		const list = byName.get(c.name) ?? [];
		list.push(c);
		byName.set(c.name, list);
	}
	for (const group of byName.values()) {
		if (group.length < 2) continue;
		for (const a of group) {
			for (const b of group) {
				if (a.id === b.id) continue;
				if (a.related.some(r => r.collectionId === b.id && r.kind === 'same-name')) continue;
				a.related.push({
					collectionId: b.id,
					via: `same collection name in ${b.repoId}`,
					kind: 'same-name',
				});
			}
		}
	}
}
