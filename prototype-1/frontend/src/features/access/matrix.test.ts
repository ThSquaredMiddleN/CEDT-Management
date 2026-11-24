import { describe, expect, it } from "vitest";
import type { CatalogRow, RoleView } from "@/api/access";
import { cellKeys, diffDraft, draftSources, isGivable } from "./matrix";

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
