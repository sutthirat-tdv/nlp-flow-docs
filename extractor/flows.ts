/**
 * Step 3: stitch the per-repo extractions into end-to-end flows.
 *
 * A flow always starts at the platform boundary - either an HTTP endpoint or a
 * Kafka topic that nobody inside these four repos publishes - and then walks
 * the graph: use case -> topic it publishes -> consumer in another service ->
 * its use case -> ... until it runs out of edges, hits a downstream system, or
 * hits the depth budget.
 */
import { Consumer, Endpoint, Flow, FlowStep, Topic, UseCase } from "./model.js";

const MAX_DEPTH = 7;
const MAX_STEPS = 70;

export interface GraphInput {
  endpoints: Endpoint[];
  consumers: Consumer[];
  useCases: UseCase[];
  topics: Topic[];
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
  if (step.repoId) w.repos.add(step.repoId);
  return w.steps.length - 1;
}

export function buildFlows(input: GraphInput): Flow[] {
  const { endpoints, consumers, useCases, topics } = input;
  const useCaseById = new Map(useCases.map((u) => [u.id, u]));
  const consumersByTopic = new Map<string, Consumer[]>();
  for (const c of consumers) {
    const list = consumersByTopic.get(c.topic) ?? [];
    list.push(c);
    consumersByTopic.set(c.topic, list);
  }
  const topicByName = new Map(topics.map((t) => [t.name, t]));

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

    for (const system of uc.systems) {
      if (system === "kafka") continue;
      w.systems.add(system);
      if (w.steps.length < MAX_STEPS) {
        push(w, {
          depth: depth + 1,
          kind: "system",
          id: system,
          repoId: null,
          label: input.systemTitles.get(system) ?? system,
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

const REPO_ORDER = ["openapi-bff", "backoffice-bff", "agg-common", "tmf658"];

const SHORT_TITLE: Record<string, string> = {
  "openapi-bff": "OpenAPI",
  "backoffice-bff": "BackOffice",
  "agg-common": "Aggregator",
  tmf658: "TMF658",
};

function pid(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "_") || "x";
  return /^[0-9]/.test(cleaned) ? `p_${cleaned}` : cleaned;
}

function msg(text: string): string {
  return text.replace(/["#:]/g, " ").replace(/\s+/g, " ").trim();
}

function arrowFor(kind: string | undefined): string {
  if (kind === "event" || kind === "reply") return "-->>";
  return "->>";
}

/**
 * Compact sequence: Channel + the four services only.
 * Downstream systems sit on a Note so they do not stretch the diagram.
 * Failure topics stay off the drawing (they remain in the step list).
 * wrap is off so every arrow is one complete line.
 */
export function toSequence(steps: FlowStep[], input: GraphInput): string {
  if (!steps.length) return "";

  const childrenOf = (index: number) =>
    steps.map((s, i) => (s.parent === index ? i : -1)).filter((i) => i >= 0);

  const ancestorRepo = (index: number): string | null => {
    let i: number | null = index;
    while (i !== null) {
      if (steps[i].repoId) return steps[i].repoId;
      i = steps[i].parent;
    }
    return null;
  };

  const usedRepos = [
    ...new Set(steps.map((s) => s.repoId).filter((r): r is string => !!r)),
  ];
  const hasHttp = steps.some((s) => s.kind === "endpoint");
  const hasExternalTopic = steps[0]?.kind === "topic";

  const declare: string[] = [];
  const seenIds = new Set<string>();
  const remember = (id: string, label: string, actor = false) => {
    if (seenIds.has(id)) return;
    seenIds.add(id);
    declare.push(
      `  ${actor ? "actor" : "participant"} ${pid(id)} as ${msg(label)}`,
    );
  };

  if (hasHttp) remember("channel", "Channel", true);
  if (hasExternalTopic) remember("external", "External", true);
  for (const repo of [
    ...REPO_ORDER.filter((r) => usedRepos.includes(r)),
    ...usedRepos.filter((r) => !REPO_ORDER.includes(r)),
  ]) {
    remember(repo, SHORT_TITLE[repo] ?? input.repoTitles.get(repo) ?? repo);
  }

  const lines: string[] = ["sequenceDiagram", ...declare];
  const seenArrows = new Set<string>();

  const pushArrow = (from: string, arrow: string, to: string, text: string) => {
    const key = `${from}|${arrow}|${to}|${text}`;
    if (seenArrows.has(key)) return;
    seenArrows.add(key);
    lines.push(`  ${pid(from)} ${arrow} ${pid(to)}: ${msg(text)}`);
  };

  const walk = (index: number) => {
    const step = steps[index];
    const kids = childrenOf(index);

    if (step.kind === "endpoint") {
      const to = step.repoId ?? usedRepos[0];
      if (to) pushArrow("channel", "->>", to, step.label);
      for (const k of kids) walk(k);
      return;
    }

    if (step.kind === "topic" && step.parent === null) {
      const firstConsumer = kids.find(
        (i) => steps[i].kind === "consumer" && steps[i].detail !== "reply",
      );
      const to = firstConsumer ? steps[firstConsumer].repoId : usedRepos[0];
      if (to) pushArrow("external", "->>", to, step.label);
      for (const k of kids) walk(k);
      return;
    }

    if (step.kind === "use-case" || step.kind === "manager") {
      const repo = step.repoId;
      const systems = [
        ...new Set(
          kids
            .filter((i) => steps[i].kind === "system")
            .map((i) => steps[i].id.toUpperCase()),
        ),
      ].slice(0, 4);
      if (repo) {
        const note = systems.length
          ? `${step.label} · ${systems.join(", ")}`
          : step.label;
        lines.push(`  Note over ${pid(repo)}: ${msg(note)}`);
      }
      for (const k of kids.filter((i) => steps[i].kind === "topic")) walk(k);
      return;
    }

    if (step.kind === "topic") {
      const from = ancestorRepo(index);
      const consumers = kids.filter((i) => steps[i].kind === "consumer");
      if (!from) {
        for (const k of kids) walk(k);
        return;
      }
      if (step.detail === "failure") {
        for (const k of kids) walk(k);
        return;
      }
      const business = consumers.filter((i) => steps[i].detail !== "reply");
      const replies = consumers.filter((i) => steps[i].detail === "reply");
      const targets = (business.length ? business : replies)
        .map((i) => steps[i].repoId)
        .filter((r): r is string => !!r);
      const unique = [...new Set(targets)];
      if (unique.length) {
        const arrow = arrowFor(step.detail);
        for (const to of unique) pushArrow(from, arrow, to, step.label);
      }
      for (const k of kids) walk(k);
      return;
    }

    if (step.kind === "consumer") {
      for (const k of kids) walk(k);
    }
  };

  walk(0);
  return lines.join("\n");
}
