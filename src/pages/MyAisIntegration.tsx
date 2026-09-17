/**
 * Hand written, like /guide — see REQUIREMENTS.md's hand-written-content
 * list. Transcribed from a "myAIS legacy integration overview" architecture
 * diagram (Softlaunch Solution) supplied directly by a team member; none of
 * MyBE, PRC, Donut, AC, MAS, or ESB On Cloud are in repos.config.json, so
 * none of this is derivable from the extractor. If the source diagram
 * changes, update this page to match — it is not regenerated.
 */
import { Link } from "react-router-dom";

import { Mermaid } from "../components/Mermaid";
import { Badge, PageHead, Section } from "../components/ui";
import { useData } from "../data";
import { endpointHref } from "../entryLinks";
import type { Endpoint } from "../types";

const DIAGRAM = `flowchart TB
  legacy["MyAIS Legacy"]
  ac["AC (Partner, Privilege)"]
  bbl["BBL"]
  apimbff["APIM BFF ★1"]
  mas["MAS ★2"]
  myaisnlp["MyAIS NLP"]
  legacy48["Legacy (48 App)"]

  subgraph softlaunch["Softlaunch Solution"]
    mybe["MyBE ★4"]
    donut["Donut"]
    prc["PRC ★5"]
    nlp["NLP ★6"]
    donutdb[("Donut DB")]
    prcdb[("PRC DB")]
    nlpdb[("NLP DB")]

    subgraph esb["ESB On Cloud"]
      gw["Gateway APIM ★3"]
      bcc["BCC: AD to SRPS"]
    end
  end

  legacy -->|"TMF V4 (A)"| ac
  legacy -->|"TMF V4 (B2)"| ac
  ac -->|"RestAPI (A)"| mybe
  ac -->|"RestAPI (B2)"| mybe
  mybe -->|"RestAPI"| donut
  mybe -->|"RestAPI"| prc
  mybe -->|"RestAPI (B2)"| bcc
  mybe -->|"RestAPI (A)"| bcc

  legacy -->|"RestAPI (C)"| apimbff
  legacy -->|"RestAPI (B1)"| apimbff
  apimbff -->|"RestAPI"| mas
  apimbff -->|"RestAPI, PRC format (B1)"| gw
  apimbff -->|"RestAPI (C2)"| gw
  mas -->|"RestAPI (C1)"| gw

  bbl --> gw

  gw -->|"RestAPI, PRC format (B1)"| bcc
  gw -->|"RestAPI (C)"| nlp
  gw -.->|"legacy bypass"| donut
  bcc -->|"RestAPI"| nlp
  bcc -->|"Topic"| nlp
  bcc -->|"Topic"| nlp

  myaisnlp -->|"TMF V5"| nlp

  legacy48 -->|"sync"| prc

  donut -.-> donutdb
  donutdb -.-> donut
  prc -.-> prcdb
  prcdb -.-> prc
  nlp -.-> nlpdb
  nlpdb -.-> nlp
  donutdb -.->|"Sync Data"| prcdb
  prcdb -.->|"Sync Data"| nlpdb

  classDef cutoff stroke:#ff2fa0,stroke-width:3px;
  class apimbff,mas,gw,mybe,prc,nlp cutoff;`;

const LETTER_LEGEND: { letter: string; tone: string; meaning: string }[] = [
  {
    letter: "A",
    tone: "accent",
    meaning: "API that NLP already supports as OpenAPI.",
  },
  {
    letter: "B1",
    tone: "red",
    meaning:
      "RestAPI pushed from MyAIS → APIM → PRC/Donut, converted RestAPI → TMF V5 along the way.",
  },
  {
    letter: "B2",
    tone: "purple",
    meaning:
      "TMF V4 pushed from MyAIS → AC → MyBE. NLP supports this as a topic (TMF V5), not OpenAPI.",
  },
  {
    letter: "C",
    tone: "green",
    meaning:
      "RestAPI pushed from MyAIS → APIM → MyBE → PRC, sent as RestAPI to NLP's OpenAPI.",
  },
];

interface SolutionGroup {
  id: string;
  title: string;
  tone: string;
  apis: string[];
}

const SOLUTION_GROUPS: SolutionGroup[] = [
  {
    id: "a",
    title: "Solution A",
    tone: "accent",
    apis: [
      "redeemPointSeamless",
      "getCustomerPoints",
      "getPointRedeemHistory",
      "getPrivilegeRedeemHistory",
      "requestPrivilegeBarcode",
      "getCampaignRecommend",
      "getCustomerPointsHistory",
    ],
  },
  {
    id: "b1",
    title: "Solution B1",
    tone: "red",
    apis: ["redeemLuckyDraw", "redeemPointSeamlessLuckyDraw"],
  },
  {
    id: "b2",
    title: "Solution B2",
    tone: "purple",
    apis: [
      "redeemMerchantKTB",
      "getVoucherToday",
      "getPrivilegeRedeemVoucher",
      "getVoucher",
    ],
  },
  {
    id: "c",
    title: "Solution C",
    tone: "green",
    apis: ["getVoucherActive (C1)", "checkTransfer (C2)", "transferOut (C2)"],
  },
];

const RETEST_FLOW: string[] = [
  "validateMerchantKTB (RestAPI)",
  "getMerchantQRKTB",
  "getPartnerProfile (RestAPI)",
  "getPartner",
  "getPointsPartner",
  "confirmAddPartner",
  "authenKbank",
  "checkStatusKpoint",
  "deletePartner",
  "verifyMemberPointX",
  "requestOtpPointX",
  "serenadeParking",
  "decryptPrivilegeQRCode (RestAPI)",
];

