import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/db.js";
import { findUserByStudentNo } from "../../src/core/users.js";

/** Made-up inactive student, created here and deleted afterwards. */
const INACTIVE_NO = "6699990001";
const INACTIVE_EMAIL = "core-users-inactive@example.test";

async function cleanup(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: INACTIVE_EMAIL } });
}

beforeAll(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      email: INACTIVE_EMAIL,
      name: "Made-up inactive student",
      role: "student",
      studentNo: INACTIVE_NO,
      isActive: false,
    },
  });
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("findUserByStudentNo", () => {
  it("finds the seeded student by student number, without passwordHash", async () => {
    const user = await findUserByStudentNo(prisma, "6630000121");
    expect(user).not.toBeNull();
    expect(user?.email).toBe("student@cedt.edu");
    expect(user?.studentNo).toBe("6630000121");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("returns null for an unknown student number", async () => {
    expect(await findUserByStudentNo(prisma, "6699990999")).toBeNull();
  });

  it("returns null for an inactive user", async () => {
    expect(await findUserByStudentNo(prisma, INACTIVE_NO)).toBeNull();
  });
});
