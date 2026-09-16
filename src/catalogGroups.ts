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
