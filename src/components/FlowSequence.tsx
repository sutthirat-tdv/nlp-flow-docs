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
        Numbered left to right over time. Lifelines are grouped in bordered
        boxes (Entry · Services · Downstream). Solid arrow = call / command ·
        dashed = reply / event · ✕ = failure. Activation bars mark the use case
        in progress; notes name it. Arrows to Mongo / D03 / LID show axios or
        database calls. SID / BFF Kafka topics are tagged in the message.
        Publishes nobody here consumes go to Outside.
      </p>
      <Mermaid chart={chart} scroll />
    </div>
  );
}
