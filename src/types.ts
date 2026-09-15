/**
 * Website side view of the generated data. The heavy types are re-exported from
 * the extractor so the two halves can never drift apart.
 */
export type {
	Consumer,
	Dependency,
	DependencyKind,
	DownstreamSystem,
	Endpoint,
	Flow,
	FlowStep,
	RepoDoc,
	RepoStats,
	Schema,
	SchemaField,
	SchemaLayer,
	SourceRef,
	Topic,
	UseCase,
} from '../extractor/model';

import type {
	Consumer,
	DownstreamSystem,
	Endpoint,
	RepoDoc,
	Topic,
	UseCase,
} from '../extractor/model';

export interface SchemaSummary {
	id: string;
	name: string;
	repoId: string;
	kind: 'class' | 'interface' | 'enum' | 'type';
	layer: string;
	fieldCount: number;
	usedByCount: number;
	file: string;
}

export interface FlowSummary {
	id: string;
	title: string;
	entry: { kind: 'endpoint' | 'topic'; id: string };
	entryRepoId: string;
	summary: string;
	repos: string[];
	topics: string[];
	systems: string[];
	stepCount: number;
	useCaseCount: number;
	crossService: boolean;
	external: boolean;
	tags: string[];
}

export interface CoreData {
	generatedAt: string;
	generatorVersion: string;
	repos: RepoDoc[];
	useCases: UseCase[];
	endpoints: Endpoint[];
	consumers: Consumer[];
	topics: Topic[];
	systems: DownstreamSystem[];
	stats: {
		repos: number;
		useCases: number;
		endpoints: number;
		consumers: number;
		topics: number;
		schemas: number;
		flows: number;
		crossServiceFlows: number;
	};
	schemaIndex: SchemaSummary[];
	flowIndex: FlowSummary[];
}
