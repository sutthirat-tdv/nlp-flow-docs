import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { DatabaseDiagram } from "../components/DatabaseDiagram";
import {
  Badge,
  Collapsible,
  CollectionLink,
  Empty,
  KeyValue,
  PageHead,
  RepoBadge,
  SchemaLink,
  Section,
  SourceLink,
  UseCaseLink,
} from "../components/ui";
import { useData, useSchema } from "../data";
import type { CollectionOpKind, MongoCollection, SchemaField } from "../types";

const KIND_LABEL: Record<CollectionOpKind, string> = {
  create: "create",
  read: "query",
  update: "update",
  delete: "delete",
  upsert: "upsert",
  other: "other",
};

const KIND_TONE: Record<CollectionOpKind, string | undefined> = {
  create: "green",
  read: "accent",
  update: "amber",
  delete: "red",
  upsert: "purple",
  other: undefined,
};

const WRITE_KINDS: CollectionOpKind[] = ["create", "upsert"];
const QUERY_KINDS: CollectionOpKind[] = ["read"];

function kindCounts(collection: MongoCollection) {
  const writes = collection.operations.filter((o) =>
    WRITE_KINDS.includes(o.kind),
  ).length;
  const queries = collection.operations.filter((o) =>
    QUERY_KINDS.includes(o.kind),
  ).length;
  const updates = collection.operations.filter(
    (o) => o.kind === "update",
  ).length;
  return { writes, queries, updates };
}

