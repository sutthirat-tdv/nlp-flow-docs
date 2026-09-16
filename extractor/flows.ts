/**
 * Step 3: stitch the per-repo extractions into end-to-end flows.
 *
 * A flow always starts at the platform boundary - either an HTTP endpoint or a
 * Kafka topic that nobody inside these four repos publishes - and then walks
 * the graph: use case -> topic it publishes -> consumer in another service ->
 * its use case -> ... until it runs out of edges, hits a downstream system, or
 * hits the depth budget.
 */
import {
  Consumer,
  Endpoint,
  Flow,
  FlowStep,
  HttpClient,
  MongoCollection,
  Topic,
  UseCase,
} from "./model.js";
import { SYSTEM_SHORT, toSequence } from "./sequence.js";

const MAX_DEPTH = 7;
const MAX_STEPS = 70;
/** Cap concrete axios/Mongo arrows under one use case so diagrams stay readable. */
const MAX_IO_PER_USE_CASE = 8;

const SHORT_REPO: Record<string, string> = {
  "openapi-bff": "OpenAPI",
  "backoffice-bff": "BackOffice",
  "agg-common": "Aggregator",
  tmf658: "TMF658",
  cronjob: "Cronjob",
};

export interface GraphInput {
  endpoints: Endpoint[];
  consumers: Consumer[];
  useCases: UseCase[];
  topics: Topic[];
  collections: MongoCollection[];
  httpClients: HttpClient[];
  repoTitles: Map<string, string>;
  systemTitles: Map<string, string>;
}

interface Walker {
  steps: FlowStep[];
  repos: Set<string>;
  topics: Set<string>;
  systems: Set<string>;
  useCaseIds: Set<string>;
  visitedTopics: Set<string>;
  visitedUseCases: Set<string>;
}

function push(
  w: Walker,
  step: Omit<FlowStep, "depth"> & { depth: number },
): number {
  w.steps.push(step);
  // System steps may carry an owning-repo id (which Mongo DB) without meaning
  // that repo executed code in this hop.
  if (step.repoId && step.kind !== "system") w.repos.add(step.repoId);
  return w.steps.length - 1;
}

function shortenPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const joined =
    parts.length <= 3 ? path.replace(/^\//, "") : parts.slice(-3).join("/");
  // Mermaid sequence messages cannot contain `:`, so keep params as {id}.
  return joined.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function kindSummary(
  kinds: string[],
): string {
  const order = ["create", "read", "update", "upsert", "delete", "other"];
  const unique = [...new Set(kinds)];
  unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return unique.join("/");
}

export function buildFlows(input: GraphInput): Flow[] {
  const { endpoints, consumers, useCases, topics } = input;
  const useCaseById = new Map(useCases.map((u) => [u.id, u]));
  const collectionById = new Map(input.collections.map((c) => [c.id, c]));
  const httpClientById = new Map(input.httpClients.map((c) => [c.id, c]));
  const consumersByTopic = new Map<string, Consumer[]>();
  for (const c of consumers) {
    const list = consumersByTopic.get(c.topic) ?? [];
    list.push(c);
    consumersByTopic.set(c.topic, list);
  }
  const topicByName = new Map(topics.map((t) => [t.name, t]));

  const pushSystemIo = (
    w: Walker,
    parent: number,
    depth: number,
    step: {
      systemId: string;
      ownerRepoId: string | null;
      label: string;
      detail: string;
    },
  ) => {
    if (w.steps.length >= MAX_STEPS) return;
    w.systems.add(step.systemId);
    push(w, {
      depth,
      kind: "system",
      id: step.systemId,
      repoId: step.ownerRepoId,
      label: step.label,
      detail: step.detail,
      parent,
    });
  };

  const walkUseCase = (
    w: Walker,
    useCaseId: string,
    parent: number,
    depth: number,
  ) => {
    if (depth > MAX_DEPTH || w.steps.length >= MAX_STEPS) return;
    const uc = useCaseById.get(useCaseId);
    if (!uc) return;
    if (w.visitedUseCases.has(useCaseId)) return;
    w.visitedUseCases.add(useCaseId);
    w.useCaseIds.add(useCaseId);

    const index = push(w, {
      depth,
      kind: uc.tags.includes("manager") ? "manager" : "use-case",
      id: uc.id,
      repoId: uc.repoId,
      label: uc.title || uc.name,
      detail: uc.className,
      parent,
    });

    const covered = new Set<string>();
    let ioCount = 0;

    for (const access of uc.collectionAccess) {
      if (ioCount >= MAX_IO_PER_USE_CASE || w.steps.length >= MAX_STEPS) break;
      const col = collectionById.get(access.collectionId);
      const colName =
        col?.name ??
        (access.collectionId.split(":").slice(1).join(":") || "collection");
      const owner = col?.repoId ?? uc.repoId;
      const ownerTitle =
        input.repoTitles.get(owner) ?? SHORT_REPO[owner] ?? owner;
      const kinds = kindSummary(access.operations.map((o) => o.kind));
      covered.add("mongo");
      pushSystemIo(w, index, depth + 1, {
        systemId: "mongo",
        ownerRepoId: owner,
        label: `MongoDB (${ownerTitle})`,
        detail: `${kinds} ${colName}`,
      });
      ioCount++;
    }

    for (const access of uc.httpAccess) {
      if (ioCount >= MAX_IO_PER_USE_CASE || w.steps.length >= MAX_STEPS) break;
      const client = httpClientById.get(access.clientId);
      const systemId = client?.system && client.system !== "kafka"
        ? client.system
        : "http";
      if (systemId === "kafka") continue;
      const title =
        input.systemTitles.get(systemId) ??
        SYSTEM_SHORT[systemId] ??
        systemId;
      const op = access.operations[0];
      if (!op) continue;
      const extra =
        access.operations.length > 1
          ? ` +${access.operations.length - 1}`
          : "";
      covered.add(systemId);
      pushSystemIo(w, index, depth + 1, {
        systemId,
        ownerRepoId: null,
        label: title,
        detail: `${op.httpMethod} /${shortenPath(op.path)}${extra}`,
      });
      ioCount++;
    }

    for (const system of uc.systems) {
      if (system === "kafka" || covered.has(system)) continue;
      w.systems.add(system);
      if (w.steps.length < MAX_STEPS) {
        // Named platforms still appear on the diagram when axios attribution
        // missed them (common for LID / d64).
        const showUses = ["d03", "d64", "sap", "pns", "redis", "mongo"].includes(
          system,
        );
        push(w, {
          depth: depth + 1,
          kind: "system",
          id: system,
          repoId: system === "mongo" ? uc.repoId : null,
          label:
            input.systemTitles.get(system) ??
            SYSTEM_SHORT[system] ??
            system,
          detail: showUses ? "uses" : undefined,
          parent: index,
        });
      }
    }

    for (const topic of uc.producesTopics) {
      walkTopic(w, topic, index, depth + 1);
    }
  };

  const walkTopic = (
    w: Walker,
    topicName: string,
    parent: number,
    depth: number,
  ) => {
    if (depth > MAX_DEPTH || w.steps.length >= MAX_STEPS) return;
    if (w.visitedTopics.has(topicName)) return;
    w.visitedTopics.add(topicName);
    w.topics.add(topicName);
    const topic = topicByName.get(topicName);
    const index = push(w, {
      depth,
      kind: "topic",
      id: topicName,
      repoId: null,
      label: topicName,
      detail: topic?.kind,
      parent,
    });

    const handlers = consumersByTopic.get(topicName) ?? [];
    for (const handler of handlers) {
      if (w.steps.length >= MAX_STEPS) {
        w.steps[index].truncated = true;
        break;
      }
      const consumerIndex = push(w, {
        depth: depth + 1,
        kind: "consumer",
        id: handler.id,
        repoId: handler.repoId,
        label: `${handler.controller}.${handler.handler}`,
        detail: handler.isReplyListener
          ? "reply"
          : (handler.payloadType ?? undefined),
        parent: index,
      });
      if (handler.isReplyListener) continue;
      for (const useCaseId of handler.useCaseIds) {
        walkUseCase(w, useCaseId, consumerIndex, depth + 2);
      }
    }
  };

  const newWalker = (): Walker => ({
    steps: [],
    repos: new Set(),
    topics: new Set(),
    systems: new Set(),
    useCaseIds: new Set(),
    visitedTopics: new Set(),
    visitedUseCases: new Set(),
  });

  const flows: Flow[] = [];

  for (const endpoint of endpoints) {
    const w = newWalker();
    const root = push(w, {
      depth: 0,
      kind: "endpoint",
      id: endpoint.id,
      repoId: endpoint.repoId,
      label: `${endpoint.method} ${endpoint.path}`,
      detail: endpoint.summary ?? endpoint.controller,
      parent: null,
    });
    for (const useCaseId of endpoint.useCaseIds)
      walkUseCase(w, useCaseId, root, 1);

    flows.push({
      id: `flow:${endpoint.id}`,
      title: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
      entry: { kind: "endpoint", id: endpoint.id },
      entryRepoId: endpoint.repoId,
      summary: describeFlow(w, input, `${endpoint.method} ${endpoint.path}`),
      steps: w.steps,
      repos: [...w.repos],
      topics: [...w.topics],
      systems: [...w.systems],
      useCaseIds: [...w.useCaseIds],
      mermaid: toSequence(w.steps, input),
      crossService: w.repos.size > 1,
      tags: [
        ...endpoint.tags,
        ...(endpoint.permissions.length ? ["permissioned"] : []),
      ],
      external: true,
      producedBy: [],
    });
  }

  // Every topic that something here actually handles gets its own flow, so you
  // can look a topic up directly instead of having to guess which HTTP call
  // happens to reach it. Topics nobody here publishes are the true platform
  // entry points and are marked as such.
  const producedTopics = new Set<string>();
  for (const uc of useCases)
    for (const t of uc.producesTopics) producedTopics.add(t);

  for (const topic of topics) {
    const handlers = (consumersByTopic.get(topic.name) ?? []).filter(
      (c) => !c.isReplyListener,
    );
    if (!handlers.length) continue;
    const isExternalEntry = !producedTopics.has(topic.name);

    const w = newWalker();
    const root = push(w, {
      depth: 0,
      kind: "topic",
      id: topic.name,
      repoId: null,
      label: topic.name,
      detail: isExternalEntry
        ? "entry topic (published outside these repos)"
        : topic.kind,
      parent: null,
    });
    w.visitedTopics.add(topic.name);
    w.topics.add(topic.name);
    for (const handler of handlers) {
      const consumerIndex = push(w, {
        depth: 1,
        kind: "consumer",
        id: handler.id,
        repoId: handler.repoId,
        label: `${handler.controller}.${handler.handler}`,
        detail: handler.payloadType ?? undefined,
        parent: root,
      });
      for (const useCaseId of handler.useCaseIds)
        walkUseCase(w, useCaseId, consumerIndex, 2);
    }

    flows.push({
      id: `flow:topic:${topic.name}`,
      title: topicTitle(topic.name),
      entry: { kind: "topic", id: topic.name },
      entryRepoId: handlers[0].repoId,
      summary: describeFlow(w, input, topic.name),
      steps: w.steps,
      repos: [...w.repos],
      topics: [...w.topics],
      systems: [...w.systems],
      useCaseIds: [...w.useCaseIds],
      mermaid: toSequence(w.steps, input),
      crossService: w.repos.size > 1,
      tags: ["kafka", topic.kind, ...(isExternalEntry ? ["entry-topic"] : [])],
      external: isExternalEntry,
      producedBy: topic.producedBy,
    });
  }

  return flows.sort((a, b) => b.steps.length - a.steps.length);
}

export function topicTitle(topic: string): string {
  const last = topic.split(".").pop() ?? topic;
  return last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function describeFlow(
  w: Walker,
  input: GraphInput,
  entryLabel: string,
): string {
  const repoNames = [...w.repos].map((r) => input.repoTitles.get(r) ?? r);
  const parts: string[] = [];
  parts.push(
    `${entryLabel} is handled by ${repoNames.join(" then ") || "no resolved handler"}.`,
  );
  if (w.topics.size) {
    parts.push(
      `It moves across ${w.topics.size} Kafka topic${w.topics.size === 1 ? "" : "s"}.`,
    );
  }
  if (w.systems.size) {
    parts.push(
      `Downstream it touches ${[...w.systems].map((s) => input.systemTitles.get(s) ?? s).join(", ")}.`,
    );
  }
  return parts.join(" ");
}

