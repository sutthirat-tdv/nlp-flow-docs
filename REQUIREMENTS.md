# NLP Loyalty Platform — Flow Documentation Site

This file is the **durable requirement**. Paste it (or link it) into the next Cursor session and the agent should continue in the same direction without re-discovering the service repos.

Location of the site: `nlp-flow-docs/` next to the four service checkouts in `corp-ais/`.

---

## Resume prompt (paste this)

> Continue the NLP loyalty flow documentation site in `nlp-flow-docs/`. Read `REQUIREMENTS.md` first and treat it as the source of truth. The site is generated from the NestJS repos in `repos.config.json` on `origin/sit` (OpenAPI BFF, Back Office BFF, agg-common, TMF658, nlp-cronjob). Do not hand-write catalogs. To refresh: `npm run update` (or `npm run generate:offline` if GitHub is unreachable). Keep extractor conventions, call-graph topic attribution, sharded `public/data/` output, and the React catalog UI. Improve accuracy, onboarding, and regenerate-from-tag/commit — do not replace the pipeline with a different architecture.

---

## Goal

A website a new joiner (or anyone) can use to **look up any use case, flow, and data schema** across:

| Config id        | Repository                              | Role                                               |
| ---------------- | --------------------------------------- | -------------------------------------------------- |
| `openapi-bff`    | `nlp-openapi-bff`                       | Layer 1 HTTP entry (Legacy API + OpenAPI Warranty) |
| `backoffice-bff` | `nlp-backoffice-bff`                    | Layer 1 HTTP entry (Back Office console)           |
| `agg-common`     | `esb-loyalty-management-agg-common`     | Layer 2 Kafka aggregator                           |
| `tmf658`         | `esb-dos-TMF658-loyalty-management-nlp` | Layer 3 TMF658 domain / system of record           |
| `cronjob`        | `nlp-cronjob`                           | Layer 4 scheduled Nest Commander jobs              |

Requirements that must remain true:

1. **End-to-end.** A reader can follow a request from the HTTP (or Kafka) entry, through use cases, across Kafka topics into other services, down to Mongo/D03/SAP/etc.
3. **Onboarding.** A short mental-model page (`/guide`) explains that _every cross-service call is Kafka_, request/reply + Failed topics, and which repo owns what.
3. **Onboarding.** A short mental-model page (`/guide`) explains that _every cross-service call is Kafka_, request/reply + Failed topics, and which repo owns what.
4. **Regenerable.** Re-run against the latest `origin/sit` (or a release tag / commit) without rewriting pages by hand.
5. **Provenance.** Every page must show which branch, commit, and nearest tag the extraction came from, with GitHub deep links to the exact line.

---

## Non-goals

- Running the services, generating OpenAPI from live Swagger, or scraping production.
- Documenting `nlp-backoffice-web`, helm charts, or anything not in `repos.config.json`.
- Perfect control-flow (which `if` branch ran). Static analysis of structure only; pages must say so when a link could not be resolved.
- Hand-maintained catalogs of endpoints or topics.

---

## How the four repos actually work (do not unlearn this)

All four are NestJS + TypeScript. Working trees in this workspace are often **not** on `sit`. Always read `origin/sit` (or the configured ref) via `git archive` / `git show`, never the dirty worktree.

### Shared conventions the extractor depends on

| Artifact        | Convention                                                                   |
| --------------- | ---------------------------------------------------------------------------- |
| Use case file   | `*.use-case.ts`, class `*UseCase`, entry method `execute()`                  |
| HTTP controller | `@Controller` + `@Get`/`@Post`/…, Swagger `@ApiProperty` on DTOs             |
| Kafka consumer  | `@EntryPoint(topic)` from `@corp-ais/eqxjs-stub` (sometimes `@EventPattern`) |
| Kafka produce   | `EventProducerService.request` / `.publisher` / `.produce` with a topic enum |
| Topic strings   | Enum string values like `'nlp.pty.redeemPrivilege'`                          |
| Topic family    | command / past-tense event / `…Failed`                                       |
| Validation      | `class-validator` on DTO properties                                          |
| Path aliases    | `~*` → `src/*`; agg-common uses `~loyalty/*` → `src/loyaltyManagement/*`     |

### Per-repo layout (origin/sit)

**openapi-bff** — HTTP in `src/controllers/legacyApi/<feature>/` and `src/controllers/openApiWarranty/`. Use cases mostly live **next to controllers**, not under `src/domains/`. Kafka consumers in `src/consumers/` **and** `src/infrastructure/eventServiceBus/consumer/`. Global prefix `api` with exclusions for `legacy-api`, `bbl`, `healthcheck`, etc. (see `repos.config.json` `apiPrefixExcludes`). Runtime Swagger only — no committed OpenAPI spec.

