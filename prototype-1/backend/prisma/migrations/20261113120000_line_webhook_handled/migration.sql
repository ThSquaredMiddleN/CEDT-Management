-- AlterTable
ALTER TABLE "line_webhook_events" ADD COLUMN "handled_at" TIMESTAMPTZ(6);

-- Rows written before this column existed were handled when they were received.
UPDATE "line_webhook_events" SET "handled_at" = "received_at";
