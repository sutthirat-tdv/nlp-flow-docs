/**
 * Shared infrastructure config, deduplicated across repos.
 *
 * Every repo has its own `src/configs/*.config.ts` (plus a couple of
 * infrastructure-specific spots: `infrastructure/axios/configs/`,
 * `infrastructure/eventServiceBus/`) for the platform concerns every NestJS
 * service needs: env loading, logging, the Kafka client, Redis hardening,
 * outbound HTTP, per-downstream-system connection details. These are
 * usually copy-pasted between repos with only minor drift — see
 * REQUIREMENTS.md's note on this page. Rather than document five
 * near-identical files five times, one InfraKind merges every repo's copy:
 * the doc comments (which explain *why*, not just *what*) deduplicated, the
 * env vars each reads, and a source link into every repo that has one.
 *
 * Deliberately curated, not "every *.config.ts under src/configs": business
 * config (campaign rules, mission, segmentation, currency, message
 * templates, ...) isn't infrastructure and is left out.
 */
import { ParsedFile, parseFile, walkFiles } from "./ast.js";
import { RepoConfig } from "./config.js";
import { InfraKind, InfraSource, SourceRef } from "./model.js";
import { RepoProvenance } from "./sync.js";

interface InfraKindDef {
  /**
   * Merge key. Defaults to the stem itself — only set this when a *different*
   * stem is the same concern under another name (email vs graph-email, mpay
   * vs mpay-dcb). Do NOT reuse `systemId` for this: several distinct concerns
   * (the Kafka client itself vs the request/reply correlation layer on top of
   * it) legitimately share one systemId without being the same file.
   */
  id?: string;
  title: string;
  category: "downstream" | "platform";
  /** Matching id in repos.config.json's downstreamSystems, for cross-linking to /systems. Not a merge key. */
  systemId?: string;
  /**
   * Curated fallback description, used only when a repo's actual copy has no
   * doc comments explaining itself. Every one of these is grounded in having
   * read the real file (see the commit that added them) — not guessed. Kept
   * out of `notes` on purpose: that field is extracted, this one is written.
   */
  summary?: string;
}

