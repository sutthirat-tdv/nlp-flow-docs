# NLP Loyalty Platform — Flow Documentation Site

This file is the **durable requirement**. Paste it (or link it) into the next Cursor session and the agent should continue in the same direction without re-discovering the service repos.

Location of the site: `nlp-flow-docs/` next to the four service checkouts in `corp-ais/`.

---

## Resume prompt (paste this)

> Continue the NLP loyalty flow documentation site in `nlp-flow-docs/`. Read `REQUIREMENTS.md` first and treat it as the source of truth. The site is generated from the NestJS repos in `repos.config.json` on `origin/sit` (OpenAPI BFF, Back Office BFF, agg-common, TMF658, nlp-cronjob). Do not hand-write catalogs. To refresh: `npm run update` (or `npm run generate:offline` if GitHub is unreachable). Keep extractor conventions, call-graph topic attribution, sharded `public/data/` output, and the React catalog UI. Improve accuracy, onboarding, and regenerate-from-tag/commit — do not replace the pipeline with a different architecture.

---

## Goal

A website a new joiner (or anyone) can use to **look up any use case, flow, and data schema** across:

| Config id        | Tag          | Repository                              | Role                                               |
| ---------------- | ------------ | --------------------------------------- | -------------------------------------------------- |
| `openapi-bff`    | **OPENAPI**  | `nlp-openapi-bff`                       | Layer 1 HTTP entry (Legacy API + OpenAPI Warranty) |
| `backoffice-bff` | **BACKOFFICE** | `nlp-backoffice-bff`                  | Layer 1 HTTP entry (Back Office console)           |
| `agg-common`     | **DAG**      | `esb-loyalty-management-agg-common`     | Layer 2 Kafka aggregator                           |
| `tmf658`         | **DOS**      | `esb-dos-TMF658-loyalty-management-nlp` | Layer 3 TMF658 domain / system of record           |
| `cronjob`        | **CRONJOB**  | `nlp-cronjob`                           | Layer 4 scheduled Nest Commander jobs              |

Requirements that must remain true:

1. **End-to-end.** A reader can follow a request from the HTTP (or Kafka) entry, through use cases, across Kafka topics into other services, down to Mongo/D03/SAP/etc.
2. **Onboarding.** A short mental-model page (`/guide`) explains that _every cross-service call is Kafka_, request/reply + Failed topics, and which repo owns what.
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

8. **nlp-cronjob** is a fifth repo. Nest Commander `@Command` classes are catalogued as `CRON /jobs/<name>` entries and shown under **Batch jobs** (`/jobs`), not API endpoints. Resolve `name: batchName` via `const batchName = BatchName.…` (and the `BatchName` string enum) — never leave the path as `/jobs/batchName`. Match `*.useCase.ts` as use-case files (camelCase). Job detail pages embed sequence + hop trace. Jobs use the same use-case / axios / Mongo extractors. Sequence diagrams use a Scheduler actor (not Channel / HTTP 200). Do not skip `origin/sit` for it.

9. **Drop `_developer` surfaces from every catalog.** Seed/debug `DeveloperController` / `DevelopEventConsumerController`, `/_developer/` modules, `_developer*` files, and `_test-ac` are not product APIs. Skip them at file walk so endpoints, consumers, CRON jobs, use cases, schemas, collections, and HTTP clients never include them.

10. **Sequence diagrams show concrete I/O.** Prefer `collectionAccess` / `httpAccess` over coarse ctor-only `systems[]`. Draw arrows to short-named system lifelines (D03, LID, Mongo per owning service, …) labeled with verb+path or collection op. Tag `sid.*` / `*.bff.*` Kafka messages as SID / BFF. Cap I/O arrows per use case so charts stay readable. **Failure topics** get a red `rect` / `opt on failure` / `alt success … else on failure` frame; unconsumed publishes get an amber `opt` condition frame.

11. **Infrastructure config is merged, not catalogued per repo** (`extractor/extract-infra.ts`, `/infrastructure`). Each repo re-implements the same `*.config.ts` platform concerns (env, logger, Kafka, Redis, axios, request/reply, per-downstream-system clients) with only minor drift. One `InfraKind` per concern, keyed by a curated `INFRA_KIND_BY_STEM` map — deliberately not "every `*.config.ts`": business config (campaign rules, mission, segmentation, message templates, …) is excluded on purpose, don't widen the scan to include it. Doc comments are pulled from every repo's copy and deduplicated by word-set similarity (`dedupeNotes`, Jaccard ≥ 0.2 — tuned against real Redis config comments reworded per repo; lower it and unrelated notes start merging, raise it and reworded duplicates stop merging). A `systemId` cross-links to the matching `/systems` entry but is **not** the merge key — two concerns can share a downstream system (Kafka client bootstrap vs the request/reply correlation layer on top of it) without being the same file; only `INFRA_KIND_BY_STEM[stem].id` merges stems together (used for genuine aliases like `email`/`graph-email`). When a repo's actual config has no doc comments to extract (most of them don't — 18 of 21 kinds as of this writing), `InfraKindDef.summary` is a hand-written fallback, grounded in actually reading the file, rendered in a visually distinct amber-bordered "Summary" section so it never gets confused with extracted `notes` (see the hand-written-content exception list in "Website (keep this IA)" below).

### Known remaining accuracy issues

