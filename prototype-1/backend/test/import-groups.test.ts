import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { groupNameKey } from "../src/core/groups.js";

/**
 * CSV import of course groups. All students are made up, except the seeded student@cedt.edu (6630000121).
 * Every group this file creates ends with SUFFIX and is deleted before and after the run.
 */

const SUFFIX = randomUUID().slice(0, 8);
const SEEDED_STUDENT = "6630000121"; // seeded account (student@cedt.edu)
const NO_ACCOUNT = "6699999921"; // made up, no account
const NO_ACCOUNT_2 = "6699999922"; // made up, no account
const HEADER = "type,name,courseCode,academicYear,termNumber,section,studentNo,role";
const BOUNDARY = "----import-groups-test-boundary";

const name = (tag: string) => `Import ${tag} ${SUFFIX}`;

interface ImportBody {
  dryRun: boolean;
  summary: Record<string, number>;
  rows: { row: number; action: string; message: string; hasAccount: boolean | null }[];
}

interface ErrorBody {
  error: { code: string; message: string; details: unknown[] };
}

let app: FastifyInstance;
let adminCookie: string;
let studentCookie: string;

async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === "labsync_session");
  return `labsync_session=${c!.value}`;
}

async function cleanup(): Promise<void> {
  await prisma.groupMember.deleteMany({ where: { group: { name: { endsWith: SUFFIX } } } });
  await prisma.group.deleteMany({ where: { name: { endsWith: SUFFIX } } });
}

async function groupCount(): Promise<number> {
  return prisma.group.count({ where: { name: { endsWith: SUFFIX } } });
}

beforeAll(async () => {
  await cleanup();
  app = await buildApp();
  await app.ready();
  adminCookie = await login("admin@cedt.edu", "admin1234");
  studentCookie = await login("student@cedt.edu", "student1234");
});

afterAll(async () => {
  await cleanup();
  await app.close();
  await prisma.$disconnect();
});

const line = (...cells: string[]) => cells.join(",");

