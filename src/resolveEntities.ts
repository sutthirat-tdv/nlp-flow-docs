/**
 * Join thin entity defs to the generated catalog (collections, D03 clients, topics, use cases).
 */
import { mongoDbFamily, type MongoDbFamilyId } from "./catalogGroups";
import { ENTITY_DEFS, type EntityDef } from "./entityCatalog";
import type {
  HttpClient,
  MongoCollection,
  SchemaSummary,
  Topic,
  UseCase,
} from "./types";

export interface EntityStructureRoot {
  name: string;
  schemaId: string;
  repoId: string;
  layer: string;
  fieldCount: number;
}

export interface ResolvedEntity {
  def: EntityDef;
  /** OOP / document roots to browse field-by-field. */
  structureRoots: EntityStructureRoot[];
  collections: MongoCollection[];
  collectionsByFamily: {
    id: MongoDbFamilyId;
    label: string;
    items: MongoCollection[];
  }[];
  canonicalD03: HttpClient[];
  completeD03: HttpClient[];
  topics: Topic[];
  bridgeUseCases: UseCase[];
  uniqueCollectionNames: string[];
  d03Paths: { method: string; path: string; clientIds: string[] }[];
}

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function matchCollections(
  def: EntityDef,
  collections: MongoCollection[],
): MongoCollection[] {
  const exact = new Set((def.collectionNames ?? []).map((n) => n.toLowerCase()));
  return collections
    .filter(
      (c) =>
        exact.has(c.name.toLowerCase()) ||
        matchesAny(c.name, def.collectionPatterns),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.repoId.localeCompare(b.repoId),
    );
}

function matchClients(
  patterns: string[],
  clients: HttpClient[],
): HttpClient[] {
  if (!patterns.length) return [];
  return clients
    .filter((c) => c.system === "d03")
    .filter(
      (c) =>
        matchesAny(c.className, patterns) || matchesAny(c.name, patterns),
    )
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.repoId.localeCompare(b.repoId),
    );
}

