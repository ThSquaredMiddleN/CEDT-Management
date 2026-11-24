-- Moves the LINE link out of users into the LINE module's own table (shared-objects plan 4.1).
-- The data is copied before the old columns are dropped, in one file (one transaction).

-- CreateTable
CREATE TABLE "line_accounts" (
    "user_id" UUID NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "line_accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_accounts_line_user_id_key" ON "line_accounts"("line_user_id");

-- AddForeignKey
ALTER TABLE "line_accounts" ADD CONSTRAINT "line_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Move existing links.
INSERT INTO "line_accounts" ("user_id", "line_user_id", "linked_at")
SELECT "id", "line_user_id", COALESCE("line_linked_at", now()) FROM "users" WHERE "line_user_id" IS NOT NULL;

-- DropIndex
DROP INDEX "users_line_user_id_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "line_linked_at",
DROP COLUMN "line_user_id";