/** Config filename stem (without `.config.ts`) -> canonical concern. */
const INFRA_KIND_BY_STEM: Record<string, InfraKindDef> = {
  env: {
    title: "Environment & zone config",
    category: "platform",
    summary:
      "The central env-var registry each repo parses at startup — zone, Kafka tuning, feature flags, and (in most repos) the base URLs + API keys for every downstream system it talks to, all in one file. A repo-specific module like d03.config.ts or redis.config.ts usually holds only a handful of extra tuning knobs; the actual connection details live here instead.",
  },
  logger: {
    title: "Structured logging",
    category: "platform",
    summary:
      "Two knobs on how much gets logged: LOG_MAX_LENGTH (and LOG_ARRAY_MAX_LENGTH in tmf658) caps how much of a single logged value is printed, and DISABLED_LOG_ACTIONS is a comma-separated list of action names to suppress entirely.",
  },
  server: {
    title: "HTTP server bootstrap",
    category: "platform",
    summary:
      "Loads assets/config/<ZONE>.config.yaml (Kafka client/consumer tuning, HTTP, ...) with js-yaml at startup, keyed by the ZONE env var (local/dev/sit/uat/prod). The Kafka client bootstrap config reads the same YAML file.",
  },
  swagger: {
    title: "OpenAPI / Swagger docs",
    category: "platform",
    summary:
      "One NestJS Swagger DocumentBuilder call — title, description, version, and a Bearer-JWT auth scheme for the OpenAPI docs served at /docs-json.",
  },
  passport: {
    title: "Authentication (Passport)",
    category: "platform",
    summary:
      "SAML / Entra ID single sign-on settings — entry point, issuer, certificate, callback and IdP logout URLs, an accepted clock-skew tolerance for the SAML assertion, and a flag to fall back to standalone (non-SSO) authentication.",
  },
  paginate: {
    title: "Pagination defaults",
    category: "platform",
    summary:
      "Two defaults: page (DEFAULT_PAGINATE_PAGE, default 1) and perPage (DEFAULT_PAGINATE_PERPAGE, default 10), plus a fixed perPageSearchList of 50 for search endpoints.",
  },
  "health-check": { title: "Health checks", category: "platform" },
  kafka: {
    title: "Kafka client bootstrap",
    category: "platform",
    systemId: "kafka",
    summary:
      "Loads assets/config/<ZONE>.config.yaml for broker connection/consumer tuning (connection timeout, SSL, session timeout, auto topic creation), then layers KAFKA_CLIENT_ID / KAFKA_GROUP_ID / BROKERS env vars on top. SASL (mechanism 'plain', API_KEY/API_SECRET) is enabled for every zone except local.",
  },
  "request-reply": {
    title: "Kafka request/reply correlation",
    category: "platform",
    systemId: "kafka",
    summary:
      "How long a Kafka request/reply call (a produced message plus a correlation id, waiting on a reply topic) is allowed to hang before timing out — REQUEST_REPLY_TIMEOUT, 60s by default. Individual flows can carry their own longer override; see the notes below for tmf658's redeem-premium exception, which waits on three separate reply channels.",
  },
  axios: {
    title: "Outbound HTTP client (Axios)",
    category: "platform",
    summary:
      "One shared object: request timeout and max redirects/retries for AxiosService, plus the list of field names (password, token, apikey, secret, credit_card, ...) that get redacted before a request or response is logged.",
  },
  redis: { title: "Redis", category: "downstream", systemId: "redis" },
  d03: {
    title: "D03 TMF APIs",
    category: "downstream",
    systemId: "d03",
    summary:
      "Despite the name, d03.config.ts itself is nearly empty — just a pagination chunk size (D03_GET_DATA_CHUNK_SIZE). The actual per-API-family base URL + API key (customer, party, inventory, resource pool/catalog, loyalty, balance management — plus LID variants that fall back to the non-LID URL when unset) live in env.config.ts instead.",
  },
  d64: {
    title: "D64 / LID analytics",
    category: "downstream",
    systemId: "d64",
  },
  sap: {
    title: "SAP",
    category: "downstream",
    systemId: "sap",
    summary: "Three values: base URL, API key and an environment string for SAP budget/WBS checks. Nothing else.",
  },
  pns: {
    title: "PNS",
    category: "downstream",
    systemId: "pns",
    summary:
      "Base URL, app identity (app id/name/version, sender id) and the one notification-by-user-id endpoint used to call AIS's push notification service.",
  },
  ikm: {
    title: "IKM",
    category: "downstream",
    systemId: "ikm",
    summary: "Two values: base URL and API key for the IKM content service. Nothing else.",
  },
  aaf: {
    title: "AAF",
    category: "downstream",
    systemId: "aaf",
    summary:
      "Base URL, API key and HTTP timeout/redirect tuning for AAF, plus the partner names (KBank, Bangchak, PointX) AAF requests are tagged with.",
  },
  ac: {
    title: "AC",
    category: "downstream",
    systemId: "ac",
    summary:
      "Base URL and timeout/redirect/retry tuning for the AC partner API, a static map of partner and currency codes (KBank, Bangchak, PointX, PTMAX, KSC), and every AC endpoint path (verify, authenticate, payment confirm, redeem point, OTP request/verify, ...) as a literal string map.",
  },
  "esb-gateway": {
    title: "ESB gateway",
    category: "downstream",
    systemId: "esb-gateway",
    summary:
      "Base URL, channel secret and timeout/redirect tuning for the ESB gateway's enquiry endpoint. The same file also holds a second, separate integration's settings — the 'MPAY One' payment gateway's base URL/API key/merchant id/secret — distinct from mpay-dcb.config.ts's 'MPAY DCB' integration below.",
  },
  email: {
    title: "Email sending",
    category: "downstream",
    systemId: "email",
    summary:
      "SMTP host/port/sender plus a Microsoft OAuth client-credential grant (against login.microsoftonline.com) for sending through an Outlook/Office365 mailbox. cronjob additionally has graph-email.config.ts, which talks to the Microsoft Graph API directly (mailFolders/Inbox, SentItems, DeletedItems, JunkEmail) instead of SMTP — a second, different way of reaching the same kind of mailbox.",
  },
  "graph-email": {
    id: "email",
    title: "Email sending",
    category: "downstream",
    systemId: "email",
  },
  sftp: {
    title: "SFTP file transfer",
    category: "downstream",
    summary:
      "Reads either one base64-JSON blob (SFTP_CONNECTION_CONFIG) or up to nine separate per-partner JSON env vars (SAP, BBL, KTB, SCBT, Bangchak, KBank Seamless, FS NLP Settlement, KBank Point Exchange, MPAY) and merges whichever are set into one config object, falling back to an empty object if none parse. Keepalive interval/count and the connection-ready timeout are tuned separately.",
  },
  mpay: {
    title: "mPAY",
    category: "downstream",
    systemId: "mpay",
    summary:
      "Base URL, API key, HTTP timeout/redirects and a service number for the 'MPAY DCB' direct-carrier-billing integration, plus its two endpoint paths (partial refund, reserve and charge volume). A second, separate mPAY integration ('MPAY One') is configured inside esb-gateway.config.ts above.",
  },
  "mpay-dcb": {
    id: "mpay",
    title: "mPAY",
    category: "downstream",
    systemId: "mpay",
  },
};

