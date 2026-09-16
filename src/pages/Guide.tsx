/**
 * The only hand written page on the site. Everything else is generated, but a
 * new joiner needs the mental model that the code cannot state about itself.
 * Keep the prose here honest and short; link into generated pages for detail
 * so this never goes stale.
 */
import { Link } from "react-router-dom";

import { Mermaid } from "../components/Mermaid";
import { Badge, PageHead, Section } from "../components/ui";
import { useData } from "../data";

const REQUEST_REPLY = `sequenceDiagram
  autonumber
  actor C as Channel
  participant B as OpenAPI
  participant D as TMF658
  C ->> B: POST /campaigns/check
  Note over B: Check Privilege
  B ->> D: checkPrivilege
  Note over D: CheckPrivilegeUseCase
  D -->> B: privilegeChecked
  B -->> C: HTTP 200`;

const REQUEST_FAIL = `sequenceDiagram
  autonumber
  actor C as Channel
  participant B as OpenAPI
  participant D as TMF658
  C ->> B: POST /campaigns/check
  B ->> D: checkPrivilege
  D -x B: checkPrivilegeFailed
  B -->> C: HTTP error`;

export function GuidePage() {
  const { core } = useData();
  const byId = (id: string) => core.repos.find((r) => r.id === id);

  return (
    <>
      <PageHead title="New joiner guide">
        Read this once, top to bottom. It is about 10 minutes and gives you the
        mental model you need before the generated pages make sense. Everything
        else on this site is extracted from the code; this page is the part the
        code cannot tell you about itself.
      </PageHead>

      <div className="prose">
        <h2>1. The one idea that explains everything</h2>
        <p>
          <strong>
            Every cross-service call in this platform is a Kafka message.
          </strong>{" "}
          There are no internal REST calls between these four services. When the
          Back Office saves a campaign, or a customer redeems a privilege in
          MyAIS, the service that received the request does not call the loyalty
          database — it publishes a command topic and waits for a reply topic.
        </p>
        <p>
          That single fact explains the shape of the code, the shape of this
          site, and most of the confusion new joiners have. If you are looking
          for “the function that redeems a privilege”, it is not in the service
          that received the HTTP request. It is in the domain service, reached
          by a topic.
        </p>

        <h2>2. The request/reply pattern you will see everywhere</h2>
        <p>
          Kafka is fire-and-forget, but an HTTP caller needs an answer. The
          platform bridges that with a correlation id: the caller publishes a
          command, registers a listener for the matching reply topic, and blocks
          until the reply with its correlation id arrives or the timeout
          expires.
        </p>
        <Mermaid chart={REQUEST_REPLY} />
        <p>
          Topics come in families of three, and recognising the naming
          convention will save you a lot of time:
        </p>
        <ul>
          <li>
            <code>nlp.pty.checkPrivilege</code> — the{" "}
            <Badge tone="accent">command</Badge>, imperative mood. Somebody
            wants something done.
          </li>
          <li>
            <code>nlp.pty.privilegeChecked</code> — the{" "}
            <Badge tone="green">event</Badge>, past tense. It was done, here is
            the result.
          </li>
          <li>
            <code>nlp.pty.checkPrivilegeFailed</code> — the{" "}
            <Badge tone="red">failure</Badge>. It was not done, here is why.
          </li>
        </ul>
        <Mermaid chart={REQUEST_FAIL} />
        <p>
          Separately, <code>sid.cdc.*</code> topics are{" "}
          <Badge tone="purple">CDC</Badge> change streams from other systems'
          databases, used to keep local read models warm. They are not part of
          any request/reply pair.
        </p>

        <h2>3. The services, and which one you want</h2>
        <p>
          Three request layers, plus scheduled jobs. Requests come in at layer
          1, only layer 3 owns loyalty data, and cronjobs publish into the same
          bus.
        </p>
        <ul>
          <li>
            <strong>
              <Link to="/services/openapi-bff">OpenAPI BFF</Link>
            </strong>{" "}
            ({byId("openapi-bff")?.stats.endpoints} endpoints) — the outside
            world's door. MyAIS, USSD, partners, BBL. Mostly translating between
            the legacy API contract that channels depend on and the platform's
            internal topics. Go here when a customer-facing symptom needs
            explaining.
          </li>
          <li>
            <strong>
              <Link to="/services/backoffice-bff">Back Office BFF</Link>
            </strong>{" "}
            ({byId("backoffice-bff")?.stats.endpoints} endpoints) — the internal
            console's door. Campaign, partner, point and permission
            administration. Every endpoint is permission guarded, and it owns
            its own MongoDB for back office state. By far the largest codebase.
            Go here when an operator says “I clicked save and…”.
          </li>
          <li>
            <strong>
              <Link to="/services/agg-common">Loyalty Aggregator</Link>
            </strong>{" "}
            — Kafka only, no HTTP. Small but important: it owns the coarse
            business entry topics (register a member, adjust a balance),
            enriches them with D03 lookups, then delegates to the domain service
            and publishes the final outcome. Go here when a registration
            half-happened.
          </li>
          <li>
            <strong>
              <Link to="/services/tmf658">TMF658 Loyalty Domain Service</Link>
            </strong>{" "}
            ({byId("tmf658")?.stats.useCases} use cases) — the system of record.
            It owns the loyalty MongoDB and all the real rules: earn, burn,
            redeem, transfer, expire, tier. Go here when you need to know what
            the platform actually decided and why.
          </li>
          <li>
            <strong>
              <Link to="/services/cronjob">NLP Cronjob</Link>
            </strong>{" "}
            — Nest Commander CLI jobs, not HTTP. Reconcile files, expire points,
            SFTP/SAP, offer notifications. A job typically calls a use case that
            then publishes a Kafka command into TMF658. Go here when something
            “ran overnight and broke”.
          </li>
        </ul>
        <div className="callout">
          <strong>Rule of thumb:</strong> if the question is “what did we answer
          the channel?”, look at a BFF. If the question is “what did we actually
          do to the customer's points?”, look at the TMF658 service. The BFFs
          hold almost no business logic.
        </div>

        <h2>4. How the code is laid out</h2>
        <p>
          All of these services are NestJS and follow the same layering, which
          is why this site can be generated at all:
        </p>
        <ul>
          <li>
            <strong>Controller</strong> (<code>*.controller.ts</code>) — an HTTP
            route. Validates input, calls one use case, maps the response. No
            business logic.
          </li>
          <li>
            <strong>Consumer</strong> (<code>@EntryPoint('topic')</code>) — the
            Kafka equivalent of a controller. Binds a topic to a handler.
          </li>
          <li>
            <strong>Cron command</strong> (<code>@Command</code> in nlp-cronjob)
            — a scheduled CLI job listed under{" "}
            <Link to="/jobs">Batch jobs</Link>. Same role as a controller:
            validate flags, call one use case.
          </li>
          <li>
            <strong>Use case</strong> (<code>*.use-case.ts</code>, one class
            with <code>execute()</code>) —{" "}
            <em>this is where the business logic lives</em>. When you are
            hunting for a rule, you are hunting for a use case.
          </li>
          <li>
            <strong>Manager</strong> — wraps the Kafka producer with a
            business-shaped method, so a use case calls{" "}
            <code>manager.requestCheckPrivilege(...)</code> rather than dealing
            with topics and correlation ids itself. The aggregator uses managers
            instead of use cases.
          </li>
          <li>
            <strong>Repository</strong> — the only thing allowed to touch
            MongoDB or an external HTTP API. Loyalty documents live in TMF658;
            the BFFs keep their own collections as local read models. See{" "}
            <Link to="/database">Mongo collections</Link> for the name as it is
            created, which use case inserts vs queries it, and how documents
            point at other collections. See{" "}
            <Link to="/dependencies">HTTP dependencies</Link> for every axios
            call (D03, SAP, PNS, IKM) a use case actually makes.
          </li>
          <li>
            <strong>DTO</strong> — request, response and event shapes, with{" "}
            <code>class-validator</code> decorators that are the real runtime
            contract. See <Link to="/schemas">Data schemas</Link>.
          </li>
        </ul>

        <h2>5. Things that will confuse you</h2>
        <ol>
          <li>
            <strong>The same class name exists in several repos.</strong>{" "}
            <code>CheckPrivilegeUseCase</code> exists in both the OpenAPI BFF
            and the TMF658 service, and they do completely different things —
            one publishes a command, the other implements the rule. Always check
            which service you are looking at; every page here shows it.
          </li>
          <li>
            <strong>A consumer may not run in your environment.</strong> The{" "}
            <code>CONSUMER_TYPE</code> environment variable slices which
            consumer controllers a pod actually starts (<code>main</code>,{" "}
            <code>background</code>, <code>onlineTransaction</code> and so on).
            A topic can look wired in the code and still be handled by a
            different pod. Topic pages list the slice each handler belongs to.
          </li>
          <li>
            <strong>Failure paths are first class.</strong> A{" "}
            <code>…Failed</code> topic is not an exception — it is a designed
            outcome with its own consumers and its own follow-up logic, such as
            releasing a reserved quota. When tracing a bug, follow the failure
            leg as seriously as the happy path.
          </li>
          <li>
            <strong>
              Seed and debug controllers are not in this catalog.
            </strong>{" "}
            Each BFF has a <code>_developer</code> module (and TMF658 has{" "}
            <code>DevelopEventConsumerController</code>) used for seeding and
            sit-only experiments. Those files still exist in the repos; this
            site omits them so the maps stay product APIs.
          </li>
        </ol>

        <h2>6. How to answer a real question with this site</h2>
        <p>
          <strong>
            “A customer says redeeming a privilege failed. Where do I look?”
          </strong>
        </p>
        <ol>
          <li>
            Press <Badge>⌘K</Badge>, type <em>redeem privilege</em>, open the
            flow.
          </li>
          <li>
            The diagram shows the HTTP endpoint, the command topic, which
            service consumes it, and every system involved. That tells you which
            team and which log to check.
          </li>
          <li>
            Open the use case in the domain service. Its <em>Failure modes</em>{" "}
            section lists every error it can throw, verbatim from the code —
            usually enough to match the error your customer saw.
          </li>
          <li>
            Follow the <code>…Failed</code> topic to see what compensating logic
            was supposed to run.
          </li>
          <li>
            Click through to GitHub at the exact commit this site describes.
          </li>
        </ol>
        <p>
          <strong>“What fields can this API accept?”</strong> Open the endpoint
          from <Link to="/endpoints">API endpoints</Link>. The request section
          lists every field with its type, whether it is required, and the
          validation rules that actually apply.
        </p>
        <p>
          <strong>“If D03 goes down, what breaks?”</strong>{" "}
          <Link to="/systems">Downstream systems</Link> lists every use case
          whose call graph reaches each external system.
        </p>

        <h2>7. Where to go next</h2>
        <ul>
          <li>
            <Link to="/flows?entry=topic">Kafka entry flows</Link> — the best
            overview of what the platform actually does, in{" "}
            {core.stats.flows.toLocaleString()} traced paths
          </li>
          <li>
            <Link to="/services">Services</Link> — including a matrix of which
            service publishes topics that another one consumes
          </li>
          <li>
            <Link to="/topics">Kafka topics</Link> — the contract surface
            between teams
          </li>
          <li>
            <Link to="/releases">Versions &amp; updates</Link> — exactly which
            commits this site reflects, and what has landed since
          </li>
        </ul>

        <div className="callout">
          <strong>A caution.</strong> This site is generated by static analysis,
          so it is accurate about structure (routes, topics, schemas, who calls
          whom) and silent about runtime reality (which branch of an{" "}
          <code>if</code> ran, what a feature flag was set to, which pod was
          listening). Where a link could not be resolved, the page says so
          rather than guessing. Treat it as a map, not as proof.
        </div>
      </div>

      <Section title="Same guide, as a checklist">
        <div className="card prose" style={{ maxWidth: "none" }}>
          <ul>
            <li>
              Every cross-service call is a Kafka message. There is no internal
              REST.
            </li>
            <li>
              Commands are imperative, events are past tense, failures end in
              Failed.
            </li>
            <li>Business logic lives in use cases. BFFs mostly translate.</li>
            <li>
              The TMF658 service owns loyalty data. Nobody else writes it.
            </li>
            <li>Check which repo you are in before trusting a class name.</li>
            <li>
              A wired consumer may still not be running — check{" "}
              <code>CONSUMER_TYPE</code>.
            </li>
            <li>
              <code>_developer</code> seed/debug controllers are omitted from
              every catalog.
            </li>
          </ul>
        </div>
      </Section>
    </>
  );
}
