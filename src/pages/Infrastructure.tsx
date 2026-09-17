import { Link, useParams } from "react-router-dom";

import {
  Badge,
  Collapsible,
  Empty,
  PageHead,
  RepoBadge,
  Section,
  SourceLink,
} from "../components/ui";
import { useData } from "../data";
import type { InfraKind } from "../types";

const CATEGORY_LABEL: Record<InfraKind["category"], string> = {
  platform: "Platform infrastructure",
  downstream: "Downstream system clients",
};

const CATEGORY_BLURB: Record<InfraKind["category"], string> = {
  platform:
    "Generic technical concerns every service needs — env loading, logging, the Kafka client, outbound HTTP — each repo re-implements as its own config module.",
  downstream:
    "The connection/auth details for one specific downstream system (see also Downstream systems for who actually calls it and why).",
};

export function InfrastructurePage() {
  const { core } = useData();
  const infra = core.infra;
  const platform = infra.filter((k) => k.category === "platform");
  const downstream = infra.filter((k) => k.category === "downstream");
  const sharedCount = infra.filter((k) => k.sources.length > 1).length;

  return (
    <>
      <PageHead title="Infrastructure">
        How the platform's technical plumbing works — Kafka, Redis, logging,
        outbound HTTP, per-system connection details — read once instead of
        five nearly-identical times. Each entry merges every repo's copy of
        that config module: {sharedCount} of {infra.length} concerns here are
        re-implemented in two or more repos, usually copy-pasted with only
        minor drift.
      </PageHead>

      <Section
        title={CATEGORY_LABEL.platform}
        subtitle={CATEGORY_BLURB.platform}
      >
        <div className="infra-grid">
          {platform.map((kind) => (
            <InfraSummaryCard key={kind.id} kind={kind} />
          ))}
        </div>
      </Section>

      <Section
        title={CATEGORY_LABEL.downstream}
        subtitle={CATEGORY_BLURB.downstream}
      >
        <div className="infra-grid">
          {downstream.map((kind) => (
            <InfraSummaryCard key={kind.id} kind={kind} />
          ))}
        </div>
      </Section>
    </>
  );
}

function InfraSummaryCard({ kind }: { kind: InfraKind }) {
  const repoIds = [...new Set(kind.sources.map((s) => s.repoId))];
  const teaser = kind.notes[0];
  return (
    <Link to={`/infrastructure/${encodeURIComponent(kind.id)}`} className="card infra-card infra-card--link">
      <div className="infra-card__head">
        <div className="infra-card__title">{kind.title}</div>
        {kind.sources.length > 1 ? (
          <Badge tone="accent">shared by {repoIds.length} repos</Badge>
        ) : (
          <Badge tone="amber">only in one repo</Badge>
        )}
      </div>
      <div className="badges" style={{ marginBottom: 2 }}>
        {repoIds.map((id) => (
          <RepoBadge key={id} repoId={id} />
        ))}
      </div>
      {teaser ? (
        <p className="dim infra-card__teaser">{teaser}</p>
      ) : (
        <p className="dimmer infra-card__teaser">
          {kind.envVars.length} env var{kind.envVars.length === 1 ? "" : "s"} ·
          no doc comments explaining the why.
        </p>
      )}
    </Link>
  );
}

export function InfrastructureDetailPage() {
  const { infraId } = useParams();
  const { indexes } = useData();
  const kind = infraId ? indexes.infraById.get(decodeURIComponent(infraId)) : undefined;

  if (!kind) {
    return (
      <Empty>
        Unknown infrastructure concern.{" "}
        <Link to="/infrastructure">Back to the list</Link>.
      </Empty>
    );
  }

  const repoIds = [...new Set(kind.sources.map((s) => s.repoId))];

  return (
    <>
      <PageHead
        title={kind.title}
        crumbs={
          <>
            <Link to="/infrastructure">Infrastructure</Link> <span>/</span>{" "}
            <span>{CATEGORY_LABEL[kind.category]}</span>
          </>
        }
      >
        {kind.sources.length > 1
          ? `Re-implemented in ${repoIds.length} repos, merged here from every copy.`
          : "Only one repo has this config module."}{" "}
        {kind.systemId ? (
          <>
            See also{" "}
            <Link to={`/systems#${kind.systemId}`}>
              who actually calls it, in Downstream systems →
            </Link>
          </>
        ) : null}
      </PageHead>

      <Section
        title="How it works"
        subtitle={`${kind.notes.length} note(s) pulled from doc comments, deduplicated across repos`}
      >
        {kind.notes.length ? (
          <div className="card">
            {kind.notes.map((note) => (
              <p key={note.slice(0, 40)} className="dim infra-card__note">
                {note}
              </p>
            ))}
          </div>
        ) : (
          <Empty>No doc comments explaining the why — just plain config values.</Empty>
        )}
      </Section>

      <Section
        title="Environment variables"
        subtitle={`${kind.envVars.length} referenced across every copy`}
      >
        <div className="card">
          <Collapsible
            items={kind.envVars}
            limit={30}
            noun="env vars"
            render={(name: string) => (
              <span key={name} className="mono infra-card__envvar">
                {name}
              </span>
            )}
          />
        </div>
      </Section>

      <Section
        title="Copies"
        subtitle={`${kind.sources.length} file(s) — open any of them to compare`}
      >
        <div className="card">
          {kind.sources.map((s) => (
            <div
              key={`${s.repoId}:${s.source.file}`}
              className="infra-card__source-row"
            >
              <RepoBadge repoId={s.repoId} />
              <SourceLink source={s.source} label={s.source.file} />
              <span className="dimmer" style={{ fontSize: 11 }}>
                {s.loc} lines
              </span>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
