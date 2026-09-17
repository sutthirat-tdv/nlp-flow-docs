import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { FlowSequence } from "../components/FlowSequence";
import { FlowTrace } from "../components/FlowTrace";
import {
  Badge,
  Empty,
  KeyValue,
  PageHead,
  RepoBadge,
  Section,
  SourceLink,
  SystemLink,
  TopicLink,
  UseCaseLink,
} from "../components/ui";
import { flowModule } from "../catalogGroups";
import { useData, useFlow } from "../data";
import { endpointHref, isBatchJob } from "../entryLinks";
import type { FlowSummary } from "../types";

/** Flows per module/feature sub-table before a "+N more" hint takes over. */
const GROUP_LIMIT = 60;

export function FlowsPage() {
  const { core, indexes } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const entry = params.get("entry") ?? "all";
  const scope = params.get("scope") ?? "all";
  const repo = params.get("repo") ?? "all";
  const moduleFilter = params.get("module") ?? "all";

  // Same shape as /use-cases' domain dropdown: options narrow to the
  // selected service, and picking a service clears any stale module choice.
  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of core.flowIndex) {
      if (repo !== "all" && !f.repos.includes(repo)) continue;
      const mod = flowModule(f, indexes.endpointById, indexes.consumersByTopic);
      if (mod) set.add(mod.domain);
    }
    return [...set].sort();
  }, [core.flowIndex, repo, indexes.endpointById, indexes.consumersByTopic]);

  const flows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return core.flowIndex
      .filter((f) => (entry === "all" ? true : f.entry.kind === entry))
      .filter((f) => (scope === "cross" ? f.crossService : true))
      .filter((f) => (repo === "all" ? true : f.repos.includes(repo)))
      .filter((f) =>
        moduleFilter === "all"
          ? true
          : flowModule(f, indexes.endpointById, indexes.consumersByTopic)
              ?.domain === moduleFilter,
      )
      .filter((f) =>
        needle
          ? f.title.toLowerCase().includes(needle) ||
            f.entry.id.toLowerCase().includes(needle) ||
            f.topics.some((t) => t.toLowerCase().includes(needle))
          : true,
      )
      .sort(
        (a, b) =>
          b.repos.length * 1000 +
          b.stepCount -
          (a.repos.length * 1000 + a.stepCount),
      );
  }, [
    core.flowIndex,
    entry,
    scope,
    repo,
    moduleFilter,
    query,
    indexes.endpointById,
    indexes.consumersByTopic,
  ]);

  // Grouped by module/feature — service, then the domain folder the entry
  // endpoint or consumer actually lives under — rather than one flat list.
  // Reuses the same `domain` every use case/endpoint page already shows.
  const groups = useMemo(() => {
    const byRepo = new Map<string, Map<string, FlowSummary[]>>();
    for (const f of flows) {
      const mod = flowModule(f, indexes.endpointById, indexes.consumersByTopic);
      if (!mod) continue;
      const domains = byRepo.get(mod.repoId) ?? new Map<string, FlowSummary[]>();
      const list = domains.get(mod.domain) ?? [];
      list.push(f);
      domains.set(mod.domain, list);
      byRepo.set(mod.repoId, domains);
    }
    return [...byRepo.entries()]
      .map(([repoId, domains]) => {
        const domainGroups = [...domains.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .map(([domain, list]) => ({ domain, flows: list }));
        return {
          repoId,
          total: domainGroups.reduce((n, g) => n + g.flows.length, 0),
          domains: domainGroups,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [flows, indexes.endpointById, indexes.consumersByTopic]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    if (key === "repo") next.delete("module");
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead title="End-to-end flows">
        One flow per platform entry point. Each traces the real path through the
        code: HTTP handler or Kafka consumer, the use case that runs, every
        topic it publishes, whoever picks those topics up in another service,
        and the downstream systems involved.
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by title, endpoint path or topic…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="select"
          value={entry}
          onChange={(e) => setParam("entry", e.target.value)}
        >
          <option value="all">Any entry</option>
          <option value="endpoint">HTTP / batch entry</option>
          <option value="topic">Kafka topic</option>
        </select>
        <select
          className="select"
          value={repo}
          onChange={(e) => setParam("repo", e.target.value)}
        >
          <option value="all">Any service</option>
          {core.repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={moduleFilter}
          onChange={(e) => setParam("module", e.target.value)}
        >
          <option value="all">Any module</option>
          {moduleOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button
          className={`chip${scope === "cross" ? " active" : ""}`}
          onClick={() => setParam("scope", scope === "cross" ? "all" : "cross")}
        >
          Cross service only
        </button>
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {flows.length.toLocaleString()} of{" "}
          {core.flowIndex.length.toLocaleString()}
        </span>
      </div>

      {groups.length === 0 ? <Empty>No flows match these filters.</Empty> : null}

      {groups.map((group) => (
        <Section
          key={group.repoId}
          title={<RepoBadge repoId={group.repoId} />}
          subtitle={`${group.total.toLocaleString()} flow${group.total === 1 ? "" : "s"} across ${group.domains.length} module${group.domains.length === 1 ? "" : "s"}`}
        >
          {group.domains.map((d) => (
            <FlowModuleGroup key={d.domain} domain={d.domain} flows={d.flows} />
          ))}
        </Section>
      ))}
    </>
  );
}

function FlowModuleGroup({
  domain,
  flows,
}: {
  domain: string;
  flows: FlowSummary[];
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 className="dim" style={{ fontSize: 13, margin: "0 0 8px" }}>
        <span className="mono">{domain}</span>{" "}
        <span className="dimmer">({flows.length})</span>
      </h3>
      <FlowTable flows={flows} />
    </div>
  );
}

function FlowTable({ flows }: { flows: FlowSummary[] }) {
  const visible = flows.slice(0, GROUP_LIMIT);
  const hidden = flows.length - visible.length;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Flow</th>
              <th>Entry</th>
              <th>Services</th>
              <th className="nowrap">Topics</th>
              <th className="nowrap">Steps</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((flow) => (
              <tr key={flow.id}>
                <td>
                  <Link to={`/flows/${encodeURIComponent(flow.id)}`}>
                    {flow.title}
                  </Link>
                  {flow.external && flow.entry.kind === "topic" ? (
                    <>
                      {" "}
                      <Badge tone="amber">entry topic</Badge>
                    </>
                  ) : null}
                </td>
                <td
                  className="mono dim"
                  style={{ fontSize: 12, maxWidth: 320 }}
                >
                  {flow.entry.kind === "endpoint"
                    ? flow.entry.id.split(":").slice(1).join(":").split("#")[0]
                    : flow.entry.id}
                </td>
                <td>
                  <div className="badges">
                    {flow.repos.map((r) => (
                      <RepoBadge key={r} repoId={r} />
                    ))}
                  </div>
                </td>
                <td className="mono dim">{flow.topics.length}</td>
                <td className="mono dim">{flow.stepCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 ? (
        <p className="dimmer" style={{ fontSize: 12.5, margin: "6px 0 0" }}>
          +{hidden.toLocaleString()} more. Narrow the filters or use ⌘K to
          jump straight to one.
        </p>
      ) : null}
    </>
  );
}

export function FlowDetailPage() {
  const { flowId } = useParams();
  const { indexes, core } = useData();
  const flow = useFlow(flowId);
  const summary = flowId ? indexes.flowSummaryById.get(flowId) : undefined;

  if (!summary) {
    return (
      <Empty>
        Unknown flow. <Link to="/flows">Back to all flows</Link>.
      </Empty>
    );
  }

  const endpoint =
    summary.entry.kind === "endpoint"
      ? indexes.endpointById.get(summary.entry.id)
      : undefined;
  const topic =
    summary.entry.kind === "topic"
      ? indexes.topicByName.get(summary.entry.id)
      : undefined;

  return (
    <>
      <PageHead
        title={summary.title}
        crumbs={
          <>
            <Link to="/flows">Flows</Link> <span>/</span>{" "}
            <span>
              {summary.entry.kind === "endpoint" ? "HTTP entry" : "Kafka entry"}
            </span>
          </>
        }
      >
        {summary.summary}
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            [
              "Triggered by",
              endpoint ? (
                <span>
                  <Badge tone={endpoint.method}>
                    {isBatchJob(endpoint.method) ? "BATCH" : endpoint.method}
                  </Badge>{" "}
                  <Link
                    className="mono"
                    to={endpointHref(endpoint)}
                  >
                    {isBatchJob(endpoint.method)
                      ? endpoint.path.replace(/^\/jobs\//, "")
                      : endpoint.path}
                  </Link>{" "}
                  <span className="dimmer">
                    in {indexes.repoById.get(endpoint.repoId)?.title}
                  </span>
                </span>
              ) : topic ? (
                <span>
                  <TopicLink topic={topic.name} />{" "}
                  {summary.external ? (
                    <Badge tone="amber">published outside these repos</Badge>
                  ) : (
                    <Badge>published internally</Badge>
                  )}
                </span>
              ) : (
                <span className="dimmer">unknown</span>
              ),
            ],
            [
              "Services involved",
              <div className="badges">
                {summary.repos.map((r) => (
                  <RepoBadge key={r} repoId={r} />
                ))}
              </div>,
            ],
            [
              "Downstream systems",
              summary.systems.length ? (
                <div className="badges">
                  {summary.systems.map((s) => (
                    <SystemLink key={s} id={s} />
                  ))}
                </div>
              ) : (
                <span className="dimmer">none resolved</span>
              ),
            ],
            [
              "Kafka topics on the path",
              <span className="mono dim">{summary.topics.length}</span>,
            ],
          ]}
        />
      </div>

      {!summary.external && topic ? (
        <Section
          title="Who triggers this topic"
          subtitle="inside these four repos"
        >
          <div className="pill-list">
            {(indexes.useCasesByTopic.get(topic.name) ?? []).map((uc) => (
              <Badge key={uc.id}>
                <Link to={`/use-cases/${encodeURIComponent(uc.id)}`}>
                  {uc.title}
                </Link>
              </Badge>
            ))}
            {(indexes.useCasesByTopic.get(topic.name) ?? []).length === 0 ? (
              <span className="dimmer">Nothing here publishes it.</span>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section
        title="Sequence"
        subtitle="who talks to whom, in time order — one arrow per Kafka hop"
      >
        {flow ? (
          <FlowSequence key={`${summary.id}-seq`} steps={flow.steps} />
        ) : (
          <div className="empty">Loading diagram…</div>
        )}
      </Section>

      <Section
        title="How it runs, end to end"
        subtitle="read the glance first, then every hop in order — HTTP, use case, Kafka, who hears it, what they run"
      >
        {flow ? (
          <FlowTrace key={summary.id} steps={flow.steps} />
        ) : (
          <div className="empty">Loading flow…</div>
        )}
      </Section>

      {flow && flow.useCaseIds.length ? (
        <Section
          title="Use cases on this path"
          subtitle={`${flow.useCaseIds.length} total`}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Use case</th>
                  <th>Service</th>
                  <th>Input</th>
                  <th>Publishes</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {flow.useCaseIds.map((id) => {
                  const useCase = indexes.useCaseById.get(id);
                  if (!useCase) return null;
                  return (
                    <tr key={id}>
                      <td>
                        <UseCaseLink id={id} />
                        <div className="mono dimmer" style={{ fontSize: 11.5 }}>
                          {useCase.className}
                        </div>
                      </td>
                      <td>
                        <RepoBadge repoId={useCase.repoId} />
                      </td>
                      <td className="mono dim" style={{ fontSize: 12 }}>
                        {useCase.inputType ?? "—"}
                      </td>
                      <td className="mono dim">
                        {useCase.producesTopics.length}
                      </td>
                      <td>
                        <SourceLink source={useCase.source} label="code" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      {flow && flow.topics.length ? (
        <Section title="Topics on this path">
          <div className="pill-list">
            {flow.topics.map((t) => {
              const meta = core.topics.find((x) => x.name === t);
              return (
                <Badge
                  key={t}
                  tone={
                    meta?.kind === "failure"
                      ? "red"
                      : meta?.kind === "event"
                        ? "green"
                        : meta?.kind === "cdc"
                          ? "purple"
                          : undefined
                  }
                >
                  <TopicLink topic={t} />
                </Badge>
              );
            })}
          </div>
        </Section>
      ) : null}
    </>
  );
}
