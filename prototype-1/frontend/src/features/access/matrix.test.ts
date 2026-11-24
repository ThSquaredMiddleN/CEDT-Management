import { describe, expect, it } from "vitest";
import type { CatalogRow, RoleView } from "@/api/access";
import { cellKeys, displayRows, cellLook, cellState, cellTip, diffDraft, directNote, draftSources, isGivable, keyLabels, type CellState, type Draft } from "./matrix";

const role = (id: string, name: string, permissions: string[], key = id): RoleView => ({
  id, key, name, description: null, isSystem: false, isActive: true, permissions, userCount: 0,
});
const roles = [
  role("r1", "อาจารย์", ["bookings.use", "course_change.view"]),
  role("r2", "Audit", ["course_change.view", "receipts.view"]),
  role("s", "นิสิต", ["course_change.use"], "student"),
];

describe("cellKeys", () => {
  it("lists every key of a row, including manage parts", () => {
    const row: CatalogRow = {
      row: "course_change",
      label: "ลด-ถอนรายวิชา",
      use: { key: "course_change.use", label: "" },
      manage: { key: "course_change.manage", label: "", parts: [{ key: "course_change.manage.advise", label: "" }] },
    };
    expect(cellKeys(row)).toEqual(["course_change.use", "course_change.manage", "course_change.manage.advise"]);
  });
});

describe("draftSources", () => {
  it("combines draft roles, the student role and direct permissions", () => {
    const draft = { roleIds: ["r1", "r2"], permissions: ["course_change.view", "news.view"] };
    expect(draftSources(draft, roles, true).get("course_change.view")).toEqual(["อาจารย์", "Audit", "direct"]);
    expect(draftSources(draft, roles, true).get("course_change.use")).toEqual(["นิสิต"]);
    expect(draftSources(draft, roles, false).has("course_change.use")).toBe(false);
  });
});

describe("diffDraft", () => {
  it("counts added and removed roles and permissions", () => {
    const d = diffDraft({ roleIds: ["r1"], permissions: ["a.view"] }, { roleIds: ["r2"], permissions: ["a.view", "b.view"] });
    expect(d).toEqual({ addRoles: ["r2"], removeRoles: ["r1"], addPermissions: ["b.view"], removePermissions: [], count: 3 });
  });
});

describe("isGivable", () => {
  it("allows only permissions the actor holds", () => {
    expect(isGivable(["a.view"], ["a.view", "b.view"])).toBe(true);
    expect(isGivable(["a.view", "b.view"], ["a.view"])).toBe(false);
  });
});

describe("directNote", () => {
  const direct = [
    { permission: "a.view", reason: "ช่วยงาน", grantedBy: "Admin" },
    { permission: "b.view", reason: "ชั่วคราว", grantedBy: null },
  ];
  it("shows reason and granter", () => {
    expect(directNote(direct, "a.view")).toBe("เหตุผล: ช่วยงาน · ให้โดย Admin");
  });
  it("omits the granter when unknown", () => {
    expect(directNote(direct, "b.view")).toBe("เหตุผล: ชั่วคราว");
  });
  it("has no note for unsaved permissions", () => {
    expect(directNote(direct, "c.view")).toBeUndefined();
  });
});

describe("cellState", () => {
  const base = (draft: Draft, saved: Draft, actor: string[], direct: { permission: string; reason: string; grantedBy: string | null }[] = []) => {
    const rs = [...roles];
    return (key: string) =>
      cellState(key, {
        draft,
        saved,
        draftSources: draftSources(draft, rs, false),
        savedSources: draftSources(saved, rs, false),
        direct,
        actorPermissions: actor,
      });
  };

  it("locks a permission that only a role gives", () => {
    const d = { roleIds: ["r1"], permissions: [] };
    const s = base(d, d, ["bookings.use"])("bookings.use");
    expect(s).toMatchObject({ checked: true, locked: true, sources: ["อาจารย์"] });
  });

  it("does not lock a direct permission that a role also gives, and shows both sources", () => {
    const d = { roleIds: ["r1"], permissions: ["bookings.use"] };
    const s = base(d, d, ["bookings.use"])("bookings.use");
    expect(s.locked).toBe(false);
    expect(s.checked).toBe(true);
    expect(s.sources).toEqual(["อาจารย์", "direct"]);
  });

  it("stays ticked after removing the direct grant when a role still gives it", () => {
    const saved = { roleIds: ["r1"], permissions: ["bookings.use"] };
    const draft = { roleIds: ["r1"], permissions: [] };
    const s = base(draft, saved, [])("bookings.use");
    expect(s).toMatchObject({ checked: true, locked: true, change: null });
  });

  it("keeps a saved direct permission the actor lacks clickable, even after un-tick", () => {
    const saved = { roleIds: [], permissions: ["receipts.view"] };
    const draft = { roleIds: [], permissions: [] };
    const s = base(draft, saved, [])("receipts.view");
    expect(s).toMatchObject({ checked: false, disabled: false, change: "removed" });
  });

  it("disables a new permission the actor lacks", () => {
    const d = { roleIds: [], permissions: [] };
    expect(base(d, d, [])("receipts.view").disabled).toBe(true);
    expect(base(d, d, ["receipts.view"])("receipts.view").disabled).toBe(false);
  });

  it("carries the saved note only for direct permissions", () => {
    const d = { roleIds: [], permissions: ["news.view"] };
    const direct = [{ permission: "news.view", reason: "ช่วยงาน", grantedBy: null }];
    expect(base(d, d, ["news.view"], direct)("news.view").note).toBe("เหตุผล: ช่วยงาน");
  });
});

