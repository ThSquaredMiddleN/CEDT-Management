import { describe, expect, it } from "vitest";
import { buildCatalogRows, parsePermission } from "../../src/core/permission-layout.js";
import { permissionCatalog, permissionRowLabels } from "../../src/modules/index.js";

describe("parsePermission", () => {
  it("splits row, level and part", () => {
    expect(parsePermission("course_change.manage.advise")).toEqual({ row: "course_change", level: "manage", part: "advise" });
    expect(parsePermission("core.users.view")).toEqual({ row: "core.users", level: "view", part: null });
    expect(parsePermission("bookings.use")).toEqual({ row: "bookings", level: "use", part: null });
  });

  it("rejects names without a level or with a part on use/view", () => {
    expect(parsePermission("core.import")).toBeNull();
    expect(parsePermission("bookings.view.extra")).toBeNull();
    expect(parsePermission("view")).toBeNull();
  });

  it("parses every declared permission", () => {
    expect(permissionCatalog.filter((p) => parsePermission(p.key) === null).map((p) => p.key)).toEqual([]);
  });
});

describe("buildCatalogRows", () => {
  it("groups by row with Thai labels and manage parts", () => {
    const rows = buildCatalogRows(permissionCatalog, permissionRowLabels);
    const cc = rows.find((r) => r.row === "course_change")!;
    expect(cc.label).toBe("ลด-ถอนรายวิชา");
    expect(cc.use?.key).toBe("course_change.use");
    expect(cc.manage?.key).toBe("course_change.manage");
    expect(cc.manage?.parts.map((p) => p.key)).toEqual(["course_change.manage.advise"]);
    expect(rows.find((r) => r.row === "line")!.view).toBeUndefined();
  });
});
