-- Step 5a: users.role is replaced by roles/user_roles. Every former staff account was given
-- the "staff" role by the core_permissions migration before this column goes.
-- Hand-trimmed from `prisma migrate diff` output: the DROP of booking_occurrences.timeslot (raw-SQL generated column, not in the schema) is removed on purpose.

-- DropIndex
DROP INDEX "users_role_is_active_idx";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role";

-- DropEnum
DROP TYPE "user_role";

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
