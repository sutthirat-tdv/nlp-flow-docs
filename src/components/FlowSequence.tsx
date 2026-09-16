import { useMemo } from "react";

import { toSequence } from "../../extractor/sequence";
import { useData } from "../data";
import type { FlowStep } from "../types";
import { Mermaid } from "./Mermaid";

export function FlowSequence({ steps }: { steps: FlowStep[] }) {
  const { indexes, core } = useData();
  const chart = useMemo(() => {
    const repoTitles = new Map<string, string>();
    for (const [id, repo] of indexes.repoById) repoTitles.set(id, repo.title);
    const systemTitles = new Map<string, string>();
    for (const sys of core.systems) systemTitles.set(sys.id, sys.title);
    return toSequence(steps, { repoTitles, systemTitles });
  }, [steps, indexes.repoById, core.systems]);

  if (!chart) return <div className="empty">No sequence for this flow.</div>;

  return (
    <div className="flow-sequence">
      <p className="flow-sequence__legend dimmer">
        Numbered left to right over time. Solid arrow = call / command · dashed
        = reply / event · ✕ = failure. Notes name the use case. Arrows to
        Mongo / D03 / LID / … show the axios or database call (which DB is
        labeled on the Mongo lifeline). SID / BFF Kafka topics are tagged in
        the message. Publishes nobody here consumes go to Outside.
      </p>
      <Mermaid chart={chart} scroll />
    </div>
  );
}
