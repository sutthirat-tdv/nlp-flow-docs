/**
 * Thin, syntax-only wrappers over the TypeScript compiler API.
 *
 * We deliberately parse without a type checker: these repos are large, we only
 * need decorators, class shapes and identifier names, and a checker would need
 * node_modules for four repos to be installed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

export interface ParsedFile {
	/** Repo relative posix path. */
	path: string;
	absolutePath: string;
	text: string;
	source: ts.SourceFile;
}

export function walkFiles(root: string, predicate: (relPath: string) => boolean): string[] {
	const out: string[] = [];
	const stack = [root];
	while (stack.length) {
		const dir = stack.pop()!;
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry === 'node_modules' || entry === '.git') continue;
			const full = join(dir, entry);
			let st;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				stack.push(full);
			} else if (st.isFile()) {
				const rel = relative(root, full).split(sep).join('/');
				if (predicate(rel)) out.push(rel);
			}
		}
	}
	return out.sort();
}

export function parseFile(root: string, relPath: string): ParsedFile {
	const absolutePath = join(root, relPath);
	const text = readFileSync(absolutePath, 'utf8');
	const source = ts.createSourceFile(relPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	return { path: relPath, absolutePath, text, source };
}

export function lineOf(file: ParsedFile, node: ts.Node): number {
	return file.source.getLineAndCharacterOfPosition(node.getStart(file.source)).line + 1;
}

export function textOf(file: ParsedFile, node: ts.Node | undefined): string {
	if (!node) return '';
	return node.getText(file.source);
}

export interface DecoratorInfo {
	name: string;
	args: string[];
	text: string;
	node: ts.Decorator;
}

export function getDecorators(node: ts.Node, file: ParsedFile): DecoratorInfo[] {
	const decorators = ts.canHaveDecorators(node) ? ts.getDecorators(node) : undefined;
	if (!decorators) return [];
	return decorators.map(decorator => {
		const expr = decorator.expression;
		if (ts.isCallExpression(expr)) {
			return {
				name: textOf(file, expr.expression),
				args: expr.arguments.map(a => textOf(file, a)),
				text: textOf(file, decorator),
				node: decorator,
			};
		}
		return { name: textOf(file, expr), args: [], text: textOf(file, decorator), node: decorator };
	});
}

export function findDecorator(
	node: ts.Node,
	file: ParsedFile,
	...names: string[]
): DecoratorInfo | undefined {
	return getDecorators(node, file).find(d => names.includes(d.name));
}

export function classDeclarations(file: ParsedFile): ts.ClassDeclaration[] {
	return file.source.statements.filter(ts.isClassDeclaration) as ts.ClassDeclaration[];
}

export function exportedClasses(file: ParsedFile): ts.ClassDeclaration[] {
	return classDeclarations(file).filter(c => c.name);
}

export function constructorOf(cls: ts.ClassDeclaration): ts.ConstructorDeclaration | undefined {
	return cls.members.find(ts.isConstructorDeclaration) as ts.ConstructorDeclaration | undefined;
}

export interface CtorParam {
	name: string;
	type: string;
}

export function constructorParams(cls: ts.ClassDeclaration, file: ParsedFile): CtorParam[] {
	const ctor = constructorOf(cls);
	if (!ctor) return [];
	return ctor.parameters
		.map(p => ({
			name: ts.isIdentifier(p.name) ? p.name.text : textOf(file, p.name),
			type: p.type ? textOf(file, p.type) : 'unknown',
		}))
		.filter(p => p.type !== 'unknown' || p.name.length > 0);
}

export function methodsOf(cls: ts.ClassDeclaration): ts.MethodDeclaration[] {
	return cls.members.filter(ts.isMethodDeclaration) as ts.MethodDeclaration[];
}

export function methodName(m: ts.MethodDeclaration, file: ParsedFile): string {
	return ts.isIdentifier(m.name) ? m.name.text : textOf(file, m.name);
}

export function isPublicMethod(m: ts.MethodDeclaration): boolean {
	const mods = ts.getModifiers(m) ?? [];
	return !mods.some(
		mod =>
			mod.kind === ts.SyntaxKind.PrivateKeyword || mod.kind === ts.SyntaxKind.ProtectedKeyword,
	);
}

/** Strips Promise<...>, Array<...> and union `| null` noise from a type string. */
export function unwrapType(typeText: string): string {
	let t = typeText.trim();
	for (let i = 0; i < 4; i++) {
		const m = /^(?:Promise|Array|Observable|Partial|Readonly|Awaited)<([\s\S]*)>$/.exec(t);
		if (!m) break;
		t = m[1].trim();
	}
	t = t
		.split('|')
		.map(s => s.trim())
		.filter(s => s && s !== 'null' && s !== 'undefined' && s !== 'void')
		.join(' | ');
	t = t.replace(/\[\]$/, '');
	return t.trim();
}

/** Every identifier-looking type name inside a type string, for nested schema refs. */
export function typeNamesIn(typeText: string): string[] {
	const names = new Set<string>();
	for (const m of typeText.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
		const name = m[1];
		if (
			[
				'Promise',
				'Array',
				'Record',
				'Partial',
				'Omit',
				'Pick',
				'Date',
				'Map',
				'Set',
				'Observable',
				'Readonly',
				'Buffer',
				'ObjectId',
				'String',
				'Number',
				'Boolean',
				'Object',
				'JSON',
				'Awaited',
				'Required',
				'Exclude',
				'Extract',
				'NonNullable',
				'IntersectionType',
				'PartialType',
				'PickType',
				'OmitType',
			].includes(name)
		) {
			continue;
		}
		names.add(name);
	}
	return [...names];
}

export function leadingComment(file: ParsedFile, node: ts.Node): string | undefined {
	const ranges = ts.getLeadingCommentRanges(file.text, node.getFullStart());
	if (!ranges?.length) return undefined;
	const raw = ranges
		.map(r => file.text.slice(r.pos, r.end))
		.join('\n')
		.replace(/^\/\*\*?|\*\/$/g, '')
		.split('\n')
		.map(l => l.replace(/^\s*\*?\s?/, '').replace(/^\/\/\s?/, ''))
		.join(' ')
		.trim();
	return raw.length > 1 ? raw.slice(0, 400) : undefined;
}

/** All `Enum.MEMBER` style references inside a node's text. */
export function enumReferences(text: string): { enumName: string; member: string }[] {
	const out: { enumName: string; member: string }[] = [];
	for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Z0-9_]{2,})\b/g)) {
		out.push({ enumName: m[1], member: m[2] });
	}
	for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Za-z0-9_]*)\.([A-Z][A-Z0-9_]{2,})\b/g)) {
		out.push({ enumName: `${m[1]}.${m[2]}`, member: m[3] });
	}
	return out;
}

/** `this.somethingUseCase.execute(...)` / `this.manager.doThing(...)` call targets. */
export function thisCalls(text: string): { property: string; method: string }[] {
	const out: { property: string; method: string }[] = [];
	for (const m of text.matchAll(/this\.([A-Za-z0-9_$]+)\s*\.\s*([A-Za-z0-9_$]+)\s*\(/g)) {
		out.push({ property: m[1], method: m[2] });
	}
	return out;
}

export function toTitle(identifier: string): string {
	return identifier
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function kebabToPascal(kebab: string): string {
	return kebab
		.split(/[-_.]/)
		.filter(Boolean)
		.map(p => p.charAt(0).toUpperCase() + p.slice(1))
		.join('');
}

export { ts };
