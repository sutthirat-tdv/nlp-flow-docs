/**
 * Mermaid sequence diagram from a flow's step tree.
 *
 * Lifelines are Channel / Scheduler / External, the service repos, and the
 * downstream systems actually touched (Mongo per owning service, D03, LID,
 * …). Kafka hops stay as arrows between services. Failure and conditional
 * branches get bordered frames (alt / opt / rect) so they stand out from the
 * happy path. Axios and Mongo calls are arrows from the calling service to
 * that system, labeled with verb/path or collection op.
 */
import { FlowStep } from "./model.js";

/** Compact lifeline / badge names for downstream systems. */
export const SYSTEM_SHORT: Record<string, string> = {
  d03: "D03",
  d64: "LID",
  mongo: "Mongo",
  redis: "Redis",
  sap: "SAP",
  pns: "PNS",
  ikm: "IKM",
  mfaf: "MFAF",
  gsso: "GSSO",
  prc: "PRC",
  thanos: "Thanos",
  camara: "CAMARA",
  atn: "ATN",
  ctm: "CTM",
  mpay: "mPAY",
  storage: "Storage",
  "openapi-master-data": "Master data",
  "esb-gateway": "ESB",
  aaf: "AAF",
  ac: "AC",
  cms: "CMS",
  email: "Email",
  http: "HTTP",
};

export interface SequenceInput {
  repoTitles: Map<string, string>;
  systemTitles?: Map<string, string>;
}

const REPO_ORDER = ["openapi-bff", "backoffice-bff", "agg-common", "tmf658"];

const SHORT_TITLE: Record<string, string> = {
  "openapi-bff": "OPENAPI",
  "backoffice-bff": "BACKOFFICE",
  "agg-common": "DAG",
  tmf658: "DOS",
  cronjob: "CRONJOB",
};

/** Prefer short names on lifelines so many systems still fit. */
const SYSTEM_LIFELINE: Record<string, string> = {
  ...SYSTEM_SHORT,
  d64: "LID",
  d03: "D03",
  mongo: "Mongo",
};

/** Soft red wash behind failure steps. */
const FAILURE_RECT = "rgba(140, 48, 48, 0.28)";
/** Soft amber wash behind optional / conditional steps. */
const CONDITION_RECT = "rgba(140, 110, 40, 0.22)";

function pid(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "_") || "x";
  return /^[0-9]/.test(cleaned) ? `p_${cleaned}` : cleaned;
}

