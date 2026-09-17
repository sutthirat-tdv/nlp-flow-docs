/**
 * The generated documentation data model.
 *
 * This file is imported by both the extractor (Node) and the website (browser),
 * so it must stay free of runtime dependencies.
 */

export interface SourceRef {
  repoId: string;
  file: string;
  line: number;
  /** Deep link to the exact line on the documented commit. */
  url: string;
}

export interface Dependency {
  /** Constructor property name, e.g. "loyaltyAccountRepository". */
  name: string;
  /** Injected class name, e.g. "LoyaltyAccountMongoRepository". */
  type: string;
  /** What kind of thing this dependency is, resolved across the repo. */
  kind: DependencyKind;
  /** Downstream system id from repos.config.json, when this dep leaves the service. */
  system?: string;
  /** Id of the resolved artifact (use case / manager / repository) when known. */
  targetId?: string;
}

export type DependencyKind =
  | "use-case"
  | "manager"
  | "service"
  | "mongo-repository"
  | "http-repository"
  | "kafka-producer"
  | "cache"
  | "logging"
  | "helper"
  | "unknown";

export interface SchemaField {
  name: string;
  type: string;
  optional: boolean;
  /** Validation + documentation decorators, verbatim, e.g. "@IsString()". */
  decorators: string[];
  /** Human readable rules distilled from the decorators. */
  rules: string[];
  description?: string;
  example?: string;
  /** Schema ids this field's type refers to, for nested navigation. */
  refs: string[];
  comment?: string;
}

export interface Schema {
  id: string;
  name: string;
  repoId: string;
  kind: "class" | "interface" | "enum" | "type";
  /** Which layer the schema belongs to: http, use-case, kafka, persistence, ... */
  layer: SchemaLayer;
  extends: string[];
  fields: SchemaField[];
  enumMembers?: { name: string; value: string }[];
  typeText?: string;
  source: SourceRef;
  usedBy: string[];
}

export type SchemaLayer =
  | "http-request"
  | "http-response"
  | "use-case"
  | "kafka-event"
  | "service"
  | "persistence"
  | "downstream"
  | "shared";

export interface Topic {
  /** The topic string itself, e.g. "nlp.pty.redeemPrivilege". */
  name: string;
  id: string;
  /** Enum aliases that point at this topic, per repo. */
  aliases: {
    repoId: string;
    enumName: string;
    member: string;
    source: SourceRef;
  }[];
  /** Naming-convention derived family: the command topic this reply belongs to. */
  family: string | null;
  kind: "command" | "event" | "failure" | "cdc" | "unknown";
  consumedBy: string[];
  producedBy: string[];
}

export interface UseCase {
  id: string;
  name: string;
  className: string;
  repoId: string;
  domain: string;
  /** One line, derived from the class name. */
  title: string;
  source: SourceRef;
  loc: number;
  entryMethod: string;
  inputType: string | null;
  outputType: string | null;
  inputSchemaId: string | null;
  outputSchemaId: string | null;
  dependencies: Dependency[];
  /** Topics this use case (directly or through its managers) publishes. */
  producesTopics: string[];
  /** Downstream system ids touched, directly or transitively. */
  systems: string[];
  /** Endpoints and consumers that invoke this use case. */
  invokedBy: string[];
  /** Other use cases / managers this one calls. */
  calls: string[];
  /** Mongo collections this use case (or a repository it calls) actually touches. */
  collectionAccess: CollectionAccess[];
  /** Axios/HTTP clients this use case actually calls. */
  httpAccess: HttpAccess[];
  /** Notable business rules: thrown errors and guard conditions. */
  errors: string[];
  tags: string[];
}

export type CollectionOpKind =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "upsert"
  | "other";

export interface CollectionOperation {
  /** Repository method name, e.g. "create" or "findOneById". */
  name: string;
  kind: CollectionOpKind;
  /** Native driver calls inside the method: insertOne, findOne, updateOne, … */
  driverCalls: string[];
  source: SourceRef;
}

