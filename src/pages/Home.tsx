import { Link } from 'react-router-dom';

import { Mermaid } from '../components/Mermaid';
import { Badge, PageHead, RepoBadge, Section, Stat } from '../components/ui';
import { useData } from '../data';

const ARCHITECTURE = `flowchart TD
  subgraph channels["Channels and operators"]
    myais["MyAIS / USSD / partners / BBL"]:::actor
    bo["Back office console"]:::actor
  end
  subgraph entry["Layer 1 - entry points (HTTP)"]
    openapi["nlp-openapi-bff"]:::svc
    backoffice["nlp-backoffice-bff"]:::svc
  end
  subgraph bus["Kafka event service bus"]
    topics[/"nlp.pty.* / nlp.bff.* / esb.* / mfaf.*"/]:::topic
  end
  subgraph agg["Layer 2 - aggregation"]
    aggc["esb-loyalty-management-agg-common"]:::svc
  end
  subgraph domain["Layer 3 - domain (system of record)"]
    tmf["esb-dos-TMF658-loyalty-management-nlp"]:::svc
  end
  subgraph down["Downstream"]
    d03[("D03 TMF APIs")]:::sys
    mongo[("MongoDB")]:::sys
    others[("SAP / PNS / IKM / MFAF / mPAY / ...")]:::sys
  end
  myais --> openapi
  bo --> backoffice
  openapi --> topics
  backoffice --> topics
  topics --> aggc
  topics --> tmf
  aggc --> topics
  tmf --> topics
  tmf --> mongo
  tmf --> d03
  tmf --> others
  backoffice --> mongo
  openapi --> d03
  classDef actor fill:#0f172a,stroke:#334155,color:#cbd5e1
  classDef svc fill:#1d4ed8,stroke:#1e3a8a,color:#fff
  classDef topic fill:#7c2d12,stroke:#7c2d12,color:#fff
  classDef sys fill:#334155,stroke:#0f172a,color:#fff`;

export function HomePage() {
	const { core } = useData();

	const entryFlows = core.flowIndex
		.filter(f => f.entry.kind === 'topic' && f.external && f.stepCount > 3)
		.sort((a, b) => b.stepCount - a.stepCount)
		.slice(0, 8);

	const deepestFlows = core.flowIndex
		.filter(f => f.entry.kind === 'endpoint' && f.crossService)
		.sort((a, b) => b.repos.length * 100 + b.stepCount - (a.repos.length * 100 + a.stepCount))
		.slice(0, 8);

	return (
		<>
			<PageHead title="The NLP loyalty platform, end to end">
				Every HTTP endpoint, Kafka topic, use case and data schema in the four services below,
				read directly from the <code>sit</code> branch of each repository. Start with the{' '}
				<Link to="/guide">new joiner guide</Link>, or press{' '}
				<Badge>⌘K</Badge> and search for whatever you are chasing.
			</PageHead>

			<div className="grid grid--4">
				<Stat value={core.stats.flows.toLocaleString()} label="Flows" to="/flows" />
				<Stat value={core.stats.endpoints.toLocaleString()} label="API endpoints" to="/endpoints" />
				<Stat value={core.stats.topics.toLocaleString()} label="Kafka topics" to="/topics" />
				<Stat value={core.stats.useCases.toLocaleString()} label="Use cases" to="/use-cases" />
				<Stat value={core.stats.schemas.toLocaleString()} label="Data schemas" to="/schemas" />
				<Stat
					value={core.stats.crossServiceFlows.toLocaleString()}
					label="Cross service flows"
					to="/flows?scope=cross"
				/>
				<Stat value={core.stats.consumers.toLocaleString()} label="Kafka consumers" to="/topics" />
				<Stat value={core.systems.length} label="Downstream systems" to="/systems" />
			</div>

			<Section
				title="How the platform fits together"
				subtitle="three layers, joined by Kafka"
			>
				<Mermaid chart={ARCHITECTURE} />
			</Section>

			<Section title="The four services" subtitle="in request order">
				<div className="grid grid--2">
					{core.repos
						.slice()
						.sort((a, b) => a.layer - b.layer)
						.map(repo => (
							<Link key={repo.id} to={`/services/${repo.id}`} className="repo-card">
								<div className="repo-card__title">{repo.title}</div>
								<div className="repo-card__name">{repo.name}</div>
								<div className="repo-card__summary">{repo.summary}</div>
								<div className="badges">
									<Badge tone="accent">layer {repo.layer}</Badge>
									{repo.stats.endpoints ? <Badge>{repo.stats.endpoints} endpoints</Badge> : null}
									<Badge>{repo.stats.useCases} use cases</Badge>
									<Badge>{repo.stats.consumers} consumers</Badge>
									<Badge tone="purple">{repo.commit.shortSha}</Badge>
								</div>
							</Link>
						))}
				</div>
			</Section>

			<Section
				title="Platform entry topics"
				subtitle="Kafka messages produced outside these four repos"
				actions={<Link to="/flows?entry=topic">all topic flows →</Link>}
			>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Entry topic</th>
								<th>Lands in</th>
								<th className="nowrap">Services</th>
								<th className="nowrap">Steps</th>
							</tr>
						</thead>
						<tbody>
							{entryFlows.map(flow => (
								<tr key={flow.id}>
									<td>
										<Link className="mono" to={`/flows/${encodeURIComponent(flow.id)}`}>
											{flow.entry.id}
										</Link>
									</td>
									<td>
										<div className="badges">
											{flow.repos.map(r => (
												<RepoBadge key={r} repoId={r} />
											))}
										</div>
									</td>
									<td className="mono dim">{flow.repos.length}</td>
									<td className="mono dim">{flow.stepCount}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>

			<Section
				title="Widest HTTP flows"
				subtitle="the requests that touch the most services"
				actions={<Link to="/flows?entry=endpoint">all endpoint flows →</Link>}
			>
				<div className="table-wrap">
					<table>
						<thead>
							<tr>
								<th>Flow</th>
								<th>Entry</th>
								<th>Services</th>
								<th className="nowrap">Topics</th>
							</tr>
						</thead>
						<tbody>
							{deepestFlows.map(flow => (
								<tr key={flow.id}>
									<td>
										<Link to={`/flows/${encodeURIComponent(flow.id)}`}>{flow.title}</Link>
									</td>
									<td className="mono dim" style={{ fontSize: 12 }}>
										{flow.entry.id.split(':').slice(1).join(':').split('#')[0]}
									</td>
									<td>
										<div className="badges">
											{flow.repos.map(r => (
												<RepoBadge key={r} repoId={r} />
											))}
										</div>
									</td>
									<td className="mono dim">{flow.topics.length}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>
		</>
	);
}
