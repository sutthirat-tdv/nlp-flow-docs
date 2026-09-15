import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
	Badge,
	Collapsible,
	Empty,
	KeyValue,
	PageHead,
	RepoBadge,
	SchemaLink,
	Section,
	SourceLink,
	UseCaseLink,
} from '../components/ui';
import { useData, useRepoSchemas, useSchema } from '../data';
import type { Schema, SchemaField } from '../types';

const LAYER_LABEL: Record<string, string> = {
	'http-request': 'HTTP request',
	'http-response': 'HTTP response',
	'use-case': 'Use case I/O',
	'kafka-event': 'Kafka event',
	service: 'Service I/O',
	persistence: 'Persistence',
	downstream: 'Downstream API',
	shared: 'Shared',
};

const LAYER_TONE: Record<string, string | undefined> = {
	'http-request': 'accent',
	'http-response': 'accent',
	'kafka-event': 'amber',
	persistence: 'green',
	downstream: 'teal',
	'use-case': 'purple',
};

export function SchemasPage() {
	const { core } = useData();
	const [params, setParams] = useSearchParams();
	const [query, setQuery] = useState('');
	const repo = params.get('repo') ?? 'all';
	const layer = params.get('layer') ?? 'all';
	const kind = params.get('kind') ?? 'all';

	const schemas = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return core.schemaIndex
			.filter(s => (repo === 'all' ? true : s.repoId === repo))
			.filter(s => (layer === 'all' ? true : s.layer === layer))
			.filter(s => (kind === 'all' ? true : s.kind === kind))
			.filter(s =>
				needle
					? s.name.toLowerCase().includes(needle) || s.file.toLowerCase().includes(needle)
					: true,
			)
			.sort((a, b) => b.usedByCount - a.usedByCount || a.name.localeCompare(b.name));
	}, [core.schemaIndex, repo, layer, kind, query]);

	const setParam = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value === 'all') next.delete(key);
		else next.set(key, value);
		setParams(next, { replace: true });
	};

	return (
		<>
			<PageHead title="Data schemas">
				Every DTO, entity, interface and enum in the four services, with the validation rules that
				actually apply at runtime. Sorted by how widely each one is used, so the shapes that
				matter most come first.
			</PageHead>

			<div className="toolbar">
				<input
					className="input input--grow"
					placeholder="Filter by class name or file…"
					value={query}
					onChange={e => setQuery(e.target.value)}
				/>
				<select className="select" value={repo} onChange={e => setParam('repo', e.target.value)}>
					<option value="all">Any service</option>
					{core.repos.map(r => (
						<option key={r.id} value={r.id}>
							{r.title}
						</option>
					))}
				</select>
				<select className="select" value={layer} onChange={e => setParam('layer', e.target.value)}>
					<option value="all">Any layer</option>
					{Object.entries(LAYER_LABEL).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
				<select className="select" value={kind} onChange={e => setParam('kind', e.target.value)}>
					<option value="all">Any kind</option>
					<option value="class">Class</option>
					<option value="interface">Interface</option>
					<option value="enum">Enum</option>
					<option value="type">Type alias</option>
				</select>
				<span className="dimmer" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
					{schemas.length.toLocaleString()} of {core.schemaIndex.length.toLocaleString()}
				</span>
			</div>

			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Schema</th>
							<th className="nowrap">Layer</th>
							<th className="nowrap">Kind</th>
							<th className="nowrap">Fields</th>
							<th className="nowrap">Referenced</th>
							<th>Service</th>
						</tr>
					</thead>
					<tbody>
						{schemas.slice(0, 400).map(schema => (
							<tr key={schema.id}>
								<td>
									<Link className="mono" to={`/schemas/${encodeURIComponent(schema.id)}`}>
										{schema.name}
									</Link>
									<div className="mono dimmer" style={{ fontSize: 11 }}>
										{schema.file}
									</div>
								</td>
								<td>
									<Badge tone={LAYER_TONE[schema.layer]}>
										{LAYER_LABEL[schema.layer] ?? schema.layer}
									</Badge>
								</td>
								<td className="dim" style={{ fontSize: 12.5 }}>
									{schema.kind}
								</td>
								<td className="mono dim">{schema.fieldCount}</td>
								<td className="mono dim">{schema.usedByCount}</td>
								<td>
									<RepoBadge repoId={schema.repoId} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{schemas.length > 400 ? (
				<p className="dimmer" style={{ fontSize: 12.5 }}>
					Showing the first 400 of {schemas.length.toLocaleString()}. Press ⌘K to jump to one by
					name.
				</p>
			) : null}
		</>
	);
}

/**
 * One field, with the option to drill into any nested schema it references.
 * Nesting is capped so a self referencing tree cannot run away.
 */
function FieldRow({
	field,
	repoId,
	depth,
}: {
	field: SchemaField;
	repoId: string;
	depth: number;
}) {
	const { indexes } = useData();
	const [expanded, setExpanded] = useState<string | null>(null);
	const nestedRefs = field.refs
		.map(ref => indexes.schemaSummaryById.get(`${repoId}:${ref}`))
		.filter((s): s is NonNullable<typeof s> => !!s && s.fieldCount > 0);

	return (
		<div className="schema-field">
			<div className="schema-field__head">
				<span className="schema-field__name">{field.name}</span>
				<span className="schema-field__type">{field.type}</span>
				{field.optional ? <Badge>optional</Badge> : <Badge tone="amber">required</Badge>}
				{nestedRefs.length && depth < 3 ? (
					<button
						className="expander"
						onClick={() => setExpanded(expanded ? null : nestedRefs[0].id)}
					>
						{expanded ? 'hide' : `expand ${nestedRefs[0].name}`}
					</button>
				) : null}
				{nestedRefs.length ? (
					<span className="badges">
						{nestedRefs.map(ref => (
							<SchemaLink key={ref.id} id={ref.id} />
						))}
					</span>
				) : null}
			</div>
			{field.description ? <div className="schema-field__desc">{field.description}</div> : null}
			{field.comment && !field.description ? (
				<div className="schema-field__desc">{field.comment}</div>
			) : null}
			{field.rules.length ? (
				<div className="schema-field__rules">{field.rules.join(' · ')}</div>
			) : null}
			{field.example ? (
				<div className="schema-field__rules">
					example: <span className="mono">{field.example}</span>
				</div>
			) : null}
			{field.decorators.length ? (
				<details style={{ marginTop: 4 }}>
					<summary className="expander" style={{ cursor: 'pointer' }}>
						decorators
					</summary>
					<div className="mono dimmer" style={{ fontSize: 11.5, paddingTop: 3 }}>
						{field.decorators.join('  ')}
					</div>
				</details>
			) : null}
			{expanded ? (
				<div className="nested">
					<NestedSchema schemaId={expanded} depth={depth + 1} />
				</div>
			) : null}
		</div>
	);
}

function NestedSchema({ schemaId, depth }: { schemaId: string; depth: number }) {
	const schema = useSchema(schemaId);
	if (!schema) return <span className="dimmer">Loading…</span>;
	return (
		<>
			<div className="dimmer" style={{ fontSize: 11.5, marginBottom: 4 }}>
				<SchemaLink id={schema.id} /> · {schema.fields.length} fields
			</div>
			{schema.fields.map(field => (
				<FieldRow key={field.name} field={field} repoId={schema.repoId} depth={depth} />
			))}
		</>
	);
}

export function SchemaDetailPage() {
	const { schemaId } = useParams();
	const { indexes } = useData();
	const schema = useSchema(schemaId);
	const summary = schemaId ? indexes.schemaSummaryById.get(schemaId) : undefined;
	const siblings = useRepoSchemas(summary?.repoId ?? null);

	if (!summary) {
		return (
			<Empty>
				Unknown schema. <Link to="/schemas">Back to the list</Link>.
			</Empty>
		);
	}

	const inherited = (siblings ?? []).filter(s =>
		(schema?.extends ?? []).some(h => h.includes(s.name)),
	);

	return (
		<>
			<PageHead
				title={<span className="mono">{summary.name}</span>}
				crumbs={
					<>
						<Link to="/schemas">Data schemas</Link> <span>/</span>{' '}
						<Link to={`/services/${summary.repoId}`}>
							{indexes.repoById.get(summary.repoId)?.title}
						</Link>{' '}
						<span>/</span> <span>{LAYER_LABEL[summary.layer] ?? summary.layer}</span>
					</>
				}
				actions={schema ? <SourceLink source={schema.source} label="open in GitHub" /> : null}
			>
				{summary.kind === 'enum'
					? 'An enum. Where the values look like topic names, they are the literal strings used on the Kafka bus.'
					: `A ${summary.kind} with ${summary.fieldCount} declared field(s), referenced in ${summary.usedByCount} place(s).`}
			</PageHead>

			<div className="card">
				<KeyValue
					rows={[
						['Service', <RepoBadge repoId={summary.repoId} />],
						[
							'Layer',
							<Badge tone={LAYER_TONE[summary.layer]}>
								{LAYER_LABEL[summary.layer] ?? summary.layer}
							</Badge>,
						],
						[
							'Extends',
							schema?.extends.length ? (
								<span className="mono dim" style={{ fontSize: 12.5 }}>
									{schema.extends.join(', ')}
								</span>
							) : (
								<span className="dimmer">nothing</span>
							),
						],
						['File', schema ? <SourceLink source={schema.source} /> : '—'],
					]}
				/>
			</div>

			{inherited.length ? (
				<Section title="Inherited shapes" subtitle="fields also come from these">
					<div className="pill-list">
						{inherited.map(parent => (
							<Badge key={parent.id}>
								<SchemaLink id={parent.id} />
							</Badge>
						))}
					</div>
				</Section>
			) : null}

			<Section
				title={summary.kind === 'enum' ? 'Members' : 'Fields'}
				subtitle={
					summary.kind === 'enum'
						? `${schema?.enumMembers?.length ?? 0} members`
						: `${summary.fieldCount} declared`
				}
			>
				<div className="card">
					{!schema ? (
						<span className="dimmer">Loading…</span>
					) : schema.kind === 'enum' ? (
						<div className="table-wrap" style={{ border: 'none' }}>
							<table>
								<thead>
									<tr>
										<th>Member</th>
										<th>Value</th>
									</tr>
								</thead>
								<tbody>
									{(schema.enumMembers ?? []).map(member => (
										<tr key={member.name}>
											<td className="mono">{member.name}</td>
											<td className="mono dim">
												{indexes.topicByName.has(member.value) ? (
													<Link to={`/topics/${encodeURIComponent(member.value)}`}>
														{member.value}
													</Link>
												) : (
													member.value || <span className="dimmer">—</span>
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : schema.kind === 'type' ? (
						<pre className="mono dim" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
							{schema.typeText}
						</pre>
					) : schema.fields.length === 0 ? (
						<span className="dimmer">
							No own fields. Everything comes from what it extends.
						</span>
					) : (
						<Collapsible
							items={schema.fields}
							limit={40}
							noun="fields"
							render={(field: SchemaField) => (
								<FieldRow key={field.name} field={field} repoId={schema.repoId} depth={0} />
							)}
						/>
					)}
				</div>
			</Section>

			{schema && schema.usedBy.length ? (
				<Section title="Used by" subtitle={`${schema.usedBy.length} place(s)`}>
					<div className="card">
						<Collapsible
							items={schema.usedBy}
							limit={20}
							noun="references"
							render={(id: string) => <UsageRow key={id} id={id} />}
						/>
					</div>
				</Section>
			) : null}
		</>
	);
}

function UsageRow({ id }: { id: string }) {
	const { indexes } = useData();
	const endpoint = indexes.endpointById.get(id);
	const consumer = indexes.consumerById.get(id);
	const useCase = indexes.useCaseById.get(id);
	const schema = indexes.schemaSummaryById.get(id);

	if (endpoint) {
		return (
			<div style={{ padding: '3px 0' }}>
				<Badge tone={endpoint.method}>{endpoint.method}</Badge>{' '}
				<Link className="mono" to={`/endpoints/${encodeURIComponent(endpoint.id)}`}>
					{endpoint.path}
				</Link>
			</div>
		);
	}
	if (consumer) {
		return (
			<div style={{ padding: '3px 0' }}>
				<Badge tone="teal">Kafka</Badge>{' '}
				<Link className="mono" to={`/topics/${encodeURIComponent(consumer.topic)}`}>
					{consumer.topic}
				</Link>{' '}
				<span className="dimmer mono" style={{ fontSize: 11.5 }}>
					{consumer.controller}.{consumer.handler}
				</span>
			</div>
		);
	}
	if (useCase) {
		return (
			<div style={{ padding: '3px 0' }}>
				<Badge tone="purple">Use case</Badge> <UseCaseLink id={useCase.id} />
			</div>
		);
	}
	if (schema) {
		return (
			<div style={{ padding: '3px 0' }}>
				<Badge>Schema</Badge> <SchemaLink id={schema.id} />{' '}
				<span className="dimmer" style={{ fontSize: 12 }}>
					references it
				</span>
			</div>
		);
	}
	return (
		<div className="mono dimmer" style={{ padding: '3px 0', fontSize: 12 }}>
			{id}
		</div>
	);
}
