/**
 * Outbound HTTP catalog: AxiosService (and D03/PNS/AAF factories wrapping it)
 * as they are actually called — verb, path, system, and which use cases reach them.
 */
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  Badge,
  Collapsible,
  Empty,
  HttpClientLink,
  KeyValue,
  PageHead,
  RepoBadge,
  Section,
  SourceLink,
  SystemLink,
  UseCaseLink,
} from "../components/ui";
import { httpSystemRank } from "../catalogGroups";
import { useData } from "../data";
import type { HttpClient, HttpVerb } from "../types";

const VERB_TONE: Record<HttpVerb, string | undefined> = {
  GET: "accent",
  POST: "green",
  PUT: "amber",
  PATCH: "purple",
  DELETE: "red",
};

function ClientsTable({ clients }: { clients: HttpClient[] }) {
  if (!clients.length) return <Empty>No clients in this section.</Empty>;
  return (
    <div className="table-wrap table-wrap--freeze">
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Calls</th>
            <th className="nowrap">Use cases</th>
            <th>Service</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client.id}>
              <td>
                <HttpClientLink id={client.id} />
                <div className="mono dimmer" style={{ fontSize: 11 }}>
                  {client.className}
                </div>
              </td>
              <td>
                <div className="badges">
                  {uniqueOps(client)
                    .slice(0, 4)
                    .map((op) => (
                      <Badge
                        key={`${op.httpMethod}:${op.path}`}
                        tone={VERB_TONE[op.httpMethod]}
                      >
                        {op.httpMethod} /{op.path}
                      </Badge>
                    ))}
                  {uniqueOps(client).length > 4 ? (
                    <span className="dimmer" style={{ fontSize: 12 }}>
                      +{uniqueOps(client).length - 4}
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="mono dim">{client.usedByUseCaseIds.length}</td>
              <td>
                <RepoBadge repoId={client.repoId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DependenciesPage() {
  const { core } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const repo = params.get("repo") ?? "all";
  const system = params.get("system") ?? "all";
  const verb = params.get("verb") ?? "all";

  const systemMeta = useMemo(() => {
    const byId = new Map(
      (core.systems ?? []).map((s) => [s.id, s] as const),
    );
    const counts = new Map<string, number>();
    for (const client of core.httpClients ?? []) {
      counts.set(client.system, (counts.get(client.system) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        count,
        title: byId.get(id)?.title ?? id,
        blurb: byId.get(id)?.description ?? undefined,
      }))
      .sort(
        (a, b) =>
          httpSystemRank(a.id) - httpSystemRank(b.id) || b.count - a.count,
      );
  }, [core.httpClients, core.systems]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (core.httpClients ?? [])
      .filter((c) => (repo === "all" ? true : c.repoId === repo))
      .filter((c) => (system === "all" ? true : c.system === system))
      .filter((c) =>
        verb === "all" ? true : c.operations.some((o) => o.httpMethod === verb),
      )
      .filter((c) =>
        needle
          ? c.name.toLowerCase().includes(needle) ||
            c.className.toLowerCase().includes(needle) ||
            c.operations.some((o) => o.path.toLowerCase().includes(needle)) ||
            c.system.toLowerCase().includes(needle)
          : true,
      )
      .sort(
        (a, b) =>
          b.usedByUseCaseIds.length - a.usedByUseCaseIds.length ||
          a.name.localeCompare(b.name),
      );
  }, [core.httpClients, repo, system, verb, query]);

  const sections = useMemo(() => {
    const bySystem = new Map<string, HttpClient[]>();
    for (const client of filtered) {
      const list = bySystem.get(client.system) ?? [];
      list.push(client);
      bySystem.set(client.system, list);
    }
    return [...bySystem.entries()].sort(
      (a, b) => httpSystemRank(a[0]) - httpSystemRank(b[0]),
    );
  }, [filtered]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const titleFor = (id: string) =>
    systemMeta.find((s) => s.id === id)?.title ?? id;
  const blurbFor = (id: string) =>
    systemMeta.find((s) => s.id === id)?.blurb;

  return (
    <>
      <PageHead title="HTTP dependencies">
        Grouped by downstream system — D03, SAP, PNS, IKM, and the rest. Every
        outbound call that goes through <code>AxiosService</code>. A use case is
        listed only when its entry method actually reaches that client method.
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by client, path or system…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
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
          value={system}
          onChange={(e) => setParam("system", e.target.value)}
        >
          <option value="all">All systems</option>
          {systemMeta.map(({ id, title, count }) => (
            <option key={id} value={id}>
              {title} ({count})
            </option>
          ))}
        </select>
        <select
          className="select"
          value={verb}
          onChange={(e) => setParam("verb", e.target.value)}
        >
          <option value="all">Any verb</option>
          {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpVerb[]).map(
            (v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ),
          )}
        </select>
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {filtered.length.toLocaleString()} of{" "}
          {(core.httpClients ?? []).length.toLocaleString()}
        </span>
      </div>

      <div className="section-chips">
        <button
          type="button"
          className={`chip${system === "all" ? " active" : ""}`}
          onClick={() => setParam("system", "all")}
        >
          All
        </button>
        {systemMeta.map(({ id, title, count }) => (
          <button
            key={id}
            type="button"
            className={`chip${system === id ? " active" : ""}`}
            onClick={() => setParam("system", id)}
          >
            {title}
            <span className="dimmer">{count}</span>
          </button>
        ))}
      </div>

      {!sections.length ? (
        <Empty>No axios clients matched those filters.</Empty>
      ) : (
        sections.map(([systemId, clients]) => (
          <Section
            key={systemId}
            title={
              <Link to={`/systems#${encodeURIComponent(systemId)}`}>
                {titleFor(systemId)}
              </Link>
            }
            subtitle={
              blurbFor(systemId) ?? (
                <span className="mono">{systemId}</span>
              )
            }
            actions={
              <span className="dimmer">{clients.length.toLocaleString()}</span>
            }
          >
            <ClientsTable clients={clients} />
          </Section>
        ))
      )}
    </>
  );
}

export function DependencyDetailPage() {
  const { clientId } = useParams();
  const { indexes } = useData();
  const decoded = clientId ? decodeURIComponent(clientId) : "";
  const client = decoded ? indexes.httpClientById.get(decoded) : undefined;

  if (!client) {
    return (
      <Empty>
        Unknown HTTP client. <Link to="/dependencies">Back to the list</Link>.
      </Empty>
    );
  }

  return (
    <>
      <PageHead
        title={client.name}
        crumbs={
          <>
            <Link to="/dependencies">HTTP dependencies</Link> <span>/</span>{" "}
            <Link
              to={`/dependencies?system=${encodeURIComponent(client.system)}`}
            >
              {indexes.systemById.get(client.system)?.title ?? client.system}
            </Link>{" "}
            <span>/</span>{" "}
            <Link to={`/services/${client.repoId}`}>
              {indexes.repoById.get(client.repoId)?.title}
            </Link>
          </>
        }
        actions={<SourceLink source={client.source} label="open in GitHub" />}
      >
        <span className="mono">{client.className}</span> calls{" "}
        <SystemLink id={client.system} />
        {client.baseUrlRef ? (
          <>
            {" "}
            at <code>{client.baseUrlRef}</code>
          </>
        ) : null}
        .
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            ["Service", <RepoBadge repoId={client.repoId} />],
            ["System", <SystemLink id={client.system} />],
            ["Class", <span className="mono">{client.className}</span>],
            [
              "Base URL",
              client.baseUrlRef ? (
                <span className="mono">{client.baseUrlRef}</span>
              ) : (
                <span className="dimmer">not declared</span>
              ),
            ],
            ["Use cases that call it", client.usedByUseCaseIds.length],
          ]}
        />
      </div>

      <Section
        title="Calls"
        subtitle={`${client.operations.length} method(s) that actually hit axios`}
      >
        <div className="table-wrap table-wrap--freeze">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th className="nowrap">Verb</th>
                <th>Path</th>
                <th>Via</th>
              </tr>
            </thead>
            <tbody>
              {client.operations.map((op, i) => (
                <tr key={`${op.name}:${op.httpMethod}:${op.path}:${i}`}>
                  <td>
                    <a
                      className="mono"
                      href={op.source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {op.name}()
                    </a>
                  </td>
                  <td>
                    <Badge tone={VERB_TONE[op.httpMethod]}>
                      {op.httpMethod}
                    </Badge>
                  </td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    /{op.path}
                  </td>
                  <td className="dimmer" style={{ fontSize: 12.5 }}>
                    {op.via === "factory"
                      ? "this.get / this.post"
                      : "this.axios.*"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Use cases that call it"
        subtitle="from the entry method call graph, not every method on the class"
      >
        {client.usedByUseCaseIds.length === 0 ? (
          <Empty>No use case entry method reached this client.</Empty>
        ) : (
          <Collapsible
            items={client.usedByUseCaseIds}
            limit={16}
            noun="use cases"
            render={(id) => (
              <div key={id} style={{ padding: "2px 0" }}>
                <UseCaseLink id={id} />
              </div>
            )}
          />
        )}
      </Section>

      {client.related.length ? (
        <Section title="Same client in another service">
          <div className="pill-list">
            {client.related.map((rel) => (
              <Badge key={rel.clientId}>
                <HttpClientLink id={rel.clientId} />
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function uniqueOps(client: HttpClient) {
  const seen = new Set<string>();
  return client.operations.filter((op) => {
    const key = `${op.httpMethod}:${op.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
