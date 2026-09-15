/**
 * Cmd/Ctrl-K search over everything in the catalog.
 *
 * The MiniSearch index is built in the browser from core.json the first time
 * the palette opens, which keeps the initial page load free of a second big
 * download.
 */
import MiniSearch from 'minisearch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useData } from '../data';

interface Doc {
	id: string;
	kind: string;
	title: string;
	subtitle: string;
	repoId: string | null;
	body: string;
	route: string;
}

const KIND_LABEL: Record<string, string> = {
	flow: 'Flow',
	endpoint: 'API',
	'use-case': 'Use case',
	topic: 'Topic',
	consumer: 'Consumer',
	schema: 'Schema',
	collection: 'Mongo',
	http: 'HTTP',
	service: 'Service',
};

export function SearchPalette({ onClose }: { onClose: () => void }) {
	const { core, indexes } = useData();
	const navigate = useNavigate();
	const [query, setQuery] = useState('');
	const [cursor, setCursor] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);

	const { search, docs } = useMemo(() => {
		const documents: Doc[] = [
			...core.flowIndex.map(f => ({
				id: `flow|${f.id}`,
				kind: 'flow',
				title: f.title,
				subtitle: `${f.repos.length} service(s) · ${f.stepCount} steps`,
				repoId: f.entryRepoId,
				body: [...f.topics, ...f.systems, ...f.tags].join(' '),
				route: `/flows/${encodeURIComponent(f.id)}`,
			})),
			...core.endpoints.map(e => ({
				id: `endpoint|${e.id}`,
				kind: 'endpoint',
				title: `${e.method} ${e.path}`,
				subtitle: e.summary ?? `${e.controller}.${e.handler}`,
				repoId: e.repoId,
				body: [e.domain, e.controller, e.handler, ...e.tags, ...e.permissions].join(' '),
				route: `/endpoints/${encodeURIComponent(e.id)}`,
			})),
			...core.useCases.map(u => ({
				id: `use-case|${u.id}`,
				kind: 'use-case',
				title: u.title,
				subtitle: `${u.className} · ${u.domain}`,
				repoId: u.repoId,
				body: [u.inputType, u.outputType, ...u.producesTopics, ...u.tags, ...(u.collectionAccess ?? []).map(a => a.collectionId), ...(u.httpAccess ?? []).map(a => a.clientId)].filter(Boolean).join(' '),
				route: `/use-cases/${encodeURIComponent(u.id)}`,
			})),
			...core.topics.map(t => ({
				id: `topic|${t.name}`,
				kind: 'topic',
				title: t.name,
				subtitle: `${t.kind} · ${t.producedBy.length} producer(s), ${t.consumedBy.length} consumer(s)`,
				repoId: null,
				body: t.aliases.map(a => `${a.enumName}.${a.member}`).join(' '),
				route: `/topics/${encodeURIComponent(t.name)}`,
			})),
			...core.schemaIndex.map(s => ({
				id: `schema|${s.id}`,
				kind: 'schema',
				title: s.name,
				subtitle: `${s.kind} · ${s.layer} · ${s.fieldCount} fields`,
				repoId: s.repoId,
				body: s.file,
				route: `/schemas/${encodeURIComponent(s.id)}`,
			})),
			...(core.collections ?? []).map(c => ({
				id: `collection|${c.id}`,
				kind: 'collection',
				title: c.name,
				subtitle: `${c.entityName ?? c.repositoryClass} · ${c.usedByUseCaseIds.length} use case(s)`,
				repoId: c.repoId,
				body: [c.repositoryClass, c.connection, c.entityName, c.domain].filter(Boolean).join(' '),
				route: `/database/${encodeURIComponent(c.id)}`,
			})),
			...(core.httpClients ?? []).map(c => ({
				id: `http|${c.id}`,
				kind: 'http',
				title: c.name,
				subtitle: `${c.system} · ${c.className} · ${c.usedByUseCaseIds.length} use case(s)`,
				repoId: c.repoId,
				body: [c.className, c.system, c.baseUrlRef, ...c.operations.map(o => `${o.httpMethod} ${o.path}`)].filter(Boolean).join(' '),
				route: `/dependencies/${encodeURIComponent(c.id)}`,
			})),
			...core.repos.map(r => ({
				id: `service|${r.id}`,
				kind: 'service',
				title: r.title,
				subtitle: r.name,
				repoId: r.id,
				body: r.summary,
				route: `/services/${r.id}`,
			})),
		];

		const engine = new MiniSearch<Doc>({
			fields: ['title', 'subtitle', 'body'],
			storeFields: ['title', 'subtitle', 'kind', 'repoId', 'route'],
			searchOptions: {
				prefix: true,
				fuzzy: 0.15,
				boost: { title: 4, subtitle: 1.5 },
				combineWith: 'AND',
			},
			// Split camelCase and dotted topic names into searchable words so
			// "redeem privilege" finds nlp.pty.redeemPrivilege.
			tokenize: text =>
				text
					.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
					.split(/[^a-zA-Z0-9_]+/)
					.filter(Boolean),
			processTerm: term => term.toLowerCase(),
		});
		engine.addAll(documents);
		return { search: engine, docs: documents };
	}, [core]);

	const results = useMemo(() => {
		if (!query.trim()) {
			return docs.filter(d => d.kind === 'flow').slice(0, 12);
		}
		return search
			.search(query, { prefix: true, fuzzy: 0.15, combineWith: 'AND' })
			.slice(0, 40)
			.map(r => docs.find(d => d.id === r.id)!)
			.filter(Boolean);
	}, [query, search, docs]);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		setCursor(0);
	}, [query]);

	const go = (doc: Doc | undefined) => {
		if (!doc) return;
		navigate(doc.route);
		onClose();
	};

	return (
		<div className="palette-backdrop" onMouseDown={onClose}>
			<div className="palette" onMouseDown={e => e.stopPropagation()}>
				<input
					ref={inputRef}
					className="palette__input"
					placeholder="Search flows, endpoints, use cases, topics, schemas, collections, HTTP…"
					value={query}
					onChange={e => setQuery(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Escape') onClose();
						if (e.key === 'ArrowDown') {
							e.preventDefault();
							setCursor(c => Math.min(c + 1, results.length - 1));
						}
						if (e.key === 'ArrowUp') {
							e.preventDefault();
							setCursor(c => Math.max(c - 1, 0));
						}
						if (e.key === 'Enter') go(results[cursor]);
					}}
				/>
				<div className="palette__results">
					{results.length === 0 ? (
						<div style={{ padding: '18px', color: 'var(--text-dimmer)', fontSize: 13 }}>
							Nothing matched “{query}”.
						</div>
					) : null}
					{results.map((doc, i) => (
						<div
							key={doc.id}
							className={`palette__item${i === cursor ? ' active' : ''}`}
							onMouseEnter={() => setCursor(i)}
							onClick={() => go(doc)}
						>
							<span className="badge" style={{ width: 74, justifyContent: 'center' }}>
								{KIND_LABEL[doc.kind] ?? doc.kind}
							</span>
							<span style={{ minWidth: 0, flex: 1 }}>
								<div className="palette__item-title">{doc.title}</div>
								<div className="palette__item-sub">{doc.subtitle}</div>
							</span>
							{doc.repoId ? (
								<span className="palette__item-sub nowrap">
									{indexes.repoById.get(doc.repoId)?.title ?? doc.repoId}
								</span>
							) : null}
						</div>
					))}
				</div>
				<div className="palette__hint">
					<span>↑ ↓ to move</span>
					<span>↵ to open</span>
					<span>esc to close</span>
					<span style={{ marginLeft: 'auto' }}>{docs.length.toLocaleString()} indexed</span>
				</div>
			</div>
		</div>
	);
}
