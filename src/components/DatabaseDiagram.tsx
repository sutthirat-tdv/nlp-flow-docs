/**
 * Physical database diagram: one table card per Mongo collection, columns as
 * rows (PK / FK), lines for document links. Not a mermaid ERD — tables look
 * like a schema tool, grouped by domain so a service's database is readable.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { CollectionColumn, MongoCollection } from '../types';

export interface DiagramEdge {
	from: string;
	to: string;
	label: string;
}

interface Box {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

const FIELD_LIMIT_DEFAULT = 12;

export function DatabaseDiagram({
	collections,
	edges,
	focusId,
	fieldLimit = FIELD_LIMIT_DEFAULT,
}: {
	collections: MongoCollection[];
	edges?: DiagramEdge[];
	focusId?: string;
	fieldLimit?: number;
}) {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [boxes, setBoxes] = useState<Box[]>([]);

	const resolvedEdges = useMemo(() => {
		if (edges) return edges;
		const ids = new Set(collections.map(c => c.id));
		const seen = new Set<string>();
		const out: DiagramEdge[] = [];
		for (const collection of collections) {
			for (const link of collection.related) {
				if (link.kind === 'same-name') continue;
				if (!ids.has(link.collectionId) || link.collectionId === collection.id) continue;
				const key = [collection.id, link.collectionId].sort().join('|');
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({
					from: collection.id,
					to: link.collectionId,
					label: (link.via.split(':')[0] ?? link.via).trim().slice(0, 28),
				});
			}
		}
		return out;
	}, [collections, edges]);

	const groups = useMemo(() => {
		const map = new Map<string, MongoCollection[]>();
		for (const collection of collections) {
			const key = collection.domain || 'root';
			const list = map.get(key) ?? [];
			list.push(collection);
			map.set(key, list);
		}
		return [...map.entries()].sort(
			(a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
		);
	}, [collections]);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const measure = () => {
			const origin = canvas.getBoundingClientRect();
			const next: Box[] = [];
			for (const el of canvas.querySelectorAll<HTMLElement>('[data-table-id]')) {
				const rect = el.getBoundingClientRect();
				next.push({
					id: el.dataset.tableId!,
					x: rect.left - origin.left + canvas.scrollLeft,
					y: rect.top - origin.top + canvas.scrollTop,
					w: rect.width,
					h: rect.height,
				});
			}
			setBoxes(next);
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(canvas);
		canvas.addEventListener('scroll', measure);
		return () => {
			ro.disconnect();
			canvas.removeEventListener('scroll', measure);
		};
	}, [collections, fieldLimit]);

	if (!collections.length) return null;

	const byId = new Map(boxes.map(b => [b.id, b]));
	const width = Math.max(canvasRef.current?.scrollWidth ?? 0, ...boxes.map(b => b.x + b.w + 24), 640);
	const height = Math.max(canvasRef.current?.scrollHeight ?? 0, ...boxes.map(b => b.y + b.h + 24), 240);

	return (
		<div className="db-diagram" ref={canvasRef}>
			<svg
				className="db-diagram__wires"
				width={width}
				height={height}
				aria-hidden
			>
				<defs>
					<marker
						id="db-arrow"
						viewBox="0 0 10 8"
						refX="9"
						refY="4"
						markerWidth="8"
						markerHeight="6"
						orient="auto"
					>
						<path d="M 0 0 L 10 4 L 0 8 z" fill="var(--accent)" opacity="0.7" />
					</marker>
				</defs>
				{resolvedEdges.map(edge => {
					const a = byId.get(edge.from);
					const b = byId.get(edge.to);
					if (!a || !b) return null;
					const start = { x: a.x + a.w, y: a.y + 22 };
					const end = { x: b.x, y: b.y + 22 };
					if (a.x > b.x) {
						start.x = a.x;
						end.x = b.x + b.w;
					}
					const mid = (start.x + end.x) / 2;
					const d = `M ${start.x} ${start.y} C ${mid} ${start.y}, ${mid} ${end.y}, ${end.x} ${end.y}`;
					return (
						<g key={`${edge.from}->${edge.to}:${edge.label}`}>
							<path
								d={d}
								fill="none"
								stroke="var(--accent)"
								strokeOpacity="0.45"
								strokeWidth="1.4"
								markerEnd="url(#db-arrow)"
							/>
							<text
								x={mid}
								y={(start.y + end.y) / 2 - 6}
								textAnchor="middle"
								className="db-diagram__edge-label"
							>
								{edge.label}
							</text>
						</g>
					);
				})}
			</svg>

			<div className="db-diagram__lanes">
				{groups.map(([domain, tables]) => (
					<section key={domain} className="db-lane">
						<h3 className="db-lane__title">{domain}</h3>
						<div className="db-lane__tables">
							{tables.map(table => (
								<TableCard
									key={table.id}
									collection={table}
									focus={table.id === focusId}
									fieldLimit={fieldLimit}
								/>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}

function TableCard({
	collection,
	focus,
	fieldLimit,
}: {
	collection: MongoCollection;
	focus: boolean;
	fieldLimit: number;
}) {
	const fields = (collection.fields ?? []).slice(0, fieldLimit);
	const extra = (collection.fields ?? []).length - fields.length;
	return (
		<Link
			to={`/database/${encodeURIComponent(collection.id)}`}
			className={`db-table${focus ? ' db-table--focus' : ''}`}
			data-table-id={collection.id}
		>
			<div className="db-table__head">
				<span className="db-table__name">{collection.name}</span>
				{collection.entityName ? (
					<span className="db-table__entity">{collection.entityName}</span>
				) : null}
			</div>
			<div className="db-table__body">
				{fields.length === 0 ? (
					<div className="db-table__row db-table__row--empty">no columns resolved</div>
				) : (
					fields.map(field => (
						<div key={field.name} className="db-table__row">
							<span className="db-table__col">
								{field.pk ? <span className="db-key db-key--pk">PK</span> : null}
								{field.fk ? <span className="db-key db-key--fk">FK</span> : null}
								<span className="db-table__col-name">{field.name}</span>
							</span>
							<span className="db-table__col-type">{shortType(field)}</span>
						</div>
					))
				)}
				{extra > 0 ? (
					<div className="db-table__row db-table__row--more">+{extra} more columns</div>
				) : null}
			</div>
		</Link>
	);
}

function shortType(field: CollectionColumn): string {
	const t = field.type.replace(/^Promise<|>$/g, '').split('|')[0]?.trim() ?? field.type;
	return (field.optional ? `${t}?` : t).slice(0, 22);
}