function matchTopics(def: EntityDef, topics: Topic[]): Topic[] {
  if (!def.topicPatterns.length) return [];
  return topics
    .filter((t) => matchesAny(t.name, def.topicPatterns))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueOps(clients: HttpClient[]) {
  const map = new Map<string, { method: string; path: string; clientIds: string[] }>();
  for (const client of clients) {
    for (const op of client.operations) {
      const key = `${op.httpMethod}|${op.path}`;
      const prev = map.get(key);
      if (prev) {
        if (!prev.clientIds.includes(client.id)) prev.clientIds.push(client.id);
      } else {
        map.set(key, {
          method: op.httpMethod,
          path: op.path,
          clientIds: [client.id],
        });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

function groupByFamily(collections: MongoCollection[]) {
  const by = new Map<MongoDbFamilyId, MongoCollection[]>();
  for (const collection of collections) {
    const { id } = mongoDbFamily(collection.connection);
    const list = by.get(id) ?? [];
    list.push(collection);
    by.set(id, list);
  }
  const order: MongoDbFamilyId[] = ["sid", "bff", "lid", "other"];
  const labels: Record<MongoDbFamilyId, string> = {
    sid: "SID (system of record Mongo)",
    bff: "BFF / NLP Mongo (indexes & satellites)",
    lid: "LID (analytics / reports)",
    other: "Other Mongo",
  };
  return order
    .filter((id) => by.has(id))
    .map((id) => ({
      id,
      label: labels[id],
      items: groupRows(by.get(id)!),
    }));
}

/** Collapse same collection name across services to one representative + copies. */
function groupRows(collections: MongoCollection[]): MongoCollection[] {
  const byName = new Map<string, MongoCollection[]>();
  for (const c of collections) {
    const list = byName.get(c.name) ?? [];
    list.push(c);
    byName.set(c.name, list);
  }
  return [...byName.values()]
    .map((copies) =>
      [...copies].sort(
        (a, b) =>
          b.usedByUseCaseIds.length - a.usedByUseCaseIds.length ||
          b.fields.length - a.fields.length,
      )[0]!,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveEntity(
  def: EntityDef,
  catalog: {
    collections: MongoCollection[];
    httpClients: HttpClient[];
    topics: Topic[];
    useCases: UseCase[];
    schemaIndex: SchemaSummary[];
  },
): ResolvedEntity {
  const collections = matchCollections(def, catalog.collections ?? []);
  const collectionIds = new Set(collections.map((c) => c.id));
  const canonicalD03 = matchClients(
    def.canonicalD03Patterns,
    catalog.httpClients ?? [],
  );
  const completeD03 = matchClients(
    def.completeD03Patterns,
    catalog.httpClients ?? [],
  );
  const completeIds = new Set(completeD03.map((c) => c.id));
  const topics = matchTopics(def, catalog.topics ?? []);
  const structureRoots = pickStructureRoots(
    def.structureRoots,
    catalog.schemaIndex ?? [],
  );

  const bridgeUseCases = (catalog.useCases ?? [])
    .filter((uc) => {
      const domainHit = def.domains.some(
        (d) =>
          uc.domain === d ||
          uc.domain.startsWith(`${d}/`) ||
          uc.domain.includes(d),
      );
      const mongoHit = uc.collectionAccess.some((a) =>
        collectionIds.has(a.collectionId),
      );
      const d03Hit = uc.httpAccess.some((a) => completeIds.has(a.clientId));
      return (domainHit || mongoHit) && (d03Hit || mongoHit);
    })
    .filter((uc) => {
      const mongoHit = uc.collectionAccess.some((a) =>
        collectionIds.has(a.collectionId),
      );
      const d03Hit = uc.httpAccess.some((a) => completeIds.has(a.clientId));
      return mongoHit && d03Hit;
    })
    .sort(
      (a, b) =>
        a.title.localeCompare(b.title) || a.repoId.localeCompare(b.repoId),
    );

  return {
    def,
    structureRoots,
    collections,
    collectionsByFamily: groupByFamily(collections),
    canonicalD03,
    completeD03,
    topics,
    bridgeUseCases,
    uniqueCollectionNames: [
      ...new Set(collections.map((c) => c.name)),
    ].sort(),
    d03Paths: uniqueOps(completeD03),
  };
}

const LAYER_RANK: Record<string, number> = {
  persistence: 0,
  downstream: 1,
  "use-case": 2,
  service: 3,
};

function pickStructureRoots(
  names: string[],
  schemaIndex: SchemaSummary[],
): EntityStructureRoot[] {
  const out: EntityStructureRoot[] = [];
  for (const name of names) {
    const candidates = schemaIndex.filter(
      (s) =>
        s.name === name &&
        (s.kind === "class" || s.kind === "interface") &&
        s.fieldCount > 0,
    );
    if (!candidates.length) continue;
    const best = [...candidates].sort(
      (a, b) =>
        (LAYER_RANK[a.layer] ?? 9) - (LAYER_RANK[b.layer] ?? 9) ||
        b.fieldCount - a.fieldCount ||
        a.repoId.localeCompare(b.repoId),
    )[0]!;
    out.push({
      name: best.name,
      schemaId: best.id,
      repoId: best.repoId,
      layer: best.layer,
      fieldCount: best.fieldCount,
    });
  }
  return out;
}

export function resolveAllEntities(catalog: {
  collections: MongoCollection[];
  httpClients: HttpClient[];
  topics: Topic[];
  useCases: UseCase[];
  schemaIndex: SchemaSummary[];
}): ResolvedEntity[] {
  return ENTITY_DEFS.map((def) => resolveEntity(def, catalog)).filter(
    (e) =>
      e.structureRoots.length > 0 ||
      e.collections.length > 0 ||
      e.completeD03.length > 0 ||
      e.topics.length > 0,
  );
}
