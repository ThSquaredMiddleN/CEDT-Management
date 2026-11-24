import type { PrismaClient } from "@prisma/client";

/** Dev and demo only (shared plan 2.11). Every test account ends with @test.local. */
export const TEST_PASSWORD = "test1234";
export const TEST_EMAIL_DOMAIN = "@test.local";

export const TEST_ACCOUNTS = [
  { email: "student@test.local", name: "นิสิต ทดสอบ", studentNo: "6800000001", roles: [] },
  { email: "teacher@test.local", name: "อาจารย์ ทดสอบ", studentNo: null, roles: ["teacher"] },
  { email: "staff@test.local", name: "เจ้าหน้าที่ ทดสอบ", studentNo: null, roles: ["staff"] },
  { email: "itadmin@test.local", name: "IT Admin ทดสอบ", studentNo: null, roles: ["it_admin"] },
  { email: "audit@test.local", name: "Audit ทดสอบ", studentNo: null, roles: ["audit"] },
  { email: "norole@test.local", name: "ไม่มีบทบาท ทดสอบ", studentNo: null, roles: [] },
] as const;

/** Gives a user a role by key. Idempotent; never stores the automatic "student" role. */
export async function assignRole(prisma: PrismaClient, userId: string, roleKey: string): Promise<void> {
  if (roleKey === "student") throw new Error("The student role is automatic; never assign it");
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.userRoleAssignment.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    create: { userId, roleId: role.id },
    update: {},
  });
}

export async function seedTestAccounts(prisma: PrismaClient, hash: (pw: string) => Promise<string>): Promise<void> {
  const passwordHash = await hash(TEST_PASSWORD);
  for (const a of TEST_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, studentNo: a.studentNo, isActive: true },
      // `role` is still required until Task A7 drops the column.
      create: { email: a.email, name: a.name, studentNo: a.studentNo, passwordHash, role: a.studentNo ? "student" : "staff" },
    });
    for (const key of a.roles) await assignRole(prisma, user.id, key);
  }
  console.log(`Seed: ${TEST_ACCOUNTS.length} test accounts (${TEST_EMAIL_DOMAIN}).`);
}