**backoffice-bff** — HTTP in `src/domains/<domain>/controllers/`. Use cases in `src/domains/<domain>/useCases/`. Permissions via `@RequiredPermissions(PermissionEnum…)`. `@ApiOperation` is rare; do not require it. Global prefix `api`, URI versioning → `/api/v1/…`.

**agg-common** — **No `*.use-case.ts`**. Pattern is `Consumer → Manager.method() → Service + D03 + Kafka request/reply into tmf658`. Promote managers invoked from consumers into synthetic use cases so flows have a body. Kafka-only (health HTTP only).

**tmf658** — Kafka-only domain service. `src/loyaltyManagement/useCases/**/*.use-case.ts` (~111) and `consumers/**/*consumer.controller.ts`. Owns loyalty MongoDB. `scripts/mac/topics.yaml` is the command / success / failure triplet registry. `CONSUMER_TYPE` slices which consumers a pod starts.

### Architecture fact that drives E2E tracing

There are **no internal REST calls** between these four services. Cross-service work is Kafka, usually request/reply with a correlation id. OpenAPI/Backoffice BFFs translate HTTP ↔ topics. agg-common owns coarse entry topics (`nlp.pty.registerLoyaltyMember`, `nlp.pty.adjustLoyaltyAccountBalance`). tmf658 implements the rules and writes loyalty data.

---

## Pipeline (keep this shape)

```
repos.config.json
        │
        ▼
extractor/sync.ts     git archive of each branch → .cache/snapshots/<repoId>
        │             records commit, tags, new commits since last build
        ▼
extractor/index.ts    extract-repo.ts per snapshot
        │             flows.ts stitches produce/consume into E2E graphs
        ▼
public/data/          core.json + schemas.<repoId>.json + flows.<repoId>.json
        │
        ▼
Vite + React          src/  (hash router, loads shards on demand)
```

### Commands

| Script                     | What it does                                |
| -------------------------- | ------------------------------------------- |
| `npm run generate`         | fetch + snapshot + extract                  |
| `npm run generate:offline` | snapshot current local refs, no `git fetch` |
| `npm run extract`          | extract from existing snapshots             |
| `npm run dev`              | Vite on port 4173                           |
| `npm run build`            | static site → `dist/`                       |
| `npm run update`           | generate + build                            |

tsx was abandoned: the sandbox cannot create its IPC socket. Compile the extractor with `tsc -p tsconfig.extractor.json` and run `node dist-extractor/*.js`.

### Updating from a tag or commit

In `repos.config.json`, set that repo's `branch` to:

- `"origin/sit"` (default, latest SIT)
- a tag, e.g. `"2.31.0"`
- a commit SHA

Then `npm run update`. The site's Releases page already lists recent tags per repo.

### Output shards (do not go back to one 30 MB file)

| File                                | Loaded when                                    |
| ----------------------------------- | ---------------------------------------------- |
| `public/data/core.json`             | First paint — lists, search, summaries (~7 MB) |
| `public/data/schemas.<repoId>.json` | Opening a schema                               |
| `public/data/flows.<repoId>.json`   | Opening a flow (steps + mermaid)               |
| `public/data/manifest.json`         | Provenance for the next sync                   |

---

## Extractor rules that must not regress

1. **Topic attribution is per-method call graph**, not per-class union. Walk `this.dep.method()` and `this.helper()` from the entry method. A class-level union of every topic a shared `CampaignService` can publish made every flow look like it published 35 topics. Look at `publishedIn()` — only enum/string topics **inside the argument list of** `.request(` / `.publisher(` / `.produce(` / `.publish(` / `.sendKafkaMessage(` count as publishes.

2. **Reply listeners** (`publishReply(`) are not business consumers. Filter them out of flow walks.

3. **agg-common managers** invoked from a consumer become synthetic use cases (`tags: ['manager']`). Do **not** promote `RequestReplyService` / loggers.

4. **Every consumed topic gets a flow**, not only “external” ones. HTTP endpoints also get a flow. `external: true` means nothing in these four repos publishes the entry.

5. **Never mutate the service repos.** Snapshots are read-only.

6. `extractor/model.ts` is shared with the website. Keep it free of Node/DOM imports.

7. **Mongo collections** come from `*MongoRepository` (`db.collection(...)` / `collectionName`), not Mongoose. Attribute create vs query from the use-case (or manager) entry method call graph, same as topics — not a class-level union of every repository method. Draw them as a **database diagram** (table cards with columns and PK/FK lines), not a mermaid `erDiagram`.

9. **nlp-cronjob** is a fifth repo. Nest Commander `@Command` classes are catalogued as `CRON /jobs/<name>` endpoints. Jobs use the same use-case / axios / Mongo extractors. Do not skip `origin/sit` for it.

