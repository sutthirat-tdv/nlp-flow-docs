import { useMemo } from "react";

import { toSequence } from "../../extractor/sequence";
import { useData } from "../data";
import type { FlowStep } from "../types";
import { Mermaid } from "./Mermaid";

export function FlowSequence({ steps }: { steps: FlowStep[] }) {
  const { indexes } = useData();
  const chart = useMemo(() => {
    const repoTitles = new Map<string, string>();
    for (const [id, repo] of indexes.repoById) repoTitles.set(id, repo.title);
    return toSequence(steps, { repoTitles });
  }, [steps, indexes.repoById]);

  if (!chart) return <div className="empty">No sequence for this flow.</div>;

  return (
    <div className="flow-sequence">
      <p className="flow-sequence__legend dimmer">
        Numbered left to right over time. Solid arrow = command · dashed = reply
        / event · ✕ = failure. Notes name the use case and the systems it talks
        to. Publishes nobody here consumes go to Outside.
      </p>
      <Mermaid chart={chart} scroll />
    </div>
  );
}
