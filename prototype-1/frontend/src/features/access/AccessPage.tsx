import { useCallback, useEffect, useState } from "react";
import { RoleEditor } from "./RoleEditor";
import { UserAccess } from "./UserAccess";

/** /admin/access: user permissions and role presets (spec 2026-11-24-permissions-ui-design). */
export function AccessPage() {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [dirty, setDirty] = useState(false);
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function switchTo(next: "users" | "roles") {
    if (next === tab) return;
    if (dirty && !window.confirm("มีการเปลี่ยนแปลงที่ยังไม่บันทึก ต้องการทิ้งการเปลี่ยนแปลงหรือไม่")) return;
    setDirty(false);
    setTab(next);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">สิทธิ์ผู้ใช้</h1>
      <div className="flex gap-2 border-b" role="tablist">
        {(["users", "roles"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-brand-primary font-semibold" : "text-neutral-500"}`}
            onClick={() => switchTo(t)}
          >
            {t === "users" ? "ผู้ใช้" : "บทบาท"}
          </button>
        ))}
      </div>
      {tab === "users" ? <UserAccess onDirtyChange={onDirtyChange} /> : <RoleEditor onDirtyChange={onDirtyChange} />}
    </div>
  );
}
