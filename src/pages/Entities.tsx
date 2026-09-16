import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Badge,
  Empty,
  HttpClientLink,
  KeyValue,
  PageHead,
  RepoBadge,
  SchemaLink,
  Section,
  TopicLink,
  UseCaseLink,
} from "../components/ui";
import { Mermaid } from "../components/Mermaid";
import { useData, useSchema } from "../data";
import { buildEntityClassDiagram } from "../entityDiagram";
import { entityDefById } from "../entityCatalog";
import {
  resolveAllEntities,
  resolveEntity,
} from "../resolveEntities";
import type { Schema, SchemaField } from "../types";

export function EntitiesPage() {
  const { core } = useData();
  const [query, setQuery] = useState("");

  const entities = useMemo(
    () =>
      resolveAllEntities({
        collections: core.collections ?? [],
        httpClients: core.httpClients ?? [],
        topics: core.topics,
        useCases: core.useCases,
        schemaIndex: core.schemaIndex,
      }),
    [core],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entities;
    return entities.filter(
      (e) =>
        e.def.title.toLowerCase().includes(needle) ||
        e.def.summary.toLowerCase().includes(needle) ||
        e.structureRoots.some((r) => r.name.toLowerCase().includes(needle)) ||
        e.uniqueCollectionNames.some((n) => n.toLowerCase().includes(needle)),
    );
  }, [entities, query]);

  return (
    <>
      <PageHead title="Business entities">
        OOP-style data structures for major NLP objects — open an entity, pick a
        root type, and expand nested fields to check each part of the data.
        D03 completion paths stay available below the structure.
      </PageHead>

      <div className="toolbar">
        <input
          className="input input--grow"
          placeholder="Filter by entity or type name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="dimmer" style={{ fontSize: 12.5, marginLeft: "auto" }}>
          {filtered.length} entit{filtered.length === 1 ? "y" : "ies"}
        </span>
      </div>

      {!filtered.length ? (
        <Empty>No entities matched.</Empty>
      ) : (
        <div className="entity-grid">
          {filtered.map((entity) => (
            <Link
              key={entity.def.id}
              to={`/entities/${entity.def.id}`}
              className="entity-card"
            >
              <div className="entity-card__title">{entity.def.title}</div>
              <p className="entity-card__summary">{entity.def.summary}</p>
              <div className="entity-card__stats">
                <span>
                  <strong>{entity.structureRoots.length}</strong> type
                  {entity.structureRoots.length === 1 ? "" : "s"}
                </span>
                <span>
                  <strong>
                    {entity.structureRoots.reduce((n, r) => n + r.fieldCount, 0)}
                  </strong>{" "}
                  fields
                </span>
                <span>
                  <strong>{entity.d03Paths.length}</strong> D03 paths
                </span>
              </div>
              <div className="badges" style={{ marginTop: 10 }}>
                {entity.structureRoots.map((r) => (
                  <Badge key={r.schemaId} tone="green">
                    {r.name}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function EntityDetailPage() {
  const { entityId } = useParams();
  const { core } = useData();
  const def = entityId ? entityDefById(entityId) : undefined;

  const entity = useMemo(() => {
    if (!def) return null;
    return resolveEntity(def, {
      collections: core.collections ?? [],
      httpClients: core.httpClients ?? [],
      topics: core.topics,
      useCases: core.useCases,
      schemaIndex: core.schemaIndex,
    });
  }, [def, core]);

  const [rootId, setRootId] = useState<string | null>(null);
  useEffect(() => {
    setRootId(entity?.structureRoots[0]?.schemaId ?? null);
  }, [entity?.def.id, entity?.structureRoots]);

  if (!def || !entity) {
    return (
      <Empty>
        Unknown entity. <Link to="/entities">Back to the list</Link>.
      </Empty>
    );
  }

  const activeRoot =
    entity.structureRoots.find((r) => r.schemaId === rootId) ??
    entity.structureRoots[0];

  return (
    <>
      <PageHead
        title={entity.def.title}
        crumbs={
          <>
            <Link to="/entities">Business entities</Link> <span>/</span>{" "}
            <span>{entity.def.title}</span>
          </>
        }
      >
        {entity.def.summary}
      </PageHead>

      <div className="card entity-composition">
        <h3 style={{ marginTop: 0 }}>Data structure</h3>
        <p className="dim">{entity.def.composition}</p>
        {!entity.structureRoots.length ? (
          <Empty>No root types resolved for this entity.</Empty>
        ) : (
          <>
            <div className="section-chips" style={{ marginTop: 12 }}>
              {entity.structureRoots.map((root) => (
                <button
                  key={root.schemaId}
                  type="button"
                  className={`chip${activeRoot?.schemaId === root.schemaId ? " active" : ""}`}
                  onClick={() => setRootId(root.schemaId)}
                >
                  <span className="mono">{root.name}</span>
                  <span className="dimmer">{root.fieldCount}</span>
                </button>
              ))}
            </div>
            {activeRoot ? (
              <EntityStructureExplorer
                key={activeRoot.schemaId}
                rootId={activeRoot.schemaId}
                repoId={activeRoot.repoId}
                layer={activeRoot.layer}
              />
            ) : null}
          </>
        )}
      </div>

      <Section
        title="Complete missing parts from D03"
        subtitle="when a field is only an id / ref, these GETs fill the rest"
      >
        {!entity.d03Paths.length ? (
          <Empty>No D03 clients matched this entity.</Empty>
        ) : (
          <div className="table-wrap table-wrap--freeze">
            <table>
              <thead>
                <tr>
                  <th className="nowrap">Verb</th>
                  <th>Path</th>
                  <th>Clients</th>
                </tr>
              </thead>
              <tbody>
                {entity.d03Paths.slice(0, 40).map((op) => (
                  <tr key={`${op.method}:${op.path}`}>
                    <td>
                      <Badge tone={op.method}>{op.method}</Badge>
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      /{op.path}
                    </td>
                    <td>
                      <div className="badges">
                        {op.clientIds.slice(0, 2).map((id) => (
                          <Badge key={id}>
                            <HttpClientLink id={id} />
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Where documents live (Mongo)"
        subtitle="storage only — open a collection for create vs query"
      >
        {!entity.collectionsByFamily.length ? (
          <Empty>No matching Mongo collections.</Empty>
        ) : (
          entity.collectionsByFamily.map((family) => (
            <div key={family.id} className="entity-store-block">
              <h3>
                {family.label}{" "}
                <span className="dimmer">{family.items.length}</span>
              </h3>
              <div className="pill-list">
                {family.items.map((collection) => (
                  <Badge key={collection.id} tone="green">
                    <Link
                      className="mono"
                      to={`/database/${encodeURIComponent(collection.id)}`}
                    >
                      {collection.name}
                    </Link>
                  </Badge>
                ))}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Kafka write / sync topics">
        {!entity.topics.length ? (
          <Empty>No matching topics.</Empty>
        ) : (
          <div className="pill-list">
            {entity.topics.slice(0, 30).map((topic) => (
              <Badge key={topic.name}>
                <TopicLink topic={topic.name} />
              </Badge>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Bridge use cases"
        subtitle="touch both a matched Mongo collection and a matched D03 client"
      >
        {!entity.bridgeUseCases.length ? (
          <Empty>No bridge use cases matched.</Empty>
        ) : (
          <div className="table-wrap table-wrap--freeze">
            <table>
              <thead>
                <tr>
                  <th>Use case</th>
                  <th>Service</th>
                </tr>
              </thead>
              <tbody>
                {entity.bridgeUseCases.slice(0, 40).map((uc) => (
                  <tr key={uc.id}>
                    <td>
                      <UseCaseLink id={uc.id} />
                      <div className="mono dimmer" style={{ fontSize: 11 }}>
                        {uc.domain}
                      </div>
                    </td>
                    <td>
                      <RepoBadge repoId={uc.repoId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function EntityStructureExplorer({
  rootId,
  repoId,
  layer,
}: {
  rootId: string;
  repoId: string;
  layer: string;
}) {
  const { indexes, loadSchema } = useData();
  const root = useSchema(rootId);
  const [fieldQuery, setFieldQuery] = useState("");
  const [nested, setNested] = useState<Schema[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadNested(schema: Schema) {
      const names = new Set<string>();
      for (const field of schema.fields) {
        for (const ref of field.refs) {
          if (
            ref &&
            !/^(string|number|boolean|Date|ObjectId|any|unknown|T|Type|Status)$/i.test(
              ref,
            )
          ) {
            names.add(ref);
          }
        }
      }
      const loaded: Schema[] = [];
      for (const name of [...names].slice(0, 12)) {
        const summary =
          indexes.schemaSummaryById.get(`${repoId}:${name}`) ??
          [...indexes.schemaSummaryById.values()].find((s) => s.name === name);
        if (!summary || summary.fieldCount === 0) continue;
        const full = await loadSchema(summary.id);
        if (full) loaded.push(full);
      }
      if (!cancelled) setNested(loaded);
    }
    setNested([]);
    if (root) void loadNested(root);
    return () => {
      cancelled = true;
    };
  }, [root, repoId, indexes.schemaSummaryById, loadSchema]);

  const chart = useMemo(() => {
    if (!root) return "";
    return buildEntityClassDiagram(root, nested);
  }, [root, nested]);

  const fields = useMemo(() => {
    if (!root) return [];
    const needle = fieldQuery.trim().toLowerCase();
    if (!needle) return root.fields;
    return root.fields.filter(
      (f) =>
        f.name.toLowerCase().includes(needle) ||
        f.type.toLowerCase().includes(needle) ||
        f.refs.some((r) => r.toLowerCase().includes(needle)),
    );
  }, [root, fieldQuery]);

  return (
    <div className="entity-structure">
      <div className="card" style={{ marginTop: 12 }}>
        <KeyValue
          rows={[
            [
              "Type",
              <span className="mono">
                <SchemaLink id={rootId} />
              </span>,
            ],
            ["Service", <RepoBadge repoId={repoId} />],
            ["Layer", <Badge>{layer}</Badge>],
            [
              "Fields",
              root ? root.fields.length : <span className="dimmer">…</span>,
            ],
          ]}
        />
      </div>

      {chart ? (
        <div className="entity-diagram">
          <Mermaid chart={chart} scroll />
          <p className="dimmer" style={{ fontSize: 12.5 }}>
            Class diagram of this type and nested object parts. Expand a field
            below to inspect that part of the data.
          </p>
        </div>
      ) : null}

      <div className="toolbar" style={{ marginTop: 8 }}>
        <input
          className="input input--grow"
          placeholder="Find a field or nested type… e.g. campaignBrands, advanceSetting"
          value={fieldQuery}
          onChange={(e) => setFieldQuery(e.target.value)}
        />
        <span className="dimmer" style={{ fontSize: 12.5 }}>
          {fields.length}
          {root ? ` / ${root.fields.length}` : ""}
        </span>
      </div>

      <div className="card entity-fields">
        {!root ? (
          <span className="dimmer">Loading fields…</span>
        ) : !fields.length ? (
          <Empty>No fields match that filter.</Empty>
        ) : (
          fields.map((field) => (
            <EntityFieldRow
              key={field.name}
              field={field}
              repoId={repoId}
              depth={0}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EntityFieldRow({
  field,
  repoId,
  depth,
}: {
  field: SchemaField;
  repoId: string;
  depth: number;
}) {
  const { indexes } = useData();
  const [expanded, setExpanded] = useState<string | null>(null);
  const nestedRefs = field.refs
    .map(
      (ref) =>
        indexes.schemaSummaryById.get(`${repoId}:${ref}`) ??
        [...indexes.schemaSummaryById.values()].find((s) => s.name === ref),
    )
    .filter((s): s is NonNullable<typeof s> => !!s && s.fieldCount > 0);

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
        {nestedRefs.length && depth < 4 ? (
          <button
            type="button"
            className="expander"
            onClick={() =>
              setExpanded(expanded ? null : nestedRefs[0]!.id)
            }
          >
            {expanded ? "hide" : `open ${nestedRefs[0]!.name}`}
          </button>
        ) : null}
        {nestedRefs.length ? (
          <span className="badges">
            {nestedRefs.map((ref) => (
              <SchemaLink key={ref.id} id={ref.id} />
            ))}
          </span>
        ) : null}
      </div>
      {field.description ? (
        <div className="schema-field__desc">{field.description}</div>
      ) : null}
      {expanded ? (
        <div className="nested">
          <NestedEntityFields schemaId={expanded} depth={depth + 1} />
        </div>
      ) : null}
    </div>
  );
}

function NestedEntityFields({
  schemaId,
  depth,
}: {
  schemaId: string;
  depth: number;
}) {
  const schema = useSchema(schemaId);
  if (!schema) return <span className="dimmer">Loading…</span>;
  return (
    <>
      <div className="dimmer" style={{ fontSize: 11.5, marginBottom: 4 }}>
        <SchemaLink id={schema.id} /> · {schema.fields.length} fields
      </div>
      {schema.fields.map((field) => (
        <EntityFieldRow
          key={field.name}
          field={field}
          repoId={schema.repoId}
          depth={depth}
        />
      ))}
    </>
  );
}
