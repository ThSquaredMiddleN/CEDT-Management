// Gives a role to an existing account: npm run roles:grant -- <email> <roleKey>
// Used once after deploying step 5a to give it_admin to the first administrator.
import { PrismaClient } from "@prisma/client";
import { assignRole } from "../src/core/permissions.js";

const [email, roleKey] = process.argv.slice(2);
if (!email || !roleKey) {
  console.error("Usage: npm run roles:grant -- <email> <roleKey>");
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("No account with that email");
  await assignRole(prisma, user.id, roleKey);
  console.log(`Gave role ${roleKey}.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
