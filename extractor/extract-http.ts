/**
 * Outbound HTTP catalog: AxiosService (and the D03/PNS/AAF factories that wrap
 * it) as they are actually called — method, path, downstream system, and which
 * use cases reach them.
 *
 * Attribution is the same as Mongo: walk `this.dep.method()` from the use-case
 * entry method, not a class-level union of every repository method.
 */
import { posix } from 'node:path';

import {
	ParsedFile,
	exportedClasses,
	isPublicMethod,
	lineOf,
	methodName,
	methodsOf,
	textOf,
	thisCalls,
	toTitle,
	ts,
	unwrapType,
} from './ast.js';
import { RepoConfig } from './config.js';
import { ClassWalkEntry } from './extract-collections.js';
import {
	HttpAccess,
	HttpClient,
	HttpLink,
	HttpOperation,
	HttpVerb,
	SourceRef,
	UseCase,
} from './model.js';
import { RepoProvenance } from './sync.js';

const SYSTEM_BY_PATH: [RegExp, string][] = [
	[/\/d03\//, 'd03'],
	[/\/d64\//, 'd64'],
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
	[/\/openApi\//, 'openapi-master-data'],
	[/\/aaf\//, 'aaf'],
	[/\/ac\//, 'ac'],
	[/esb-gateway/, 'esb-gateway'],
	[/channel-cms/, 'cms'],
	[/\/email\//, 'email'],
	[/\/dt\//, 'd03'],
];

const SYSTEM_FROM_REF: [RegExp, string][] = [
	[/D03/, 'd03'],
	[/D64/, 'd64'],
	[/SAP/, 'sap'],
	[/PNS/, 'pns'],
	[/IKM/, 'ikm'],
	[/GSSO/, 'gsso'],
	[/PRC/, 'prc'],
	[/THANOS/, 'thanos'],
	[/CAMARA/, 'camara'],
	[/ATN/, 'atn'],
	[/CTM/, 'ctm'],
	[/MPAY|M_PAY/, 'mpay'],
	[/AAF/, 'aaf'],
];

const FACTORY_HTTP = /\bthis\.(getMany|get|post|put|patch|delete)(?![A-Za-z0-9_])\s*(?:<[^>]*>)?\s*\(/g;
const AXIOS_HTTP = /\bthis\.axios\.(get|post|put|patch|delete)(?![A-Za-z0-9_])\s*(?:<[^>]*>)?\s*\(/g;

const WRAPPER_METHODS = new Set([
	'get',
	'getMany',
	'post',
	'put',
	'patch',
	'delete',
	'createUrl',
	'createQueryString',
	'createHeader',
	'createHeaders',
	'createGetObservable',
	'generateRequestId',
	'executeRequest',
]);

export interface ExtractHttpArgs {
	repo: RepoConfig;
	prov: RepoProvenance;
	files: string[];
	parse: (rel: string) => ParsedFile;
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

function namedImports(file: ParsedFile): Map<string, string> {
	const map = new Map<string, string>();
	for (const stmt of file.source.statements) {
		if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
		if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
		const spec = stmt.moduleSpecifier.text;
		if (stmt.importClause.name) map.set(stmt.importClause.name.text, spec);
		const named = stmt.importClause.namedBindings;
		if (named && ts.isNamedImports(named)) {
			for (const el of named.elements) map.set(el.name.text, spec);
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
		if (
			ts.isPropertyAssignment(node) &&
			((ts.isIdentifier(node.name) && node.name.text === name) ||
				(ts.isStringLiteral(node.name) && node.name.text === name)) &&
			ts.isStringLiteral(node.initializer)
		) {
			found = node.initializer.text;
			return;
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

/** Last identifier in `pnsConfig.ENDPOINT.NOTIFICATION_BY_USER_ID` → string in that config file. */
function resolveConfigPath(
	expr: string,
	file: ParsedFile,
	parse: (rel: string) => ParsedFile,
	fileSet: Set<string>,
): string | null {
	const parts = expr.split('.');
	if (parts.length < 2) return null;
	const spec = namedImports(file).get(parts[0]);
	if (!spec) return null;
	const rel = resolveImport(spec, file.path, fileSet);
	if (!rel) return null;
	try {
		const imported = parse(rel);
		for (let i = parts.length - 1; i >= 1; i--) {
			const value = stringConstIn(imported, parts[i]);
			if (value) return value;
		}
	} catch {
		return null;
	}
	return null;
}

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

function splitTop(text: string, sep = ','): string[] {
	const out: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let cur = '';
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote) {
			cur += ch;
			if (ch === quote && text[i - 1] !== '\\') quote = null;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === '`') {
			quote = ch;
			cur += ch;
			continue;
		}
		if ('[({'.includes(ch)) depth++;
		else if ('])}'.includes(ch)) depth = Math.max(0, depth - 1);
		if (ch === sep && depth === 0) {
			out.push(cur.trim());
			cur = '';
		} else {
			cur += ch;
		}
	}
	if (cur.trim()) out.push(cur.trim());
	return out;
}

function verbFromFactory(name: string): HttpVerb {
	if (name === 'getMany' || name === 'get') return 'GET';
	if (name === 'post') return 'POST';
	if (name === 'put') return 'PUT';
	if (name === 'patch') return 'PATCH';
	return 'DELETE';
}

function verbFromAxios(name: string): HttpVerb {
	return name.toUpperCase() as HttpVerb;
}

function isWrapperClass(className: string, file: string): boolean {
	if (className === 'AxiosService') return true;
	if (/MongoRepository$/.test(className)) return true;
	if (/Factory$|FactoryService$|FactoryRepository$/.test(className)) return true;
	if (/\/axios\//.test(file) && /Service$/.test(className)) return true;
	return false;
}

function systemOf(file: string, baseUrlRef: string | null): string {
	const fromPath = SYSTEM_BY_PATH.find(([re]) => re.test(`/${file}`))?.[1];
	if (fromPath) return fromPath;
	const ref = (baseUrlRef ?? '').toUpperCase();
	for (const [re, id] of SYSTEM_FROM_REF) {
		if (re.test(ref)) return id;
	}
	return 'http';
}

function classStringProps(cls: ts.ClassDeclaration, file: ParsedFile): Map<string, string> {
	const props = new Map<string, string>();
	for (const member of cls.members) {
		if (!ts.isPropertyDeclaration(member) || !member.name || !member.initializer) continue;
		const pname = ts.isIdentifier(member.name) ? member.name.text : textOf(file, member.name);
		const init = member.initializer;
		if (ts.isStringLiteral(init)) props.set(pname, init.text);
	}
	return props;
}

function baseUrlRefOf(cls: ts.ClassDeclaration, file: ParsedFile): string | null {
	for (const member of cls.members) {
		if (!ts.isPropertyDeclaration(member) || !member.name || !member.initializer) continue;
		const pname = ts.isIdentifier(member.name) ? member.name.text : textOf(file, member.name);
		if (pname !== 'baseUrl') continue;
		return textOf(file, member.initializer).replace(/\s+/g, ' ').slice(0, 80);
	}
	return null;
}

function usesAxios(cls: ts.ClassDeclaration, file: ParsedFile): boolean {
	const text = textOf(file, cls);
	if (/\bAxiosService\b/.test(text)) return true;
	const heritage = cls.heritageClauses?.map(h => textOf(file, h)).join(' ') ?? '';
	return /Factory|Axios/.test(heritage);
}

function joinPath(parts: string[]): string {
	return parts
		.map(p => p.replace(/^\/+|\/+$/g, ''))
		.filter(p => p && p !== 'undefined')
		.join('/');
}

function fragmentFromExpr(
	expr: string,
	props: Map<string, string>,
	file: ParsedFile,
	parse: (rel: string) => ParsedFile,
	fileSet: Set<string>,
): string {
	expr = expr.trim().replace(/,$/, '');
	if (!expr) return '';

	if ((expr.startsWith("'") || expr.startsWith('"')) && !expr.includes('${')) {
		return expr.slice(1, -1);
	}

	if (expr.startsWith('`')) {
		let t = expr.slice(1, -1);
		t = t.replace(/\$\{this\.baseUrl\}/g, '');
		t = t.replace(/\$\{this\.([A-Za-z0-9_]+)\}/g, (_, p: string) => props.get(p) ?? `{${p}}`);
		t = t.replace(/\$\{[^}]+\}/g, match => {
			const id = /([A-Za-z0-9_]+)\s*\}/.exec(match)?.[1] ?? 'id';
			return `:${id}`;
		});
		return t;
	}

	if (/^this\.([A-Za-z0-9_]+)$/.test(expr)) {
		const p = expr.slice(5);
		return props.get(p) ?? `{${p}}`;
	}

	if (/^[A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)+$/.test(expr) && !expr.startsWith('this.')) {
		return (
			resolveConfigPath(expr, file, parse, fileSet) ??
			resolveNameToString(expr.split('.').pop()!, file, parse, fileSet) ??
			expr.split('.').pop()!
		);
	}

	if (/^this\.[A-Za-z0-9_]+\s*\(/.test(expr)) {
		const arg = /this\.[A-Za-z0-9_]+\s*\(\s*([^)]*)\s*\)/.exec(expr)?.[1]?.trim();
		if (arg && /^[A-Za-z0-9_$.]+$/.test(arg)) return `:${arg.split('.').pop()}`;
		return ':id';
	}

	if (/^[A-Za-z0-9_$.]+$/.test(expr)) {
		const last = expr.split('.').pop()!;
		if (/^[A-Z][A-Z0-9_]+$/.test(last)) {
			return resolveNameToString(last, file, parse, fileSet) ?? last;
		}
		return `:${last}`;
	}

	return ':param';
}

function pathFromArg(
	arg: string,
	props: Map<string, string>,
	methodBody: string,
	helpers: Map<string, string>,
	file: ParsedFile,
	parse: (rel: string) => ParsedFile,
	fileSet: Set<string>,
	depth = 0,
): string {
	if (depth > 4) return ':url';
	arg = arg.trim();
	if (!arg) return '';

	const ident = /^(?:const|let|var)?\s*([A-Za-z0-9_$]+)(?:\.toString\(\))?$/.exec(arg);
	if (ident && !arg.includes('[') && !arg.includes('(') && !arg.includes('`')) {
		const varName = ident[1];
		const assign = new RegExp(
			`(?:const|let|var)\\s+${varName}\\s*=\\s*([^;]+)`,
		).exec(methodBody);
		if (assign) {
			return pathFromArg(assign[1].trim(), props, methodBody, helpers, file, parse, fileSet, depth + 1);
		}
	}

	const createUrl = /^this\.createUrl\s*(?:<[^>]*>)?\s*\(/.exec(arg);
	if (createUrl) {
		const helper = helpers.get('createUrl');
		if (helper) {
			return pathFromArg(
				/return\s+([^;]+)/.exec(helper)?.[1]?.trim() ?? helper,
				props,
				helper,
				helpers,
				file,
				parse,
				fileSet,
				depth + 1,
			);
		}
	}

	const join = /path\.join\s*\(\s*this\.baseUrl\s*,\s*([^)]+)\)/.exec(arg);
	if (join) {
		return pathFromArg(join[1].trim(), props, methodBody, helpers, file, parse, fileSet, depth + 1);
	}

	const newUrl = /new\s+URL\s*\(\s*(?:path\.join\s*\(\s*this\.baseUrl\s*,\s*)?([^)]+)\)/.exec(arg);
	if (newUrl && !arg.startsWith('[')) {
		return pathFromArg(newUrl[1].trim(), props, methodBody, helpers, file, parse, fileSet, depth + 1);
	}

	if (arg.startsWith('[')) {
		const close = arg.lastIndexOf(']');
		const inner = close > 0 ? arg.slice(1, close) : arg.slice(1);
		return joinPath(
			splitTop(inner).map(el =>
				fragmentFromExpr(el, props, file, parse, fileSet),
			),
		);
	}

	return joinPath([fragmentFromExpr(arg, props, file, parse, fileSet)]);
}

function callsIn(
	text: string,
	props: Map<string, string>,
	helpers: Map<string, string>,
	file: ParsedFile,
	parse: (rel: string) => ParsedFile,
	fileSet: Set<string>,
	methodNameForSource: string,
	source: SourceRef,
): HttpOperation[] {
	const out: HttpOperation[] = [];
	const seen = new Set<string>();

	const collect = (re: RegExp, via: HttpOperation['via'], verbOf: (name: string) => HttpVerb) => {
		re.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = re.exec(text))) {
			const open = match.index + match[0].length - 1;
			const args = balancedArgs(text, open);
			const first = splitTop(args)[0] ?? '';
			const httpMethod = verbOf(match[1]);
			const path = pathFromArg(first, props, text, helpers, file, parse, fileSet) || ':url';
			const key = `${httpMethod} ${path}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push({
				name: methodNameForSource,
				httpMethod,
				path,
				via,
				source,
			});
		}
	};

	collect(FACTORY_HTTP, 'factory', verbFromFactory);
	collect(AXIOS_HTTP, 'axios', verbFromAxios);
	return out;
}

function selfCallsIn(text: string): string[] {
	return [...new Set([...text.matchAll(/this\.([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1]))];
}

export function extractHttpClients(args: ExtractHttpArgs): HttpClient[] {
	const { repo, prov, files, parse, domainFromPath } = args;
	const fileSet = new Set(files);
	const clients: HttpClient[] = [];

	for (const rel of files) {
		if (!/\.ts$/.test(rel) || /\.spec\.ts$|\.test\.ts$|\.d\.ts$|\.module\.ts$/.test(rel)) continue;
		if (!/infrastructure|externalServices|sharedModules/.test(rel)) continue;
		const file = parse(rel);
		for (const cls of exportedClasses(file)) {
			const className = cls.name!.text;
			if (isWrapperClass(className, rel)) continue;
			if (!usesAxios(cls, file)) continue;

			const props = classStringProps(cls, file);
			for (const [k, v] of [...props.entries()]) {
				if (!v && /^[A-Z]/.test(k)) {
					const resolved = resolveNameToString(k, file, parse, fileSet);
					if (resolved) props.set(k, resolved);
				}
			}
			// Identifier-initialized string props (endpoint = SOME_CONST).
			for (const member of cls.members) {
				if (!ts.isPropertyDeclaration(member) || !member.name || !member.initializer) continue;
				const pname = ts.isIdentifier(member.name) ? member.name.text : textOf(file, member.name);
				if (props.has(pname)) continue;
				if (ts.isIdentifier(member.initializer)) {
					const value = resolveNameToString(member.initializer.text, file, parse, fileSet);
					if (value) props.set(pname, value);
				}
			}

			const helpers = new Map<string, string>();
			for (const method of methodsOf(cls)) {
				helpers.set(methodName(method, file), textOf(file, method));
			}

			const operations: HttpOperation[] = [];
			for (const method of methodsOf(cls)) {
				if (!isPublicMethod(method)) continue;
				const name = methodName(method, file);
				if (name === 'constructor' || WRAPPER_METHODS.has(name)) continue;
				const seen = new Set<string>();
				const walk = (methodNameWalk: string, depth: number) => {
					if (depth > 3) return;
					const key = `${className}#${methodNameWalk}`;
					if (seen.has(key)) return;
					seen.add(key);
					const body = helpers.get(methodNameWalk);
					if (!body) return;
					const found = callsIn(
						body,
						props,
						helpers,
						file,
						parse,
						fileSet,
						name,
						sourceRef(repo, prov, rel, lineOf(file, method)),
					);
					operations.push(...found);
					for (const helper of selfCallsIn(body)) {
						if (helpers.has(helper) && helper !== methodNameWalk) walk(helper, depth + 1);
					}
				};
				walk(name, 0);
			}

			if (!operations.length) continue;

			const baseUrlRef = baseUrlRefOf(cls, file);
			clients.push({
				id: `${repo.id}:${className}`,
				repoId: repo.id,
				name: toTitle(className.replace(/(Repository|Service|Client)$/, '')),
				className,
				system: systemOf(rel, baseUrlRef),
				domain: domainFromPath(rel),
				baseUrlRef,
				repositoryFile: rel,
				operations,
				usedByUseCaseIds: [],
				related: [],
				source: sourceRef(repo, prov, rel, lineOf(file, cls)),
			});
		}
	}

	return clients.sort((a, b) => a.system.localeCompare(b.system) || a.name.localeCompare(b.name));
}

export function attachHttpUsage(
	useCases: UseCase[],
	clients: HttpClient[],
	classIndex: Map<string, ClassWalkEntry>,
): void {
	const byClass = new Map<string, HttpClient>();
	for (const c of clients) byClass.set(c.className, c);

	const opsOf = (client: HttpClient, method: string): HttpAccess['operations'] =>
		client.operations
			.filter(o => o.name === method)
			.map(o => ({ name: o.name, httpMethod: o.httpMethod, path: o.path }));

	const selfCallNames = (text: string): string[] => [
		...new Set([...text.matchAll(/this\.([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1])),
	];

	const walk = (
		className: string,
		method: string,
		depth: number,
		seen: Set<string>,
		into: Map<string, Map<string, HttpAccess['operations'][number]>>,
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
			const client = byClass.get(unwrapType(depType));
			if (client) {
				const ops = into.get(client.id) ?? new Map();
				for (const op of opsOf(client, call.method)) {
					ops.set(`${op.httpMethod} ${op.path} ${op.name}`, op);
				}
				if (!ops.size) {
					ops.set(call.method, { name: call.method, httpMethod: 'GET', path: '?' });
				}
				into.set(client.id, ops);
				continue;
			}
			walk(unwrapType(depType), call.method, depth + 1, seen, into);
		}
		for (const helper of selfCallNames(text)) {
			if (entry.methodText.has(helper)) walk(className, helper, depth + 1, seen, into);
		}
	};

	for (const uc of useCases) {
		const into = new Map<string, Map<string, HttpAccess['operations'][number]>>();
		walk(uc.className, uc.entryMethod, 0, new Set(), into);

		const access: HttpAccess[] = [...into.entries()].map(([clientId, ops]) => ({
			clientId,
			operations: [...ops.values()],
		}));
		uc.httpAccess = access;

		for (const a of access) {
			const client = clients.find(c => c.id === a.clientId);
			if (client && !client.usedByUseCaseIds.includes(uc.id)) client.usedByUseCaseIds.push(uc.id);
		}

		for (const dep of uc.dependencies) {
			if (dep.kind !== 'http-repository' && dep.kind !== 'service') continue;
			const client = byClass.get(unwrapType(dep.type));
			if (client) dep.targetId = client.id;
		}
	}
}

export function linkSameClientHttp(all: HttpClient[]): void {
	const byClass = new Map<string, HttpClient[]>();
	for (const c of all) {
		const list = byClass.get(c.className) ?? [];
		list.push(c);
		byClass.set(c.className, list);
	}
	for (const group of byClass.values()) {
		if (group.length < 2) continue;
		for (const a of group) {
			for (const b of group) {
				if (a.id === b.id) continue;
				if (a.related.some(r => r.clientId === b.id)) continue;
				a.related.push({
					clientId: b.id,
					via: `same client in ${b.repoId}`,
					kind: 'same-client',
				} satisfies HttpLink);
			}
		}
	}
}
