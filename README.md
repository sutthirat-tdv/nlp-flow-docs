# NLP Loyalty — flow, use-case and schema docs

Generated documentation site for four NestJS services on `origin/sit`. Nothing in the catalogs is hand-written. The durable spec is [`REQUIREMENTS.md`](./REQUIREMENTS.md) — give that to the next agent (or human) who continues this work.

Generated catalogs (`public/data/*.json`), snapshots (`.cache/`), `node_modules/`, and build output (`dist/`, `dist-extractor/`) are gitignored. After clone, run generate before `npm run dev`.

## First run

From this directory, with the four repos checked out as siblings (`../nlp-openapi-bff`, `../nlp-backoffice-bff`, `../esb-loyalty-management-agg-common`, `../esb-dos-TMF658-loyalty-management-nlp`):

```bash
npm install
npm run generate:offline   # uses local origin/sit; no GitHub
npm run dev                # http://localhost:4173
```

To fetch latest `origin/sit` then rebuild the static site:

```bash
npm run update
```

## Point at a release tag or commit

Edit `repos.config.json` — set that repo's `branch` to a tag (`"2.31.0"`) or a SHA — then `npm run update`. The **Versions & updates** page lists recent tags per repo.

## New joiners

Open **New joiner guide** in the sidebar. The one idea: every cross-service call is a Kafka message; BFFs translate HTTP; the TMF658 service owns loyalty data. **Mongo collections** is a database diagram of each collection as `db.collection()` creates it, with columns, PK/FK, and which use cases insert vs query. **HTTP dependencies** lists every axios call (D03, SAP, PNS, …) a use case actually makes.

## What each command does

| Command                    | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `npm run generate`         | `git fetch` + snapshot + extract → `public/data/` |
| `npm run generate:offline` | snapshot local refs only                          |
| `npm run extract`          | re-extract without re-snapshotting                |
| `npm run dev`              | Vite dev server                                   |
| `npm run build`            | static site in `dist/`                            |
| `npm run update`           | generate + build                                  |
