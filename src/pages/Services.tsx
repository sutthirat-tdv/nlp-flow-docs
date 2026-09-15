import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Badge,
  Collapsible,
  Empty,
  KeyValue,
  PageHead,
  RepoBadge,
  Section,
  Stat,
  TopicLink,
} from "../components/ui";
import { useData } from "../data";

export function ServicesPage() {
  const { core } = useData();
  const repos = core.repos.slice().sort((a, b) => a.layer - b.layer);

  return (
    <>
      <PageHead title="Services">
        Four repositories, three layers. Requests enter through a BFF, coarse
        business operations are aggregated, and the TMF658 domain service is the
        system of record. Everything between them is Kafka.
      </PageHead>

      <div className="layer-rail">
        {repos.map((repo) => (
          <div key={repo.id} className="layer-row">
            <div className="layer-row__num">{repo.layer}</div>
            <Link to={`/services/${repo.id}`} className="repo-card">
              <div className="repo-card__title">{repo.title}</div>
              <div className="repo-card__name">
                {repo.name} · {repo.branch} @ {repo.commit.shortSha} ·{" "}
                {repo.commit.date.slice(0, 10)}
              </div>
              <div className="repo-card__summary">{repo.summary}</div>
              <div className="badges">
                <Badge tone="accent">{repo.role}</Badge>
                {repo.stats.endpoints ? (
                  <Badge>{repo.stats.endpoints} endpoints</Badge>
                ) : (
                  <Badge tone="amber">no HTTP surface</Badge>
                )}
                <Badge>{repo.stats.useCases} use cases</Badge>
                <Badge>{repo.stats.consumers} Kafka consumers</Badge>
                <Badge>{repo.stats.schemas} schemas</Badge>
                {repo.stats.collections ? (
                  <Badge tone="green">
                    {repo.stats.collections} collections
                  </Badge>
                ) : null}
                {repo.stats.httpClients ? (
                  <Badge tone="teal">
                    {repo.stats.httpClients} HTTP clients
                  </Badge>
                ) : null}
                {repo.packageVersion ? (
                  <Badge tone="purple">v{repo.packageVersion}</Badge>
                ) : null}
              </div>
            </Link>
          </div>
        ))}
      </div>

      <Section
        title="Who talks to whom"
        subtitle="shared Kafka topics between each pair"
      >
        <CrossServiceMatrix />
      </Section>
    </>
  );
}

