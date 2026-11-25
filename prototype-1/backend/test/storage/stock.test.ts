import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { addItem } from "../../src/modules/storage/inventory.js";
import { listRequests } from "../../src/modules/storage/requests.js";
import { bulk, inv, pis, resetStorage, sellOutB101, staffId, walk, restock } from "./helpers.js";

beforeEach(resetStorage);

const statusOf = async (no: string) => (await listRequests()).find((r) => r.id === no)!.status;

describe("unit records", () => {
  it("generates numbered serials for a new Unique item", async () => {
    await addItem(await staffId(), { id: "eq-005", name: "Arduino", isUnique: true, total: 3 });
    const item = await inv("EQ-005");
    expect(item.availableSerials).toEqual(["EQ-005-001", "EQ-005-002", "EQ-005-003"]);
    expect(item.total).toBe(3);
  });

  it("rejects a duplicate item code", async () => {
    await expect(addItem(await staffId(), { id: "EQ-001", name: "x", isUnique: false, total: 1 })).rejects.toThrow(/มีอยู่แล้ว/);
  });

  it("hands out real units and rejects unavailable serials", async () => {
    await expect(walk([{ itemId: "EQ-001", qty: 1, sns: ["EQ-001-009"] }])).rejects.toThrow(/ไม่พร้อมจ่าย/);
    await walk([pis(2)]);
    expect((await inv("EQ-001")).available).toBe(3);
    expect((await prisma.storageUnit.findUniqueOrThrow({ where: { serial: "EQ-001-001" } })).status).toBe("out");
  });
});

describe("sweep rule", () => {
  it("keeps a request OPEN while any line is still issuable", async () => {
    await walk([pis(5)]);
    expect(await statusOf("REQ-B-103")).toBe("OPEN"); // servos remain
    expect(await statusOf("REQ-B-101")).toBe("OPEN"); // breadboards remain
  });

  it("marks a request UNFULFILLED only when no line is issuable", async () => {
    await sellOutB101();
    expect(await statusOf("REQ-B-101")).toBe("UNFULFILLED");
    expect(await statusOf("REQ-B-103")).toBe("OPEN");
  });
});

describe("restock flag and hold", () => {
  it("flags the UNFULFILLED request and holds restocked units for it", async () => {
    await restock();
    const req = (await listRequests()).find((r) => r.id === "REQ-B-101")!;
    expect(req.restock).toBeDefined();
    const pi = await inv("EQ-001");
    expect(pi.reserved).toBe(2);
    expect(pi.available).toBe(0); // held units are out of the general pool
    await expect(walk([{ itemId: "EQ-001", qty: 1, sns: ["EQ-001-006"] }])).rejects.toThrow(/สต็อก/);
  });
});

describe("stock invariant", () => {
  it("keeps units out accounted for: total = shelf + reserved + qc + damaged + lost + out", async () => {
    await walk([pis(2)]);
    const pi = await inv("EQ-001");
    const out = await prisma.storageUnit.count({ where: { item: { code: "EQ-001" }, status: "out" } });
    expect(pi.total).toBe(pi.available + pi.reserved + pi.qc + pi.damaged + pi.lost + out);
  });

  it("bulk counts never go negative", async () => {
    await expect(walk([bulk("EQ-002", 43)])).rejects.toThrow(/สต็อก/);
  });
});