describe("keyLabels", () => {
  it("maps keys to short Thai labels", () => {
    const rows: CatalogRow[] = [
      {
        row: "receipts",
        label: "ใบเสร็จ",
        view: { key: "receipts.view", label: "x" },
        manage: { key: "receipts.manage", label: null, parts: [{ key: "receipts.manage.void", label: "ยกเลิก" }] },
      },
    ];
    const m = keyLabels(rows);
    expect(m.get("receipts.view")).toBe("ใบเสร็จ · ดู");
    expect(m.get("receipts.manage")).toBe("ใบเสร็จ · จัดการ");
    expect(m.get("receipts.manage.void")).toBe("ใบเสร็จ · จัดการ: ยกเลิก");
  });
});

describe("cellLook and cellTip", () => {
  const st = (o: Partial<CellState>): CellState => ({ checked: false, locked: false, disabled: false, sources: [], change: null, ...o });
  it("picks the look", () => {
    expect(cellLook(st({}))).toBe("empty");
    expect(cellLook(st({ checked: true, sources: ["direct"] }))).toBe("saved");
    expect(cellLook(st({ checked: true, change: "added", sources: ["direct"] }))).toBe("add");
    expect(cellLook(st({ change: "removed" }))).toBe("remove");
    expect(cellLook(st({ checked: true, locked: true, sources: ["อาจารย์"] }))).toBe("locked");
  });
  it("builds tooltips", () => {
    expect(cellTip(st({ checked: true, locked: true, sources: ["อาจารย์", "นิสิต"] }), "x")).toBe("ได้จากบทบาท: อาจารย์, นิสิต");
    expect(cellTip(st({ checked: true, sources: ["direct"], note: "เหตุผล: ก · ให้โดย ข" }), "x")).toBe("รายคน · เหตุผล: ก · ให้โดย ข");
    expect(cellTip(st({ checked: true, sources: ["อาจารย์", "direct"], note: "เหตุผล: ก" }), "x")).toBe("ได้จากบทบาท: อาจารย์ · รายคน · เหตุผล: ก");
    expect(cellTip(st({ checked: true, change: "added", sources: ["direct"] }), "x")).toBe("จะเพิ่มเมื่อบันทึก");
    expect(cellTip(st({ change: "removed" }), "x")).toBe("จะถอนเมื่อบันทึก");
    expect(cellTip(st({ disabled: true }), "x")).toBe("ให้ได้เฉพาะสิทธิ์ที่คุณมี");
    expect(cellTip(st({}), "x")).toBe("x");
  });
});

describe("displayRows", () => {
  it("puts each manage part in a sub-row right after its module row", () => {
    const rows: CatalogRow[] = [
      {
        row: "course_change",
        label: "ลด-ถอนรายวิชา",
        use: { key: "course_change.use", label: "" },
        manage: { key: "course_change.manage", label: "", parts: [{ key: "course_change.manage.advise", label: "a" }, { key: "course_change.manage.head", label: "h" }] },
      },
      { row: "receipts", label: "ใบเสร็จ", view: { key: "receipts.view", label: "" } },
    ];
    expect(displayRows(rows).map((r) => [r.kind, r.id])).toEqual([
      ["module", "course_change"],
      ["part", "course_change.manage.advise"],
      ["part", "course_change.manage.head"],
      ["module", "receipts"],
    ]);
  });

  it("handles a module that only declares manage parts", () => {
    const rows: CatalogRow[] = [{ row: "x", label: "X", manage: { key: null, label: null, parts: [{ key: "x.manage.a", label: "A" }] } }];
    const out = displayRows(rows);
    expect(out.map((r) => r.kind)).toEqual(["module", "part"]);
    expect(out[1].kind === "part" && out[1].part.key).toBe("x.manage.a");
  });
});
