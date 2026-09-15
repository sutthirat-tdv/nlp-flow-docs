import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
	Badge,
	Empty,
	KeyValue,
	PageHead,
	RepoBadge,
	SchemaLink,
	Section,
	SourceLink,
	UseCaseLink,
} from '../components/ui';
import { useData, useSchema } from '../data';

export function EndpointsPage() {
	const { core } = useData();
	const [params, setParams] = useSearchParams();
	const [query, setQuery] = useState('');
	const repo = params.get('repo') ?? 'all';
	const method = params.get('method') ?? 'all';

	const endpoints = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return core.endpoints
			.filter(e => (repo === 'all' ? true : e.repoId === repo))
			.filter(e => (method === 'all' ? true : e.method === method))
			.filter(e =>
				needle
					? e.path.toLowerCase().includes(needle) ||
						(e.summary ?? '').toLowerCase().includes(needle) ||
						e.controller.toLowerCase().includes(needle) ||
						e.tags.some(t => t.toLowerCase().includes(needle))
					: true,
			);
	}, [core.endpoints, repo, method, query]);

	const setParam = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value === 'all') next.delete(key);
		else next.set(key, value);
		setParams(next, { replace: true });
	};

	return (
		<>
			<PageHead title="API endpoints">
				Every HTTP route the two BFFs expose, with the guard that protects it, the permission it
				needs, the request and response schema, and the use case behind it. Paths already include
				the global prefix and version, so they are the real URLs.
			</PageHead>

			<div className="toolbar">
				<input
					className="input input--grow"
					placeholder="Filter by path, summary, controller or tag…"
					value={query}
					onChange={e => setQuery(e.target.value)}
				/>
				<select className="select" value={repo} onChange={e => setParam('repo', e.target.value)}>
					<option value="all">Both BFFs</option>
					{core.repos
						.filter(r => r.stats.endpoints > 0)
						.map(r => (
							<option key={r.id} value={r.id}>
								{r.title}
							</option>
						))}
				</select>
				<select
					className="select"
					value={method}
					onChange={e => setParam('method', e.target.value)}
				>
					<option value="all">Any method</option>
					{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
						<option key={m} value={m}>
							{m}
						</option>
					))}
				</select>
				<span className="dimmer" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
					{endpoints.length.toLocaleString()} of {core.endpoints.length.toLocaleString()}
				</span>
			</div>

			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th className="nowrap">Method</th>
							<th>Path</th>
							<th>What it does</th>
							<th>Service</th>
							<th>Auth</th>
						</tr>
					</thead>
					<tbody>
						{endpoints.slice(0, 400).map(endpoint => (
							<tr key={endpoint.id}>
								<td>
									<Badge tone={endpoint.method}>{endpoint.method}</Badge>
								</td>
								<td>
									<Link className="mono" to={`/endpoints/${encodeURIComponent(endpoint.id)}`}>
										{endpoint.path}
									</Link>
								</td>
								<td className="dim">{endpoint.summary ?? endpoint.handler}</td>
								<td>
									<RepoBadge repoId={endpoint.repoId} />
								</td>
								<td>
									{endpoint.permissions.length ? (
										<Badge tone="amber">permission</Badge>
									) : endpoint.auth ? (
										<Badge tone="green">guard</Badge>
									) : (
										<Badge tone="red">open</Badge>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{endpoints.length > 400 ? (
				<p className="dimmer" style={{ fontSize: 12.5 }}>
					Showing the first 400 of {endpoints.length.toLocaleString()}.
				</p>
			) : null}
		</>
	);
}

function SchemaFields({ schemaId }: { schemaId: string | null }) {
	const schema = useSchema(schemaId);
	if (!schemaId) return <span className="dimmer">no schema resolved</span>;
	if (!schema) return <span className="dimmer">Loading…</span>;
	if (!schema.fields.length) {
		return (
			<span className="dimmer">
				{schema.extends.length
					? `Inherits everything from ${schema.extends.join(', ')}.`
					: 'No declared fields.'}
			</span>
		);
	}
	return (
		<div>
			{schema.fields.map(field => (
				<div key={field.name} className="schema-field">
					<div className="schema-field__head">
						<span className="schema-field__name">{field.name}</span>
						<span className="schema-field__type">{field.type}</span>
						{field.optional ? <Badge>optional</Badge> : <Badge tone="amber">required</Badge>}
					</div>
					{field.description ? (
						<div className="schema-field__desc">{field.description}</div>
					) : null}
					{field.rules.length ? (
						<div className="schema-field__rules">{field.rules.join(' · ')}</div>
					) : null}
					{field.example ? (
						<div className="schema-field__rules">
							example: <span className="mono">{field.example}</span>
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

export function EndpointDetailPage() {
	const { endpointId } = useParams();
	const { indexes } = useData();
	const endpoint = endpointId ? indexes.endpointById.get(endpointId) : undefined;

	if (!endpoint) {
		return (
			<Empty>
				Unknown endpoint. <Link to="/endpoints">Back to the list</Link>.
			</Empty>
		);
	}

	const flow = indexes.flowByEntry.get(endpoint.id);
	const repo = indexes.repoById.get(endpoint.repoId);

	return (
		<>
			<PageHead
				title={
					<span>
						<Badge tone={endpoint.method}>{endpoint.method}</Badge>{' '}
						<span className="mono" style={{ fontSize: 21 }}>
							{endpoint.path}
						</span>
					</span>
				}
				crumbs={
					<>
						<Link to="/endpoints">API endpoints</Link> <span>/</span>{' '}
						<Link to={`/services/${endpoint.repoId}`}>{repo?.title}</Link> <span>/</span>{' '}
						<span className="mono">{endpoint.domain}</span>
					</>
				}
				actions={<SourceLink source={endpoint.source} label="open in GitHub" />}
			>
				{endpoint.summary ?? `Handled by ${endpoint.controller}.${endpoint.handler}().`}
			</PageHead>

			<div className="card">
				<KeyValue
					rows={[
						['Service', <RepoBadge repoId={endpoint.repoId} />],
						[
							'Handler',
							<span className="mono">
								{endpoint.controller}.{endpoint.handler}()
							</span>,
						],
						[
							'Guards',
							endpoint.guards.length ? (
								<div className="badges">
									{endpoint.guards.map(g => (
										<Badge key={g} tone="green">
											{g}
										</Badge>
									))}
								</div>
							) : (
								<Badge tone="red">no guard on this route</Badge>
							),
						],
						[
							'Permissions',
							endpoint.permissions.length ? (
								<div className="badges">
									{endpoint.permissions.map(p => (
										<Badge key={p} tone="amber">
											{p}
										</Badge>
									))}
								</div>
							) : (
								<span className="dimmer">none required</span>
							),
						],
						[
							'Swagger tags',
							endpoint.tags.length ? (
								<div className="badges">
									{endpoint.tags.map(t => (
										<Badge key={t}>{t}</Badge>
									))}
								</div>
							) : (
								<span className="dimmer">—</span>
							),
						],
						[
							'End-to-end flow',
							flow ? (
								<Link to={`/flows/${encodeURIComponent(flow.id)}`}>
									trace it across {flow.repos.length} service(s) →
								</Link>
							) : (
								<span className="dimmer">no flow resolved</span>
							),
						],
					]}
				/>
			</div>

			<Section title="Request">
				{endpoint.requestSchemas.length === 0 ? (
					<Empty>No request payload — the route takes no body, query or params.</Empty>
				) : (
					<div className="grid grid--2">
						{endpoint.requestSchemas.map((request, i) => (
							<div key={i} className="card">
								<h3>
									{request.location} · <SchemaLink id={request.schemaId} />
								</h3>
								{!request.schemaId ? (
									<span className="mono dim">{request.type}</span>
								) : (
									<SchemaFields schemaId={request.schemaId} />
								)}
							</div>
						))}
					</div>
				)}
			</Section>

			<Section title="Responses">
				{endpoint.responseSchemas.length === 0 ? (
					<Empty>No response type declared.</Empty>
				) : (
					<div className="grid grid--2">
						{endpoint.responseSchemas.map((response, i) => (
							<div key={i} className="card">
								<h3>
									{response.status} · <SchemaLink id={response.schemaId} />
								</h3>
								{!response.schemaId ? (
									<span className="mono dim">{response.type}</span>
								) : (
									<SchemaFields schemaId={response.schemaId} />
								)}
							</div>
						))}
					</div>
				)}
			</Section>

			<Section title="Use cases it runs">
				{endpoint.useCaseIds.length === 0 ? (
					<Empty>
						No use case resolved. The handler probably answers inline or delegates to a service.
						Check the source.
					</Empty>
				) : (
					<div className="table-wrap">
						<table>
							<thead>
								<tr>
									<th>Use case</th>
									<th>Publishes</th>
									<th>Systems</th>
									<th>Source</th>
								</tr>
							</thead>
							<tbody>
								{endpoint.useCaseIds.map(id => {
									const useCase = indexes.useCaseById.get(id);
									if (!useCase) return null;
									return (
										<tr key={id}>
											<td>
												<UseCaseLink id={id} />
												<div className="mono dimmer" style={{ fontSize: 11.5 }}>
													{useCase.className}
												</div>
											</td>
											<td className="mono dim">{useCase.producesTopics.length}</td>
											<td>
												<div className="badges">
													{useCase.systems
														.filter(s => s !== 'kafka')
														.map(s => (
															<Badge key={s}>{s}</Badge>
														))}
												</div>
											</td>
											<td>
												<SourceLink source={useCase.source} label="code" />
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</Section>
		</>
	);
}
