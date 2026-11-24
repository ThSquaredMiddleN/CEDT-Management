import { useEffect, useMemo, useState } from "react";
import { useAccessCatalog, useRole, useRoles, useSaveRole } from "@/api/access";
import { useAuth } from "@/app/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isGivable, keyLabels } from "./matrix";
import { PermissionMatrix } from "./PermissionMatrix";
import { SaveChangesDialog } from "./SaveChangesDialog";

interface RoleDraft { key: string; name: string; description: string; isActive: boolean; permissions: string[] }
const EMPTY: RoleDraft = { key: "", name: "", description: "", isActive: true, permissions: [] };

export function RoleEditor({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { user: me } = useAuth();
  const [roleId, setRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const roles = useRoles();
  const role = useRole(roleId);
  const catalog = useAccessCatalog();
  const save = useSaveRole(creating ? null : roleId);

  const saved = useMemo<RoleDraft>(
    () =>
      role.data && !creating
        ? { key: role.data.key, name: role.data.name, description: role.data.description ?? "", isActive: role.data.isActive, permissions: role.data.permissions }
        : EMPTY,
    [role.data, creating],
  );
  useEffect(() => setDraft(saved), [saved]);
  const added = draft.permissions.filter((p) => !saved.permissions.includes(p));
  const removed = saved.permissions.filter((p) => !draft.permissions.includes(p));
  const fieldChanges = [
    draft.key !== saved.key && creating ? `key ${draft.key}` : null,
    draft.name !== saved.name ? `ชื่อ: ${draft.name}` : null,
    draft.description !== saved.description ? "คำอธิบาย" : null,
    draft.isActive !== saved.isActive ? (draft.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน") : null,
  ].filter((c): c is string => !!c);
  const labels = useMemo(() => keyLabels(catalog.data?.rows ?? []), [catalog.data]);
  const label = (p: string) => labels.get(p) ?? p;
  const changes = [...fieldChanges, ...added.map((p) => `+ ${label(p)}`), ...removed.map((p) => `− ${label(p)}`)];
  const dirty = changes.length > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function pick(next: string | null, create = false) {
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setCreating(create);
    setRoleId(next);
    if (create) setDraft(EMPTY);
  }

  const showEditor = creating || !!role.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select aria-label="เลือกบทบาท" className="flex-1 rounded border px-2 py-2 text-sm" value={creating ? "" : roleId ?? ""} onChange={(e) => pick(e.target.value || null)}>
          <option value="">เลือกบทบาท</option>
          {roles.data?.items.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.key}) · {r.userCount} คน{r.isActive ? "" : " · ปิดใช้งาน"}
            </option>
          ))}
        </select>
        <Button variant="outline" onClick={() => pick(null, true)}>+ สร้างบทบาท</Button>
        <Button disabled={!dirty} onClick={() => setSaving(true)}>บันทึก ({changes.length})</Button>
      </div>

      {showEditor && catalog.data && (
        <>
          <section className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
            {creating ? (
              <Input aria-label="key ของบทบาท" placeholder="key เช่น storage_staff" value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
            ) : (
              <p className="self-center">
                key: <code>{saved.key}</code> {role.data?.isSystem && <Badge>ระบบ</Badge>}
              </p>
            )}
            <Input aria-label="ชื่อบทบาท" placeholder="ชื่อบทบาท" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea aria-label="คำอธิบาย" className="sm:col-span-2" placeholder="คำอธิบาย" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            {!creating && !role.data?.isSystem && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                เปิดใช้งาน
              </label>
            )}
            {!creating && role.data && (
              <p className="sm:col-span-2 text-neutral-600">
                สมาชิก: {role.data.members.map((m) => m.name).join(", ") || "—"} (เพิ่มหรือถอนที่แท็บผู้ใช้)
              </p>
            )}
          </section>

          <PermissionMatrix
            forRole
            maxHeightClass="max-h-[calc(100vh-530px)]"
            rows={catalog.data.rows}
            onToggle={(key) =>
              setDraft((d) => ({ ...d, permissions: d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key] }))
            }
            stateOf={(key) => {
              const checked = draft.permissions.includes(key);
              const wasSaved = saved.permissions.includes(key);
              return {
                checked,
                locked: false,
                disabled: !wasSaved && !isGivable([key], me?.permissions ?? []),
                sources: [],
                change: added.includes(key) ? "added" : removed.includes(key) ? "removed" : null,
              };
            }}
          />
        </>
      )}

      <SaveChangesDialog
        open={saving}
        title={creating ? "ยืนยันการสร้างบทบาท" : `ยืนยันการแก้บทบาท ${saved.name}`}
        changes={changes}
        onClose={() => setSaving(false)}
        onConfirm={async (reason) => {
          const body = { name: draft.name, description: draft.description || null, permissions: draft.permissions, reason };
          const result = await save.mutateAsync(creating ? { ...body, key: draft.key } : { ...body, isActive: draft.isActive });
          if (creating) {
            setCreating(false);
            setRoleId(result.id);
          }
        }}
      />
    </div>
  );
}
