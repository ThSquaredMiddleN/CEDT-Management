import type { PermissionDef } from "./permissions.js";

const LEVELS = ["use", "view", "manage"] as const;
export type PermissionLevel = (typeof LEVELS)[number];

export interface ParsedPermission {
  row: string;
  level: PermissionLevel;
  /** Only for "<row>.manage.<part>". */
  part: string | null;
}

/** The first use/view/manage token is the column; before it is the row; after manage. is the part. */
export function parsePermission(key: string): ParsedPermission | null {
  const tokens = key.split(".");
  const i = tokens.findIndex((t) => (LEVELS as readonly string[]).includes(t));
  if (i <= 0) return null;
  const level = tokens[i] as PermissionLevel;
  const rest = tokens.slice(i + 1);
  if (level !== "manage" && rest.length > 0) return null;
  return { row: tokens.slice(0, i).join("."), level, part: rest.length ? rest.join(".") : null };
}

export interface CatalogCell {
  key: string;
  label: string;
}

export interface CatalogRow {
  row: string;
  label: string;
  use?: CatalogCell;
  view?: CatalogCell;
  /** `key` is null when the module only declares manage parts (e.g. storage.manage.qc). */
  manage?: { key: string | null; label: string | null; parts: CatalogCell[] };
}

/** Rows for the permission table, in catalog order. */
export function buildCatalogRows(catalog: PermissionDef[], rowLabels: Record<string, string>): CatalogRow[] {
  const rows = new Map<string, CatalogRow>();
  for (const p of catalog) {
    const parsed = parsePermission(p.key);
    if (!parsed) continue;
    const row = rows.get(parsed.row) ?? { row: parsed.row, label: rowLabels[parsed.row] ?? parsed.row };
    const cell = { key: p.key, label: p.label };
    if (parsed.level === "manage") {
      row.manage ??= { key: null, label: null, parts: [] };
      if (parsed.part) row.manage.parts.push(cell);
      else Object.assign(row.manage, cell);
    } else {
      row[parsed.level] = cell;
    }
    rows.set(parsed.row, row);
  }
  return [...rows.values()];
}