/**
 * The names in the diagram are MyAIS's legacy contract method names, not
 * today's handler/route names — most don't correspond to anything current
 * (fuzzy matching them produced false positives, e.g. "checkStatusKpoint"
 * matching "healthCheck", so that approach was dropped). Only link a name
 * when it's an exact, case-insensitive, UNAMBIGUOUS match to exactly one
 * openapi-bff endpoint handler — the Legacy API surface MyAIS actually
 * calls. Everything else stays plain text rather than guess.
 */
function buildLegacyHandlerIndex(endpoints: Endpoint[]): Map<string, Endpoint> {
  const counts = new Map<string, Endpoint[]>();
  for (const e of endpoints) {
    if (e.repoId !== "openapi-bff") continue;
    const key = e.handler.toLowerCase();
    const list = counts.get(key) ?? [];
    list.push(e);
    counts.set(key, list);
  }
  const unambiguous = new Map<string, Endpoint>();
  for (const [key, list] of counts) {
    if (list.length === 1) unambiguous.set(key, list[0]);
  }
  return unambiguous;
}

/** Strips a trailing "(C1)" / "(RestAPI)" style annotation before matching. */
function bareApiName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function ApiName({
  name,
  index,
}: {
  name: string;
  index: Map<string, Endpoint>;
}) {
  const endpoint = index.get(bareApiName(name).toLowerCase());
  if (!endpoint) return <>{name}</>;
  return (
    <Link to={endpointHref(endpoint)} title={`${endpoint.method} ${endpoint.path}`}>
      {name}
    </Link>
  );
}

const CUT_OFF_NODES = [
  "APIM BFF",
  "MAS",
  "Gateway APIM (inside ESB On Cloud)",
  "MyBE",
  "PRC",
  "NLP",
];

export function MyAisIntegrationPage() {
  const { core } = useData();
  const handlerIndex = buildLegacyHandlerIndex(core.endpoints);
  const linkedCount = [
    ...SOLUTION_GROUPS.flatMap((g) => g.apis),
    ...RETEST_FLOW,
  ].filter((name) => handlerIndex.has(bareApiName(name).toLowerCase())).length;

  return (
    <>
      <PageHead title="myAIS legacy integration">
        How the myAIS legacy app reaches the loyalty platform under the
        Softlaunch Solution — multiple parallel integration paths (TMF V4,
        RestAPI, TMF V5, Kafka topics) converging on MyBE, PRC, Donut and NLP,
        each API bucketed into one of four migration solutions.
      </PageHead>

      <div className="callout">
        <strong>Hand written, not generated.</strong> Unlike every other page
        on this site, this one is transcribed from an architecture diagram
        rather than extracted from the four/five repos' source — MyBE, PRC,
        Donut, AC, MAS and ESB On Cloud aren't in <code>repos.config.json</code>,
        so the extractor has no way to know about them. If the source diagram
        changes, this page needs a manual update; it will not regenerate
        itself.
      </div>

      <Section
        title="Architecture overview"
        subtitle="redrawn from the Softlaunch Solution diagram"
      >
        <Mermaid chart={DIAGRAM} scroll />
        <p className="dim" style={{ marginTop: 10 }}>
          Pink-bordered boxes ({CUT_OFF_NODES.join(", ")}) are the six points
          the source diagram marks with a{" "}
          <span style={{ color: "#ff2fa0" }}>★</span> "Cut Off Step" — the
          diagram doesn't say what happens at each individually beyond that
          marker, so this page doesn't invent an explanation either; ask
          whoever owns the Softlaunch migration for the per-step detail.
        </p>
      </Section>

      <Section
        title="What the letters mean"
        subtitle="each integration path pushes data through a different route/protocol conversion"
      >
        <div className="grid grid--2">
          {LETTER_LEGEND.map((item) => (
            <div key={item.letter} className="card">
              <div className="badges" style={{ marginBottom: 8 }}>
                <Badge tone={item.tone}>{item.letter}</Badge>
              </div>
              <p className="dim" style={{ margin: 0 }}>
                {item.meaning}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Solution groups"
        subtitle="which APIs are migrated under which solution"
        actions={
          <Link to="/endpoints?surface=legacy">Browse the Legacy API surface →</Link>
        }
      >
        <p className="dim" style={{ marginTop: -6 }}>
          These are MyAIS's legacy contract names, not today's route/handler
          names — most don't correspond 1:1 to anything currently generated.{" "}
          {linkedCount} of them do have a confirmed, unambiguous match and are
          linked to their generated endpoint; browse the Legacy API surface
          above to look up the rest yourself.
        </p>
        <div className="grid grid--2">
          {SOLUTION_GROUPS.map((group) => (
            <div key={group.id} className="card">
              <div className="badges" style={{ marginBottom: 8 }}>
                <Badge tone={group.tone}>
                  {group.title} ({group.apis.length} APIs)
                </Badge>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {group.apis.map((api) => (
                  <li key={api} className="mono" style={{ fontSize: 12.5 }}>
                    <ApiName name={api} index={handlerIndex} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Legacy flow — retest"
        subtitle={`${RETEST_FLOW.length} calls to retest end-to-end on the legacy path`}
      >
        <div className="card">
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {RETEST_FLOW.map((step) => (
              <li key={step} className="mono" style={{ fontSize: 12.5, padding: "2px 0" }}>
                <ApiName name={step} index={handlerIndex} />
              </li>
            ))}
          </ol>
        </div>
      </Section>
    </>
  );
}
