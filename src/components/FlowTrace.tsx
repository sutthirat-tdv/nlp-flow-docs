/**
 * Vertical hop-by-hop trace of a generated flow.
 *
 * Mermaid graphs either drop hops or turn into spaghetti. This view is the
 * same step list, told as a story you can scan: what started it, what ran,
 * what it published, who heard that, what they ran next.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { useData } from "../data";
import type { FlowStep } from "../types";
import { RepoBadge, SystemLink, TopicLink, UseCaseLink } from "./ui";

interface Node {
  index: number;
  step: FlowStep;
  children: Node[];
}

type TopicKind = "command" | "event" | "failure" | "cdc" | "other";

function buildTree(steps: FlowStep[]): Node | null {
  const nodes: Node[] = steps.map((step, index) => ({
    index,
    step,
    children: [],
  }));
  let root: Node | null = null;
  for (const node of nodes) {
    if (node.step.parent === null) root = node;
    else nodes[node.step.parent]?.children.push(node);
  }
  return root;
}

function systemsOf(node: Node): Node[] {
  return node.children.filter((c) => c.step.kind === "system");
}

function topicsOf(node: Node): Node[] {
  return node.children.filter((c) => c.step.kind === "topic");
}

function workOf(node: Node): Node[] {
  return node.children.filter(
    (c) => c.step.kind === "use-case" || c.step.kind === "manager",
  );
}

function consumersOf(node: Node): Node[] {
  return node.children.filter((c) => c.step.kind === "consumer");
}

function topicKind(detail?: string): TopicKind {
  if (detail === "failure") return "failure";
  if (detail === "event" || detail === "reply") return "event";
  if (detail === "cdc") return "cdc";
  return "command";
}

function kindLabel(kind: TopicKind): string {
  if (kind === "failure") return "failure";
  if (kind === "event") return "reply / event";
  if (kind === "cdc") return "cdc";
  return "command";
}

function orderedTopics(nodes: Node[], showFailures: boolean): Node[] {
  const visible = showFailures
    ? nodes
    : nodes.filter((n) => topicKind(n.step.detail) !== "failure");
  const commands = visible.filter((n) => {
    const k = topicKind(n.step.detail);
    return k === "command" || k === "other" || k === "cdc";
  });
  const events = visible.filter((n) => topicKind(n.step.detail) === "event");
  const failures = visible.filter(
    (n) => topicKind(n.step.detail) === "failure",
  );
  return [...commands, ...events, ...failures];
}

function numberTree(root: Node, showFailures: boolean): Map<number, number> {
  const map = new Map<number, number>();
  let n = 0;
  const visit = (node: Node) => {
    if (node.step.kind === "system") return;
    if (
      node.step.kind === "topic" &&
      topicKind(node.step.detail) === "failure" &&
      !showFailures
    ) {
      return;
    }
    map.set(node.index, ++n);
    if (node.step.kind === "use-case" || node.step.kind === "manager") {
      for (const topic of orderedTopics(topicsOf(node), showFailures))
        visit(topic);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(root);
  return map;
}

function countNonSystem(node: Node, includeFailures: boolean): number {
  const self =
    node.step.kind === "system"
      ? 0
      : topicKind(node.step.detail) === "failure" &&
          !includeFailures &&
          node.step.kind === "topic"
        ? 0
        : 1;
  if (
    node.step.kind === "topic" &&
    topicKind(node.step.detail) === "failure" &&
    !includeFailures
  ) {
    return 0;
  }
  return (
    self +
    node.children.reduce(
      (sum, child) => sum + countNonSystem(child, includeFailures),
      0,
    )
  );
}

function useRepoTitle() {
  const { indexes } = useData();
  return (repoId: string | null | undefined) =>
    repoId ? (indexes.repoById.get(repoId)?.title ?? repoId) : null;
}

function Hop({
  n,
  kind,
  kindLabel: label,
  title,
  aside,
  children,
}: {
  n: number;
  kind: string;
  kindLabel: string;
  title: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`trace-hop trace-hop--${kind}`}>
      <div className="trace-hop__index" aria-hidden>
        {n}
      </div>
      <div className="trace-hop__main">
        <div className="trace-hop__head">
          <span className={`trace-kind trace-kind--${kind}`}>{label}</span>
          <span className="trace-hop__title">{title}</span>
          {aside ? <span className="trace-hop__aside">{aside}</span> : null}
        </div>
        {children ? <div className="trace-hop__body">{children}</div> : null}
      </div>
    </div>
  );
}

function TalksTo({ nodes }: { nodes: Node[] }) {
  if (!nodes.length) return null;
  return (
    <div className="trace-talks">
      <span className="dimmer">talks to</span>
      {nodes.map((s) => (
        <SystemLink key={s.index} id={s.step.id} />
      ))}
    </div>
  );
}

function WorkHops({ node, nums }: { node: Node; nums: Map<number, number> }) {
  const systems = systemsOf(node);
  return (
    <Hop
      n={nums.get(node.index) ?? 0}
      kind={node.step.kind === "manager" ? "manager" : "usecase"}
      kindLabel={node.step.kind === "manager" ? "manager" : "use case"}
      title={<UseCaseLink id={node.step.id} />}
      aside={node.step.repoId ? <RepoBadge repoId={node.step.repoId} /> : null}
    >
      {node.step.detail ? (
        <div className="mono dimmer trace-class">{node.step.detail}</div>
      ) : null}
      <TalksTo nodes={systems} />
    </Hop>
  );
}

function splitHandler(label: string): {
  handler: string;
  controller: string | null;
} {
  const dot = label.lastIndexOf(".");
  if (dot <= 0) return { handler: label, controller: null };
  return { handler: label.slice(dot + 1), controller: label.slice(0, dot) };
}

function ConsumerHops({
  node,
  nums,
  showFailures,
}: {
  node: Node;
  nums: Map<number, number>;
  showFailures: boolean;
}) {
  const isReply = node.step.detail === "reply";
  const work = workOf(node);
  const { handler, controller } = splitHandler(node.step.label);
  return (
    <>
      <Hop
        n={nums.get(node.index) ?? 0}
        kind={isReply ? "reply" : "hears"}
        kindLabel={isReply ? "reply" : "hears"}
        title={<span className="mono">{handler}</span>}
        aside={
          node.step.repoId ? <RepoBadge repoId={node.step.repoId} /> : null
        }
      >
        {controller ? (
          <div className="mono dimmer trace-class">{controller}</div>
        ) : null}
        {node.step.detail && node.step.detail !== "reply" ? (
          <div className="dimmer">
            payload <span className="mono">{node.step.detail}</span>
          </div>
        ) : isReply ? (
          <div className="dimmer">
            request/reply listener — no further use case
          </div>
        ) : null}
      </Hop>
      {work.map((w) => (
        <div key={w.index} className="trace-nest">
          <WorkHops node={w} nums={nums} />
          <PublishList
            nodes={topicsOf(w)}
            nums={nums}
            showFailures={showFailures}
          />
        </div>
      ))}
    </>
  );
}

function TopicHop({
  node,
  nums,
  showFailures,
  defaultOpen,
}: {
  node: Node;
  nums: Map<number, number>;
  showFailures: boolean;
  defaultOpen: boolean;
}) {
  const titleOf = useRepoTitle();
  const [open, setOpen] = useState(defaultOpen);
  const kind = topicKind(node.step.detail);
  const consumers = consumersOf(node);
  const hopCount = consumers.reduce(
    (sum, c) => sum + countNonSystem(c, showFailures),
    0,
  );
  const dest = [
    ...new Set(
      consumers
        .map((c) => titleOf(c.step.repoId))
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  return (
    <div className={`trace-topic-block trace-topic-block--${kind}`}>
      <Hop
        n={nums.get(node.index) ?? 0}
        kind={kind}
        kindLabel={kindLabel(kind)}
        title={<TopicLink topic={node.step.id} />}
        aside={
          dest.length ? (
            <span className="trace-dest">→ {dest.join(" · ")}</span>
          ) : (
            <span className="trace-dest dimmer">no listener here</span>
          )
        }
      >
        {consumers.length ? (
          <button
            type="button"
            className="trace-more"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {`${open ? "Hide" : "Show"} ${hopCount} hop${hopCount === 1 ? "" : "s"} downstream`}
          </button>
        ) : (
          <div className="trace-dead">
            Published, but nothing in these four services consumes it.
          </div>
        )}
        {node.step.truncated ? (
          <div className="trace-dead">Path truncated at the step budget.</div>
        ) : null}
      </Hop>
      {open && consumers.length ? (
        <div className="trace-nest">
          {consumers.map((c) => (
            <ConsumerHops
              key={c.index}
              node={c}
              nums={nums}
              showFailures={showFailures}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PublishList({
  nodes,
  nums,
  showFailures,
}: {
  nodes: Node[];
  nums: Map<number, number>;
  showFailures: boolean;
}) {
  if (!nodes.length) return null;
  const ordered = orderedTopics(nodes, showFailures);
  const hidden = showFailures
    ? 0
    : nodes.filter((x) => topicKind(x.step.detail) === "failure").length;
  const commands = ordered.filter((x) => {
    const k = topicKind(x.step.detail);
    return k === "command" || k === "other" || k === "cdc";
  });
  const events = ordered.filter((x) => topicKind(x.step.detail) === "event");
  const failures = ordered.filter(
    (x) => topicKind(x.step.detail) === "failure",
  );

  const group = (label: string, items: Node[], open: boolean) =>
    items.length ? (
      <div className="trace-group">
        <div className="trace-group__label">{label}</div>
        {items.map((item) => (
          <TopicHop
            key={item.index}
            node={item}
            nums={nums}
            showFailures={showFailures}
            defaultOpen={open}
          />
        ))}
      </div>
    ) : null;

  return (
    <>
      {group(
        commands.length === 1
          ? "publishes"
          : `publishes ${commands.length} topics`,
        commands,
        true,
      )}
      {group(
        events.length === 1 ? "reply / event" : "replies / events",
        events,
        true,
      )}
      {group("if it fails", failures, true)}
      {hidden ? (
        <div className="trace-hidden-fail">
          {hidden} failure topic{hidden === 1 ? "" : "s"} hidden
        </div>
      ) : null}
    </>
  );
}

function Glance({ root }: { root: Node }) {
  const titleOf = useRepoTitle();
  const entryWork =
    root.step.kind === "endpoint"
      ? workOf(root)
      : consumersOf(root).flatMap(workOf);

  const rows = entryWork.flatMap((w) =>
    orderedTopics(topicsOf(w), true).map((topic) => {
      const consumers = consumersOf(topic);
      const workTitles = consumers.flatMap((c) =>
        workOf(c).map((x) => x.step.label),
      );
      const replies = consumers.filter((c) => c.step.detail === "reply");
      const dest = [
        ...new Set(
          consumers
            .map((c) => titleOf(c.step.repoId))
            .filter((v): v is string => Boolean(v)),
        ),
      ];
      return { topic, dest, workTitles, replies: replies.length };
    }),
  );

  if (!rows.length) return null;

  return (
    <div className="trace-glance">
      <div className="trace-glance__kicker">
        At a glance — what the entry publishes, and who picks it up
      </div>
      <ol className="trace-glance__list">
        {rows.map((row) => {
          const kind = topicKind(row.topic.step.detail);
          return (
            <li key={row.topic.index}>
              <span className={`trace-kind trace-kind--${kind}`}>
                {kindLabel(kind)}
              </span>
              <TopicLink topic={row.topic.step.id} />
              <span className="trace-glance__to">
                {row.dest.length
                  ? `→ ${row.dest.join(" · ")}`
                  : "→ no listener in these repos"}
                {row.workTitles.length
                  ? ` · ${row.workTitles.slice(0, 3).join(", ")}${
                      row.workTitles.length > 3
                        ? ` +${row.workTitles.length - 3}`
                        : ""
                    }`
                  : row.replies
                    ? " · reply listener"
                    : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function FlowTrace({ steps }: { steps: FlowStep[] }) {
  const root = useMemo(() => buildTree(steps), [steps]);
  const [showFailures, setShowFailures] = useState(true);
  const [expandEpoch, setExpandEpoch] = useState(0);
  const nums = useMemo(
    () => (root ? numberTree(root, showFailures) : new Map<number, number>()),
    [root, showFailures],
  );

  if (!root) return <div className="empty">No steps in this flow.</div>;

  const total = countNonSystem(root, true);
  const startWork = workOf(root);
  const startConsumers = consumersOf(root);

  return (
    <div className="trace">
      <div className="trace-legend">
        <span>
          <i className="trace-dot trace-dot--command" /> command
        </span>
        <span>
          <i className="trace-dot trace-dot--event" /> reply / event
        </span>
        <span>
          <i className="trace-dot trace-dot--failure" /> failure
        </span>
        <span className="dimmer" style={{ marginLeft: "auto" }}>
          {total} hops in the graph
        </span>
        <button
          type="button"
          className="chip"
          onClick={() => setShowFailures((v) => !v)}
        >
          {showFailures ? "Hide" : "Show"} failures
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => setExpandEpoch((v) => v + 1)}
        >
          Reset expanded
        </button>
      </div>

      <Glance root={root} />

      <div className="trace-story" key={`${expandEpoch}-${showFailures}`}>
        {root.step.kind === "endpoint" ? (
          <Hop
            n={nums.get(root.index) ?? 1}
            kind="http"
            kindLabel="HTTP"
            title={<EndpointTitle step={root.step} />}
            aside={
              root.step.repoId ? <RepoBadge repoId={root.step.repoId} /> : null
            }
          >
            {root.step.detail ? (
              <div className="dimmer">{root.step.detail}</div>
            ) : null}
          </Hop>
        ) : (
          <Hop
            n={nums.get(root.index) ?? 1}
            kind="command"
            kindLabel="Kafka in"
            title={<TopicLink topic={root.step.id} />}
            aside={<span className="dimmer">{root.step.detail}</span>}
          />
        )}

        {startWork.map((node) => (
          <div key={node.index} className="trace-nest">
            <WorkHops node={node} nums={nums} />
            <PublishList
              nodes={topicsOf(node)}
              nums={nums}
              showFailures={showFailures}
            />
          </div>
        ))}

        {startConsumers.map((consumer) => (
          <div key={consumer.index} className="trace-nest">
            <ConsumerHops
              node={consumer}
              nums={nums}
              showFailures={showFailures}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EndpointTitle({ step }: { step: FlowStep }) {
  const { indexes } = useData();
  const endpoint = indexes.endpointById.get(step.id);
  if (!endpoint) return <span className="mono">{step.label}</span>;
  return (
    <Link className="mono" to={`/endpoints/${encodeURIComponent(endpoint.id)}`}>
      {endpoint.method} {endpoint.path}
    </Link>
  );
}
