import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import {
	Badge,
	CollectionLink,
	Collapsible,
	Empty,
	HttpClientLink,
	KeyValue,
	PageHead,
	RepoBadge,
	SchemaLink,
	Section,
	SourceLink,
	SystemLink,
	TopicLink,
	UseCaseLink,
} from '../components/ui';
import { useData, useSchema } from '../data';
import type { Dependency } from '../types';

const DEP_TONE: Record<string, string | undefined> = {
	'use-case': 'accent',
	manager: 'purple',
	'mongo-repository': 'green',
	'http-repository': 'teal',
	'kafka-producer': 'amber',
	cache: undefined,
	logging: undefined,
};

export function UseCasesPage() {
	const { core } = useData();
	const [params, setParams] = useSearchParams();
	const [query, setQuery] = useState('');
	const repo = params.get('repo') ?? 'all';
	const domain = params.get('domain') ?? 'all';
	const trigger = params.get('trigger') ?? 'all';

	const domains = useMemo(() => {
		const set = new Set(
			core.useCases.filter(u => repo === 'all' || u.repoId === repo).map(u => u.domain),
		);
		return [...set].sort();
	}, [core.useCases, repo]);

	const useCases = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return core.useCases
			.filter(u => (repo === 'all' ? true : u.repoId === repo))
			.filter(u => (domain === 'all' ? true : u.domain === domain))
			.filter(u =>
				trigger === 'all'
					? true
					: trigger === 'http'
						? u.tags.includes('http-triggered')
						: trigger === 'kafka'
							? u.tags.includes('kafka-triggered')
							: u.tags.includes('internal'),
			)
			.filter(u =>
				needle
					? u.title.toLowerCase().includes(needle) ||
						u.className.toLowerCase().includes(needle) ||
						u.domain.toLowerCase().includes(needle)
					: true,
			);
	}, [core.useCases, repo, domain, trigger, query]);

	const setParam = (key: string, value: string) => {
		const next = new URLSearchParams(params);
		if (value === 'all') next.delete(key);
		else next.set(key, value);
		if (key === 'repo') next.delete('domain');
		setParams(next, { replace: true });
	};

	return (
		<>
			<PageHead title="Use cases">
				The unit of business logic in all four services: one class, one <code>execute()</code>.
				This is the fastest way to answer “where does this rule actually live?”.
			</PageHead>

			<div className="toolbar">
				<input
					className="input input--grow"
					placeholder="Filter by name, class or domain…"
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
				<select
					className="select"
					value={domain}
					onChange={e => setParam('domain', e.target.value)}
				>
					<option value="all">Any domain</option>
					{domains.map(d => (
						<option key={d} value={d}>
							{d}
						</option>
					))}
				</select>
				<select
					className="select"
					value={trigger}
					onChange={e => setParam('trigger', e.target.value)}
				>
					<option value="all">Any trigger</option>
					<option value="http">HTTP triggered</option>
					<option value="kafka">Kafka triggered</option>
					<option value="internal">No resolved trigger</option>
				</select>
				<span className="dimmer" style={{ fontSize: 12.5, marginLeft: 'auto' }}>
					{useCases.length.toLocaleString()} of {core.useCases.length.toLocaleString()}
				</span>
			</div>

			<div className="table-wrap table-wrap--freeze">
				<table>
					<thead>
						<tr>
							<th>Use case</th>
							<th>Service</th>
							<th>Domain</th>
							<th className="nowrap">Deps</th>
							<th className="nowrap">Publishes</th>
							<th>Systems</th>
						</tr>
					</thead>
					<tbody>
						{useCases.slice(0, 400).map(useCase => (
							<tr key={useCase.id}>
								<td>
									<Link to={`/use-cases/${encodeURIComponent(useCase.id)}`}>{useCase.title}</Link>
									<div className="mono dimmer" style={{ fontSize: 11.5 }}>
										{useCase.className}
									</div>
								</td>
								<td>
									<RepoBadge repoId={useCase.repoId} />
								</td>
								<td className="mono dim" style={{ fontSize: 12 }}>
									{useCase.domain}
								</td>
								<td className="mono dim">{useCase.dependencies.length}</td>
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
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{useCases.length > 400 ? (
				<p className="dimmer" style={{ fontSize: 12.5 }}>
					Showing the first 400 of {useCases.length.toLocaleString()}. Narrow the filters or press
					⌘K.
				</p>
			) : null}
		</>
	);
}

function DependencyRow({ dep }: { dep: Dependency }) {
	const { indexes } = useData();
	const target = dep.targetId ? indexes.useCaseById.get(dep.targetId) : undefined;
	const collection = dep.targetId ? indexes.collectionById.get(dep.targetId) : undefined;
	const httpClient = dep.targetId ? indexes.httpClientById.get(dep.targetId) : undefined;
	return (
		<tr>
			<td className="mono" style={{ fontSize: 12.5 }}>
				{dep.name}
			</td>
			<td className="mono" style={{ fontSize: 12.5 }}>
				{collection ? (
					<CollectionLink id={collection.id} />
				) : httpClient ? (
					<HttpClientLink id={httpClient.id} />
				) : target ? (
					<UseCaseLink id={target.id} />
				) : (
					dep.type
				)}
			</td>
			<td>
				<Badge tone={DEP_TONE[dep.kind]}>{dep.kind.replace(/-/g, ' ')}</Badge>
			</td>
			<td>{dep.system ? <SystemLink id={dep.system} /> : <span className="dimmer">—</span>}</td>
		</tr>
	);
}

function SchemaPreview({ schemaId, title }: { schemaId: string | null; title: string }) {
	const schema = useSchema(schemaId);
	if (!schemaId) return null;
	return (
		<div className="card">
			<h3>{title}</h3>
			<div style={{ marginBottom: 8 }}>
				<SchemaLink id={schemaId} />
			</div>
			{!schema ? (
				<span className="dimmer">Loading…</span>
			) : schema.fields.length === 0 ? (
				<span className="dimmer">No declared fields (inherits or is a primitive alias).</span>
			) : (
				<div>
					{schema.fields.slice(0, 8).map(field => (
						<div key={field.name} className="schema-field">
							<div className="schema-field__head">
								<span className="schema-field__name">{field.name}</span>
								<span className="schema-field__type">{field.type}</span>
								{field.optional ? <Badge>optional</Badge> : <Badge tone="amber">required</Badge>}
							</div>
							{field.rules.length ? (
								<div className="schema-field__rules">{field.rules.join(' · ')}</div>
							) : null}
						</div>
					))}
					{schema.fields.length > 8 ? (
						<div style={{ marginTop: 8 }}>
							<SchemaLink id={schemaId} /> has {schema.fields.length} fields in total.
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}

export function UseCaseDetailPage() {
	const { useCaseId } = useParams();
	const { indexes } = useData();
	const useCase = useCaseId ? indexes.useCaseById.get(useCaseId) : undefined;

	if (!useCase) {
		return (
			<Empty>
				Unknown use case. <Link to="/use-cases">Back to the list</Link>.
			</Empty>
		);
	}

	const triggers = useCase.invokedBy
		.map(id => ({
			id,
			endpoint: indexes.endpointById.get(id),
			consumer: indexes.consumerById.get(id),
		}))
		.filter(t => t.endpoint || t.consumer);

	const relatedFlows = indexes.flowSummaryById
		? [...indexes.flowSummaryById.values()].filter(f => f.entry && useCase.invokedBy.includes(f.entry.id))
		: [];

	return (
		<>
			<PageHead
				title={useCase.title}
				crumbs={
					<>
						<Link to="/use-cases">Use cases</Link> <span>/</span>{' '}
						<Link to={`/services/${useCase.repoId}`}>
							{indexes.repoById.get(useCase.repoId)?.title}
						</Link>{' '}
						<span>/</span> <span className="mono">{useCase.domain}</span>
					</>
				}
				actions={<SourceLink source={useCase.source} label="open in GitHub" />}
			>
				<span className="mono">{useCase.className}</span> · entry method{' '}
				<code>
					{useCase.entryMethod}()
				</code>
				{useCase.tags.includes('manager')
					? ' · this one is a manager called straight from a Kafka consumer, not a *.use-case.ts file'
					: ''}
			</PageHead>

			<div className="card">
				<KeyValue
					rows={[
						['Service', <RepoBadge repoId={useCase.repoId} />],
						['Domain', <span className="mono">{useCase.domain}</span>],
						['Input', <SchemaLink id={useCase.inputSchemaId} /> ],
						['Output', <SchemaLink id={useCase.outputSchemaId} />],
						[
							'Declared types',
							<span className="mono dim" style={{ fontSize: 12 }}>
								{useCase.inputType ?? '—'} → {useCase.outputType ?? 'void'}
							</span>,
						],
						[
							'Downstream systems',
							useCase.systems.filter(s => s !== 'kafka').length ? (
								<div className="badges">
									{useCase.systems
										.filter(s => s !== 'kafka')
										.map(s => (
											<SystemLink key={s} id={s} />
										))}
								</div>
							) : (
								<span className="dimmer">none resolved</span>
							),
						],
						['Source', <SourceLink source={useCase.source} />],
					]}
				/>
			</div>

			<Section title="What triggers it" subtitle={`${triggers.length} entry point(s)`}>
				{triggers.length === 0 ? (
					<Empty>
						Nothing in these repos calls it directly. It is either wired only through a module we
						could not resolve, called from another use case, or dead code worth checking.
					</Empty>
				) : (
					<div className="table-wrap table-wrap--freeze">
						<table>
							<thead>
								<tr>
									<th>Kind</th>
									<th>Entry</th>
									<th>Detail</th>
									<th>Flow</th>
								</tr>
							</thead>
							<tbody>
								{triggers.map(({ id, endpoint, consumer }) => {
									const flow = indexes.flowByEntry.get(
										endpoint ? endpoint.id : consumer ? consumer.topic : id,
									);
									return (
										<tr key={id}>
											<td>
												<Badge tone={endpoint ? endpoint.method : 'teal'}>
													{endpoint ? 'HTTP' : 'Kafka'}
												</Badge>
											</td>
											<td>
												{endpoint ? (
													<Link className="mono" to={`/endpoints/${encodeURIComponent(endpoint.id)}`}>
														{endpoint.method} {endpoint.path}
													</Link>
												) : consumer ? (
													<TopicLink topic={consumer.topic} />
												) : null}
											</td>
											<td className="mono dim" style={{ fontSize: 12 }}>
												{endpoint
													? `${endpoint.controller}.${endpoint.handler}`
													: `${consumer!.controller}.${consumer!.handler}`}
											</td>
											<td>
												{flow ? (
													<Link to={`/flows/${encodeURIComponent(flow.id)}`}>trace it →</Link>
												) : (
													<span className="dimmer">—</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</Section>

			{useCase.inputSchemaId || useCase.outputSchemaId ? (
				<Section title="Data in and out">
					<div className="grid grid--2">
						<SchemaPreview schemaId={useCase.inputSchemaId} title="Input" />
						<SchemaPreview schemaId={useCase.outputSchemaId} title="Output" />
					</div>
				</Section>
			) : null}

			<Section
				title="Events it publishes"
				subtitle={`${useCase.producesTopics.length} topic(s), resolved from the publish call sites`}
			>
				{useCase.producesTopics.length === 0 ? (
					<Empty>It publishes nothing. All of its work is synchronous.</Empty>
				) : (
					<div className="table-wrap table-wrap--freeze">
						<table>
							<thead>
								<tr>
									<th>Topic</th>
									<th>Kind</th>
									<th>Picked up by</th>
								</tr>
							</thead>
							<tbody>
								{useCase.producesTopics.map(name => {
									const topic = indexes.topicByName.get(name);
									const consumers = indexes.consumersByTopic.get(name) ?? [];
									return (
										<tr key={name}>
											<td>
												<TopicLink topic={name} />
											</td>
											<td>
												<Badge
													tone={
														topic?.kind === 'failure'
															? 'red'
															: topic?.kind === 'event'
																? 'green'
																: 'accent'
													}
												>
													{topic?.kind ?? 'unknown'}
												</Badge>
											</td>
											<td>
												{consumers.length === 0 ? (
													<span className="dimmer">nobody in these repos</span>
												) : (
													<div className="badges">
														{consumers.map(c => (
															<Badge key={c.id} tone={c.isReplyListener ? undefined : 'teal'}>
																{indexes.repoById.get(c.repoId)?.title}: {c.controller}
																{c.isReplyListener ? ' (reply)' : ''}
															</Badge>
														))}
													</div>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</Section>

			<Section
				title="Mongo collections"
				subtitle={
					(useCase.collectionAccess ?? []).length
						? `${useCase.collectionAccess.length} collection(s) reached from ${useCase.entryMethod}()`
						: 'none reached from the entry method'
				}
			>
				{(useCase.collectionAccess ?? []).length === 0 ? (
					<Empty>
						This use case does not call a Mongo repository from{' '}
						<code>{useCase.entryMethod}()</code>. Loyalty writes live in TMF658; BFF collections are
						local read models.
					</Empty>
				) : (
					<div className="table-wrap table-wrap--freeze">
						<table>
							<thead>
								<tr>
									<th>Collection</th>
									<th>Creates</th>
									<th>Queries</th>
									<th>Other</th>
								</tr>
							</thead>
							<tbody>
								{(useCase.collectionAccess ?? []).map(access => {
									const creates = access.operations.filter(
										o => o.kind === 'create' || o.kind === 'upsert',
									);
									const queries = access.operations.filter(o => o.kind === 'read');
									const other = access.operations.filter(
										o => o.kind !== 'create' && o.kind !== 'upsert' && o.kind !== 'read',
									);
									return (
										<tr key={access.collectionId}>
											<td>
												<CollectionLink id={access.collectionId} />
											</td>
											<td>
												{creates.length ? (
													<div className="badges">
														{creates.map(o => (
															<Badge key={o.name} tone="green">
																{o.name}()
															</Badge>
														))}
													</div>
												) : (
													<span className="dimmer">—</span>
												)}
											</td>
											<td>
												{queries.length ? (
													<div className="badges">
														{queries.map(o => (
															<Badge key={o.name} tone="accent">
																{o.name}()
															</Badge>
														))}
													</div>
												) : (
													<span className="dimmer">—</span>
												)}
											</td>
											<td>
												{other.length ? (
													<div className="badges">
														{other.map(o => (
															<Badge key={o.name} tone={o.kind === 'delete' ? 'red' : 'amber'}>
																{o.name}()
															</Badge>
														))}
													</div>
												) : (
													<span className="dimmer">—</span>
												)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</Section>

			<Section
				title="HTTP dependencies"
				subtitle={
					(useCase.httpAccess ?? []).length
						? `${useCase.httpAccess.length} axios client(s) reached from ${useCase.entryMethod}()`
						: 'none reached from the entry method'
				}
			>
				{(useCase.httpAccess ?? []).length === 0 ? (
					<Empty>
						This use case does not call an Axios client from <code>{useCase.entryMethod}()</code>.
					</Empty>
				) : (
					<div className="table-wrap table-wrap--freeze">
						<table>
							<thead>
								<tr>
									<th>Client</th>
									<th>Calls</th>
								</tr>
							</thead>
							<tbody>
								{(useCase.httpAccess ?? []).map(access => (
									<tr key={access.clientId}>
										<td>
											<HttpClientLink id={access.clientId} />
										</td>
										<td>
											<div className="badges">
												{access.operations.map(o => (
													<Badge
														key={`${o.name}:${o.httpMethod}:${o.path}`}
														tone={
															o.httpMethod === 'GET'
																? 'accent'
																: o.httpMethod === 'POST'
																	? 'green'
																	: o.httpMethod === 'DELETE'
																		? 'red'
																		: 'amber'
														}
													>
														{o.httpMethod} /{o.path}
													</Badge>
												))}
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Section>

			<Section
				title="Injected dependencies"
				subtitle={`${useCase.dependencies.length} constructor parameter(s)`}
			>
				{useCase.dependencies.length === 0 ? (
					<Empty>No dependencies — pure logic.</Empty>
				) : (
					<div className="table-wrap table-wrap--freeze">
						<table>
							<thead>
								<tr>
									<th>Property</th>
									<th>Type</th>
									<th>Kind</th>
									<th>System</th>
								</tr>
							</thead>
							<tbody>
								{useCase.dependencies.map(dep => (
									<DependencyRow key={dep.name} dep={dep} />
								))}
							</tbody>
						</table>
					</div>
				)}
			</Section>

			{useCase.errors.length ? (
				<Section
					title="Failure modes"
					subtitle="errors thrown inside this use case, verbatim from the code"
				>
					<div className="card">
						<Collapsible
							items={useCase.errors}
							limit={8}
							noun="errors"
							render={(error, i) => (
								<div key={i} className="mono" style={{ fontSize: 12.5, padding: '3px 0' }}>
									<span style={{ color: 'var(--red)' }}>throw</span> {error}
								</div>
							)}
						/>
					</div>
				</Section>
			) : null}

			{relatedFlows.length ? (
				<Section title="Flows that reach it">
					<div className="pill-list">
						{relatedFlows.slice(0, 20).map(flow => (
							<Badge key={flow.id}>
								<Link to={`/flows/${encodeURIComponent(flow.id)}`}>{flow.title}</Link>
							</Badge>
						))}
					</div>
				</Section>
			) : null}
		</>
	);
}