export interface CollectionLink {
  collectionId: string;
  /** Field name, imported constant, entity type, or same collection name. */
  via: string;
  kind: "field" | "type" | "import" | "same-name";
}

/** Compact column on a Mongo collection, for the database diagram. */
export interface CollectionColumn {
  name: string;
  type: string;
  optional: boolean;
  pk: boolean;
  fk: boolean;
}

export interface CollectionAccess {
  collectionId: string;
  operations: { name: string; kind: CollectionOpKind }[];
}

/**
 * A MongoDB collection owned by one of the four services. Native driver
 * (`db.collection(...)`), not Mongoose — collection names come from string
 * constants or `collectionName` properties on `*MongoRepository` classes.
 */
export interface MongoCollection {
  id: string;
  repoId: string;
  /** Literal Mongo collection name, e.g. "loyaltyProgramMember". */
  name: string;
  domain: string;
  /** Nest `@Inject('…')` connection token, when present. */
  connection: string | null;
  repositoryClass: string;
  repositoryFile: string;
  entityName: string | null;
  entitySchemaId: string | null;
  operations: CollectionOperation[];
  /** Use cases whose call graph hits this repository. */
  usedByUseCaseIds: string[];
  related: CollectionLink[];
  /** Document fields when the entity schema resolved — drawn on the database diagram. */
  fields: CollectionColumn[];
  source: SourceRef;
}

export type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpOperation {
  /** Repository / client method name, e.g. "findOneById". */
  name: string;
  httpMethod: HttpVerb;
  /** Path as called, with params as `:id`. Host comes from `baseUrlRef`. */
  path: string;
  via: "factory" | "axios";
  source: SourceRef;
}

export interface HttpLink {
  clientId: string;
  via: string;
  kind: "same-client";
}

export interface HttpAccess {
  clientId: string;
  operations: { name: string; httpMethod: HttpVerb; path: string }[];
}

/**
 * An outbound HTTP client that goes through AxiosService (or a D03/PNS/AAF
 * factory wrapping it). One class per card — CustomerD03Repository, SAPRepository.
 */
export interface HttpClient {
  id: string;
  repoId: string;
  name: string;
  className: string;
  system: string;
  domain: string;
  /** Source expression for the base URL, e.g. D03_CUSTOMER_BASE_URL. */
  baseUrlRef: string | null;
  repositoryFile: string;
  operations: HttpOperation[];
  usedByUseCaseIds: string[];
  related: HttpLink[];
  source: SourceRef;
}

export interface Endpoint {
  id: string;
  repoId: string;
  domain: string;
  method: string;
  /** Full path including global prefix and version, e.g. "/api/v1/users". */
  path: string;
  controller: string;
  handler: string;
  summary: string | null;
  tags: string[];
  permissions: string[];
  guards: string[];
  auth: boolean;
  requestSchemas: {
    location: "body" | "query" | "param" | "header";
    type: string;
    schemaId: string | null;
  }[];
  responseSchemas: { status: string; type: string; schemaId: string | null }[];
  useCaseIds: string[];
  source: SourceRef;
  deprecated: boolean;
}

export interface Consumer {
  id: string;
  repoId: string;
  domain: string;
  topic: string;
  controller: string;
  handler: string;
  payloadType: string | null;
  payloadSchemaId: string | null;
  useCaseIds: string[];
  /** Consumer group slice (CONSUMER_TYPE) this handler is deployed in. */
  consumerGroups: string[];
  /** True when the handler only forwards a request/reply answer. */
  isReplyListener: boolean;
  source: SourceRef;
}

export interface FlowStep {
  depth: number;
  kind: "endpoint" | "topic" | "consumer" | "use-case" | "manager" | "system";
  id: string;
  repoId: string | null;
  label: string;
  detail?: string;
  /** Index of the parent step in the flow's step array. */
  parent: number | null;
  truncated?: boolean;
}

