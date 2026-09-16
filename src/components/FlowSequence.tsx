import { useMemo } from "react";

import { toSequence } from "../../extractor/sequence";
import { useData } from "../data";
import type { FlowStep } from "../types";
import { Mermaid } from "./Mermaid";

export function FlowSequence({ steps }: { steps: FlowStep[] }) {
  const { indexes, core } = useData();
  const chart = useMemo(() => {
    const repoTitles = new Map<string, string>();
    for (const [id, repo] of indexes.repoById)
      repoTitles.set(id, repo.tag || repo.title);
    const systemTitles = new Map<string, string>();
    for (const sys of core.systems) systemTitles.set(sys.id, sys.title);
    return toSequence(steps, { repoTitles, systemTitles });
  }, [steps, indexes.repoById, core.systems]);

  if (!chart) return <div className="empty">No sequence for this flow.</div>;

  return (
    <div className="flow-sequence">
      <p className="flow-sequence__legend dimmer">
        Numbered left to right over time. Solid filled arrow = call / command
        · dashed filled = reply / event · ✕ = failure · dashed open arrow = a
        system the code touches but no concrete call/query could be attributed
        (ctor-only dependency, not axios/Mongo). Red bordered frames mark
        failure paths; amber/opt frames mark conditional or unconsumed
        publishes. Notes name the use case — consecutive notes on one lifeline
        with no bar break are sibling handlers of the same hop, not separate
        calls. Arrows to Mongo / D03 / LID show axios or database calls.
        Publishes nobody here consumes go to Outside.
      </p>
      <Mermaid chart={chart} scroll />
    </div>
  );
}
