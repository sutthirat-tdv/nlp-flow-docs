import { useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import {
  Badge,
  Empty,
  KeyValue,
  PageHead,
  RepoBadge,
  SchemaLink,
  Section,
  SourceLink,
  UseCaseLink,
} from "../components/ui";
import {
  apiSurface,
  apiSurfaceRank,
  type ApiSurfaceId,
} from "../catalogGroups";
import { useData, useSchema } from "../data";
import { endpointHref, isBatchJob } from "../entryLinks";
import type { Endpoint } from "../types";

const SURFACE_BLURB: Record<ApiSurfaceId, string> = {
  backoffice: "Console /api/v1 routes on Back Office BFF",
  legacy: "Partner /legacy-api/v1 routes on OpenAPI BFF",
  openapi: "Warranty and newer /api/v1 routes on OpenAPI BFF",
  iam: "IAM user management routes on OpenAPI BFF",
  other: "Health checks and uncategorized HTTP",
};

function EndpointsTable({ endpoints }: { endpoints: Endpoint[] }) {
  if (!endpoints.length) return <Empty>No endpoints in this section.</Empty>;
  const shown = endpoints.slice(0, 400);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="nowrap">Method</th>
              <th>Path</th>
              <th>What it does</th>
              <th>Service</th>
              <th>Auth</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((endpoint) => (
              <tr key={endpoint.id}>
                <td>
                  <Badge tone={endpoint.method}>{endpoint.method}</Badge>
                </td>
                <td>
                  <Link className="mono" to={endpointHref(endpoint)}>
                    {endpoint.path}
                  </Link>
                </td>
                <td className="dim">{endpoint.summary ?? endpoint.handler}</td>
                <td>
                  <RepoBadge repoId={endpoint.repoId} />
                </td>
                <td>
                  {endpoint.permissions.length ? (
                    <Badge tone="amber">permission</Badge>
                  ) : endpoint.auth ? (
                    <Badge tone="green">guard</Badge>
                  ) : (
                    <Badge tone="red">open</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {endpoints.length > 400 ? (
        <p className="dimmer" style={{ fontSize: 12.5 }}>
          Showing the first 400 of {endpoints.length.toLocaleString()}.
        </p>
      ) : null}
    </>
  );
}

export function EndpointsPage() {
  const { core } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const surface = (params.get("surface") ?? "all") as ApiSurfaceId | "all";
  const method = params.get("method") ?? "all";

  const httpEndpoints = useMemo(
    () => core.endpoints.filter((e) => !isBatchJob(e.method)),
    [core.endpoints],
  );

  const surfaces = useMemo(() => {
    const counts = new Map<ApiSurfaceId, { label: string; count: number }>();
    for (const endpoint of httpEndpoints) {
      const { id, label } = apiSurface(endpoint);
      const prev = counts.get(id);
      counts.set(id, { label, count: (prev?.count ?? 0) + 1 });
    }
    return [...counts.entries()]
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => apiSurfaceRank(a.id) - apiSurfaceRank(b.id));
  }, [httpEndpoints]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return httpEndpoints
      .filter((e) =>
        surface === "all" ? true : apiSurface(e).id === surface,
      )
      .filter((e) => (method === "all" ? true : e.method === method))
      .filter((e) =>
        needle
          ? e.path.toLowerCase().includes(needle) ||
            (e.summary ?? "").toLowerCase().includes(needle) ||
            e.controller.toLowerCase().includes(needle) ||
            e.tags.some((t) => t.toLowerCase().includes(needle))
          : true,
      )
      .sort(
        (a, b) =>
          a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
      );
  }, [httpEndpoints, surface, method, query]);

  const sections = useMemo(() => {
    const bySurface = new Map<
      ApiSurfaceId,
      { label: string; endpoints: Endpoint[] }
    >();
    for (const endpoint of filtered) {
      const { id, label } = apiSurface(endpoint);
      const bucket = bySurface.get(id) ?? { label, endpoints: [] };
      bucket.endpoints.push(endpoint);
      bySurface.set(id, bucket);
    }
    return [...bySurface.entries()].sort(
      (a, b) => apiSurfaceRank(a[0]) - apiSurfaceRank(b[0]),
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
      <PageHead title="API endpoints">
        Grouped by surface — Back Office <code>/api/v1</code>, Legacy{" "}
        <code>/legacy-api/v1</code>, OpenAPI / Warranty, and IAM. Paths already
        include the global prefix and version. Scheduled Nest Commander jobs
        live under <Link to="/jobs">Batch jobs</Link>.
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by path, summary, controller or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="select"
          value={surface}
          onChange={(e) => setParam("surface", e.target.value)}
        >
          <option value="all">All surfaces</option>
          {surfaces.map(({ id, label, count }) => (
            <option key={id} value={id}>
              {label} ({count})
            </option>
          ))}
        </select>
        <select
          className="select"
          value={method}
          onChange={(e) => setParam("method", e.target.value)}
        >
          <option value="all">Any method</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {filtered.length.toLocaleString()} of{" "}
          {httpEndpoints.length.toLocaleString()}
        </span>
      </div>

      <div className="section-chips">
        <button
          type="button"
          className={`chip${surface === "all" ? " active" : ""}`}
          onClick={() => setParam("surface", "all")}
        >
          All
        </button>
        {surfaces.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            className={`chip${surface === id ? " active" : ""}`}
            onClick={() => setParam("surface", id)}
          >
            {label}
            <span className="dimmer">{count}</span>
          </button>
        ))}
      </div>

      {!sections.length ? (
        <Empty>No endpoints match this filter.</Empty>
      ) : (
        sections.map(([id, { label, endpoints }]) => (
          <Section
            key={id}
            title={label}
            subtitle={SURFACE_BLURB[id]}
            actions={
              <span className="dimmer">{endpoints.length.toLocaleString()}</span>
            }
          >
            <EndpointsTable endpoints={endpoints} />
          </Section>
        ))
      )}
    </>
  );
}

function SchemaFields({ schemaId }: { schemaId: string | null }) {
  const schema = useSchema(schemaId);
  if (!schemaId) return <span className="dimmer">no schema resolved</span>;
  if (!schema) return <span className="dimmer">Loading…</span>;
  if (!schema.fields.length) {
    return (
      <span className="dimmer">
        {schema.extends.length
          ? `Inherits everything from ${schema.extends.join(", ")}.`
          : "No declared fields."}
      </span>
    );
  }
  return (
    <div>
      {schema.fields.map((field) => (
        <div key={field.name} className="schema-field">
          <div className="schema-field__head">
            <span className="schema-field__name">{field.name}</span>
            <span className="schema-field__type">{field.type}</span>
            {field.optional ? (
              <Badge>optional</Badge>
            ) : (
              <Badge tone="amber">required</Badge>
            )}
          </div>
          {field.description ? (
            <div className="schema-field__desc">{field.description}</div>
          ) : null}
          {field.rules.length ? (
            <div className="schema-field__rules">{field.rules.join(" · ")}</div>
          ) : null}
          {field.example ? (
            <div className="schema-field__rules">
              example: <span className="mono">{field.example}</span>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function EndpointDetailPage() {
  const { endpointId } = useParams();
  const { indexes } = useData();
  const endpoint = endpointId
    ? indexes.endpointById.get(endpointId)
    : undefined;

  if (!endpoint) {
    return (
      <Empty>
        Unknown endpoint. <Link to="/endpoints">Back to the list</Link>.
      </Empty>
    );
  }

  if (isBatchJob(endpoint.method)) {
    return <Navigate to={endpointHref(endpoint)} replace />;
  }

  const flow = indexes.flowByEntry.get(endpoint.id);
  const repo = indexes.repoById.get(endpoint.repoId);
  const surface = apiSurface(endpoint);

  return (
    <>
      <PageHead
        title={
          <span>
            <Badge tone={endpoint.method}>{endpoint.method}</Badge>{" "}
            <span className="mono" style={{ fontSize: 21 }}>
              {endpoint.path}
            </span>
          </span>
        }
        crumbs={
          <>
            <Link to="/endpoints">API endpoints</Link> <span>/</span>{" "}
            <Link to={`/endpoints?surface=${surface.id}`}>{surface.label}</Link>{" "}
            <span>/</span>{" "}
            <Link to={`/services/${endpoint.repoId}`}>{repo?.title}</Link>{" "}
            <span>/</span> <span className="mono">{endpoint.domain}</span>
          </>
        }
        actions={<SourceLink source={endpoint.source} label="open in GitHub" />}
      >
        {endpoint.summary ??
          `Handled by ${endpoint.controller}.${endpoint.handler}().`}
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            ["Service", <RepoBadge repoId={endpoint.repoId} />],
            [
              "Handler",
              <span className="mono">
                {endpoint.controller}.{endpoint.handler}()
              </span>,
            ],
            [
              "Guards",
              endpoint.guards.length ? (
                <div className="badges">
                  {endpoint.guards.map((g) => (
                    <Badge key={g} tone="green">
                      {g}
                    </Badge>
                  ))}
                </div>
              ) : (
                <Badge tone="red">no guard on this route</Badge>
              ),
            ],
            [
              "Permissions",
              endpoint.permissions.length ? (
                <div className="badges">
                  {endpoint.permissions.map((p) => (
                    <Badge key={p} tone="amber">
                      {p}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="dimmer">none required</span>
              ),
            ],
            [
              "Swagger tags",
              endpoint.tags.length ? (
                <div className="badges">
                  {endpoint.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              ) : (
                <span className="dimmer">—</span>
              ),
            ],
            [
              "End-to-end flow",
              flow ? (
                <Link to={`/flows/${encodeURIComponent(flow.id)}`}>
                  trace it across {flow.repos.length} service(s) →
                </Link>
              ) : (
                <span className="dimmer">no flow resolved</span>
              ),
            ],
          ]}
        />
      </div>

      <Section title="Request">
        {endpoint.requestSchemas.length === 0 ? (
          <Empty>
            No request payload — the route takes no body, query or params.
          </Empty>
        ) : (
          <div className="grid grid--2">
            {endpoint.requestSchemas.map((request, i) => (
              <div key={i} className="card">
                <h3>
                  {request.location} · <SchemaLink id={request.schemaId} />
                </h3>
                {!request.schemaId ? (
                  <span className="mono dim">{request.type}</span>
                ) : (
                  <SchemaFields schemaId={request.schemaId} />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Responses">
        {endpoint.responseSchemas.length === 0 ? (
          <Empty>No response type declared.</Empty>
        ) : (
          <div className="grid grid--2">
            {endpoint.responseSchemas.map((response, i) => (
              <div key={i} className="card">
                <h3>
                  {response.status} · <SchemaLink id={response.schemaId} />
                </h3>
                {!response.schemaId ? (
                  <span className="mono dim">{response.type}</span>
                ) : (
                  <SchemaFields schemaId={response.schemaId} />
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Use cases it runs">
        {endpoint.useCaseIds.length === 0 ? (
          <Empty>
            No use case resolved. The handler probably answers inline or
            delegates to a service. Check the source.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Use case</th>
                  <th>Publishes</th>
                  <th>Systems</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.useCaseIds.map((id) => {
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
                      <td className="mono dim">
                        {useCase.producesTopics.length}
                      </td>
                      <td>
                        <div className="badges">
                          {useCase.systems
                            .filter((s) => s !== "kafka")
                            .map((s) => (
                              <Badge key={s}>{s}</Badge>
                            ))}
                        </div>
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
        )}
      </Section>
    </>
  );
}
