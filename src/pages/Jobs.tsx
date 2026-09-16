/**
 * Nest Commander batch jobs from nlp-cronjob (`CRON /jobs/<BatchName>`).
 * Kept separate from HTTP API endpoints.
 */
import { useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import {
  Badge,
  Empty,
  KeyValue,
  PageHead,
  RepoBadge,
  Section,
  SourceLink,
  UseCaseLink,
} from "../components/ui";
import { useData } from "../data";
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
        (or manually run) batch — not an HTTP API. Paths are{" "}
        <code>/jobs/&lt;BatchName&gt;</code> from the <code>BatchName</code>{" "}
        enum.
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
                  <Link
                    className="mono"
                    to={endpointHref(job)}
                  >
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
      {!jobs.length ? (
        <Empty>No batch jobs match this filter.</Empty>
      ) : null}
    </>
  );
}

export function JobDetailPage() {
  const { jobId } = useParams();
  const { indexes } = useData();
  const job = jobId ? indexes.endpointById.get(jobId) : undefined;

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

  const flow = indexes.flowByEntry.get(job.id);
  const repo = indexes.repoById.get(job.repoId);
  const batchName = job.path.replace(/^\/jobs\//, "");

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
        {job.summary ??
          `Handled by ${job.controller}.${job.handler}().`}
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            ["Service", <RepoBadge repoId={job.repoId} />],
            [
              "CLI name",
              <span className="mono">{batchName}</span>,
            ],
            [
              "Command class",
              <span className="mono">
                {job.controller}.{job.handler}()
              </span>,
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

      <Section title="Use cases it runs">
        {job.useCaseIds.length === 0 ? (
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
                {job.useCaseIds.map((id) => {
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
