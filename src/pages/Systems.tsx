import { Link } from 'react-router-dom';

import { Badge, Collapsible, PageHead, RepoBadge, Section } from '../components/ui';
import { useData } from '../data';

const KIND_TONE: Record<string, string | undefined> = {
	http: 'accent',
	database: 'green',
	cache: 'amber',
	bus: 'purple',
	storage: 'teal',
};

export function SystemsPage() {
	const { core, indexes } = useData();
	const systems = core.systems
		.slice()
		.sort((a, b) => b.useCaseIds.length - a.useCaseIds.length);

	return (
		<>
			<PageHead title="Downstream systems">
				Everything the platform depends on beyond these four repositories. A use case is listed
				here when the call graph from its entry method reaches that system, so this doubles as a
				blast radius map: if D03 is down, the use cases under D03 are what breaks.
			</PageHead>

			{systems.map(system => (
				<Section
					key={system.id}
					title={
						<span id={system.id}>
							{system.title}{' '}
							<Badge tone={KIND_TONE[system.kind]}>{system.kind}</Badge>
						</span>
					}
					subtitle={`${system.useCaseIds.length} use case(s)`}
				>
					<div className="card">
						<p className="dim" style={{ marginTop: 0 }}>
							{system.description}
						</p>
						{system.id === 'mongo' ? (
							<p style={{ marginTop: 0 }}>
								<Link to="/database">Browse every Mongo collection →</Link>
							</p>
						) : null}
						<div className="badges" style={{ marginBottom: 12 }}>
							{system.usedByRepos.map(repoId => (
								<RepoBadge key={repoId} repoId={repoId} />
							))}
							{system.usedByRepos.length === 0 ? (
								<span className="dimmer" style={{ fontSize: 12.5 }}>
									Not reached by any use case we could resolve.
								</span>
							) : null}
						</div>
						<Collapsible
							items={system.useCaseIds}
							limit={12}
							noun="use cases"
							render={(id: string) => {
								const useCase = indexes.useCaseById.get(id);
								if (!useCase) return null;
								return (
									<div key={id} style={{ padding: '2px 0' }}>
										<Link to={`/use-cases/${encodeURIComponent(id)}`}>{useCase.title}</Link>{' '}
										<span className="dimmer" style={{ fontSize: 11.5 }}>
											· {indexes.repoById.get(useCase.repoId)?.title} · {useCase.domain}
										</span>
									</div>
								);
							}}
						/>
					</div>
				</Section>
			))}
		</>
	);
}
