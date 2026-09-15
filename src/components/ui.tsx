import { ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useData } from '../data';
import type { SourceRef } from '../types';

export function Badge({
	children,
	tone,
	title,
}: {
	children: ReactNode;
	tone?: string;
	title?: string;
}) {
	return (
		<span className={`badge${tone ? ` badge--${tone}` : ''}`} title={title}>
			{children}
		</span>
	);
}

export function PageHead({
	title,
	children,
	crumbs,
	actions,
}: {
	title: ReactNode;
	children?: ReactNode;
	crumbs?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="page-head">
			{crumbs ? <div className="crumbs">{crumbs}</div> : null}
			<div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
				<h1 style={{ flex: 1 }}>{title}</h1>
				{actions}
			</div>
			{children ? <p>{children}</p> : null}
		</div>
	);
}

export function Stat({
	value,
	label,
	to,
}: {
	value: ReactNode;
	label: string;
	to?: string;
}) {
	const body = (
		<>
			<div className="stat__value">{value}</div>
			<div className="stat__label">{label}</div>
		</>
	);
	if (to) {
		return (
			<Link className="stat stat--link" to={to}>
				{body}
			</Link>
		);
	}
	return <div className="stat">{body}</div>;
}

export function Section({
	title,
	subtitle,
	children,
	actions,
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	children: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<section className="section">
			<h2 style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
				<span>{title}</span>
				{subtitle ? <span className="dimmer">{subtitle}</span> : null}
				{actions ? <span style={{ marginLeft: 'auto', fontSize: 13 }}>{actions}</span> : null}
			</h2>
			{children}
		</section>
	);
}

export function Empty({ children }: { children: ReactNode }) {
	return <div className="empty">{children}</div>;
}

export function RepoBadge({ repoId }: { repoId: string | null | undefined }) {
	const { indexes } = useData();
	if (!repoId) return null;
	const repo = indexes.repoById.get(repoId);
	const tone =
		repo?.role === 'entrypoint' ? 'accent' : repo?.role === 'aggregator' ? 'purple' : 'teal';
	return (
		<Link to={`/services/${repoId}`} style={{ textDecoration: 'none' }}>
			<Badge tone={tone} title={repo?.name}>
				{repo?.title ?? repoId}
			</Badge>
		</Link>
	);
}

export function SourceLink({ source, label }: { source: SourceRef; label?: string }) {
	return (
		<a className="mono dimmer" href={source.url} target="_blank" rel="noreferrer">
			{label ?? `${source.file}:${source.line}`} ↗
		</a>
	);
}

export function MethodBadge({ method }: { method: string }) {
	return <Badge tone={method}>{method}</Badge>;
}

export function TopicLink({ topic }: { topic: string }) {
	return (
		<Link className="mono" to={`/topics/${encodeURIComponent(topic)}`}>
			{topic}
		</Link>
	);
}

export function UseCaseLink({ id }: { id: string }) {
	const { indexes } = useData();
	const useCase = indexes.useCaseById.get(id);
	if (!useCase) return <span className="mono dimmer">{id.split(':')[1] ?? id}</span>;
	return <Link to={`/use-cases/${encodeURIComponent(id)}`}>{useCase.title}</Link>;
}

export function SchemaLink({ id }: { id: string | null | undefined }) {
	const { indexes } = useData();
	if (!id) return <span className="dimmer">—</span>;
	const schema = indexes.schemaSummaryById.get(id);
	if (!schema) return <span className="mono dimmer">{id.split(':')[1] ?? id}</span>;
	return (
		<Link className="mono" to={`/schemas/${encodeURIComponent(id)}`}>
			{schema.name}
		</Link>
	);
}

export function CollectionLink({ id }: { id: string }) {
	const { indexes } = useData();
	const collection = indexes.collectionById.get(id);
	if (!collection) return <span className="mono dimmer">{id.split(':').slice(1).join(':') || id}</span>;
	return (
		<Link className="mono" to={`/database/${encodeURIComponent(id)}`}>
			{collection.name}
		</Link>
	);
}

export function HttpClientLink({ id }: { id: string }) {
	const { indexes } = useData();
	const client = indexes.httpClientById.get(id);
	if (!client) return <span className="mono dimmer">{id.split(':').slice(1).join(':') || id}</span>;
	return <Link to={`/dependencies/${encodeURIComponent(id)}`}>{client.name}</Link>;
}

export function SystemLink({ id }: { id: string }) {
	const { indexes } = useData();
	const system = indexes.systemById.get(id);
	return (
		<Link to={`/systems#${id}`} style={{ textDecoration: 'none' }}>
			<Badge>{system?.title ?? id}</Badge>
		</Link>
	);
}

/** Anything that starts a flow: an endpoint or a topic. */
export function FlowLink({
	flowId,
	children,
}: {
	flowId: string;
	children?: ReactNode;
}) {
	const { indexes } = useData();
	const flow = indexes.flowSummaryById.get(flowId);
	if (!flow) return <span className="dimmer">{children ?? 'no flow'}</span>;
	return <Link to={`/flows/${encodeURIComponent(flowId)}`}>{children ?? flow.title}</Link>;
}

/**
 * A list that shows the first N rows and expands on demand. Several pages list
 * hundreds of related items and cutting them off keeps detail pages readable.
 */
export function Collapsible<T>({
	items,
	limit = 12,
	render,
	noun,
}: {
	items: T[];
	limit?: number;
	render: (item: T, index: number) => ReactNode;
	noun: string;
}) {
	const [open, setOpen] = useState(false);
	const visible = useMemo(() => (open ? items : items.slice(0, limit)), [items, open, limit]);
	if (!items.length) return <Empty>No {noun}.</Empty>;
	return (
		<>
			{visible.map(render)}
			{items.length > limit ? (
				<button className="expander" onClick={() => setOpen(v => !v)} style={{ marginTop: 8 }}>
					{open ? 'Show less' : `Show all ${items.length} ${noun}`}
				</button>
			) : null}
		</>
	);
}

export function KeyValue({ rows }: { rows: [ReactNode, ReactNode][] }) {
	return (
		<dl className="kv">
			{rows.map(([key, value], i) => (
				<div key={i} style={{ display: 'contents' }}>
					<dt>{key}</dt>
					<dd>{value}</dd>
				</div>
			))}
		</dl>
	);
}
