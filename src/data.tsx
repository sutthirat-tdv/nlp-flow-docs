/**
 * Data access for the site.
 *
 * core.json is loaded once at start up and holds every list and summary. The
 * per repo detail shards (schema fields, flow steps) are fetched on demand and
 * memoised, so opening the site is fast even though the full catalog is large.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CoreData, Flow, Schema } from "./types";

const DATA_BASE = `${import.meta.env.BASE_URL}data`.replace(/\/{2,}/g, "/");

interface Indexes {
  useCaseById: Map<string, CoreData["useCases"][number]>;
  endpointById: Map<string, CoreData["endpoints"][number]>;
  consumerById: Map<string, CoreData["consumers"][number]>;
  topicByName: Map<string, CoreData["topics"][number]>;
  repoById: Map<string, CoreData["repos"][number]>;
  systemById: Map<string, CoreData["systems"][number]>;
  collectionById: Map<string, CoreData["collections"][number]>;
  collectionsBySchemaId: Map<string, CoreData["collections"][number][]>;
  httpClientById: Map<string, CoreData["httpClients"][number]>;
  schemaSummaryById: Map<string, CoreData["schemaIndex"][number]>;
  flowSummaryById: Map<string, CoreData["flowIndex"][number]>;
  /** Endpoint id / consumer id -> flow that starts there. */
  flowByEntry: Map<string, CoreData["flowIndex"][number]>;
  consumersByTopic: Map<string, CoreData["consumers"][number][]>;
  useCasesByTopic: Map<string, CoreData["useCases"][number][]>;
  flowsByUseCase: Map<string, CoreData["flowIndex"][number][]>;
}

interface DataContextValue {
  core: CoreData;
  indexes: Indexes;
  loadSchemas: (repoId: string) => Promise<Schema[]>;
  loadSchema: (schemaId: string) => Promise<Schema | undefined>;
  loadFlow: (flowId: string) => Promise<Flow | undefined>;
  repoTitle: (repoId: string | null | undefined) => string;
}

const DataContext = createContext<DataContextValue | null>(null);

