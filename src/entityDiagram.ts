/**
 * Mermaid classDiagram for an entity's OOP / document shape.
 * Nested types are linked from field.refs — BFF infra stores are not drawn.
 */
import type { Schema, SchemaField } from "./types";

function esc(label: string): string {
  return label.replace(/"/g, "'").slice(0, 40);
}

function classId(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9_]/g, "_");
  return clean.match(/^[A-Za-z]/) ? clean : `T_${clean}`;
}

function nestedTypeNames(fields: SchemaField[]): string[] {
  const names = new Set<string>();
  for (const field of fields) {
    for (const ref of field.refs) {
      if (!ref) continue;
      if (/^(string|number|boolean|Date|ObjectId|any|unknown|T)$/i.test(ref))
        continue;
      if (ref.endsWith("Enum") || ref === "Type" || ref === "Status") continue;
      names.add(ref);
    }
  }
  return [...names];
}

/** UML-style class diagram for one root schema (+ nested type names as stubs). */
export function buildEntityClassDiagram(
  root: Schema,
  nestedSchemas: Schema[] = [],
): string {
  const lines: string[] = ["classDiagram"];
  const rootId = classId(root.name);
  lines.push(`  class ${rootId} {`);
  for (const field of root.fields.slice(0, 18)) {
    const opt = field.optional ? "?" : "";
    lines.push(
      `    +${esc(shortType(field.type))}${opt} ${esc(field.name)}`,
    );
  }
  if (root.fields.length > 18) {
    lines.push(`    +… ${root.fields.length - 18} more`);
  }
  lines.push("  }");

  const nestedByName = new Map(nestedSchemas.map((s) => [s.name, s]));
  const nestedNames = nestedTypeNames(root.fields).slice(0, 10);

  for (const name of nestedNames) {
    const id = classId(name);
    const schema = nestedByName.get(name);
    if (schema && schema.fields.length) {
      lines.push(`  class ${id} {`);
      for (const field of schema.fields.slice(0, 8)) {
        const opt = field.optional ? "?" : "";
        lines.push(
          `    +${esc(shortType(field.type))}${opt} ${esc(field.name)}`,
        );
      }
      if (schema.fields.length > 8) {
        lines.push(`    +… ${schema.fields.length - 8} more`);
      }
      lines.push("  }");
    } else {
      lines.push(`  class ${id}`);
    }
  }

  for (const field of root.fields) {
    for (const ref of field.refs) {
      if (!nestedNames.includes(ref)) continue;
      lines.push(
        `  ${rootId} --> ${classId(ref)} : ${esc(field.name)}`,
      );
    }
  }

  return lines.join("\n");
}

function shortType(type: string): string {
  return type
    .replace(/\|/g, "¦")
    .replace(/</g, "‹")
    .replace(/>/g, "›")
    .slice(0, 28);
}
