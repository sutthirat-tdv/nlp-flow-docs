/**
 * Mermaid is loaded lazily: it is the heaviest dependency on the site and only
 * the flow and architecture views need it.
 */
import { useEffect, useRef, useState } from "react";

let initialised = false;
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

async function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((module) => {
      const mermaid = module.default;
      if (!initialised) {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          themeVariables: {
            background: "#0d1426",
            primaryColor: "#17203c",
            primaryTextColor: "#e8ecf6",
            primaryBorderColor: "#6b82b0",
            lineColor: "#9eb4d8",
            secondaryColor: "#121a30",
            tertiaryColor: "#0b1020",
            actorBkg: "#1a2744",
            actorBorder: "#6b82b0",
            actorTextColor: "#e8ecf6",
            actorLineColor: "#7a90b8",
            signalColor: "#c5d4ef",
            signalTextColor: "#e8ecf6",
            labelBoxBkgColor: "#17203c",
            labelBoxBorderColor: "#6b82b0",
            labelTextColor: "#e8ecf6",
            noteBkgColor: "#243044",
            noteTextColor: "#e2e8f0",
            noteBorderColor: "#7a90b8",
            activationBkgColor: "#1a2744",
            activationBorderColor: "#8aa0c8",
            sequenceNumberColor: "#0d1426",
            fontSize: "13px",
          },
          flowchart: {
            curve: "basis",
            nodeSpacing: 34,
            rankSpacing: 44,
            useMaxWidth: true,
          },
          sequence: {
            actorMargin: 48,
            messageMargin: 16,
            boxMargin: 6,
            noteMargin: 8,
            mirrorActors: false,
            useMaxWidth: true,
            wrap: true,
            width: 130,
          },
          er: {
            useMaxWidth: true,
          },
        });
        initialised = true;
      }
      return mermaid;
    });
  }
  return mermaidPromise;
}

let counter = 0;

export function Mermaid({
  chart,
  scroll = false,
}: {
  chart: string;
  scroll?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!chart.trim()) return;
    const id = `mermaid-${counter++}`;
    getMermaid()
      .then((mermaid) => mermaid.render(id, chart))
      .then(({ svg }) => {
        if (active && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [chart]);

  if (!chart.trim()) return null;

  return (
    <div className={`mermaid-wrap${scroll ? " mermaid-wrap--scroll" : ""}`}>
      {error ? (
        <div>
          <p className="dimmer" style={{ fontSize: 12 }}>
            The diagram could not be rendered ({error}). The step list below is
            the source of truth.
          </p>
          <pre className="mono dimmer" style={{ whiteSpace: "pre-wrap" }}>
            {chart}
          </pre>
        </div>
      ) : null}
      <div ref={ref} />
    </div>
  );
}
