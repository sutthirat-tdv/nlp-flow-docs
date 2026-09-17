/**
 * Pipeline entry point: snapshot -> extract -> stitch -> write public/data.
 *
 * Run with `npm run generate` (sync + extract) or `npm run extract` when the
 * snapshots under .cache are already current.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DocsConfig, loadConfig, projectRoot, snapshotPath } from "./config.js";
import { findInfraFiles, mergeInfraKinds, RawInfraFile } from "./extract-infra.js";
import { extractRepo, RepoExtraction } from "./extract-repo.js";
import { buildFlows, topicTitle } from "./flows.js";
import {
  Catalog,
  Consumer,
  DownstreamSystem,
  Endpoint,
  HttpClient,
  InfraKind,
  MongoCollection,
  RepoDoc,
  Schema,
  Topic,
  UseCase,
} from "./model.js";
import { linkSameNameCollections } from "./extract-collections.js";
import { linkSameClientHttp } from "./extract-http.js";
import { Manifest } from "./sync.js";

function readManifest(config: DocsConfig): Manifest {
  const file = resolve(projectRoot, config.cacheDir, "manifest.json");
  if (!existsSync(file)) {
    throw new Error("No snapshot manifest found. Run `npm run sync` first.");
  }
  return JSON.parse(readFileSync(file, "utf8")) as Manifest;
}

function classifyTopic(name: string): Topic["kind"] {
  const last = name.split(".").pop() ?? name;
  if (name.startsWith("sid.cdc.")) return "cdc";
  if (/Failed$|Failure$|Error$/.test(last)) return "failure";
  if (
    /(ed|Created|Updated|Deleted|Queried|Onboarded|Redeemed|Applied)$/.test(
      last,
    )
  )
    return "event";
  if (
    /^(create|update|delete|query|get|apply|adjust|redeem|check|process|onboard|register|transfer|manage|generate|void|cancel|expire|import|export|upload|sync|send|calculate|validate|notify|reconcile|handle|refund|earn|burn|add|remove|suspend|resume|approve|reject|assign|revoke|count|list|search|verify|publish|produce|consume|run|start|stop|reset|recalculate|enrich|resolve|bulk|retrieve)/.test(
      last,
    )
  )
    return "command";
  return "unknown";
}

/** Reads scripts/mac/topics.yaml (command / success / failure triplets). */
function loadTopicFamilies(snapshotRoot: string): Map<string, string> {
  const file = resolve(snapshotRoot, "scripts/mac/topics.yaml");
  const families = new Map<string, string>();
  if (!existsSync(file)) return families;
  let currentKey: string | null = null;
  let members: string[] = [];
  const flush = () => {
    if (currentKey && members.length) {
      const command = members[0];
      for (const m of members) families.set(m, command);
    }
    members = [];
  };
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.replace(/#.*$/, "");
    const keyMatch = /^([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (keyMatch) {
      flush();
      currentKey = keyMatch[1];
      continue;
    }
    const itemMatch = /^\s*-\s*(\S+)\s*$/.exec(line);
    if (itemMatch && currentKey)
      members.push(itemMatch[1].replace(/['"]/g, ""));
  }
  flush();
  return families;
}

function main(): void {
  const config = loadConfig();
  const manifest = readManifest(config);
  const extractions: RepoExtraction[] = [];
  const repoDocs: RepoDoc[] = [];
  const topicFamilies = new Map<string, string>();
  const rawInfra: RawInfraFile[] = [];

  for (const repo of config.repos) {
    const prov = manifest.repos.find((r) => r.repoId === repo.id);
    if (!prov)
      throw new Error(`No snapshot for ${repo.name}. Re-run \`npm run sync\`.`);
    const root = snapshotPath(config, repo);
    process.stdout.write(`Extracting ${repo.name}... `);
    const extraction = extractRepo(config, repo, prov, root);
    extractions.push(extraction);
    rawInfra.push(...findInfraFiles(repo, prov, root));
    for (const [topic, family] of loadTopicFamilies(root))
      topicFamilies.set(topic, family);
    console.log(
      `${extraction.useCases.length} use cases, ${extraction.endpoints.length} endpoints, ` +
        `${extraction.consumers.length} consumers, ${extraction.schemas.length} schemas, ` +
        `${extraction.collections.length} collections, ${extraction.httpClients.length} http clients`,
    );
  }

  const useCases: UseCase[] = extractions.flatMap((e) => e.useCases);
  const endpoints: Endpoint[] = extractions.flatMap((e) => e.endpoints);
  const consumers: Consumer[] = extractions.flatMap((e) => e.consumers);
  const schemas: Schema[] = extractions.flatMap((e) => e.schemas);
  const collections: MongoCollection[] = extractions.flatMap(
    (e) => e.collections,
  );
  linkSameNameCollections(collections);
  const httpClients: HttpClient[] = extractions.flatMap((e) => e.httpClients);
  linkSameClientHttp(httpClients);

  // ------------------------------------------------------------ topics
  const topicMap = new Map<string, Topic>();
  const ensureTopic = (name: string): Topic => {
    let topic = topicMap.get(name);
    if (!topic) {
      topic = {
        name,
        id: `topic:${name}`,
        aliases: [],
        family: topicFamilies.get(name) ?? null,
        kind: classifyTopic(name),
        consumedBy: [],
        producedBy: [],
      };
      topicMap.set(name, topic);
    }
    return topic;
  };

  for (const extraction of extractions) {
    for (const [name, aliases] of extraction.topicAliases) {
      const topic = ensureTopic(name);
      for (const alias of aliases) {
        topic.aliases.push({ repoId: extraction.repoId, ...alias });
      }
    }
  }
  for (const consumer of consumers)
    ensureTopic(consumer.topic).consumedBy.push(consumer.id);
  for (const uc of useCases) {
    for (const name of uc.producesTopics)
      ensureTopic(name).producedBy.push(uc.id);
  }

  // Drop names that nothing in these four repos publishes or consumes —
  // leftover enum copies and DTO-shaped strings, not real bus topics.
  const topics = [...topicMap.values()]
    .filter((t) => t.consumedBy.length || t.producedBy.length)
    .sort((a, b) => a.name.localeCompare(b.name));

  // --------------------------------------------------------- schema usage
  const schemaById = new Map(schemas.map((s) => [s.id, s]));
  const addUsage = (schemaId: string | null, user: string) => {
    if (!schemaId) return;
    const schema = schemaById.get(schemaId);
    if (schema && !schema.usedBy.includes(user)) schema.usedBy.push(user);
  };
  for (const e of endpoints) {
    for (const r of e.requestSchemas) addUsage(r.schemaId, e.id);
    for (const r of e.responseSchemas) addUsage(r.schemaId, e.id);
  }
  for (const c of consumers) addUsage(c.payloadSchemaId, c.id);
  for (const u of useCases) {
    addUsage(u.inputSchemaId, u.id);
    addUsage(u.outputSchemaId, u.id);
  }
  for (const c of collections) addUsage(c.entitySchemaId, c.id);
  // Nested references: a schema field pointing at another schema in the same repo.
  for (const schema of schemas) {
    for (const field of schema.fields) {
      for (const ref of field.refs) {
        const target = schemaById.get(`${schema.repoId}:${ref}`);
        if (
          target &&
          target.id !== schema.id &&
          !target.usedBy.includes(schema.id)
        ) {
          target.usedBy.push(schema.id);
        }
      }
    }
  }

  // ----------------------------------------------------------- repo docs
  const repoTitles = new Map(
    config.repos.map((r) => [r.id, r.tag || r.title]),
  );
  const systemTitles = new Map(
    Object.entries(config.downstreamSystems).map(([id, s]) => [id, s.title]),
  );

  for (const repo of config.repos) {
    const prov = manifest.repos.find((r) => r.repoId === repo.id)!;
    const extraction = extractions.find((e) => e.repoId === repo.id)!;
    const domainNames = new Set<string>([
      ...extraction.useCases.map((u) => u.domain),
      ...extraction.endpoints.map((e) => e.domain),
      ...extraction.consumers.map((c) => c.domain),
    ]);
    const domains = [...domainNames]
      .map((name) => ({
        name,
        useCases: extraction.useCases.filter((u) => u.domain === name).length,
        endpoints: extraction.endpoints.filter((e) => e.domain === name).length,
        consumers: extraction.consumers.filter((c) => c.domain === name).length,
      }))
      .sort(
        (a, b) =>
          b.useCases +
          b.endpoints +
          b.consumers -
          (a.useCases + a.endpoints + a.consumers),
      );

    repoDocs.push({
      id: repo.id,
      name: repo.name,
      title: repo.title,
      tag: repo.tag,
      role: repo.role,
      layer: repo.layer,
      summary: repo.summary,
      audience: repo.audience,
      github: repo.github,
      branch: prov.branch,
      commit: prov.commit,
      latestTag: prov.latestTag,
      packageVersion: prov.packageVersion,
      nodeVersion: prov.nodeVersion,
      recentTags: prov.recentTags,
      newCommitsSinceLastBuild: prov.newCommitsSinceLastBuild,
      previousBuildCommit: prov.previousBuildCommit,
      readme: extraction.readme,
      envVars: extraction.envVars,
      domains,
      stats: {
        useCases: extraction.useCases.length,
        endpoints: extraction.endpoints.length,
        consumers: extraction.consumers.length,
        schemas: extraction.schemas.length,
        collections: extraction.collections.length,
        httpClients: extraction.httpClients.length,
        topicsProduced: new Set(
          extraction.useCases.flatMap((u) => u.producesTopics),
        ).size,
        topicsConsumed: new Set(extraction.consumers.map((c) => c.topic)).size,
        domains: domains.length,
        files: extraction.fileCount,
      },
    });
  }

  // ------------------------------------------------------------ systems
  const systems: DownstreamSystem[] = Object.entries(
    config.downstreamSystems,
  ).map(([id, cfg]) => {
    const users = useCases.filter((u) => u.systems.includes(id));
    return {
      id,
      title: cfg.title,
      kind: cfg.kind,
      description: cfg.description,
      usedByRepos: [...new Set(users.map((u) => u.repoId))],
      useCaseIds: users.map((u) => u.id),
    };
  });

  // -------------------------------------------------------------- infra
  const infra: InfraKind[] = mergeInfraKinds(rawInfra);

  // -------------------------------------------------------------- flows
  process.stdout.write("Building end-to-end flows... ");
  const flows = buildFlows({
    endpoints,
    consumers,
    useCases,
    topics,
    collections,
    httpClients,
    repoTitles,
    systemTitles,
  });
  console.log(
    `${flows.length} flows (${flows.filter((f) => f.crossService).length} cross service)`,
  );

  // Tag use cases so search and filters have something to bite on.
  for (const uc of useCases) {
    const tags = new Set(uc.tags);
    if (uc.invokedBy.some((id) => id.includes("consume ")))
      tags.add("kafka-triggered");
    if (uc.invokedBy.some((id) => /:(GET|POST|PUT|PATCH|DELETE|ANY) /.test(id)))
      tags.add("http-triggered");
    if (!uc.invokedBy.length) tags.add("internal");
    if (uc.producesTopics.length) tags.add("publishes-events");
    for (const s of uc.systems) tags.add(s);
    uc.tags = [...tags];
  }

  const catalog: Catalog = {
    generatedAt: manifest.generatedAt,
    generatorVersion: manifest.generatorVersion,
    repos: repoDocs,
    useCases: useCases.sort((a, b) => a.title.localeCompare(b.title)),
    endpoints: endpoints.sort((a, b) => a.path.localeCompare(b.path)),
    consumers: consumers.sort((a, b) => a.topic.localeCompare(b.topic)),
    topics,
    schemas: schemas.sort((a, b) => a.name.localeCompare(b.name)),
    collections: collections.sort((a, b) => a.name.localeCompare(b.name)),
    httpClients: httpClients.sort(
      (a, b) =>
        a.system.localeCompare(b.system) || a.name.localeCompare(b.name),
    ),
    flows,
    systems,
    infra,
    stats: {
      repos: repoDocs.length,
      useCases: useCases.length,
      endpoints: endpoints.length,
      consumers: consumers.length,
      topics: topics.length,
      schemas: schemas.length,
      collections: collections.length,
      httpClients: httpClients.length,
      flows: flows.length,
      crossServiceFlows: flows.filter((f) => f.crossService).length,
    },
  };

  // The full catalog is around 30 MB, far too much to hand a browser on first
  // paint. So we split it: core.json powers every list, the search box and all
  // summaries, while heavy per-item detail (schema fields, flow steps and
  // diagrams) is sharded per repo and fetched only when someone opens it.
  const outDir = resolve(projectRoot, config.outDir);
  mkdirSync(outDir, { recursive: true });

  const core = {
    generatedAt: catalog.generatedAt,
    generatorVersion: catalog.generatorVersion,
    repos: catalog.repos,
    useCases: catalog.useCases,
    endpoints: catalog.endpoints,
    consumers: catalog.consumers,
    topics: catalog.topics,
    systems: catalog.systems,
    infra: catalog.infra,
    collections: catalog.collections,
    httpClients: catalog.httpClients,
    stats: catalog.stats,
    schemaIndex: schemas.map((s) => ({
      id: s.id,
      name: s.name,
      repoId: s.repoId,
      kind: s.kind,
      layer: s.layer,
      fieldCount: s.fields.length,
      usedByCount: s.usedBy.length,
      file: s.source.file,
    })),
    flowIndex: flows.map((f) => ({
      id: f.id,
      title: f.title,
      entry: f.entry,
      entryRepoId: f.entryRepoId,
      summary: f.summary,
      repos: f.repos,
      topics: f.topics,
      systems: f.systems,
      stepCount: f.steps.length,
      useCaseCount: f.useCaseIds.length,
      crossService: f.crossService,
      external: f.external,
      tags: f.tags,
    })),
  };
  writeFileSync(resolve(outDir, "core.json"), JSON.stringify(core));
  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  for (const repo of config.repos) {
    writeFileSync(
      resolve(outDir, `schemas.${repo.id}.json`),
      JSON.stringify(schemas.filter((s) => s.repoId === repo.id)),
    );
    writeFileSync(
      resolve(outDir, `flows.${repo.id}.json`),
      JSON.stringify(flows.filter((f) => f.entryRepoId === repo.id)),
    );
  }

  console.log("");
  console.log("Catalog written to", config.outDir);
  console.table(catalog.stats);
}

main();