- `ApplyLoyaltyEvent` in tmf658 has several handlers on the same topic; the walk fans out to all of them (registration rule, mission earn, generic apply). That is structurally true but noisy on some diagrams.
- `CONSUMER_TYPE` deploy slices are recorded on consumers but the site does not yet filter flows by slice.
- Dynamic topic names (string concatenation) will be missed.
- Use-case DTO files sometimes omit `class-validator`; HTTP DTOs have the real rules — prefer those on endpoint pages.
- Backoffice `@ApiOperation` is rare; flow titles often fall back to `METHOD /path`.

---

## Website (keep this IA)

Hash router (`HashRouter`) so `dist/` works from any static path.

| Route                                | Page                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `/`                                  | Overview: stats, architecture **sequence** diagram, four services, sample entry flows                                     |
| `/guide`                             | **Hand-written** new-joiner mental model                                                                                  |
| `/integrations/myais`                | **Hand-written** myAIS legacy integration architecture — transcribed from a diagram, not extracted (systems involved aren't in `repos.config.json`) |
| `/services`, `/services/:repoId`     | Layer list, who-talks-to-whom matrix, domains, env vars, version                                                          |
| `/flows`, `/flows/:flowId`           | Filterable catalog; **mermaid sequence** (time order) with axios/Mongo arrows to D03 / LID / Mongo-(owner) / …; hop trace lists the same I/O detail |
| `/endpoints`, `/endpoints/:id`       | HTTP catalog by surface (**Back Office**, **Legacy**, OpenAPI/Warranty, IAM); request/response fields; link to flow       |
| `/jobs`, `/jobs/:id`                 | Nest Commander **batch jobs**; embedded **sequence + hop trace**, Mongo/axios I/O, topics on the path                     |
| `/topics`, `/topics/:name`           | Kafka catalog by namespace (`nlp.pty`, `nlp.bff`, `esb.*`, …); publishers, consumers, payload schema, family                |
| `/use-cases`, `/use-cases/:id`       | Business logic catalog; triggers, I/O schemas, publishes, deps, **Mongo create vs query**, **axios calls**, thrown errors |
| `/entities`, `/entities/:id`         | Business entities as **OOP data structures** (expandable fields + class diagram); D03 paths to complete missing parts     |
| `/schemas`, `/schemas/:id`           | DTO/entity/enum browser; nested expand; used-by; link to Mongo collection when it is a stored document                    |
| `/database`, `/database/:id`         | Mongo collections grouped by **BFF / LID / SID**; diagram with hover-traced links + **How they link** list; create vs query |
| `/dependencies`, `/dependencies/:id` | Outbound **axios** HTTP clients grouped by system (D03, SAP, PNS, IKM, …); verb + path; use cases that actually call them |
| `/systems`                           | Downstream blast radius                                                                                                   |
| `/infrastructure`                    | Shared `*.config.ts` platform concerns (env, logger, Kafka, Redis, axios, per-system clients) **merged across every repo that has a copy** — doc comments deduplicated, not shown five times |
| `/releases`                          | Commit/tag provenance + how to regenerate                                                                                 |

Search: MiniSearch built in-browser from `core.json` on first ⌘K. Tokenize camelCase and dotted topic names.

Visual: dark theme in `src/styles.css`. Mermaid loaded lazily (`src/components/Mermaid.tsx`).

`/guide` and `/integrations/myais` are the only hand-written **pages** — the latter because the systems it describes (MyBE, PRC, Donut, AC, MAS, ESB On Cloud) aren't in `repos.config.json`, so the extractor has no way to know about them; it exists because a team member supplied a source diagram directly, not because the scope changed. Two narrower exceptions carry hand-written _strings_ inside otherwise-generated pages, both clearly separated from extracted content in the UI: `downstreamSystems[id].description` in `repos.config.json` (shown on `/systems`), and `InfraKindDef.summary` in `extract-infra.ts` (shown on `/infrastructure/:id` as a distinct amber-bordered "Summary" section, used only when the actual code has no doc comments to extract — every one is grounded in having read the real file, not guessed). If platform facts change, update the relevant one of these four places; nothing else should contain hand-written prose.

---

## Access (sign-in gate)

The site is gated behind a sign-in screen (`src/auth/`) that only checks a typed email ends with `@terradigitalventures.com`, then remembers it in `localStorage` — no verification email, no server, no secret, no database. This is deliberate: it is a UX speed bump against casual access, not access control, and must never be described to anyone as verifying who is signing in. Read `README.md`'s **Access** section before touching this — it spells out exactly what is and isn't protected.

Because there's no backend dependency, `dist/` is a plain static bundle again — deployable anywhere, same as every other part of this site's architecture. Do not reintroduce a server-backed verification flow here without an explicit ask; an earlier email-magic-link design (Cloudflare Pages Function + Resend, HMAC-signed tokens) was tried and deliberately reverted to this simpler check — see git history around commit `22d36a4`.

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
    extract-infra.ts       shared *.config.ts platform concerns, deduped across repos
    flows.ts               stitch E2E graphs + mermaid
    model.ts               shared types
    index.ts               orchestrate + write public/data
  src/                     Vite React app
    auth/                  sign-in gate: AuthGate, AuthContext, session.ts (domain check only, no server)
    pages/Guide.tsx        hand-written new-joiner mental model
    pages/MyAisIntegration.tsx  hand-written myAIS legacy integration (see "Website" hand-written-content list)
  public/data/             generated JSON (gitignored if large; regenerate)
  .cache/snapshots/        gitignored
  Dockerfile               build + generate + serve in one image — build context is the PARENT dir (see README "Docker")
../.dockerignore           parent-level; governs the Dockerfile's build context (sibling checkouts, not just this repo)
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