function msg(text: string): string {
  return text
    .replace(/["#;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 96);
}

function topicLabel(name: string): string {
  if (name.startsWith("sid.")) {
    const tail = name.split(".").pop() ?? name;
    return `SID ${tail}`;
  }
  if (/\.bff\./i.test(name)) {
    const tail = name.split(".").pop() ?? name;
    return `BFF ${tail}`;
  }
  return name.split(".").pop() ?? name;
}

function httpLabel(label: string): string {
  const match = label.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (!match) return label;
  const parts = match[2].split("/").filter(Boolean);
  const tail = parts.slice(-3).join("/");
  return `${match[1].toUpperCase()} /${tail}`;
}

function arrowFor(kind: string | undefined): string {
  if (kind === "failure") return "-x";
  if (kind === "event" || kind === "reply") return "-->>";
  return "->>";
}

function isFailureTopic(step: FlowStep): boolean {
  return step.kind === "topic" && step.detail === "failure";
}

function isEventTopic(step: FlowStep): boolean {
  return (
    step.kind === "topic" &&
    (step.detail === "event" || step.detail === "reply")
  );
}

/** Stable mermaid participant id for a system step (Mongo is per owning DB). */
function systemParticipantKey(step: FlowStep): string {
  if (step.id === "mongo" && step.repoId) return `mongo_${step.repoId}`;
  return `sys_${step.id}`;
}

function systemParticipantLabel(
  step: FlowStep,
  input: SequenceInput,
): string {
  if (step.id === "mongo" && step.repoId) {
    const owner =
      SHORT_TITLE[step.repoId] ??
      input.repoTitles.get(step.repoId) ??
      step.repoId;
    return `Mongo (${owner})`;
  }
  return (
    SYSTEM_LIFELINE[step.id] ??
    input.systemTitles?.get(step.id) ??
    step.label ??
    step.id
  );
}

export function toSequence(steps: FlowStep[], input: SequenceInput): string {
  if (!steps.length) return "";

  const childrenOf = (index: number) =>
    steps.map((s, i) => (s.parent === index ? i : -1)).filter((i) => i >= 0);

  const ancestorRepo = (index: number): string | null => {
    let i: number | null = index;
    while (i !== null) {
      if (steps[i].repoId && steps[i].kind !== "system") return steps[i].repoId;
      i = steps[i].parent;
    }
    return null;
  };

  const usedRepos = [
    ...new Set(
      steps
        .filter((s) => s.kind !== "system")
        .map((s) => s.repoId)
        .filter((r): r is string => !!r),
    ),
  ];
  const isCronEndpoint = (label: string) => /^CRON\b/i.test(label);
  const hasHttp = steps.some(
    (s) => s.kind === "endpoint" && !isCronEndpoint(s.label),
  );
  const hasCron = steps.some(
    (s) => s.kind === "endpoint" && isCronEndpoint(s.label),
  );
  const hasExternalTopic = steps[0]?.kind === "topic";
  const hasDeadEnd = steps.some(
    (s, i) =>
      s.kind === "topic" &&
      s.parent !== null &&
      !childrenOf(i).some((c) => steps[c].kind === "consumer"),
  );
  const systemSteps = steps.filter(
    (s) => s.kind === "system" && Boolean(s.detail?.trim()),
  );

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
  if (hasCron) remember("scheduler", "Scheduler", true);
  if (hasExternalTopic) remember("external", "External", true);
  for (const repo of [
    ...REPO_ORDER.filter((r) => usedRepos.includes(r)),
    ...usedRepos.filter((r) => !REPO_ORDER.includes(r)),
  ]) {
    remember(repo, SHORT_TITLE[repo] ?? input.repoTitles.get(repo) ?? repo);
  }
  const systemOrder = ["mongo", "d03", "d64", "redis", "sap", "pns"];
  const uniqueSystems = new Map<string, FlowStep>();
  for (const s of systemSteps) {
    const key = systemParticipantKey(s);
    if (!uniqueSystems.has(key)) uniqueSystems.set(key, s);
  }
  const orderedSystemKeys = [
    ...[...uniqueSystems.keys()].sort((a, b) => {
      const sa = uniqueSystems.get(a)!;
      const sb = uniqueSystems.get(b)!;
      const ia = systemOrder.indexOf(sa.id);
      const ib = systemOrder.indexOf(sb.id);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    }),
  ];
  for (const key of orderedSystemKeys) {
    const step = uniqueSystems.get(key)!;
    remember(key, systemParticipantLabel(step, input));
  }
  if (hasDeadEnd) remember("outside", "Outside");

  const lines: string[] = [
    "%%{init: {'sequence': {'useMaxWidth': false, 'wrap': true, 'mirrorActors': false, 'actorMargin': 56, 'width': 150, 'messageMargin': 18}}}%%",
    "sequenceDiagram",
    "  autonumber",
    ...declare,
  ];
  const seenArrows = new Set<string>();

  const pushArrow = (from: string, arrow: string, to: string, text: string) => {
    const key = `${from}|${arrow}|${to}|${text}`;
    if (seenArrows.has(key)) return;
    seenArrows.add(key);
    lines.push(`  ${pid(from)} ${arrow} ${pid(to)}: ${msg(text)}`);
  };

  const emitTopic = (index: number) => {
    const step = steps[index];
    const kids = childrenOf(index);
    const from = ancestorRepo(index);
    const consumers = kids.filter((i) => steps[i].kind === "consumer");
    if (!from) {
      for (const k of kids) walk(k);
      return;
    }
    const business = consumers.filter((i) => steps[i].detail !== "reply");
    const replies = consumers.filter((i) => steps[i].detail === "reply");
    const targets = (business.length ? business : replies)
      .map((i) => steps[i].repoId)
      .filter((r): r is string => !!r);
    const unique = [...new Set(targets)];
    const label = topicLabel(step.label);
    const arrow = arrowFor(step.detail);

    if (unique.length) {
      for (const to of unique) pushArrow(from, arrow, to, label);
    } else {
      pushArrow(from, arrow, "outside", label);
    }

    for (const k of kids) walk(k);
  };

  const emitFailureTopic = (index: number, withNote = true) => {
    const over = ancestorRepo(index) ?? usedRepos[0] ?? "outside";
    lines.push(`  rect ${FAILURE_RECT}`);
    if (withNote) lines.push(`  Note over ${pid(over)}: on failure`);
    emitTopic(index);
    lines.push("  end");
  };

  const emitOptionalTopic = (index: number) => {
    const step = steps[index];
    lines.push(`  opt ${msg(topicLabel(step.label))} (no listener here)`);
    lines.push(`  rect ${CONDITION_RECT}`);
    emitTopic(index);
    lines.push("  end");
    lines.push("  end");
  };

  const emitTopicKids = (topicIndexes: number[]) => {
    const commands = topicIndexes.filter(
      (i) => !isFailureTopic(steps[i]) && !isEventTopic(steps[i]),
    );
    const events = topicIndexes.filter((i) => isEventTopic(steps[i]));
    const failures = topicIndexes.filter((i) => isFailureTopic(steps[i]));

    for (const i of commands) {
      const dead = !childrenOf(i).some((c) => steps[c].kind === "consumer");
      if (dead) emitOptionalTopic(i);
      else emitTopic(i);
    }

    if (events.length && failures.length) {
      lines.push("  alt success");
      for (const i of events) emitTopic(i);
      lines.push("  else on failure");
      for (const i of failures) emitFailureTopic(i, false);
      lines.push("  end");
      return;
    }

    for (const i of events) emitTopic(i);

    if (failures.length === 1) {
      lines.push("  opt on failure");
      emitFailureTopic(failures[0], false);
      lines.push("  end");
    } else {
      for (const i of failures) emitFailureTopic(i);
    }
  };

  const walk = (index: number) => {
    const step = steps[index];
    const kids = childrenOf(index);

    if (step.kind === "endpoint") {
      const to = step.repoId ?? usedRepos[0];
      const cron = isCronEndpoint(step.label);
      const from = cron ? "scheduler" : "channel";
      const done = cron ? "done" : "HTTP 200";
      if (to) pushArrow(from, "->>", to, httpLabel(step.label));
      for (const k of kids) walk(k);
      if (to) pushArrow(to, "-->>", from, done);
      return;
    }

    if (step.kind === "topic" && step.parent === null) {
      const firstConsumer = kids.find(
        (i) => steps[i].kind === "consumer" && steps[i].detail !== "reply",
      );
      const to = firstConsumer ? steps[firstConsumer].repoId : usedRepos[0];
      if (to) pushArrow("external", "->>", to, topicLabel(step.label));
      for (const k of kids) walk(k);
      return;
    }

    if (step.kind === "use-case" || step.kind === "manager") {
      const repo = step.repoId;
      if (repo) {
        lines.push(`  activate ${pid(repo)}`);
        lines.push(`  Note over ${pid(repo)}: ${msg(step.label)}`);
      }
      const ioKids = kids.filter((i) => steps[i].kind === "system");
      for (const k of ioKids) {
        const sys = steps[k];
        const label = sys.detail?.trim();
        if (!repo || !label) continue;
        const to = systemParticipantKey(sys);
        pushArrow(repo, "->>", to, label);
      }
      emitTopicKids(kids.filter((i) => steps[i].kind === "topic"));
      if (repo) lines.push(`  deactivate ${pid(repo)}`);
      return;
    }

    if (step.kind === "topic") {
      emitTopic(index);
      return;
    }

    if (step.kind === "consumer") {
      for (const k of kids) walk(k);
    }
  };

  walk(0);
  return lines.join("\n");
}
