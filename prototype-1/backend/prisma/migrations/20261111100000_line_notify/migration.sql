-- Hand-trimmed from `prisma migrate diff` output: the DROP of booking_occurrences.timeslot (raw-SQL generated column, not in schema.prisma) is removed on purpose.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "line_linked_at" TIMESTAMPTZ(6),
ADD COLUMN     "line_user_id" TEXT;

-- CreateTable
CREATE TABLE "line_link_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_webhook_events" (
    "webhook_event_id" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_webhook_events_pkey" PRIMARY KEY ("webhook_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_link_tokens_token_hash_key" ON "line_link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "line_link_tokens_line_user_id_idx" ON "line_link_tokens"("line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_line_user_id_key" ON "users"("line_user_id");

