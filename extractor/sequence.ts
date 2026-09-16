/**
 * Mermaid sequence diagram from a flow's step tree.
 *
 * Lifelines are Channel / External plus the four services — never one
 * lifeline per use case or downstream system, which is what made the old
 * drawings unreadable. Every Kafka hop still becomes an arrow, including
 * replies, failures, and publishes nobody here consumes.
 */
import { FlowStep } from "./model.js";

export interface SequenceInput {
  repoTitles: Map<string, string>;
}

const REPO_ORDER = ["openapi-bff", "backoffice-bff", "agg-common", "tmf658"];

const SHORT_TITLE: Record<string, string> = {
  "openapi-bff": "OpenAPI",
  "backoffice-bff": "BackOffice",
  "agg-common": "Aggregator",
  tmf658: "TMF658",
  cronjob: "Cronjob",
};

function pid(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "_") || "x";
  return /^[0-9]/.test(cleaned) ? `p_${cleaned}` : cleaned;
}

function msg(text: string): string {
  return text
    .replace(/["#;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function topicLabel(name: string): string {
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

export function toSequence(steps: FlowStep[], input: SequenceInput): string {
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
  if (hasDeadEnd) remember("outside", "Outside");

  const lines: string[] = [
    "%%{init: {'sequence': {'useMaxWidth': false, 'wrap': false, 'mirrorActors': false, 'actorMargin': 56, 'width': 150, 'messageMargin': 18}}}%%",
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
      const systems = [
        ...new Set(
          kids
            .filter((i) => steps[i].kind === "system")
            .map((i) => steps[i].id.toUpperCase()),
        ),
      ].slice(0, 4);
      if (repo) {
        const note = systems.length
          ? `${step.label} (${systems.join(", ")})`
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
      return;
    }

    if (step.kind === "consumer") {
      for (const k of kids) walk(k);
    }
  };

  walk(0);
  return lines.join("\n");
}