/** Where to look, repo-relative, in rough order of how much they matter. */
const INFRA_DIRS = [
  "src/configs",
  "src/infrastructure/axios/configs",
  "src/infrastructure/eventServiceBus",
  "src/infrastructure/eventServiceBus/configs",
  "src/loyaltyManagement/config",
];

export interface RawInfraFile {
  repoId: string;
  kindId: string;
  file: string;
  source: SourceRef;
  loc: number;
  notes: string[];
  envVars: string[];
}

function stemOf(file: string): string {
  const base = file.split("/").pop() ?? file;
  return base.replace(/\.config\.ts$/, "");
}

function sourceRef(repo: RepoConfig, prov: RepoProvenance, file: string): SourceRef {
  return {
    repoId: repo.id,
    file,
    line: 1,
    url: `${repo.github}/blob/${prov.commit.sha}/${file}`,
  };
}

/** Every `/** ... *\/` block, cleaned, trivial ones (< 40 chars) dropped. */
function extractDocComments(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    const cleaned = m[1]
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 40) out.push(cleaned);
  }
  return out;
}

/** `process.env.FOO` reads, plus SCREAMING_SNAKE names imported from a relative `env.config`. */
function extractEnvVars(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    names.add(m[1]);
  }
  for (const m of text.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*env\.config['"]/g,
  )) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.add(name);
    }
  }
  return [...names].sort();
}

export function findInfraFiles(
  repo: RepoConfig,
  prov: RepoProvenance,
  snapshotRoot: string,
): RawInfraFile[] {
  const out: RawInfraFile[] = [];
  const seen = new Set<string>();

  const candidates = walkFiles(snapshotRoot, (rel) => {
    if (!rel.endsWith(".config.ts")) return false;
    if (rel.includes("/_developer/") || rel.includes("_test-ac")) return false;
    return INFRA_DIRS.some((dir) => rel.startsWith(`${dir}/`));
  });

  for (const rel of candidates) {
    if (seen.has(rel)) continue;
    seen.add(rel);
    const kind = INFRA_KIND_BY_STEM[stemOf(rel)];
    if (!kind) continue;

    let parsed: ParsedFile;
    try {
      parsed = parseFile(snapshotRoot, rel);
    } catch {
      continue;
    }

    out.push({
      repoId: repo.id,
      kindId: kind.id ?? stemOf(rel),
      file: rel,
      source: sourceRef(repo, prov, rel),
      loc: parsed.text.split("\n").length,
      notes: extractDocComments(parsed.text),
      envVars: extractEnvVars(parsed.text),
    });
  }

  return out;
}

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Same idea, reworded per repo, doesn't survive an exact-prefix match (e.g.
 * "Shared ioredis connection options for the production/non-local zones..."
 * vs "...for production (non-local/test) zones..."). Word-set overlap
 * catches that: longest note first, drop anything sufficiently similar to
 * one already kept.
 */
function dedupeNotes(notes: string[]): string[] {
  const kept: { text: string; words: Set<string> }[] = [];
  for (const note of [...notes].sort((a, b) => b.length - a.length)) {
    const words = significantWords(note);
    if (kept.some((k) => jaccard(k.words, words) >= 0.2)) continue;
    kept.push({ text: note, words });
  }
  return kept.map((k) => k.text);
}

export function mergeInfraKinds(raw: RawInfraFile[]): InfraKind[] {
  const byKind = new Map<string, RawInfraFile[]>();
  for (const file of raw) {
    const list = byKind.get(file.kindId) ?? [];
    list.push(file);
    byKind.set(file.kindId, list);
  }

  const kinds: InfraKind[] = [];
  for (const [kindId, files] of byKind) {
    // kindId is either a stem's own name or its `id` override (see
    // INFRA_KIND_BY_STEM) — both are keys into that same map by construction.
    const def = INFRA_KIND_BY_STEM[kindId];
    if (!def) continue;

    const notes = dedupeNotes(files.flatMap((f) => f.notes));
    const envVars = [...new Set(files.flatMap((f) => f.envVars))].sort();
    const sources: InfraSource[] = files
      .map((f) => ({ repoId: f.repoId, source: f.source, loc: f.loc }))
      .sort((a, b) => a.repoId.localeCompare(b.repoId));

    kinds.push({
      id: kindId,
      title: def.title,
      category: def.category,
      systemId: def.systemId ?? null,
      summary: def.summary ?? null,
      notes,
      envVars,
      sources,
    });
  }

  return kinds.sort(
    (a, b) => b.sources.length - a.sources.length || a.title.localeCompare(b.title),
  );
}