export function CollectionsPage() {
  const { core } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const repo = params.get("repo") ?? "all";
  const access = params.get("access") ?? "all";
  const view = params.get("view") ?? "diagram";

  const collections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (core.collections ?? [])
      .filter((c) => (repo === "all" ? true : c.repoId === repo))
      .filter((c) => {
        if (access === "all") return true;
        const { writes, queries } = kindCounts(c);
        if (access === "write") return writes > 0;
        if (access === "query") return queries > 0;
        return true;
      })
      .filter((c) =>
        needle
          ? c.name.toLowerCase().includes(needle) ||
            (c.entityName ?? "").toLowerCase().includes(needle) ||
            c.repositoryClass.toLowerCase().includes(needle) ||
            c.domain.toLowerCase().includes(needle)
          : true,
      )
      .sort(
        (a, b) =>
          b.usedByUseCaseIds.length - a.usedByUseCaseIds.length ||
          a.name.localeCompare(b.name),
      );
  }, [core.collections, repo, access, query]);

  const diagramRepo = repo === "all" ? "tmf658" : repo;
  const diagramCollections = useMemo(() => {
    return (core.collections ?? []).filter((c) => c.repoId === diagramRepo);
  }, [core.collections, diagramRepo]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all" || (key === "view" && value === "diagram"))
      next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHead title="Mongo collections">
        Every collection a <code>*MongoRepository</code> actually opens. Native
        driver, not Mongoose — the name is the string passed to{" "}
        <code>db.collection()</code>. Open one to see when documents are
        inserted, when they are queried, and which other collections a document
        points at.
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by collection, entity or repository…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="select"
          value={repo}
          onChange={(e) => setParam("repo", e.target.value)}
        >
          <option value="all">Any service</option>
          {core.repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={access}
          onChange={(e) => setParam("access", e.target.value)}
        >
          <option value="all">Create or query</option>
          <option value="write">Has create / upsert</option>
          <option value="query">Has query</option>
        </select>
        <select
          className="select"
          value={view === "erd" ? "diagram" : view}
          onChange={(e) => setParam("view", e.target.value)}
        >
          <option value="diagram">Diagram</option>
          <option value="table">Table</option>
          <option value="both">Diagram + table</option>
        </select>
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {collections.length.toLocaleString()} of{" "}
          {(core.collections ?? []).length.toLocaleString()}
        </span>
      </div>

      {view !== "table" ? (
        <Section
          title="Database diagram"
          subtitle={
            repo === "all"
              ? "TMF658 is the loyalty system of record — pick a service to see that database"
              : `${core.repos.find((r) => r.id === diagramRepo)?.title ?? diagramRepo} collections as tables, columns, and links`
          }
        >
          {diagramCollections.length ? (
            <DatabaseDiagram collections={diagramCollections} />
          ) : (
            <Empty>No collections in this service.</Empty>
          )}
          <p className="dimmer" style={{ fontSize: 12.5, marginTop: 10 }}>
            Each box is a Mongo collection. PK/FK come from the document type
            and imported collection constants. Open a table for create vs query
            and its neighbourhood.
          </p>
        </Section>
      ) : null}

      {view !== "diagram" && view !== "erd" ? (
        <div className="table-wrap table-wrap--freeze">
          <table>
            <thead>
              <tr>
                <th>Collection</th>
                <th className="nowrap">Creates</th>
                <th className="nowrap">Queries</th>
                <th className="nowrap">Updates</th>
                <th className="nowrap">Use cases</th>
                <th>Links to</th>
                <th>Service</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((collection) => {
                const counts = kindCounts(collection);
                const related = collection.related.filter(
                  (r) => r.kind !== "same-name",
                );
                return (
                  <tr key={collection.id}>
                    <td>
                      <Link
                        className="mono"
                        to={`/database/${encodeURIComponent(collection.id)}`}
                      >
                        {collection.name}
                      </Link>
                      <div className="mono dimmer" style={{ fontSize: 11 }}>
                        {collection.entityName ?? collection.repositoryClass}
                      </div>
                    </td>
                    <td className="mono dim">{counts.writes || "—"}</td>
                    <td className="mono dim">{counts.queries || "—"}</td>
                    <td className="mono dim">{counts.updates || "—"}</td>
                    <td className="mono dim">
                      {collection.usedByUseCaseIds.length}
                    </td>
                    <td>
                      {related.length === 0 ? (
                        <span className="dimmer">—</span>
                      ) : (
                        <div className="badges">
                          {related.slice(0, 3).map((link) => (
                            <Badge key={`${link.collectionId}:${link.via}`}>
                              <CollectionLink id={link.collectionId} />
                            </Badge>
                          ))}
                          {related.length > 3 ? (
                            <span className="dimmer" style={{ fontSize: 12 }}>
                              +{related.length - 3}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td>
                      <RepoBadge repoId={collection.repoId} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {view !== "diagram" && view !== "erd" && collections.length === 0 ? (
        <Empty>No collections matched those filters.</Empty>
      ) : null}
    </>
  );
}

export function CollectionDetailPage() {
  const { collectionId } = useParams();
  const { indexes, core } = useData();
  const decoded = collectionId ? decodeURIComponent(collectionId) : "";
  const collection = decoded ? indexes.collectionById.get(decoded) : undefined;
  const schema = useSchema(collection?.entitySchemaId);

  if (!collection) {
    return (
      <Empty>
        Unknown collection. <Link to="/database">Back to the list</Link>.
      </Empty>
    );
  }

  const counts = kindCounts(collection);
  const createdBy = useCasesForKinds(collection, indexes, WRITE_KINDS);
  const queriedBy = useCasesForKinds(collection, indexes, QUERY_KINDS);
  const updatedBy = useCasesForKinds(collection, indexes, ["update", "delete"]);
  const related = collection.related
    .map((link) => ({
      link,
      target: indexes.collectionById.get(link.collectionId),
    }))
    .filter(
      (
        row,
      ): row is {
        link: (typeof collection.related)[number];
        target: MongoCollection;
      } => !!row.target,
    );
  const inRepo = related.filter((r) => r.link.kind !== "same-name");
  const sameName = related.filter((r) => r.link.kind === "same-name");
  const neighborhood = [collection, ...inRepo.map((r) => r.target)].filter(
    (c, i, all) => all.findIndex((x) => x.id === c.id) === i,
  );

  return (
    <>
      <PageHead
        title={<span className="mono">{collection.name}</span>}
        crumbs={
          <>
            <Link to="/database">Mongo collections</Link> <span>/</span>{" "}
            <Link to={`/services/${collection.repoId}`}>
              {indexes.repoById.get(collection.repoId)?.title}
            </Link>{" "}
            <span>/</span> <span className="mono">{collection.domain}</span>
          </>
        }
        actions={
          <SourceLink source={collection.source} label="open in GitHub" />
        }
      >
        Opened by <span className="mono">{collection.repositoryClass}</span>
        {collection.connection ? (
          <>
            {" "}
            on <code>{collection.connection}</code>
          </>
        ) : null}
        . {counts.writes} create/upsert method{counts.writes === 1 ? "" : "s"},{" "}
        {counts.queries} query method{counts.queries === 1 ? "" : "s"}.
      </PageHead>

      <div className="card">
        <KeyValue
          rows={[
            ["Service", <RepoBadge repoId={collection.repoId} />],
            [
              "Mongo collection",
              <span className="mono">{collection.name}</span>,
            ],
            [
              "Connection",
              collection.connection ? (
                <span className="mono">{collection.connection}</span>
              ) : (
                <span className="dimmer">not annotated</span>
              ),
            ],
            ["Document type", <SchemaLink id={collection.entitySchemaId} />],
            [
              "Repository",
              <span className="mono">
                {collection.repositoryClass}
                <div className="dimmer" style={{ fontSize: 11 }}>
                  <SourceLink source={collection.source} />
                </div>
              </span>,
            ],
            ["Use cases that touch it", collection.usedByUseCaseIds.length],
          ]}
        />
      </div>

      <Section
        title="Database diagram"
        subtitle={
          inRepo.length
            ? `${collection.name} and ${inRepo.length} related collection(s)`
            : "this collection as a table — no resolved in-service links"
        }
      >
        <DatabaseDiagram
          collections={neighborhood}
          focusId={collection.id}
          fieldLimit={18}
        />
      </Section>

      <Section
        title="When it is created"
        subtitle={`${createdBy.length} use case(s) call a create or upsert method`}
      >
        <AccessTable
          rows={createdBy}
          empty="Nothing in these repos inserts into this collection."
        />
      </Section>

      <Section
        title="When it is queried"
        subtitle={`${queriedBy.length} use case(s) call a find / get / count method`}
      >
        <AccessTable
          rows={queriedBy}
          empty="Nothing in these repos reads this collection."
        />
      </Section>

      {updatedBy.length ? (
        <Section
          title="When it is updated or deleted"
          subtitle={`${updatedBy.length} use case(s)`}
        >
          <AccessTable rows={updatedBy} empty="" />
        </Section>
      ) : null}

      <Section
        title="Repository methods"
        subtitle={`${collection.operations.length} public method(s) on ${collection.repositoryClass}`}
      >
        <div className="table-wrap table-wrap--freeze">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th className="nowrap">Kind</th>
                <th>Driver calls</th>
              </tr>
            </thead>
            <tbody>
              {collection.operations.map((op) => (
                <tr key={op.name}>
                  <td>
                    <a
                      className="mono"
                      href={op.source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {op.name}()
                    </a>
                  </td>
                  <td>
                    <Badge tone={KIND_TONE[op.kind]}>
                      {KIND_LABEL[op.kind]}
                    </Badge>
                  </td>
                  <td className="mono dim" style={{ fontSize: 12 }}>
                    {op.driverCalls.length ? op.driverCalls.join(", ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Document shape"
        subtitle={
          schema
            ? `${schema.fields.length} field(s) on ${collection.entityName}`
            : collection.entityName
              ? "loading fields…"
              : "no entity type resolved"
        }
      >
        <div className="card">
          {!collection.entitySchemaId ? (
            <Empty>
              The repository does not declare a document type we could match to
              a schema.
            </Empty>
          ) : !schema ? (
            <span className="dimmer">Loading…</span>
          ) : schema.fields.length === 0 ? (
            <Empty>No declared fields on the entity.</Empty>
          ) : (
            <Collapsible
              items={schema.fields}
              limit={40}
              noun="fields"
              render={(field: SchemaField) => (
                <CollectionField
                  key={field.name}
                  field={field}
                  collection={collection}
                  all={core.collections}
                />
              )}
            />
          )}
        </div>
      </Section>

      <Section
        title="How it links to other collections"
        subtitle={
          inRepo.length
            ? `${inRepo.length} link(s) from fields, types or imported collection constants`
            : "no in-service links resolved"
        }
      >
        {inRepo.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Related collection</th>
                  <th>Via</th>
                  <th>How</th>
                  <th>Service</th>
                </tr>
              </thead>
              <tbody>
                {inRepo.map(({ link, target }) => (
                  <tr key={`${link.collectionId}:${link.via}`}>
                    <td>
                      <CollectionLink id={target.id} />
                      <div className="mono dimmer" style={{ fontSize: 11 }}>
                        {target.entityName}
                      </div>
                    </td>
                    <td className="mono dim" style={{ fontSize: 12.5 }}>
                      {link.via}
                    </td>
                    <td>
                      <Badge
                        tone={
                          link.kind === "import"
                            ? "amber"
                            : link.kind === "type"
                              ? "teal"
                              : "accent"
                        }
                      >
                        {link.kind === "import"
                          ? "imported collection constant"
                          : link.kind === "type"
                            ? "document field type"
                            : "document field name"}
                      </Badge>
                    </td>
                    <td>
                      <RepoBadge repoId={target.repoId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            No field types or imported collection constants pointed at another
            collection in this service.
          </Empty>
        )}
      </Section>

      {sameName.length ? (
        <Section
          title="Same name in another service"
          subtitle="local read models that reuse the TMF658 collection name"
        >
          <div className="pill-list">
            {sameName.map(({ target }) => (
              <Badge key={target.id}>
                <CollectionLink id={target.id} />{" "}
                <span className="dimmer">
                  · {indexes.repoById.get(target.repoId)?.title}
                </span>
              </Badge>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function useCasesForKinds(
  collection: MongoCollection,
  indexes: ReturnType<typeof useData>["indexes"],
  kinds: CollectionOpKind[],
) {
  const rows: {
    useCaseId: string;
    operations: { name: string; kind: CollectionOpKind }[];
  }[] = [];
  for (const id of collection.usedByUseCaseIds) {
    const useCase = indexes.useCaseById.get(id);
    const access = (useCase?.collectionAccess ?? []).find(
      (a) => a.collectionId === collection.id,
    );
    const operations = (access?.operations ?? []).filter((o) =>
      kinds.includes(o.kind),
    );
    if (operations.length) rows.push({ useCaseId: id, operations });
  }
  return rows;
}

function AccessTable({
  rows,
  empty,
}: {
  rows: {
    useCaseId: string;
    operations: { name: string; kind: CollectionOpKind }[];
  }[];
  empty: string;
}) {
  if (!rows.length) return empty ? <Empty>{empty}</Empty> : null;
  return (
    <div className="table-wrap table-wrap--freeze">
      <table>
        <thead>
          <tr>
            <th>Use case</th>
            <th>Repository methods</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.useCaseId}>
              <td>
                <UseCaseLink id={row.useCaseId} />
              </td>
              <td>
                <div className="badges">
                  {row.operations.map((op) => (
                    <Badge key={op.name} tone={KIND_TONE[op.kind]}>
                      {op.name}() · {KIND_LABEL[op.kind]}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollectionField({
  field,
  collection,
  all,
}: {
  field: SchemaField;
  collection: MongoCollection;
  all: MongoCollection[];
}) {
  const linked = collection.related.filter((link) => {
    const via = link.via.toLowerCase();
    return (
      via === field.name.toLowerCase() ||
      via.startsWith(`${field.name.toLowerCase()}:`) ||
      field.refs.some((ref) => via.includes(ref.toLowerCase()))
    );
  });
  const extras = all.filter(
    (c) =>
      c.repoId === collection.repoId &&
      c.id !== collection.id &&
      (field.refs.includes(c.entityName ?? "") ||
        field.type.includes(c.entityName ?? "___")),
  );

  return (
    <div className="schema-field">
      <div className="schema-field__head">
        <span className="schema-field__name">{field.name}</span>
        <span className="schema-field__type">{field.type}</span>
        {field.optional ? (
          <Badge>optional</Badge>
        ) : (
          <Badge tone="amber">required</Badge>
        )}
        {linked.map((link) => (
          <Badge key={link.collectionId} tone="teal">
            → <CollectionLink id={link.collectionId} />
          </Badge>
        ))}
        {extras
          .filter((c) => !linked.some((l) => l.collectionId === c.id))
          .map((c) => (
            <Badge key={c.id} tone="teal">
              → <CollectionLink id={c.id} />
            </Badge>
          ))}
      </div>
      {field.comment ? (
        <div className="schema-field__desc">{field.comment}</div>
      ) : null}
    </div>
  );
}