### Known remaining accuracy issues

- `ApplyLoyaltyEvent` in tmf658 has several handlers on the same topic; the walk fans out to all of them (registration rule, mission earn, generic apply). That is structurally true but noisy on some diagrams.
- `CONSUMER_TYPE` deploy slices are recorded on consumers but the site does not yet filter flows by slice.
- Dynamic topic names (string concatenation) will be missed.
- Use-case DTO files sometimes omit `class-validator`; HTTP DTOs have the real rules — prefer those on endpoint pages.
- Backoffice `@ApiOperation` is rare; flow titles often fall back to `METHOD /path`.

---

## Website (keep this IA)

Hash router (`HashRouter`) so `dist/` works from any static path.

| Route                            | Page                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `/`                              | Overview: stats, architecture **sequence** diagram, four services, sample entry flows |
| `/guide`                         | **Hand-written** new-joiner mental model (the only prose that is not generated)       |
| `/services`, `/services/:repoId` | Layer list, who-talks-to-whom matrix, domains, env vars, version                      |
| `/flows`, `/flows/:flowId`       | Filterable catalog; **mermaid sequence** (time order) + indented step list            |
| `/endpoints`, `/endpoints/:id`   | HTTP catalog plus **CRON** job commands from nlp-cronjob; request/response fields; link to flow |
| `/topics`, `/topics/:name`       | Kafka catalog; publishers, consumers, payload schema, family                          |
| `/use-cases`, `/use-cases/:id`   | Business logic catalog; triggers, I/O schemas, publishes, deps, **Mongo create vs query**, **axios calls**, thrown errors |
| `/schemas`, `/schemas/:id`       | DTO/entity/enum browser; nested expand; used-by; link to Mongo collection when it is a stored document |
| `/database`, `/database/:id`     | Mongo collections as a **database diagram** (table cards, columns, PK/FK); create vs query methods; document fields |
| `/dependencies`, `/dependencies/:id` | Outbound **axios** HTTP clients (D03, SAP, PNS, IKM, …); verb + path; use cases that actually call them |
| `/systems`                       | Downstream blast radius                                                               |
| `/releases`                      | Commit/tag provenance + how to regenerate                                             |

Search: MiniSearch built in-browser from `core.json` on first ⌘K. Tokenize camelCase and dotted topic names.

Visual: dark theme in `src/styles.css`. Mermaid loaded lazily (`src/components/Mermaid.tsx`).

The `/guide` page is the **only** hand-written content. If platform facts change, update that page; everything else must stay generated.

---

## File map

```
nlp-flow-docs/
  REQUIREMENTS.md          ← this file
  README.md                ← operator how-to
  repos.config.json        ← which repos/branch/tags, downstream systems
  extractor/
    config.ts              load repos.config.json
    sync.ts                git archive snapshots + provenance
    ast.ts                 TS compiler API helpers (no typechecker)
    extract-repo.ts        one snapshot → use cases, endpoints, consumers, schemas, collections, http clients
    extract-collections.ts Mongo collection names, ops, links, columns from *MongoRepository
    extract-http.ts        AxiosService / factory get/post/put/patch/delete calls
    flows.ts               stitch E2E graphs + mermaid
    model.ts               shared types
    index.ts               orchestrate + write public/data
  src/                     Vite React app
  public/data/             generated JSON (gitignored if large; regenerate)
  .cache/snapshots/        gitignored
```

---

## Definition of done for future work

A change is done when:

1. `npx tsc -p tsconfig.extractor.json` and `npx tsc -p tsconfig.json --noEmit` are clean.
2. `npm run generate:offline && npm run build` succeeds.
3. `npm run dev` does not fail on missing page modules.
4. A known flow still traces across services (sanity: `POST /legacy-api/v1/campaigns/check` → `nlp.pty.checkPrivilege` → tmf658 `CheckPrivilegeUseCase`; `nlp.pty.registerLoyaltyMember` → agg-common manager → `nlp.pty.onboardLoyaltyMember` → tmf658). Flow pages render a mermaid **sequenceDiagram**, not a flowchart.
5. `/guide` and `/releases` still explain how to regenerate from `origin/sit` or a tag.

---

## Scale (last successful extract, sit heads)

Approximate — will change on regenerate:

- ~800 HTTP endpoints, ~340 Kafka consumers, ~900 use cases, ~580 topics, ~12k schemas, ~900 flows (~250 cross-service)
- Snapshots: openapi-bff ~1k ts files, backoffice-bff ~3k, tmf658 ~930, agg-common ~100

Do not load all schemas or all flow mermaid graphs on first paint.