export interface Flow {
  id: string;
  title: string;
  /** Where the flow starts from the outside world. */
  entry: { kind: "endpoint" | "topic"; id: string };
  entryRepoId: string;
  summary: string;
  steps: FlowStep[];
  /** Repos involved, in traversal order. */
  repos: string[];
  topics: string[];
  systems: string[];
  useCaseIds: string[];
  mermaid: string;
  crossService: boolean;
  tags: string[];
  /** True when nothing inside these four repos triggers the entry itself. */
  external: boolean;
  /** For topic-rooted flows: use cases inside these repos that publish the entry topic. */
  producedBy: string[];
}

export interface RepoStats {
  useCases: number;
  endpoints: number;
  consumers: number;
  schemas: number;
  collections: number;
  httpClients: number;
  topicsProduced: number;
  topicsConsumed: number;
  domains: number;
  files: number;
}

export interface RepoDoc {
  id: string;
  name: string;
  title: string;
  /** Short badge / diagram label (OPENAPI, BACKOFFICE, DAG, DOS, CRONJOB). */
  tag: string;
  role: string;
  layer: number;
  summary: string;
  audience: string;
  github: string;
  branch: string;
  commit: {
    sha: string;
    shortSha: string;
    date: string;
    author: string;
    subject: string;
  };
  latestTag: string | null;
  packageVersion: string | null;
  nodeVersion: string | null;
  recentTags: { tag: string; date: string; sha: string }[];
  newCommitsSinceLastBuild: {
    sha: string;
    shortSha: string;
    date: string;
    author: string;
    subject: string;
  }[];
  previousBuildCommit: string | null;
  readme: string | null;
  envVars: { name: string; comment?: string }[];
  domains: {
    name: string;
    useCases: number;
    endpoints: number;
    consumers: number;
  }[];
  stats: RepoStats;
}

export interface DownstreamSystem {
  id: string;
  title: string;
  kind: string;
  description: string;
  usedByRepos: string[];
  useCaseIds: string[];
}

/** One repo's copy of a shared infrastructure config module. */
export interface InfraSource {
  repoId: string;
  source: SourceRef;
  loc: number;
}

/**
 * A platform concern (Kafka bootstrap, Redis hardening, logging, ...) that
 * most or all of the five repos re-implement as their own `*.config.ts`,
 * usually copy-pasted with minor drift. One entry per concern, merged across
 * every repo that has a copy, with the doc comments explaining *why* pulled
 * out and deduplicated rather than left buried five times over.
 */
export interface InfraKind {
  id: string;
  title: string;
  /** "downstream" mirrors a DownstreamSystem entry; "platform" is generic (logging, Kafka bootstrap, ...). */
  category: "downstream" | "platform";
  /** The matching DownstreamSystem id, when this kind also has a /systems entry. */
  systemId: string | null;
  /**
   * Curated, hand-written fallback description — the only hand-written prose
   * outside of /guide. Used when the code has no doc comments explaining
   * itself; based on actually reading the config module, not guessed. Kept
   * separate from `notes` so the site is honest about what's generated vs not.
   */
  summary: string | null;
  /** Deduplicated operational notes pulled from doc comments across every repo's copy. */
  notes: string[];
  /** Env var names any repo's copy reads, merged and sorted. */
  envVars: string[];
  /** One entry per repo that has a matching config file, so a reader can compare copies. */
  sources: InfraSource[];
}

export interface Catalog {
  generatedAt: string;
  generatorVersion: string;
  repos: RepoDoc[];
  useCases: UseCase[];
  endpoints: Endpoint[];
  consumers: Consumer[];
  topics: Topic[];
  schemas: Schema[];
  collections: MongoCollection[];
  httpClients: HttpClient[];
  flows: Flow[];
  systems: DownstreamSystem[];
  infra: InfraKind[];
  stats: {
    repos: number;
    useCases: number;
    endpoints: number;
    consumers: number;
    topics: number;
    schemas: number;
    collections: number;
    httpClients: number;
    flows: number;
    crossServiceFlows: number;
  };
}
