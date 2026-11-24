import { useEffect, useMemo, useState } from "react";
import { useAccessCatalog, useAccessUserSearch, useRoles, useSaveUserAccess, useUserAccess } from "@/api/access";
import { useAuth } from "@/app/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { diffDraft, draftSources, isGivable, type Draft } from "./matrix";
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
  const { user: me } = useAuth();
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ roleIds: [], permissions: [] });
  const [saving, setSaving] = useState(false);
  const search = useAccessUserSearch(useDebounced(query));
  const catalog = useAccessCatalog();
  const roles = useRoles();
  const access = useUserAccess(userId);
  const save = useSaveUserAccess(userId ?? "");

  const saved = useMemo<Draft>(
    () => ({ roleIds: access.data?.roles.map((r) => r.id) ?? [], permissions: access.data?.direct.map((d) => d.permission) ?? [] }),
    [access.data],
  );
  useEffect(() => setDraft(saved), [saved]);
  const diff = diffDraft(saved, draft);
  useEffect(() => onDirtyChange(diff.count > 0), [diff.count, onDirtyChange]);

  const allRoles = roles.data?.items ?? [];
  const actorPerms = me?.permissions ?? [];
  const isStudent = !!access.data?.user.studentNo;
  const sources = draftSources(draft, allRoles, isStudent);
  const savedSources = draftSources(saved, allRoles, isStudent);
  const roleName = (id: string) => allRoles.find((r) => r.id === id)?.name ?? id;

  function choose(id: string) {
    if (diff.count > 0 && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setUserId(id);
    setQuery("");
  }

  const toggle = (key: string) =>
    setDraft((d) => ({
      ...d,
      permissions: d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key],
    }));

  const changes = [
    ...diff.addRoles.map((id) => `+ บทบาท ${roleName(id)}`),
    ...diff.removeRoles.map((id) => `− บทบาท ${roleName(id)}`),
    ...diff.addPermissions.map((p) => `+ สิทธิ์รายคน ${p}`),
    ...diff.removePermissions.map((p) => `− สิทธิ์รายคน ${p}`),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาชื่อ อีเมล รหัสนิสิต" />
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
        <Button disabled={diff.count === 0} onClick={() => setSaving(true)}>บันทึก ({diff.count})</Button>
      </div>

      {access.data && catalog.data && (
        <>
          <section className="space-y-2 border-t pt-3">
            <p className="text-sm">
              <b>{access.data.user.name}</b> · {access.data.user.email} · {access.data.user.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}
              {access.data.user.studentNo && ` · ${access.data.user.studentNo} · นิสิต (อัตโนมัติ)`}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>บทบาท:</span>
              {[...saved.roleIds, ...diff.addRoles].map((id) => {
                const removed = diff.removeRoles.includes(id);
                const added = diff.addRoles.includes(id);
                return (
                  <span key={id} className={`rounded border px-2 py-0.5 ${added ? "border-green-600 text-green-700" : ""} ${removed ? "border-red-600 text-red-700 line-through" : ""}`}>
                    {roleName(id)}{" "}
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
            rows={catalog.data.rows}
            onToggle={toggle}
            stateOf={(key) => {
              const s = sources.get(key) ?? [];
              const before = savedSources.get(key) ?? [];
              const locked = s.some((x) => x !== "direct");
              const direct = draft.permissions.includes(key);
              return {
                checked: s.length > 0,
                locked,
                disabled: !direct && !isGivable([key], actorPerms),
                sources: s,
                change: s.length > 0 && before.length === 0 ? "added" : s.length === 0 && before.length > 0 ? "removed" : null,
              };
            }}
          />
        </>
      )}

      <SaveChangesDialog
        open={saving}
        title={`ยืนยันการเปลี่ยนสิทธิ์ของ ${access.data?.user.name ?? ""}`}
        changes={changes}
        onClose={() => setSaving(false)}
        onConfirm={(reason) => save.mutateAsync({ ...draft, reason })}
      />
    </div>
  );
}
