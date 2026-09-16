import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  Badge,
  Empty,
  KeyValue,
  PageHead,
  RepoBadge,
  SchemaLink,
  Section,
  SourceLink,
  TopicLink,
  UseCaseLink,
} from "../components/ui";
import {
  topicNamespace,
  topicNamespaceRank,
} from "../catalogGroups";
import { useData } from "../data";
import type { Topic } from "../types";

const KIND_TONE: Record<Topic["kind"], string | undefined> = {
  command: "accent",
  event: "green",
  failure: "red",
  cdc: "purple",
  unknown: undefined,
};

const NAMESPACE_BLURB: Record<string, string> = {
  "nlp.pty": "Loyalty party / TMF658 bus — earn, burn, redeem, member, account",
  "nlp.bff": "BFF-owned topics — read models, notifications, local orchestration",
  "nlp.ccm": "Campaign / CCM related NLP topics",
  "esb.pty": "ESB party topics bridged into the loyalty platform",
  "esb.prd": "ESB product topics",
  "esb.ccm": "ESB campaign topics",
  "sid.cdc": "SID change-data-capture feeds",
  dsb: "DSB merchant / branch / company commands and events",
  mfaf: "MFAF notification / device registration",
  sap: "SAP proxy topics",
};

function TopicsTable({ topics }: { topics: Topic[] }) {
  const { indexes } = useData();
  if (!topics.length) return <Empty>No topics in this section.</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Topic</th>
            <th className="nowrap">Kind</th>
            <th>Published by</th>
            <th>Consumed by</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => {
            const consumers = indexes.consumersByTopic.get(topic.name) ?? [];
            const producers = indexes.useCasesByTopic.get(topic.name) ?? [];
            return (
              <tr key={topic.name}>
                <td>
                  <TopicLink topic={topic.name} />
                </td>
                <td>
                  <Badge tone={KIND_TONE[topic.kind]}>{topic.kind}</Badge>
                </td>
                <td>
                  <div className="badges">
                    {[...new Set(producers.map((p) => p.repoId))].map((r) => (
                      <RepoBadge key={r} repoId={r} />
                    ))}
                    {producers.length === 0 ? (
                      <span className="dimmer" style={{ fontSize: 12 }}>
                        outside these repos
                      </span>
                    ) : null}
                  </div>
                </td>
                <td>
                  <div className="badges">
                    {[...new Set(consumers.map((c) => c.repoId))].map((r) => (
                      <RepoBadge key={r} repoId={r} />
                    ))}
                    {consumers.length === 0 ? (
                      <span className="dimmer" style={{ fontSize: 12 }}>
                        nobody here
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TopicsPage() {
  const { core } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const kind = params.get("kind") ?? "all";
  const prefix = params.get("prefix") ?? "all";

  const prefixes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const topic of core.topics) {
      const key = topicNamespace(topic.name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) =>
        topicNamespaceRank(a[0]) - topicNamespaceRank(b[0]) || b[1] - a[1],
    );
  }, [core.topics]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return core.topics
      .filter((t) => (kind === "all" ? true : t.kind === kind))
      .filter((t) =>
        prefix === "all" ? true : topicNamespace(t.name) === prefix,
      )
      .filter((t) =>
        needle
          ? t.name.toLowerCase().includes(needle) ||
            t.aliases.some((a) => a.member.toLowerCase().includes(needle))
          : true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [core.topics, kind, prefix, query]);

  const sections = useMemo(() => {
    const byNs = new Map<string, Topic[]>();
    for (const topic of filtered) {
      const ns = topicNamespace(topic.name);
      const list = byNs.get(ns) ?? [];
      list.push(topic);
      byNs.set(ns, list);
    }
    return [...byNs.entries()].sort(
      (a, b) => topicNamespaceRank(a[0]) - topicNamespaceRank(b[0]),
    );
  }, [filtered]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead title="Kafka topics">
        Grouped by bus namespace — <code>nlp.pty</code>, <code>nlp.bff</code>,{" "}
        <code>esb.*</code>, <code>sid.cdc</code>, and the rest. Only topics
        something here publishes or consumes are listed. Commands are requests,
        events are past-tense answers, and <code>Failed</code> variants carry
        the error path.
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by topic name or enum member…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="select"
          value={kind}
          onChange={(e) => setParam("kind", e.target.value)}
        >
          <option value="all">Any kind</option>
          <option value="command">Command</option>
          <option value="event">Event</option>
          <option value="failure">Failure</option>
          <option value="cdc">CDC</option>
          <option value="unknown">Unclassified</option>
        </select>
        <select
          className="select"
          value={prefix}
          onChange={(e) => setParam("prefix", e.target.value)}
        >
          <option value="all">All namespaces</option>
          {prefixes.map(([p, count]) => (
            <option key={p} value={p}>
              {p}.* ({count})
            </option>
          ))}
        </select>
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {filtered.length.toLocaleString()} of{" "}
          {core.topics.length.toLocaleString()}
        </span>
      </div>

      <div className="section-chips">
        <button
          type="button"
          className={`chip${prefix === "all" ? " active" : ""}`}
          onClick={() => setParam("prefix", "all")}
        >
          All
        </button>
        {prefixes.map(([p, count]) => (
          <button
            key={p}
            type="button"
            className={`chip${prefix === p ? " active" : ""}`}
            onClick={() => setParam("prefix", p)}
          >
            <span className="mono">{p}</span>
            <span className="dimmer">{count}</span>
          </button>
        ))}
      </div>

      {!sections.length ? (
        <Empty>No topics match this filter.</Empty>
      ) : (
        sections.map(([ns, topics]) => (
          <Section
            key={ns}
            title={<span className="mono">{ns}.*</span>}
            subtitle={
              NAMESPACE_BLURB[ns] ??
              `${topics.length} topic${topics.length === 1 ? "" : "s"}`
            }
            actions={
              <span className="dimmer">{topics.length.toLocaleString()}</span>
            }
          >
            <TopicsTable topics={topics} />
          </Section>
        ))
      )}
    </>
  );
}

export function TopicDetailPage() {
  const { topicName } = useParams();
  const { core, indexes } = useData();
  const topic = topicName ? indexes.topicByName.get(topicName) : undefined;

  if (!topic) {
    return (
      <Empty>
        Unknown topic. <Link to="/topics">Back to the list</Link>.
      </Empty>
    );
  }

  const consumers = indexes.consumersByTopic.get(topic.name) ?? [];
  const producers = indexes.useCasesByTopic.get(topic.name) ?? [];
  const flow = indexes.flowByEntry.get(topic.name);
  const ns = topicNamespace(topic.name);

  // Sibling topics from the same command family, e.g. the success and failure
  // answers that go with a command.
  const stem = topic.name.replace(/(Failed|Failure)$/, "");
  const siblings = core.topics.filter(
    (t) =>
      t.name !== topic.name &&
      (t.family === topic.family && topic.family
        ? true
        : t.name.startsWith(stem)),
  );

  return (
    <>
      <PageHead
        title={<span className="mono">{topic.name}</span>}
        crumbs={
          <>
            <Link to="/topics">Kafka topics</Link> <span>/</span>{" "}
            <Link to={`/topics?prefix=${encodeURIComponent(ns)}`}>
              <span className="mono">{ns}</span>
            </Link>{" "}
            <span>/</span> <span>{topic.kind}</span>
          </>
        }
      >
        {producers.length === 0
          ? "Nothing in these four repos publishes this topic, so it is a platform entry point: some other service or system puts the message on the bus."
          : `Published by ${producers.length} use case(s) and handled by ${consumers.length} consumer(s).`}
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            ["Namespace", <span className="mono">{ns}</span>],
            ["Kind", <Badge tone={KIND_TONE[topic.kind]}>{topic.kind}</Badge>],
            [
              "Command family",
              topic.family ? (
                <TopicLink topic={topic.family} />
              ) : (
                <span className="dimmer">—</span>
              ),
            ],
            [
              "Trace it",
              flow ? (
                <Link to={`/flows/${encodeURIComponent(flow.id)}`}>
                  open the end-to-end flow →
                </Link>
              ) : (
                <span className="dimmer">
                  no consumer here, so there is no flow to trace
                </span>
              ),
            ],
            [
              "Declared as",
              <div className="badges">
                {topic.aliases.map((alias, i) => (
                  <Badge
                    key={i}
                    title={`${alias.source.file}:${alias.source.line}`}
                  >
                    <a href={alias.source.url} target="_blank" rel="noreferrer">
                      {alias.enumName}.{alias.member}
                    </a>
                  </Badge>
                ))}
              </div>,
            ],
          ]}
        />
      </div>

      <Section title="Publishers" subtitle={`${producers.length} use case(s)`}>
        {producers.length === 0 ? (
          <Empty>Published outside these four repositories.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Use case</th>
                  <th>Service</th>
                  <th>Domain</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {producers.map((useCase) => (
                  <tr key={useCase.id}>
                    <td>
                      <UseCaseLink id={useCase.id} />
                    </td>
                    <td>
                      <RepoBadge repoId={useCase.repoId} />
                    </td>
                    <td className="mono dim" style={{ fontSize: 12 }}>
                      {useCase.domain}
                    </td>
                    <td>
                      <SourceLink source={useCase.source} label="code" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Consumers" subtitle={`${consumers.length} handler(s)`}>
        {consumers.length === 0 ? (
          <Empty>Nobody in these repos subscribes to it.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Handler</th>
                  <th>Service</th>
                  <th>Payload</th>
                  <th>Runs</th>
                  <th>Deployed in</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {consumers.map((consumer) => (
                  <tr key={consumer.id}>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {consumer.controller}.{consumer.handler}
                      {consumer.isReplyListener ? (
                        <>
                          {" "}
                          <Badge>reply listener</Badge>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <RepoBadge repoId={consumer.repoId} />
                    </td>
                    <td>
                      <SchemaLink id={consumer.payloadSchemaId} />
                    </td>
                    <td>
                      <div className="badges">
                        {consumer.useCaseIds.map((id) => (
                          <Badge key={id}>
                            <UseCaseLink id={id} />
                          </Badge>
                        ))}
                        {consumer.useCaseIds.length === 0 ? (
                          <span className="dimmer" style={{ fontSize: 12 }}>
                            inline
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="mono dim" style={{ fontSize: 11.5 }}>
                      {consumer.consumerGroups.length
                        ? consumer.consumerGroups.join(", ")
                        : "all"}
                    </td>
                    <td>
                      <SourceLink source={consumer.source} label="code" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {siblings.length ? (
        <Section
          title="Related topics"
          subtitle="the success and failure legs of the same command"
        >
          <div className="pill-list">
            {siblings.slice(0, 20).map((sibling) => (
              <Badge key={sibling.name} tone={KIND_TONE[sibling.kind]}>
                <TopicLink topic={sibling.name} />
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}
