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
