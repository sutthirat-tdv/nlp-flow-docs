/**
 * Shared grouping helpers for catalog list pages.
 */

const KNOWN_TOPIC_NAMESPACES = [
  "nlp.pty",
  "nlp.bff",
  "nlp.ccm",
  "esb.pty",
  "esb.prd",
  "esb.ccm",
  "sid.cdc",
] as const;

/** Flat buses where the first segment alone is the namespace. */
const ROOT_TOPIC_NAMESPACES = new Set(["dsb", "mfaf", "sap"]);

/** Topic bus namespace — e.g. nlp.pty, nlp.bff, dsb, mfaf. */
export function topicNamespace(name: string): string {
  const parts = name.split(".").filter(Boolean);
  if (!parts.length) return "other";
  if (ROOT_TOPIC_NAMESPACES.has(parts[0])) return parts[0];
  if (parts.length >= 2) {
    const two = `${parts[0]}.${parts[1]}`;
    if (
      (KNOWN_TOPIC_NAMESPACES as readonly string[]).includes(two) ||
      parts.length > 2
    ) {
      return two;
    }
    return parts[0];
  }
  return parts[0];
}

const TOPIC_NAMESPACE_ORDER = [
  ...KNOWN_TOPIC_NAMESPACES,
  "dsb",
  "mfaf",
  "sap",
];

export function topicNamespaceRank(ns: string): number {
  const i = TOPIC_NAMESPACE_ORDER.indexOf(ns);
  return i === -1 ? 100 + (ns.charCodeAt(0) || 0) : i;
}

export type ApiSurfaceId =
  | "backoffice"
  | "legacy"
  | "openapi"
  | "iam"
  | "other";

export function apiSurface(endpoint: {
  repoId: string;
  path: string;
}): { id: ApiSurfaceId; label: string } {
  const path = endpoint.path.toLowerCase();
  if (endpoint.repoId === "backoffice-bff") {
    return { id: "backoffice", label: "Back Office API" };
  }
  if (path.startsWith("/legacy-api")) {
    return { id: "legacy", label: "Legacy API" };
  }
  if (path.startsWith("/iam-user") || path.includes("/iam-user/")) {
    return { id: "iam", label: "IAM user API" };
  }
  if (
    endpoint.repoId === "openapi-bff" &&
    (path.startsWith("/api/") || path === "/api")
  ) {
    return { id: "openapi", label: "OpenAPI / Warranty" };
  }
  return { id: "other", label: "Other HTTP" };
}

const API_SURFACE_ORDER: ApiSurfaceId[] = [
  "backoffice",
  "legacy",
  "openapi",
  "iam",
  "other",
];

export function apiSurfaceRank(id: ApiSurfaceId): number {
  const i = API_SURFACE_ORDER.indexOf(id);
  return i === -1 ? 99 : i;
}

export type FlowBeginningId =
  | ApiSurfaceId
  | "other-http"
  | "batch"
  | "kafka-external"
  | "kafka-internal";

/**
 * How a flow begins — the HTTP surface it enters through, a scheduled batch
 * job, or a Kafka topic (split into entry topics published from outside
 * these repos vs ones something here also publishes, since those read very
 * differently: one is "where the platform's boundary is", the other is "a
 * topic worth looking up on its own").
 */
export function flowBeginning(
  flow: {
    entry: { kind: "endpoint" | "topic"; id: string };
    external: boolean;
  },
  endpointById: Map<string, { repoId: string; path: string; method: string }>,
): { id: FlowBeginningId; label: string } {
  if (flow.entry.kind === "topic") {
    return flow.external
      ? { id: "kafka-external", label: "Kafka — entry topics" }
      : { id: "kafka-internal", label: "Kafka — internal topics" };
  }
  const endpoint = endpointById.get(flow.entry.id);
  if (!endpoint) return { id: "other-http", label: "Other HTTP" };
  if (endpoint.method === "CRON") {
    return { id: "batch", label: "Batch jobs (CRON)" };
  }
  const surface = apiSurface(endpoint);
  if (surface.id === "other") return { id: "other-http", label: "Other HTTP" };
  return surface;
}

