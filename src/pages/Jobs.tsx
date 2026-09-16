/**
 * Nest Commander batch jobs from nlp-cronjob (`CRON /jobs/<BatchName>`).
 * Kept separate from HTTP API endpoints. Detail pages embed the same sequence
 * diagram and hop trace as flow pages, plus Mongo / axios I/O from the job.
 */
import { useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { FlowSequence } from "../components/FlowSequence";
import { FlowTrace } from "../components/FlowTrace";
import {
  Badge,
  CollectionLink,
  Empty,
  HttpClientLink,
  KeyValue,
  PageHead,
  RepoBadge,
  Section,
  SourceLink,
  SystemLink,
  TopicLink,
  UseCaseLink,
} from "../components/ui";
import { useData, useFlow } from "../data";
import { endpointHref, isBatchJob } from "../entryLinks";

export function JobsPage() {
  const { core } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const domain = params.get("domain") ?? "all";

  const jobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return core.endpoints
      .filter((e) => isBatchJob(e.method))
      .filter((e) => (domain === "all" ? true : e.domain === domain))
      .filter((e) =>
        needle
          ? e.path.toLowerCase().includes(needle) ||
            (e.summary ?? "").toLowerCase().includes(needle) ||
            e.controller.toLowerCase().includes(needle) ||
            e.handler.toLowerCase().includes(needle) ||
            e.tags.some((t) => t.toLowerCase().includes(needle))
          : true,
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [core.endpoints, domain, query]);

  const domains = useMemo(() => {
    const set = new Set(
      core.endpoints.filter((e) => isBatchJob(e.method)).map((e) => e.domain),
    );
    return [...set].sort();
  }, [core.endpoints]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead title="Batch jobs">
        Nest Commander <code>@Command</code> jobs from{" "}
        <Link to="/services/cronjob">nlp-cronjob</Link>. Each row is a scheduled
        (or manually run) batch — not an HTTP API. Open a job for its sequence
        diagram (Scheduler → use case → Kafka / Mongo / D03).
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by job name, summary or command class…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="select"
          value={domain}
          onChange={(e) => setParam("domain", e.target.value)}
        >
          <option value="all">All domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {jobs.length.toLocaleString()} jobs
        </span>
      </div>

      <div className="table-wrap table-wrap--freeze">
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>What it does</th>
              <th>Domain</th>
              <th>Command</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <Link className="mono" to={endpointHref(job)}>
                    {job.path.replace(/^\/jobs\//, "")}
                  </Link>
                </td>
                <td className="dim">{job.summary ?? job.handler}</td>
                <td className="mono dim">{job.domain}</td>
                <td className="mono dimmer" style={{ fontSize: 11.5 }}>
                  {job.controller}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!jobs.length ? <Empty>No batch jobs match this filter.</Empty> : null}
    </>
  );
}

export function JobDetailPage() {
  const { jobId } = useParams();
  const { indexes } = useData();
  const job = jobId ? indexes.endpointById.get(jobId) : undefined;
  const flowSummary = job ? indexes.flowByEntry.get(job.id) : undefined;
  const flow = useFlow(flowSummary?.id);

  if (!job) {
    return (
      <Empty>
        Unknown batch job. <Link to="/jobs">Back to the list</Link>.
      </Empty>
    );
  }

  if (!isBatchJob(job.method)) {
    return <Navigate to={endpointHref(job)} replace />;
  }

  const repo = indexes.repoById.get(job.repoId);
  const batchName = job.path.replace(/^\/jobs\//, "");
  const useCases = job.useCaseIds
    .map((id) => indexes.useCaseById.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  const mongoAccess = useCases.flatMap((uc) =>
    (uc.collectionAccess ?? []).map((a) => ({ useCaseId: uc.id, ...a })),
  );
  const httpAccess = useCases.flatMap((uc) =>
    (uc.httpAccess ?? []).map((a) => ({ useCaseId: uc.id, ...a })),
  );

  return (
    <>
      <PageHead
        title={
          <span>
            <Badge tone="CRON">BATCH</Badge>{" "}
            <span className="mono" style={{ fontSize: 21 }}>
              {batchName}
            </span>
          </span>
        }
        crumbs={
          <>
            <Link to="/jobs">Batch jobs</Link> <span>/</span>{" "}
            <Link to={`/services/${job.repoId}`}>{repo?.title}</Link>{" "}
            <span>/</span> <span className="mono">{job.domain}</span>
          </>
        }
        actions={<SourceLink source={job.source} label="open in GitHub" />}
      >
        {job.summary ?? `Handled by ${job.controller}.${job.handler}().`}
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            ["Service", <RepoBadge repoId={job.repoId} />],
            ["CLI name", <span className="mono">{batchName}</span>],
            [
              "Command class",
              <span className="mono">
                {job.controller}.{job.handler}()
              </span>,
            ],
            [
              "Downstream systems",
              flowSummary?.systems.length ? (
                <div className="badges">
                  {flowSummary.systems.map((s) => (
                    <SystemLink key={s} id={s} />
                  ))}
                </div>
              ) : (
                <span className="dimmer">none resolved on the flow</span>
              ),
            ],
            [
              "Kafka topics on the path",
              flowSummary ? (
                <span className="mono dim">{flowSummary.topics.length}</span>
              ) : (
                <span className="dimmer">—</span>
              ),
            ],
            [
              "Full flow page",
              flowSummary ? (
                <Link to={`/flows/${encodeURIComponent(flowSummary.id)}`}>
                  open flow →
                </Link>
              ) : (
                <span className="dimmer">no flow resolved</span>
              ),
            ],
          ]}
        />
      </div>

      <Section
        title="Sequence"
        subtitle="Scheduler → cronjob → Kafka / Mongo / D03 — failure paths in red frames"
      >
        {flow ? (
          <FlowSequence key={`${job.id}-seq`} steps={flow.steps} />
        ) : flowSummary ? (
          <div className="empty">Loading diagram…</div>
        ) : (
          <Empty>
            No end-to-end flow was built for this job. Check that{" "}
            <code>process()</code> calls a use case the extractor can see.
          </Empty>
        )}
      </Section>

      <Section
        title="How it runs"
        subtitle="hop-by-hop: command, use case, publishes, who hears them"
      >
        {flow ? (
          <FlowTrace key={job.id} steps={flow.steps} />
        ) : flowSummary ? (
          <div className="empty">Loading flow…</div>
        ) : null}
      </Section>

      <Section title="Use cases it runs">
        {useCases.length === 0 ? (
          <Empty>
            No use case resolved. The command may call helpers inline — check
            the source.
          </Empty>
        ) : (
          <div className="table-wrap table-wrap--freeze">
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
                {useCases.map((useCase) => (
                  <tr key={useCase.id}>
                    <td>
                      <UseCaseLink id={useCase.id} />
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Mongo collections"
        subtitle={
          mongoAccess.length
            ? `${mongoAccess.length} collection access(es) from the job use case(s)`
            : "none reached from the job entry method"
        }
      >
        {!mongoAccess.length ? (
          <Empty>
            This batch does not call a Mongo repository from the resolved use
            case entry method(s).
          </Empty>
        ) : (
          <div className="table-wrap table-wrap--freeze">
            <table>
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Via use case</th>
                  <th>Operations</th>
                </tr>
              </thead>
              <tbody>
                {mongoAccess.map((access) => (
                  <tr key={`${access.useCaseId}:${access.collectionId}`}>
                    <td>
                      <CollectionLink id={access.collectionId} />
                    </td>
                    <td>
                      <UseCaseLink id={access.useCaseId} />
                    </td>
                    <td>
                      <div className="badges">
                        {access.operations.map((o) => (
                          <Badge
                            key={o.name}
                            tone={
                              o.kind === "read"
                                ? undefined
                                : o.kind === "create" || o.kind === "upsert"
                                  ? "green"
                                  : "amber"
                            }
                          >
                            {o.kind} · {o.name}()
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Outbound HTTP (axios)"
        subtitle={
          httpAccess.length
            ? `${httpAccess.length} client(s) from the job use case(s)`
            : "none reached from the job entry method"
        }
      >
        {!httpAccess.length ? (
          <Empty>
            No axios / HTTP client calls attributed from the job use case
            entry method(s).
          </Empty>
        ) : (
          <div className="table-wrap table-wrap--freeze">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Via use case</th>
                  <th>Calls</th>
                </tr>
              </thead>
              <tbody>
                {httpAccess.map((access) => {
                  const client = indexes.httpClientById.get(access.clientId);
                  return (
                    <tr key={`${access.useCaseId}:${access.clientId}`}>
                      <td>
                        <HttpClientLink id={access.clientId} />
                        {client ? (
                          <div className="dimmer" style={{ fontSize: 11.5 }}>
                            {client.system}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <UseCaseLink id={access.useCaseId} />
                      </td>
                      <td>
                        <div className="badges">
                          {access.operations.map((o) => (
                            <Badge key={`${o.httpMethod}:${o.path}`} tone="teal">
                              {o.httpMethod} /{o.path.replace(/^\//, "")}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {flowSummary && flowSummary.topics.length ? (
        <Section title="Topics on this path">
          <div className="pill-list">
            {flowSummary.topics.map((t) => (
              <Badge key={t}>
                <TopicLink topic={t} />
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}
