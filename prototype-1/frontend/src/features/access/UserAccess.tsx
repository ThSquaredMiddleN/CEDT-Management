import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccessCatalog,
  useAccessUserSearch,
  useRoles,
  useSaveUserAccess,
  useUserAccess,
  type CatalogRow,
  type RoleView,
  type UserAccessView,
} from "@/api/access";
import { useAuth } from "@/app/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cellState, diffDraft, draftSources, isGivable, keyLabels, type Draft } from "./matrix";
import { PermissionMatrix } from "./PermissionMatrix";
import { SaveChangesDialog } from "./SaveChangesDialog";

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function UserAccess({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  // Bumped on every pick so re-selecting the same user also starts from the saved state.
  const [epoch, setEpoch] = useState(0);
  const [dirty, setDirty] = useState(false);
  const search = useAccessUserSearch(useDebounced(query));
  const catalog = useAccessCatalog();
  const roles = useRoles();
  const access = useUserAccess(userId);

  const handleDirty = useCallback(
    (d: boolean) => {
      setDirty(d);
      onDirtyChange(d);
    },
    [onDirtyChange],
  );

  function choose(id: string) {
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setUserId(id);
    setEpoch((e) => e + 1);
    setQuery("");
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Input aria-label="ค้นหาผู้ใช้" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ อีเมล รหัสนิสิต" />
        {query && search.data && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-white shadow">
            {search.data.items.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">ไม่พบผู้ใช้</li>}
            {search.data.items.map((u) => (
              <li key={u.id}>
                <button type="button" className={`w-full px-3 py-2 text-left text-sm hover:bg-neutral-100 ${u.isActive ? "" : "text-neutral-400"}`} onClick={() => choose(u.id)}>
                  {u.name} · {u.studentNo ?? u.email} {u.roles.length > 0 && `· ${u.roles.join(", ")}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {userId && access.data && catalog.data && roles.data && (
        <UserEditor
          key={`${userId}:${epoch}`}
          data={access.data}
          rows={catalog.data.rows}
          allRoles={roles.data.items}
          onDirtyChange={handleDirty}
        />
      )}
    </div>
  );
}

/** Edits one loaded user. Mounted per pick, so its draft starts from the saved state and survives background refetches. */
function UserEditor({
  data,
  rows,
  allRoles,
  onDirtyChange,
}: {
  data: UserAccessView;
  rows: CatalogRow[];
  allRoles: RoleView[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { user: me } = useAuth();
  const save = useSaveUserAccess(data.user.id);
  const [saving, setSaving] = useState(false);

  const saved = useMemo<Draft>(
    () => ({ roleIds: data.roles.map((r) => r.id), permissions: data.direct.map((d) => d.permission) }),
    [data],
  );
  const [draft, setDraft] = useState<Draft>(saved);
  const diff = diffDraft(saved, draft);
  useEffect(() => {
    onDirtyChange(diff.count > 0);
  }, [diff.count, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const actorPerms = me?.permissions ?? [];
  const isStudent = !!data.user.studentNo;
  const sources = draftSources(draft, allRoles, isStudent);
  const savedSources = draftSources(saved, allRoles, isStudent);
  const labels = useMemo(() => keyLabels(rows), [rows]);
  const label = (p: string) => labels.get(p) ?? p;
  const roleName = (id: string) => allRoles.find((r) => r.id === id)?.name ?? id;

  const toggle = (key: string) =>
    setDraft((d) => ({
      ...d,
      permissions: d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key],
    }));

  const changes = [
    ...diff.addRoles.map((id) => `+ บทบาท ${roleName(id)}`),
    ...diff.removeRoles.map((id) => `− บทบาท ${roleName(id)}`),
    ...diff.addPermissions.map((p) => `+ สิทธิ์รายคน ${label(p)}`),
    ...diff.removePermissions.map((p) => `− สิทธิ์รายคน ${label(p)}`),
  ];

  return (
    <>
      <section className="space-y-2 border-t pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">
            <b>{data.user.name}</b> · {data.user.email} · {data.user.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
            {data.user.studentNo && ` · ${data.user.studentNo} · นิสิต (อัตโนมัติ)`}
          </p>
          <Button disabled={diff.count === 0} onClick={() => setSaving(true)}>บันทึก ({diff.count})</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>บทบาท:</span>
          {[...saved.roleIds, ...diff.addRoles].map((id) => {
            const removed = diff.removeRoles.includes(id);
            const added = diff.addRoles.includes(id);
            const inactive = (data.roles.find((r) => r.id === id) ?? allRoles.find((r) => r.id === id))?.isActive === false;
            return (
              <span key={id} className={`rounded border px-2 py-0.5 ${added ? "border-green-600 text-green-700" : ""} ${removed ? "border-red-600 text-red-700 line-through" : ""}`}>
                {roleName(id)}{inactive && " (ปิดใช้งาน)"}{" "}
                <button
                  type="button"
                  aria-label={removed ? `คืนบทบาท ${roleName(id)}` : `ถอนบทบาท ${roleName(id)}`}
                  onClick={() => setDraft((d) => ({ ...d, roleIds: removed ? [...d.roleIds, id] : d.roleIds.filter((r) => r !== id) }))}
                >
                  {removed ? "↺" : "✕"}
                </button>
              </span>
            );
          })}
          <select
            aria-label="เพิ่มบทบาท"
            className="rounded border px-2 py-1"
            value=""
            onChange={(e) => e.target.value && setDraft((d) => ({ ...d, roleIds: [...d.roleIds, e.target.value] }))}
          >
            <option value="">+ เพิ่มบทบาท</option>
            {allRoles
              .filter((r) => r.isActive && r.key !== "student" && !draft.roleIds.includes(r.id))
              .map((r) => (
                <option key={r.id} value={r.id} disabled={!isGivable(r.permissions, actorPerms)}>
                  {r.name}{isGivable(r.permissions, actorPerms) ? "" : " (ให้ได้เฉพาะสิทธิ์ที่คุณมี)"}
                </option>
              ))}
          </select>
        </div>
      </section>

      <PermissionMatrix
        rows={rows}
        onToggle={toggle}
        stateOf={(key) =>
          cellState(key, { draft, saved, draftSources: sources, savedSources, direct: data.direct, actorPermissions: actorPerms })
        }
      />

      <SaveChangesDialog
        open={saving}
        title={`ยืนยันการเปลี่ยนสิทธิ์ของ ${data.user.name}`}
        changes={changes}
        onClose={() => setSaving(false)}
        onConfirm={(reason) => save.mutateAsync({ ...draft, reason })}
      />
    </>
  );
}