function upload(csv: string, opts: { dryRun?: boolean; cookie?: string } = {}) {
  const payload = Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="groups.csv"\r\nContent-Type: text/csv\r\n\r\n`,
    ),
    Buffer.from(csv, "utf8"),
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ]);
  return app.inject({
    method: "POST",
    url: `/api/v1/import/groups${opts.dryRun ? "?dryRun=true" : ""}`,
    headers: {
      cookie: opts.cookie ?? adminCookie,
      "x-requested-with": "XMLHttpRequest",
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
    },
    payload,
  });
}

describe("POST /import/groups", () => {
  it("dry run reports actions, hasAccount and summary, and writes nothing", async () => {
    const nameA = name("dry");
    const csv = [
      HEADER,
      line("course_section", nameA, "CEDT101", "2026", "1", "01", SEEDED_STUDENT, "member"),
      line("course_section", nameA, "CEDT101", "2026", "1", "01", NO_ACCOUNT, ""),
      line("course_section", nameA, "CEDT101", "2026", "1", "01", "12345", "member"),
      line("club", name("dry-club"), "NOPE999", "", "", "", SEEDED_STUDENT, "member"),
      line("course_section", name("dry-no-term"), "CEDT101", "", "", "", SEEDED_STUDENT, "member"),
    ].join("\n");

    const res = await upload(csv, { dryRun: true });
    expect(res.statusCode).toBe(200);
    const body = res.json<ImportBody>();

    expect(body.dryRun).toBe(true);
    expect(body.summary).toEqual({
      create: 2,
      update: 0,
      unchanged: 0,
      error: 3,
      groupsCreated: 1,
      noAccount: 1,
    });
    expect(body.rows.map((r) => [r.row, r.action])).toEqual([
      [2, "create"],
      [3, "create"],
      [4, "error"],
      [5, "error"],
      [6, "error"],
    ]);
    expect(body.rows[0]?.hasAccount).toBe(true);
    expect(body.rows[1]?.hasAccount).toBe(false);
    expect(body.rows[1]?.message).toContain("(no account yet)");
    expect(body.rows[2]?.hasAccount).toBeNull();

    expect(await groupCount()).toBe(0);
    expect(await prisma.groupMember.count({ where: { studentNo: NO_ACCOUNT } })).toBe(0);
  });

  it("a real import creates groups and members; a rerun is unchanged; a role change is an update", async () => {
    const nameB = name("real");
    const first = [
      HEADER,
      line("course_section", nameB, "CEDT101", "2026", "1", "01", SEEDED_STUDENT, "member"),
      line("course_section", nameB, "CEDT101", "2026", "1", "01", NO_ACCOUNT_2, "leader"),
    ].join("\n");

    const created = await upload(first);
    expect(created.statusCode).toBe(200);
    const createdBody = created.json<ImportBody>();
    expect(createdBody.dryRun).toBe(false);
    expect(createdBody.summary).toMatchObject({
      create: 2,
      update: 0,
      unchanged: 0,
      error: 0,
      groupsCreated: 1,
      noAccount: 1,
    });

    const groups = await prisma.group.findMany({
      where: { name: nameB },
      include: { members: true },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.createdById).toBeNull();
    expect(groups[0]?.members.map((m) => [m.studentNo, m.role]).sort()).toEqual(
      [
        [NO_ACCOUNT_2, "leader"],
        [SEEDED_STUDENT, "member"],
      ].sort(),
    );

    const rerun = await upload(first);
    expect(rerun.statusCode).toBe(200);
    expect(rerun.json<ImportBody>().summary).toMatchObject({
      create: 0,
      update: 0,
      unchanged: 2,
      error: 0,
      groupsCreated: 0,
    });

    // The file lists only the seeded student as leader. The other member is kept (the import never removes).
    const changed = [
      HEADER,
      line("course_section", nameB, "CEDT101", "2026", "1", "01", SEEDED_STUDENT, "leader"),
    ].join("\n");
    const updated = await upload(changed);
    expect(updated.statusCode).toBe(200);
    const updatedBody = updated.json<ImportBody>();
    expect(updatedBody.summary).toMatchObject({ create: 0, update: 1, unchanged: 0, error: 0 });
    expect(updatedBody.rows[0]?.message).toContain("role changes from member to leader");

    const members = await prisma.groupMember.findMany({ where: { group: { name: nameB } } });
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.studentNo === SEEDED_STUDENT)?.role).toBe("leader");
    expect(members.find((m) => m.studentNo === NO_ACCOUNT_2)?.role).toBe("leader");
  });

  it("a file with one error writes nothing and returns 422 VALIDATION", async () => {
    const nameC = name("bad");
    const csv = [
      HEADER,
      line("club", nameC, "", "", "", "", SEEDED_STUDENT, "member"),
      line("club", nameC, "", "", "", "", "not-a-number", "member"),
    ].join("\n");

    const res = await upload(csv);
    expect(res.statusCode).toBe(422);
    const body = res.json<ErrorBody>();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details).toHaveLength(2);
    expect(await prisma.group.count({ where: { name: nameC } })).toBe(0);
  });

  it("rows for an inactive group or with a different type are errors", async () => {
    const nameI = name("inactive");
    const nameT = name("typed");
    await prisma.group.create({ data: { type: "club", name: nameI, nameKey: groupNameKey(nameI), isActive: false } });
    await prisma.group.create({ data: { type: "club", name: nameT, nameKey: groupNameKey(nameT) } });
    const csv = [
      HEADER,
      line("club", nameI, "", "", "", "", NO_ACCOUNT, "member"),
      line("project", nameT, "", "", "", "", NO_ACCOUNT, "member"),
    ].join("\n");
    const res = await upload(csv, { dryRun: true });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.rows.map((r: { action: string }) => r.action)).toEqual(["error", "error"]);
    expect(body.rows[0].message).toContain("inactive");
    expect(body.rows[1].message).toContain("type club");
  });

  it("matches group names case-insensitively and ignores extra spaces", async () => {
    const base = name("Spelling");
    const csv = [
      HEADER,
      line("club", base, "", "", "", "", NO_ACCOUNT, "member"),
      line("club", base.toLowerCase(), "", "", "", "", NO_ACCOUNT_2, "member"),
      line("club", base.replace(" ", "   "), "", "", "", "", SEEDED_STUDENT, "member"),
    ].join("\n");
    const res = await upload(csv);
    expect(res.statusCode).toBe(200);
    expect(res.json().summary.groupsCreated).toBe(1);
    const groups = await prisma.group.findMany({ where: { name: { equals: base, mode: "insensitive" } }, include: { members: true } });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toHaveLength(3);
  });

  it("two imports racing to create the same group (names differing only in case) leave one group", async () => {
    const base = name("race");
    const first = [HEADER, line("club", base, "", "", "", "", NO_ACCOUNT, "member")].join("\n");
    const second = [HEADER, line("club", base.toLowerCase(), "", "", "", "", NO_ACCOUNT_2, "member")].join("\n");

    const results = await Promise.all([upload(first), upload(second)]);
    const statuses = results.map((r) => r.statusCode).sort();
    // Either the second import saw the first group (both 200), or it lost the race on the unique key (409 CONFLICT).
    expect([[200, 200], [200, 409]]).toContainEqual(statuses);
    const loser = results.find((r) => r.statusCode === 409);
    if (loser) expect(loser.json<ErrorBody>().error.code).toBe("CONFLICT");

    const groups = await prisma.group.findMany({ where: { nameKey: groupNameKey(base) }, include: { members: true } });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toHaveLength(results.filter((r) => r.statusCode === 200).length);
  });

  it("the database refuses a second group whose name differs only in case (same nameKey)", async () => {
    const n = name("case");
    await prisma.group.create({ data: { type: "club", name: n, nameKey: groupNameKey(n) } });
    const lower = n.toLowerCase();
    await expect(
      prisma.group.create({ data: { type: "club", name: lower, nameKey: groupNameKey(lower) } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("the database refuses a second group with the same name and no term (NULLS NOT DISTINCT)", async () => {
    const n = name("nulls");
    await prisma.group.create({ data: { type: "club", name: n, nameKey: groupNameKey(n) } });
    await expect(prisma.group.create({ data: { type: "club", name: n, nameKey: groupNameKey(n) } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("a student gets 403 FORBIDDEN", async () => {
    const csv = [HEADER, line("club", name("student"), "", "", "", "", SEEDED_STUDENT, "member")].join("\n");
    const res = await upload(csv, { cookie: studentCookie });
    expect(res.statusCode).toBe(403);
    expect(res.json<ErrorBody>().error.code).toBe("FORBIDDEN");
    expect(await prisma.group.count({ where: { name: name("student") } })).toBe(0);
  });
});
