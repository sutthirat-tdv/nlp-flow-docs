import { Link } from "react-router-dom";

import {
  Badge,
  Collapsible,
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
        five nearly-identical times. Each entry below merges every repo's copy
        of that config module: {sharedCount} of {infra.length} concerns here
        are re-implemented in two or more repos, usually copy-pasted with only
        minor drift. Doc comments are pulled from the actual code and
        deduplicated; nothing here is hand written.
      </PageHead>

      <Section
        title={CATEGORY_LABEL.platform}
        subtitle={CATEGORY_BLURB.platform}
      >
        <div className="infra-grid">
          {platform.map((kind) => (
            <InfraCard key={kind.id} kind={kind} />
          ))}
        </div>
      </Section>

      <Section
        title={CATEGORY_LABEL.downstream}
        subtitle={CATEGORY_BLURB.downstream}
      >
        <div className="infra-grid">
          {downstream.map((kind) => (
            <InfraCard key={kind.id} kind={kind} />
          ))}
        </div>
      </Section>
    </>
  );
}

function InfraCard({ kind }: { kind: InfraKind }) {
  const repoIds = [...new Set(kind.sources.map((s) => s.repoId))];
  return (
    <div className="card infra-card">
      <div className="infra-card__head">
        <div className="infra-card__title">{kind.title}</div>
        {kind.sources.length > 1 ? (
          <Badge tone="accent">shared by {repoIds.length} repos</Badge>
        ) : (
          <Badge tone="amber">only in one repo</Badge>
        )}
        {kind.systemId ? (
          <Link
            to={`/systems#${kind.systemId}`}
            style={{ fontSize: 12, marginLeft: "auto" }}
          >
            See in Downstream systems →
          </Link>
        ) : null}
      </div>

      {kind.notes.length ? (
        <div className="infra-card__notes">
          <Collapsible
            items={kind.notes}
            limit={4}
            noun="notes"
            render={(note: string) => (
              <p key={note.slice(0, 40)} className="dim infra-card__note">
                {note}
              </p>
            )}
          />
        </div>
      ) : (
        <p className="dimmer" style={{ fontSize: 12.5 }}>
          No doc comments explaining the why — just the plain config values.
        </p>
      )}

      {kind.envVars.length ? (
        <div className="infra-card__envvars">
          <div className="dimmer" style={{ fontSize: 11, marginBottom: 4 }}>
            Env vars ({kind.envVars.length})
          </div>
          <Collapsible
            items={kind.envVars}
            limit={10}
            noun="env vars"
            render={(name: string) => (
              <span key={name} className="mono infra-card__envvar">
                {name}
              </span>
            )}
          />
        </div>
      ) : null}

      <div className="infra-card__sources">
        <div className="dimmer" style={{ fontSize: 11, marginBottom: 4 }}>
          Copies ({kind.sources.length})
        </div>
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
    </div>
  );
}
