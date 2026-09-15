/**
 * Mermaid erDiagram text for Mongo collections. Entity names are the
 * collection names as `db.collection()` created them; attributes come from
 * the persistence schema when we have it.
 */
import type { CollectionLink, MongoCollection, Schema, SchemaField } from '../types';

export function erEntityId(collection: MongoCollection): string {
	const base = collection.name.replace(/[^A-Za-z0-9_]/g, '_') || 'collection';
	const id = /^[0-9]/.test(base) ? `c_${base}` : base;
	if (
		/^(end|class|click|style|direction|title|graph|subgraph|erDiagram|order|group)$/i.test(id)
	) {
		return `c_${id}`;
	}
	return id;
}

function erFieldName(name: string): string {
	const cleaned = name.replace(/^@/, 'at_').replace(/[^A-Za-z0-9_]/g, '_');
	if (!cleaned) return 'field';
	return /^[0-9]/.test(cleaned) ? `f_${cleaned}` : cleaned;
}

function erFieldType(type: string): string {
	const t = type.replace(/\s+/g, '');
	if (/^Date\b|DateTime/.test(t)) return 'date';
	if (/boolean/i.test(t)) return 'bool';
	if (/^(number|int|float|double|bigint)/i.test(t)) return 'int';
	return 'string';
}

function erLabel(via: string): string {
	const field = via.split(':')[0]?.trim() || via;
	const cleaned = field.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
	return cleaned.slice(0, 40) || 'ref';
}

function cardinality(link: CollectionLink, field: SchemaField | undefined): string {
	if (field && (/\[\]$/.test(field.type) || /Array</.test(field.type))) return '||--o{';
	if (field?.optional) return '||--o|';
	if (link.kind === 'import') return '}o--||';
	if (link.kind === 'type') return '||--o{';
	return '||--||';
}

function attributeLines(fields: SchemaField[], related: CollectionLink[], limit: number): string[] {
	const fkNames = new Set(
		related
			.filter(r => r.kind !== 'same-name')
			.map(r => erFieldName(r.via.split(':')[0] ?? r.via)),
	);
	const lines: string[] = [];
	for (const field of fields.slice(0, limit)) {
		const name = erFieldName(field.name);
		const type = erFieldType(field.type);
		const keys: string[] = [];
		if (name === 'id' || name === '_id') keys.push('PK');
		if (fkNames.has(name)) keys.push('FK');
		lines.push(`    ${type} ${name}${keys.length ? ` ${keys.join(',')}` : ''}`);
	}
	return lines;
}

function uniqueEdges(
	from: MongoCollection,
	related: { link: CollectionLink; target: MongoCollection }[],
	fields: SchemaField[],
): { a: MongoCollection; b: MongoCollection; card: string; label: string }[] {
	const seen = new Set<string>();
	const edges: { a: MongoCollection; b: MongoCollection; card: string; label: string }[] = [];
	for (const { link, target } of related) {
		if (link.kind === 'same-name') continue;
		if (target.id === from.id) continue;
		const key = [from.id, target.id].sort().join('|');
		if (seen.has(key)) continue;
		seen.add(key);
		const fieldName = link.via.split(':')[0]?.trim();
		const field = fields.find(
			f => f.name === fieldName || link.via.toLowerCase().startsWith(f.name.toLowerCase()),
		);
		edges.push({
			a: from,
			b: target,
			card: cardinality(link, field),
			label: erLabel(link.via),
		});
	}
	return edges;
}

/** Neighborhood ERD for one collection: attributes on the focus entity, links to neighbours. */
export function collectionErd(args: {
	focus: MongoCollection;
	related: { link: CollectionLink; target: MongoCollection }[];
	focusFields?: SchemaField[];
	neighborFields?: Map<string, SchemaField[]>;
}): string {
	const { focus, related, focusFields = [], neighborFields = new Map() } = args;
	const inService = related.filter(r => r.link.kind !== 'same-name' && r.target.id !== focus.id);
	const lines = ['erDiagram'];
	const declared = new Set<string>();

	const declare = (collection: MongoCollection, fields: SchemaField[], limit: number) => {
		const id = erEntityId(collection);
		if (declared.has(id)) return;
		declared.add(id);
		const attrs = attributeLines(
			fields,
			collection.related,
			limit,
		);
		if (attrs.length) {
			lines.push(`  ${id} {`);
			lines.push(...attrs);
			lines.push('  }');
		} else {
			lines.push(`  ${id} {`);
			lines.push('    string id PK');
			lines.push('  }');
		}
	};

	declare(focus, focusFields, 18);
	for (const { target } of inService.slice(0, 14)) {
		declare(target, neighborFields.get(target.id) ?? [], 8);
	}

	for (const edge of uniqueEdges(focus, inService, focusFields)) {
		lines.push(
			`  ${erEntityId(edge.a)} ${edge.card} ${erEntityId(edge.b)} : ${edge.label}`,
		);
	}

	return lines.join('\n');
}

/** Service-wide ERD: one box per collection that participates in an in-service link. */
export function serviceErd(collections: MongoCollection[]): string | null {
	const byId = new Map(collections.map(c => [c.id, c]));
	const edges: { a: MongoCollection; b: MongoCollection; card: string; label: string }[] = [];
	const seen = new Set<string>();

	for (const collection of collections) {
		for (const link of collection.related) {
			if (link.kind === 'same-name') continue;
			const target = byId.get(link.collectionId);
			if (!target || target.id === collection.id) continue;
			const key = [collection.id, target.id].sort().join('|');
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push({
				a: collection,
				b: target,
				card: cardinality(link, undefined),
				label: erLabel(link.via),
			});
		}
	}

	if (!edges.length) return null;

	const lines = ['erDiagram'];
	for (const edge of edges) {
		lines.push(
			`  ${erEntityId(edge.a)} ${edge.card} ${erEntityId(edge.b)} : ${edge.label}`,
		);
	}
	return lines.join('\n');
}

export function fieldsFromSchema(schema: Schema | null | undefined): SchemaField[] {
	return schema?.fields ?? [];
}