function CrossServiceMatrix() {
  const { core, indexes } = useData();

  const rows = useMemo(() => {
    const out: { from: string; to: string; topics: string[] }[] = [];
    for (const producerRepo of core.repos) {
      for (const consumerRepo of core.repos) {
        const topics = new Set<string>();
        for (const useCase of core.useCases.filter(
          (u) => u.repoId === producerRepo.id,
        )) {
          for (const topic of useCase.producesTopics) {
            const consumers = indexes.consumersByTopic.get(topic) ?? [];
            if (
              consumers.some(
                (c) => c.repoId === consumerRepo.id && !c.isReplyListener,
              )
            ) {
              topics.add(topic);
            }
          }
        }
        if (topics.size) {
          out.push({
            from: producerRepo.id,
            to: consumerRepo.id,
            topics: [...topics].sort(),
          });
        }
      }
    }
    return out.sort((a, b) => b.topics.length - a.topics.length);
  }, [core, indexes]);

  if (!rows.length) return <Empty>No cross service topics resolved.</Empty>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Publisher</th>
            <th>Consumer</th>
            <th className="nowrap">Topics</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.from}->${row.to}`}>
              <td>
                <RepoBadge repoId={row.from} />
              </td>
              <td>
                <RepoBadge repoId={row.to} />
              </td>
              <td className="mono dim">{row.topics.length}</td>
              <td>
                <div className="badges">
                  {row.topics.slice(0, 4).map((topic) => (
                    <Badge key={topic}>
                      <TopicLink topic={topic} />
                    </Badge>
                  ))}
                  {row.topics.length > 4 ? (
                    <span className="dimmer" style={{ fontSize: 12 }}>
                      +{row.topics.length - 4} more
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ServiceDetailPage() {
  const { repoId } = useParams();
  const { core, indexes } = useData();
  const repo = repoId ? indexes.repoById.get(repoId) : undefined;
  const [envQuery, setEnvQuery] = useState("");

  if (!repo) {
    return (
      <Empty>
        Unknown service. <Link to="/services">Back to the list</Link>.
      </Empty>
    );
  }

  const entryTopics = core.consumers
    .filter((c) => c.repoId === repo.id && !c.isReplyListener)
    .map((c) => c.topic);
  const uniqueEntryTopics = [...new Set(entryTopics)].sort();
  const producedTopics = [
    ...new Set(
      core.useCases
        .filter((u) => u.repoId === repo.id)
        .flatMap((u) => u.producesTopics),
    ),
  ].sort();

  const envVars = repo.envVars.filter((v) =>
    envQuery ? v.name.toLowerCase().includes(envQuery.toLowerCase()) : true,
  );

  return (
    <>
      <PageHead
        title={repo.title}
        crumbs={
          <>
            <Link to="/services">Services</Link> <span>/</span>{" "}
            <span className="mono">{repo.name}</span>
          </>
        }
        actions={
          <a href={repo.github} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        }
      >
        {repo.summary}
      </PageHead>

      <div className="grid grid--4">
        <Stat
          value={repo.stats.endpoints}
          label="Endpoints"
          to={`/endpoints?repo=${repo.id}`}
        />
        <Stat
          value={repo.stats.useCases}
          label="Use cases"
          to={`/use-cases?repo=${repo.id}`}
        />
        <Stat value={repo.stats.consumers} label="Kafka consumers" />
        <Stat value={repo.stats.topicsProduced} label="Topics published" />
        <Stat value={repo.stats.topicsConsumed} label="Topics consumed" />
        <Stat
          value={repo.stats.schemas}
          label="Schemas"
          to={`/schemas?repo=${repo.id}`}
        />
        <Stat
          value={repo.stats.collections}
          label="Mongo collections"
          to={`/database?repo=${repo.id}`}
        />
        <Stat
          value={repo.stats.httpClients}
          label="HTTP dependencies"
          to={`/dependencies?repo=${repo.id}`}
        />
        <Stat value={repo.stats.domains} label="Domains" />
        <Stat value={repo.stats.files} label="Source files" />
      </div>

      <Section title="Version this page describes">
        <div className="card">
          <KeyValue
            rows={[
              ["Branch", <span className="mono">{repo.branch}</span>],
              [
                "Commit",
                <span>
                  <a
                    className="mono"
                    href={`${repo.github}/commit/${repo.commit.sha}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {repo.commit.shortSha}
                  </a>{" "}
                  <span className="dim">{repo.commit.subject}</span>
                </span>,
              ],
              [
                "Committed",
                <span className="dim">
                  {new Date(repo.commit.date).toLocaleString()} by{" "}
                  {repo.commit.author}
                </span>,
              ],
              [
                "Nearest tag",
                repo.latestTag ? (
                  <Badge tone="purple">{repo.latestTag}</Badge>
                ) : (
                  <span className="dimmer">none</span>
                ),
              ],
              [
                "package.json version",
                repo.packageVersion ? (
                  <span className="mono">{repo.packageVersion}</span>
                ) : (
                  <span className="dimmer">—</span>
                ),
              ],
              [
                "Node",
                repo.nodeVersion ? (
                  <span className="mono">{repo.nodeVersion}</span>
                ) : (
                  <span className="dimmer">—</span>
                ),
              ],
            ]}
          />
        </div>
      </Section>

      <Section title="Domains" subtitle="how the code is grouped inside src/">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th className="nowrap">Use cases</th>
                <th className="nowrap">Endpoints</th>
                <th className="nowrap">Consumers</th>
              </tr>
            </thead>
            <tbody>
              {repo.domains.map((domain) => (
                <tr key={domain.name}>
                  <td>
                    <Link
                      className="mono"
                      to={`/use-cases?repo=${repo.id}&domain=${encodeURIComponent(domain.name)}`}
                    >
                      {domain.name}
                    </Link>
                  </td>
                  <td className="mono dim">{domain.useCases}</td>
                  <td className="mono dim">{domain.endpoints}</td>
                  <td className="mono dim">{domain.consumers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid grid--2" style={{ marginTop: 30 }}>
        <div className="card">
          <h3>Topics it listens to ({uniqueEntryTopics.length})</h3>
          <Collapsible
            items={uniqueEntryTopics}
            limit={15}
            noun="topics"
            render={(topic: string) => (
              <div key={topic} style={{ padding: "2px 0" }}>
                <TopicLink topic={topic} />
              </div>
            )}
          />
        </div>
        <div className="card">
          <h3>Topics it publishes ({producedTopics.length})</h3>
          <Collapsible
            items={producedTopics}
            limit={15}
            noun="topics"
            render={(topic: string) => (
              <div key={topic} style={{ padding: "2px 0" }}>
                <TopicLink topic={topic} />
              </div>
            )}
          />
        </div>
      </div>

      <Section
        title="Configuration"
        subtitle={`${repo.envVars.length} variables from example.env`}
      >
        <div className="toolbar">
          <input
            className="input input--grow"
            placeholder="Filter environment variables…"
            value={envQuery}
            onChange={(e) => setEnvQuery(e.target.value)}
          />
        </div>
        <div className="card">
          <Collapsible
            items={envVars}
            limit={25}
            noun="variables"
            render={(v) => (
              <div key={v.name} style={{ padding: "2px 0" }}>
                <span className="mono" style={{ fontSize: 12.5 }}>
                  {v.name}
                </span>
                {v.comment ? (
                  <span className="dimmer" style={{ fontSize: 12 }}>
                    {" "}
                    — {v.comment}
                  </span>
                ) : null}
              </div>
            )}
          />
        </div>
      </Section>

      {repo.readme ? (
        <Section
          title="Repository README"
          subtitle="verbatim, first 4000 characters"
        >
          <div className="card">
            <pre
              className="mono dim"
              style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: 12 }}
            >
              {repo.readme}
            </pre>
          </div>
        </Section>
      ) : null}
    </>
  );
}