const FLOW_BEGINNING_ORDER: FlowBeginningId[] = [
  "backoffice",
  "legacy",
  "openapi",
  "iam",
  "other-http",
  "batch",
  "kafka-external",
  "kafka-internal",
];

export function flowBeginningRank(id: FlowBeginningId): number {
  const i = FLOW_BEGINNING_ORDER.indexOf(id);
  return i === -1 ? 99 : i;
}

export interface FlowModule {
  repoId: string;
  domain: string;
}

/**
 * The module/feature a flow belongs to — reuses the `domain` field already
 * on every endpoint/consumer (derived by the extractor from source folder
 * structure, e.g. `src/domains/<domain>/...`), rather than inventing a
 * separate taxonomy. For an endpoint-rooted flow that's the entry endpoint's
 * own domain; for a topic-rooted flow it's the domain of whichever consumer
 * in the entry repo actually handles that topic.
 */
export function flowModule(
  flow: {
    entry: { kind: "endpoint" | "topic"; id: string };
    entryRepoId: string;
  },
  endpointById: Map<string, { domain: string }>,
  consumersByTopic: Map<string, { repoId: string; domain: string }[]>,
): FlowModule | null {
  if (flow.entry.kind === "endpoint") {
    const endpoint = endpointById.get(flow.entry.id);
    return endpoint ? { repoId: flow.entryRepoId, domain: endpoint.domain } : null;
  }
  const consumers = consumersByTopic.get(flow.entry.id) ?? [];
  const match =
    consumers.find((c) => c.repoId === flow.entryRepoId) ?? consumers[0];
  return match ? { repoId: flow.entryRepoId, domain: match.domain } : null;
}

/** Preferred order for outbound HTTP dependency sections. */
const HTTP_SYSTEM_ORDER = [
  "d03",
  "sap",
  "pns",
  "ikm",
  "aaf",
  "gsso",
  "thanos",
  "prc",
  "mpay",
  "d64",
  "cms",
  "email",
  "ac",
  "esb-gateway",
  "openapi-master-data",
  "http",
];

export function httpSystemRank(systemId: string): number {
  const i = HTTP_SYSTEM_ORDER.indexOf(systemId);
  return i === -1 ? 100 + (systemId.charCodeAt(0) || 0) : i;
}

export type MongoDbFamilyId = "bff" | "lid" | "sid" | "other";

export function mongoDbFamily(connection: string | null | undefined): {
  id: MongoDbFamilyId;
  label: string;
  /** Short label for the Connection column (family is already in the section). */
  connectionLabel: string;
  /** Full Nest inject token, when known. */
  token: string | null;
} {
  const token = connection ?? "";
  if (token.startsWith("LID_")) {
    const sub = token
      .replace(/^LID_/, "")
      .replace(/_CONNECTION$/, "")
      .toLowerCase();
    return {
      id: "lid",
      label: "LID",
      connectionLabel: sub || "lid",
      token: connection ?? null,
    };
  }
  if (token === "LOYALTY_MANAGEMENT_CONNECTION") {
    return {
      id: "sid",
      label: "SID",
      connectionLabel: "loyalty-management",
      token: connection ?? null,
    };
  }
  if (token === "BFF_DATABASE_CONNECTION") {
    return {
      id: "bff",
      label: "BFF",
      connectionLabel: "bff",
      token: connection ?? null,
    };
  }
  if (token === "NLP_DATABASE_CONNECTION") {
    return {
      id: "bff",
      label: "BFF",
      connectionLabel: "nlp",
      token: connection ?? null,
    };
  }
  return {
    id: "other",
    label: "Other",
    connectionLabel: token || "—",
    token: connection ?? null,
  };
}

const MONGO_DB_FAMILY_ORDER: MongoDbFamilyId[] = [
  "bff",
  "lid",
  "sid",
  "other",
];

export function mongoDbFamilyRank(id: MongoDbFamilyId): number {
  const i = MONGO_DB_FAMILY_ORDER.indexOf(id);
  return i === -1 ? 99 : i;
}
