/**
 * Physical database diagram: table cards with PK/FK columns, SVG link wires,
 * and a scannable relationship list so "what points at what" is obvious.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { CollectionColumn, MongoCollection } from "../types";

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
}

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ResolvedLink {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  field: string;
}

const FIELD_LIMIT_DEFAULT = 8;

export function DatabaseDiagram({
  collections,
  edges,
  focusId,
  fieldLimit = FIELD_LIMIT_DEFAULT,
}: {
  collections: MongoCollection[];
  edges?: DiagramEdge[];
  focusId?: string;
  fieldLimit?: number;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [activeId, setActiveId] = useState<string | null>(focusId ?? null);
  const markerId = useId().replace(/:/g, "");

  const byCollectionId = useMemo(() => {
    return new Map(collections.map((c) => [c.id, c]));
  }, [collections]);

  const links = useMemo(() => {
    if (edges) {
      return edges.map((edge) => ({
        fromId: edge.from,
        toId: edge.to,
        fromName: byCollectionId.get(edge.from)?.name ?? edge.from,
        toName: byCollectionId.get(edge.to)?.name ?? edge.to,
        field: edge.label,
      })) satisfies ResolvedLink[];
    }
    const ids = new Set(collections.map((c) => c.id));
    const seen = new Set<string>();
    const out: ResolvedLink[] = [];
    for (const collection of collections) {
      for (const link of collection.related) {
        if (link.kind === "same-name") continue;
        if (!ids.has(link.collectionId) || link.collectionId === collection.id)
          continue;
        const field = fieldFromVia(link.via);
        const key = `${collection.id}|${link.collectionId}|${field}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          fromId: collection.id,
          toId: link.collectionId,
          fromName: collection.name,
          toName: byCollectionId.get(link.collectionId)?.name ?? link.collectionId,
          field,
        });
      }
    }
    return out.sort(
      (a, b) =>
        a.fromName.localeCompare(b.fromName) ||
        a.field.localeCompare(b.field) ||
        a.toName.localeCompare(b.toName),
    );
  }, [collections, edges, byCollectionId]);

  /** One wire per collection pair (collapse multi-field links onto one curve). */
  const wires = useMemo(() => {
    const map = new Map<string, { fromId: string; toId: string; fields: string[] }>();
    for (const link of links) {
      const key = [link.fromId, link.toId].sort().join("|");
      const prev = map.get(key);
      if (prev) {
        if (!prev.fields.includes(link.field)) prev.fields.push(link.field);
      } else {
        map.set(key, {
          fromId: link.fromId,
          toId: link.toId,
          fields: [link.field],
        });
      }
    }
    return [...map.values()];
  }, [links]);

  const groups = useMemo(() => {
    const map = new Map<string, MongoCollection[]>();
    for (const collection of collections) {
      const key = shortDomain(collection.domain);
      const list = map.get(key) ?? [];
      list.push(collection);
      map.set(key, list);
    }
    return [...map.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
  }, [collections]);

  const relatedIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const link of links) {
      if (link.fromId === activeId || link.toId === activeId) {
        set.add(link.fromId);
        set.add(link.toId);
      }
    }
    return set;
  }, [activeId, links]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const origin = canvas.getBoundingClientRect();
      const next: Box[] = [];
      for (const el of canvas.querySelectorAll<HTMLElement>(
        "[data-table-id]",
      )) {
        const rect = el.getBoundingClientRect();
        next.push({
          id: el.dataset.tableId!,
          x: rect.left - origin.left + canvas.scrollLeft,
          y: rect.top - origin.top + canvas.scrollTop,
          w: rect.width,
          h: rect.height,
        });
      }
      setBoxes(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    canvas.addEventListener("scroll", measure);
    return () => {
      ro.disconnect();
      canvas.removeEventListener("scroll", measure);
    };
  }, [collections, fieldLimit]);

  if (!collections.length) return null;

  const byId = new Map(boxes.map((b) => [b.id, b]));
  const width = Math.max(
    canvasRef.current?.scrollWidth ?? 0,
    ...boxes.map((b) => b.x + b.w + 24),
    640,
  );
  const height = Math.max(
    canvasRef.current?.scrollHeight ?? 0,
    ...boxes.map((b) => b.y + b.h + 24),
    240,
  );

  const activeLinks = activeId
    ? links.filter((l) => l.fromId === activeId || l.toId === activeId)
    : links;

  return (
    <div className="db-diagram-shell">
      <div className="db-diagram-toolbar">
        <span className="dimmer" style={{ fontSize: 12.5 }}>
          {links.length
            ? `${links.length} link${links.length === 1 ? "" : "s"} between collections`
            : "No document links resolved in this set"}
          {activeId
            ? ` · highlighting ${byCollectionId.get(activeId)?.name ?? "selection"}`
            : " · hover a table to trace its links"}
        </span>
        {activeId ? (
          <button
            type="button"
            className="chip"
            onClick={() => setActiveId(null)}
          >
            Clear highlight
          </button>
        ) : null}
      </div>

      <div className="db-diagram" ref={canvasRef}>
        <svg
          className="db-diagram__wires"
          width={width}
          height={height}
          aria-hidden
        >
          <defs>
            <marker
              id={`db-arrow-${markerId}`}
              viewBox="0 0 10 8"
              refX="9"
              refY="4"
              markerWidth="7"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 4 L 0 8 z" fill="var(--accent)" />
            </marker>
          </defs>
          {wires.map((wire, i) => {
            const a = byId.get(wire.fromId);
            const b = byId.get(wire.toId);
            if (!a || !b) return null;
            const lit =
              !relatedIds ||
              (relatedIds.has(wire.fromId) && relatedIds.has(wire.toId));
            const path = orthogonalPath(a, b, i);
            const label = wire.fields.slice(0, 2).join(", ");
            const mid = path.labelAt;
            return (
              <g
                key={`${wire.fromId}->${wire.toId}`}
                className={`db-diagram__wire${lit ? " is-lit" : " is-dim"}`}
              >
                <path
                  d={path.d}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={lit ? 2 : 1.2}
                  markerEnd={`url(#db-arrow-${markerId})`}
                />
                {lit && label ? (
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect
                      x={-Math.min(70, label.length * 3.4) - 4}
                      y={-9}
                      width={Math.min(140, label.length * 6.8 + 8)}
                      height={16}
                      rx={3}
                      className="db-diagram__edge-bg"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="db-diagram__edge-label"
                    >
                      {label}
                      {wire.fields.length > 2
                        ? ` +${wire.fields.length - 2}`
                        : ""}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>

        <div className="db-diagram__lanes">
          {groups.map(([domain, tables]) => (
            <section key={domain} className="db-lane">
              <h3 className="db-lane__title">{domain}</h3>
              <div className="db-lane__tables">
                {tables.map((table) => {
                  const lit = !relatedIds || relatedIds.has(table.id);
                  return (
                    <TableCard
                      key={table.id}
                      collection={table}
                      focus={table.id === focusId || table.id === activeId}
                      dimmed={Boolean(relatedIds) && !lit}
                      fieldLimit={fieldLimit}
                      targetsByField={targetsFor(table, links)}
                      onActivate={() => setActiveId(table.id)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {links.length ? (
        <div className="db-relations">
          <div className="db-relations__head">
            <strong>How they link</strong>
            <span className="dimmer">
              field on the left document points at the collection on the right
            </span>
          </div>
          <div className="table-wrap">
            <table className="db-relations__table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Field</th>
                  <th></th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {activeLinks.map((link) => (
                  <tr
                    key={`${link.fromId}:${link.field}:${link.toId}`}
                    className={
                      activeId &&
                      (link.fromId === activeId || link.toId === activeId)
                        ? "is-lit"
                        : undefined
                    }
                    onMouseEnter={() => setActiveId(link.fromId)}
                  >
                    <td>
                      <Link
                        className="mono"
                        to={`/database/${encodeURIComponent(link.fromId)}`}
                      >
                        {link.fromName}
                      </Link>
                    </td>
                    <td className="mono db-relations__field">{link.field}</td>
                    <td className="db-relations__arrow dimmer">→</td>
                    <td>
                      <Link
                        className="mono"
                        to={`/database/${encodeURIComponent(link.toId)}`}
                      >
                        {link.toName}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TableCard({
  collection,
  focus,
  dimmed,
  fieldLimit,
  targetsByField,
  onActivate,
}: {
  collection: MongoCollection;
  focus: boolean;
  dimmed: boolean;
  fieldLimit: number;
  targetsByField: Map<string, string>;
  onActivate: () => void;
}) {
  const fields = (collection.fields ?? []).slice(0, fieldLimit);
  const extra = (collection.fields ?? []).length - fields.length;
  return (
    <div
      className={`db-table${focus ? " db-table--focus" : ""}${dimmed ? " db-table--dim" : ""}`}
      data-table-id={collection.id}
      onMouseEnter={onActivate}
    >
      <Link
        to={`/database/${encodeURIComponent(collection.id)}`}
        className="db-table__head"
      >
        <span className="db-table__name">{collection.name}</span>
        {collection.entityName ? (
          <span className="db-table__entity">{collection.entityName}</span>
        ) : null}
      </Link>
      <div className="db-table__body">
        {fields.length === 0 ? (
          <div className="db-table__row db-table__row--empty">
            no columns resolved
          </div>
        ) : (
          fields.map((field) => {
            const target = targetsByField.get(field.name);
            return (
              <div
                key={field.name}
                className={`db-table__row${field.fk || target ? " db-table__row--fk" : ""}`}
              >
                <span className="db-table__col">
                  {field.pk ? (
                    <span className="db-key db-key--pk">PK</span>
                  ) : null}
                  {field.fk || target ? (
                    <span className="db-key db-key--fk">FK</span>
                  ) : null}
                  <span className="db-table__col-name">{field.name}</span>
                </span>
                <span className="db-table__col-type">
                  {target ? (
                    <span className="db-table__fk-target" title={target}>
                      → {target}
                    </span>
                  ) : (
                    shortType(field)
                  )}
                </span>
              </div>
            );
          })
        )}
        {extra > 0 ? (
          <div className="db-table__row db-table__row--more">
            +{extra} more columns
          </div>
        ) : null}
      </div>
    </div>
  );
}

function targetsFor(
  collection: MongoCollection,
  links: ResolvedLink[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const link of links) {
    if (link.fromId !== collection.id) continue;
    if (!map.has(link.field)) map.set(link.field, link.toName);
  }
  return map;
}

function fieldFromVia(via: string): string {
  return (via.split(":")[0] ?? via).trim() || via;
}

function shortDomain(domain: string): string {
  const parts = domain.split("/").filter(Boolean);
  if (parts.length <= 2) return domain || "root";
  return parts.slice(-2).join("/");
}

function orthogonalPath(
  a: Box,
  b: Box,
  salt: number,
): { d: string; labelAt: { x: number; y: number } } {
  const aCenter = { x: a.x + a.w / 2, y: a.y + Math.min(28, a.h / 2) };
  const bCenter = { x: b.x + b.w / 2, y: b.y + Math.min(28, b.h / 2) };
  const goRight = aCenter.x <= bCenter.x;
  const start = {
    x: goRight ? a.x + a.w : a.x,
    y: aCenter.y,
  };
  const end = {
    x: goRight ? b.x : b.x + b.w,
    y: bCenter.y,
  };
  const bend = ((salt % 5) - 2) * 10;
  const midX = (start.x + end.x) / 2 + bend;
  const d = `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
  return {
    d,
    labelAt: { x: midX, y: (start.y + end.y) / 2 },
  };
}

function shortType(field: CollectionColumn): string {
  const t =
    field.type
      .replace(/^Promise<|>$/g, "")
      .split("|")[0]
      ?.trim() ?? field.type;
  return (field.optional ? `${t}?` : t).slice(0, 22);
}