function buildIndexes(core: CoreData): Indexes {
  const consumersByTopic = new Map<string, CoreData["consumers"][number][]>();
  for (const consumer of core.consumers) {
    const list = consumersByTopic.get(consumer.topic) ?? [];
    list.push(consumer);
    consumersByTopic.set(consumer.topic, list);
  }

  const useCasesByTopic = new Map<string, CoreData["useCases"][number][]>();
  for (const useCase of core.useCases) {
    for (const topic of useCase.producesTopics) {
      const list = useCasesByTopic.get(topic) ?? [];
      list.push(useCase);
      useCasesByTopic.set(topic, list);
    }
  }

  const flowByEntry = new Map<string, CoreData["flowIndex"][number]>();
  for (const flow of core.flowIndex) flowByEntry.set(flow.entry.id, flow);

  const collectionsBySchemaId = new Map<
    string,
    CoreData["collections"][number][]
  >();
  for (const collection of core.collections ?? []) {
    if (!collection.entitySchemaId) continue;
    const list = collectionsBySchemaId.get(collection.entitySchemaId) ?? [];
    list.push(collection);
    collectionsBySchemaId.set(collection.entitySchemaId, list);
  }

  return {
    useCaseById: new Map(core.useCases.map((u) => [u.id, u])),
    endpointById: new Map(core.endpoints.map((e) => [e.id, e])),
    consumerById: new Map(core.consumers.map((c) => [c.id, c])),
    topicByName: new Map(core.topics.map((t) => [t.name, t])),
    repoById: new Map(core.repos.map((r) => [r.id, r])),
    systemById: new Map(core.systems.map((s) => [s.id, s])),
    collectionById: new Map((core.collections ?? []).map((c) => [c.id, c])),
    collectionsBySchemaId,
    httpClientById: new Map((core.httpClients ?? []).map((c) => [c.id, c])),
    schemaSummaryById: new Map(core.schemaIndex.map((s) => [s.id, s])),
    flowSummaryById: new Map(core.flowIndex.map((f) => [f.id, f])),
    flowByEntry,
    consumersByTopic,
    useCasesByTopic,
    flowsByUseCase: new Map(),
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [core, setCore] = useState<CoreData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${DATA_BASE}/core.json`)
      .then((response) => {
        if (!response.ok)
          throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .then((raw: CoreData) => {
        const topics = raw.topics.filter(
          (t) => t.consumedBy.length > 0 || t.producedBy.length > 0,
        );
        setCore({
          ...raw,
          collections: raw.collections ?? [],
          httpClients: raw.httpClients ?? [],
          useCases: raw.useCases.map((u) => ({
            ...u,
            collectionAccess: u.collectionAccess ?? [],
            httpAccess: u.httpAccess ?? [],
          })),
          topics,
          stats: {
            ...raw.stats,
            topics: topics.length,
            collections: (raw.collections ?? []).length,
            httpClients: (raw.httpClients ?? []).length,
          },
        });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const schemaCache = useMemo(() => new Map<string, Promise<Schema[]>>(), []);
  const flowCache = useMemo(() => new Map<string, Promise<Flow[]>>(), []);

  const loadSchemas = useCallback(
    (repoId: string) => {
      let promise = schemaCache.get(repoId);
      if (!promise) {
        promise = fetch(`${DATA_BASE}/schemas.${repoId}.json`).then((r) =>
          r.json(),
        );
        schemaCache.set(repoId, promise);
      }
      return promise;
    },
    [schemaCache],
  );

  const loadSchema = useCallback(
    async (schemaId: string) => {
      const repoId = schemaId.split(":")[0];
      const schemas = await loadSchemas(repoId);
      return schemas.find((s) => s.id === schemaId);
    },
    [loadSchemas],
  );

  const loadFlows = useCallback(
    (repoId: string) => {
      let promise = flowCache.get(repoId);
      if (!promise) {
        promise = fetch(`${DATA_BASE}/flows.${repoId}.json`).then((r) =>
          r.json(),
        );
        flowCache.set(repoId, promise);
      }
      return promise;
    },
    [flowCache],
  );

  const loadFlow = useCallback(
    async (flowId: string) => {
      if (!core) return undefined;
      const summary = core.flowIndex.find((f) => f.id === flowId);
      if (!summary) return undefined;
      const flows = await loadFlows(summary.entryRepoId);
      return flows.find((f) => f.id === flowId);
    },
    [core, loadFlows],
  );

  const value = useMemo<DataContextValue | null>(() => {
    if (!core) return null;
    const indexes = buildIndexes(core);
    return {
      core,
      indexes,
      loadSchemas,
      loadSchema,
      loadFlow,
      repoTitle: (repoId) => {
        if (!repoId) return "—";
        const repo = indexes.repoById.get(repoId);
        return repo?.tag ?? repo?.title ?? repoId;
      },
    };
  }, [core, loadSchemas, loadSchema, loadFlow]);

  if (error) {
    return (
      <div className="boot boot--error">
        <h1>Documentation data is missing</h1>
        <p>
          Could not load <code>{DATA_BASE}/core.json</code>: {error}
        </p>
        <p>
          Generate it first: <code>npm run generate</code> (or{" "}
          <code>npm run generate:offline</code> if you cannot reach GitHub).
        </p>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="boot">
        <div className="boot__spinner" />
        <p>Loading the catalog…</p>
      </div>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used inside DataProvider");
  return context;
}

/** Resolves a schema shard lazily for a single schema id. */
export function useSchema(schemaId: string | null | undefined) {
  const { loadSchema } = useData();
  const [schema, setSchema] = useState<Schema | null>(null);
  useEffect(() => {
    let active = true;
    if (!schemaId) {
      setSchema(null);
      return;
    }
    loadSchema(schemaId).then((s) => {
      if (active) setSchema(s ?? null);
    });
    return () => {
      active = false;
    };
  }, [schemaId, loadSchema]);
  return schema;
}

export function useRepoSchemas(repoId: string | null) {
  const { loadSchemas } = useData();
  const [schemas, setSchemas] = useState<Schema[] | null>(null);
  useEffect(() => {
    let active = true;
    if (!repoId) {
      setSchemas(null);
      return;
    }
    loadSchemas(repoId).then((s) => {
      if (active) setSchemas(s);
    });
    return () => {
      active = false;
    };
  }, [repoId, loadSchemas]);
  return schemas;
}

export function useFlow(flowId: string | null | undefined) {
  const { loadFlow } = useData();
  const [flow, setFlow] = useState<Flow | null>(null);
  useEffect(() => {
    let active = true;
    if (!flowId) {
      setFlow(null);
      return;
    }
    loadFlow(flowId).then((f) => {
      if (active) setFlow(f ?? null);
    });
    return () => {
      active = false;
    };
  }, [flowId, loadFlow]);
  return flow;
}
