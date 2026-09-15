/**
 * Provenance page: exactly which commit of which branch each part of this site
 * was generated from, plus what has landed since, so you can tell at a glance
 * whether the docs are stale.
 */
import { Link } from 'react-router-dom';

import { Badge, Collapsible, Empty, PageHead, Section } from '../components/ui';
import { useData } from '../data';

function daysSince(iso: string): number {
	return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function ReleasesPage() {
	const { core } = useData();
	const staleCount = core.repos.filter(r => r.newCommitsSinceLastBuild.length > 0).length;
	const generatedDays = daysSince(core.generatedAt);

	return (
		<>
			<PageHead title="Versions & updates">
				This site is generated, never hand edited. Everything you have read was extracted from the
				commits listed below. Re-run the generator to move it forward.
			</PageHead>

			<div className="card">
				<div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
					<div>
						<div className="stat__value">{generatedDays === 0 ? 'today' : `${generatedDays}d ago`}</div>
						<div className="stat__label">Last generated</div>
					</div>
					<div>
						<div className="stat__value">{new Date(core.generatedAt).toLocaleString()}</div>
						<div className="stat__label">Exact timestamp</div>
					</div>
					<div>
						<div className="stat__value">
							{staleCount === 0 ? (
								<span style={{ color: 'var(--green)' }}>current</span>
							) : (
								<span style={{ color: 'var(--amber)' }}>{staleCount} behind</span>
							)}
						</div>
						<div className="stat__label">Against the last build</div>
					</div>
				</div>
			</div>

			<div className="callout">
				<strong>To refresh this site</strong> run <code>npm run update</code> in{' '}
				<code>nlp-flow-docs</code>. That fetches each branch, re-extracts everything, and rebuilds
				the static site. Use <code>npm run generate:offline</code> if you cannot reach GitHub and
				want to work from the refs you already have locally.
			</div>

			{core.repos.map(repo => (
				<Section
					key={repo.id}
					title={<Link to={`/services/${repo.id}`}>{repo.title}</Link>}
					subtitle={repo.name}
				>
					<div className="card">
						<div className="badges" style={{ marginBottom: 12 }}>
							<Badge tone="accent">{repo.branch}</Badge>
							<Badge tone="purple">
								<a href={`${repo.github}/commit/${repo.commit.sha}`} target="_blank" rel="noreferrer">
									{repo.commit.shortSha}
								</a>
							</Badge>
							<Badge>{repo.commit.date.slice(0, 10)}</Badge>
							{repo.latestTag ? <Badge tone="green">nearest tag {repo.latestTag}</Badge> : null}
							{repo.packageVersion ? <Badge>package v{repo.packageVersion}</Badge> : null}
							{repo.newCommitsSinceLastBuild.length ? (
								<Badge tone="amber">
									{repo.newCommitsSinceLastBuild.length} commit(s) newer than the previous build
								</Badge>
							) : (
								<Badge tone="green">unchanged since the previous build</Badge>
							)}
						</div>

						<p className="dim" style={{ marginTop: 0 }}>
							<span className="mono">{repo.commit.subject}</span> — {repo.commit.author}
						</p>

						{repo.newCommitsSinceLastBuild.length ? (
							<div style={{ marginTop: 14 }}>
								<h3>Landed since the previous docs build</h3>
								<Collapsible
									items={repo.newCommitsSinceLastBuild}
									limit={10}
									noun="commits"
									render={commit => (
										<div key={commit.sha} style={{ padding: '2px 0', fontSize: 12.5 }}>
											<a
												className="mono"
												href={`${repo.github}/commit/${commit.sha}`}
												target="_blank"
												rel="noreferrer"
											>
												{commit.shortSha}
											</a>{' '}
											<span className="dimmer">{commit.date.slice(0, 10)}</span>{' '}
											<span className="dim">{commit.subject}</span>
										</div>
									)}
								/>
							</div>
						) : null}

						{repo.recentTags.length ? (
							<div style={{ marginTop: 14 }}>
								<h3>Recent release tags</h3>
								<div className="badges">
									{repo.recentTags.map(tag => (
										<Badge key={tag.tag} title={`${tag.sha} · ${tag.date}`}>
											<a href={`${repo.github}/releases/tag/${tag.tag}`} target="_blank" rel="noreferrer">
												{tag.tag}
											</a>
										</Badge>
									))}
								</div>
								<p className="dimmer" style={{ fontSize: 12, marginBottom: 0 }}>
									To document a specific release instead of the branch head, set that tag as{' '}
									<code>branch</code> for this repo in <code>repos.config.json</code> and regenerate.
								</p>
							</div>
						) : (
							<Empty>No tags found in this repository.</Empty>
						)}
					</div>
				</Section>
			))}

			<Section title="What the generator reads" subtitle="so you know what it can and cannot know">
				<div className="card prose" style={{ maxWidth: 'none' }}>
					<ul>
						<li>
							<strong>Flows</strong> come from decorators and the call graph:{' '}
							<code>@Controller</code>/<code>@Get</code>/<code>@Post</code> for HTTP,{' '}
							<code>@EntryPoint</code>/<code>@EventPattern</code> for Kafka, and{' '}
							<code>this.dep.method()</code> chains to work out which topics a use case really
							publishes.
						</li>
						<li>
							<strong>Topics</strong> are resolved from the enum constants in each repo, so the
							strings shown are the literal topic names on the bus.
						</li>
						<li>
							<strong>Schemas</strong> come from DTO, entity, interface and enum declarations,
							including the <code>class-validator</code> decorators that define the real runtime
							contract.
						</li>
						<li>
							<strong>Blind spots:</strong> topics built dynamically at runtime, handlers wired
							through indirection the parser cannot follow, and anything gated behind{' '}
							<code>CONSUMER_TYPE</code> at deploy time. Where a link could not be resolved the
							page says so rather than guessing.
						</li>
					</ul>
				</div>
			</Section>
		</>
	);
}
