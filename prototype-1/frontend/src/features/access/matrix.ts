import type { CatalogRow, RoleView } from "@/api/access";

export interface Draft {
  roleIds: string[];
  permissions: string[];
}

/** Every permission key shown in a row (use, view, manage, manage parts). */
export function cellKeys(row: CatalogRow): string[] {
  return [row.use?.key, row.view?.key, row.manage?.key, ...(row.manage?.parts.map((p) => p.key) ?? [])].filter(
    (k): k is string => !!k,
  );
}

/** permission → its sources in the draft: role names (draft order), "นิสิต" (automatic), "direct". */
export function draftSources(draft: Draft, roles: RoleView[], isStudent: boolean): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (p: string, s: string) => out.set(p, [...(out.get(p) ?? []), s]);
  for (const id of draft.roleIds) {
    const r = roles.find((x) => x.id === id);
    if (r?.isActive) for (const p of r.permissions) add(p, r.name);
  }
  if (isStudent) {
    const student = roles.find((r) => r.key === "student");
    if (student?.isActive) for (const p of student.permissions) add(p, student.name);
  }
  for (const p of draft.permissions) add(p, "direct");
  return out;
}

export function diffDraft(saved: Draft, draft: Draft) {
  const minus = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));
  const addRoles = minus(draft.roleIds, saved.roleIds);
  const removeRoles = minus(saved.roleIds, draft.roleIds);
  const addPermissions = minus(draft.permissions, saved.permissions);
  const removePermissions = minus(saved.permissions, draft.permissions);
  return {
    addRoles,
    removeRoles,
    addPermissions,
    removePermissions,
    count: addRoles.length + removeRoles.length + addPermissions.length + removePermissions.length,
  };
}

/** True when the actor holds every permission (rule: you cannot give what you do not have). */
export const isGivable = (permissions: string[], actorPermissions: readonly string[]): boolean =>
  permissions.every((p) => actorPermissions.includes(p));

/** Tooltip text for a saved direct permission: its reason and who granted it. Unsaved additions have none. */
export function directNote(
  direct: { permission: string; reason: string; grantedBy: string | null }[],
  permission: string,
): string | undefined {
  const d = direct.find((x) => x.permission === permission);
  if (!d) return undefined;
  return `เหตุผล: ${d.reason}${d.grantedBy ? ` · ให้โดย ${d.grantedBy}` : ""}`;
}

export interface CellState {
  checked: boolean;
  /** Ticked by a role (or the automatic student role) and not directly: cannot be toggled here. */
  locked: boolean;
  /** The current user may not give it. */
  disabled: boolean;
  /** Source names shown next to the box; "direct" is rendered as "รายคน". */
  sources: string[];
  change: "added" | "removed" | null;
  /** Hover text, e.g. the reason and granter of a saved direct permission. */
  note?: string;
}

export interface CellInput {
  draft: Draft;
  saved: Draft;
  draftSources: Map<string, string[]>;
  savedSources: Map<string, string[]>;
  direct: { permission: string; reason: string; grantedBy: string | null }[];
  actorPermissions: readonly string[];
}

/** State of one checkbox on the user matrix. */
export function cellState(key: string, i: CellInput): CellState {
  const sources = i.draftSources.get(key) ?? [];
  const before = i.savedSources.get(key) ?? [];
  const isDirect = i.draft.permissions.includes(key);
  const wasSaved = i.saved.permissions.includes(key);
  return {
    checked: sources.length > 0,
    // A direct grant is always removable; a role-only source is not.
    locked: !isDirect && sources.some((x) => x !== "direct"),
    // Judged on the saved state so an un-tick of something you cannot give can be undone.
    disabled: !wasSaved && !isGivable([key], i.actorPermissions),
    sources,
    note: isDirect ? directNote(i.direct, key) : undefined,
    change: sources.length > 0 && before.length === 0 ? "added" : sources.length === 0 && before.length > 0 ? "removed" : null,
  };
}

/** permission key → short Thai label such as "ใบเสร็จ · ดู", for change summaries. */
export function keyLabels(rows: CatalogRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.use) out.set(r.use.key, `${r.label} · ใช้งาน`);
    if (r.view) out.set(r.view.key, `${r.label} · ดู`);
    if (r.manage?.key) out.set(r.manage.key, `${r.label} · จัดการ`);
    for (const p of r.manage?.parts ?? []) out.set(p.key, `${r.label} · จัดการ: ${p.label}`);
  }
  return out;
}

export type CellLook = "locked" | "empty" | "saved" | "add" | "remove";

/** Which of the five visual looks a cell takes. */
export function cellLook(s: Pick<CellState, "checked" | "locked" | "change">): CellLook {
  if (s.locked) return "locked";
  if (s.change === "added" && s.checked) return "add";
  if (s.change === "removed" && !s.checked) return "remove";
  return s.checked ? "saved" : "empty";
}

/** Role names (not "direct") that give a cell. */
export const roleSources = (s: Pick<CellState, "sources">): string[] => s.sources.filter((x) => x !== "direct");

/** Tooltip text of a cell; `fallback` (the permission label) is used when there is nothing else to say. */
export function cellTip(s: CellState, fallback: string): string {
  const roles = roleSources(s);
  const fromRoles = roles.length ? `ได้จากบทบาท: ${roles.join(", ")}` : "";
  const look = cellLook(s);
  if (look === "locked") return fromRoles;
  if (look === "add") return [fromRoles, "จะเพิ่มเมื่อบันทึก"].filter(Boolean).join(" · ");
  if (look === "remove") return [fromRoles, "จะถอนเมื่อบันทึก"].filter(Boolean).join(" · ");
  if (look === "saved") {
    const direct = s.sources.includes("direct") ? ["รายคน", s.note].filter(Boolean).join(" · ") : "";
    return [fromRoles, direct].filter(Boolean).join(" · ") || fallback;
  }
  return s.disabled ? "ให้ได้เฉพาะสิทธิ์ที่คุณมี" : fallback;
}
