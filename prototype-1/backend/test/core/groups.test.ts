import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { groupNameKey, groupsOfStudent } from "../../src/core/groups.js";

/** Made-up student numbers and group names only. Every group this file creates ends with SUFFIX. */
const SUFFIX = randomUUID().slice(0, 8);
const STUDENT = "6699990201";
const NAME_TERM1 = `Core A ${SUFFIX}`;
const NAME_TERM2 = `Core B ${SUFFIX}`;
const NAME_INACTIVE = `Core C ${SUFFIX}`;

async function cleanup(): Promise<void> {
  await prisma.groupMember.deleteMany({ where: { group: { name: { endsWith: SUFFIX } } } });
  await prisma.group.deleteMany({ where: { name: { endsWith: SUFFIX } } });
}

beforeAll(async () => {
  await cleanup();
  const term1 = await prisma.term.findUniqueOrThrow({
    where: { academicYear_termNumber: { academicYear: 2026, termNumber: 1 } },
  });
  const term2 = await prisma.term.findUniqueOrThrow({
    where: { academicYear_termNumber: { academicYear: 2025, termNumber: 2 } },
  });
  const course = await prisma.course.findUniqueOrThrow({ where: { code: "CEDT101" } });

  await prisma.group.create({
    data: {
      type: "course_section",
      name: NAME_TERM1,
      nameKey: groupNameKey(NAME_TERM1),
      courseId: course.id,
      termId: term1.id,
      section: "01",
      members: { create: [{ studentNo: STUDENT, role: "leader" }] },
    },
  });
  await prisma.group.create({
    data: {
      type: "club",
      name: NAME_TERM2,
      nameKey: groupNameKey(NAME_TERM2),
      termId: term2.id,
      members: { create: [{ studentNo: STUDENT, role: "member" }] },
    },
  });
  await prisma.group.create({
    data: {
      type: "club",
      name: NAME_INACTIVE,
      nameKey: groupNameKey(NAME_INACTIVE),
      isActive: false,
      members: { create: [{ studentNo: STUDENT, role: "member" }] },
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("groupsOfStudent", () => {
  it("returns active groups with the member's role, ordered by name", async () => {
    const groups = await groupsOfStudent(prisma, STUDENT);
    expect(groups.map((g) => g.name)).toEqual([NAME_TERM1, NAME_TERM2]);
    expect(groups[0]).toMatchObject({ type: "course_section", section: "01", role: "leader" });
    expect(groups[1]).toMatchObject({ type: "club", role: "member" });
  });

  it("leaves out inactive groups", async () => {
    const groups = await groupsOfStudent(prisma, STUDENT);
    expect(groups.some((g) => g.name === NAME_INACTIVE)).toBe(false);
  });

  it("filters by term when termId is given", async () => {
    const term1 = await prisma.term.findUniqueOrThrow({
      where: { academicYear_termNumber: { academicYear: 2026, termNumber: 1 } },
    });
    const groups = await groupsOfStudent(prisma, STUDENT, term1.id);
    expect(groups.map((g) => g.name)).toEqual([NAME_TERM1]);
    expect(groups[0]?.termId).toBe(term1.id);
  });

  it("returns an empty list for a student with no groups", async () => {
    expect(await groupsOfStudent(prisma, "6699990202")).toEqual([]);
  });
});

describe("groupNameKey", () => {
  it("trims, collapses inner whitespace and lower-cases", () => {
    expect(groupNameKey("Group 09")).toBe("group 09");
    expect(groupNameKey("  group   09 ")).toBe("group 09");
    expect(groupNameKey("GROUP\t09\n")).toBe("group 09");
  });

  it("gives the same key for names that differ only in case or spacing", () => {
    expect(groupNameKey("Group 09")).toBe(groupNameKey("group  09"));
    expect(groupNameKey("Group 09")).not.toBe(groupNameKey("Group 10"));
  });
});
