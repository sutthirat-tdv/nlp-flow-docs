/**
 * Hand written, like /guide — see REQUIREMENTS.md's hand-written-content
 * list. Transcribed from a "myAIS legacy integration overview" architecture
 * diagram (Softlaunch Solution) supplied directly by a team member; none of
 * MyBE, PRC, Donut, AC, MAS, or ESB On Cloud are in repos.config.json, so
 * none of this is derivable from the extractor. If the source diagram
 * changes, update this page to match — it is not regenerated.
 */
import { Mermaid } from "../components/Mermaid";
import { Badge, PageHead, Section } from "../components/ui";

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

const CUT_OFF_NODES = [
  "APIM BFF",
  "MAS",
  "Gateway APIM (inside ESB On Cloud)",
  "MyBE",
  "PRC",
  "NLP",
];

export function MyAisIntegrationPage() {
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
      >
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
                    {api}
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
                {step}
              </li>
            ))}
          </ol>
        </div>
      </Section>
    </>
  );
}
