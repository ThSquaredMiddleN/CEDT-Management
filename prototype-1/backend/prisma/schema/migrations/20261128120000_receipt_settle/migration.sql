-- AlterTable
ALTER TABLE "receipt_checks" ADD COLUMN     "file_id" UUID,
ADD COLUMN     "ocr_name" TEXT,
ADD COLUMN     "settle_note" TEXT,
ADD COLUMN     "settled_at" TIMESTAMPTZ(6),
ADD COLUMN     "settled_by" UUID,
ADD COLUMN     "settlement" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "receipt_checks_file_id_key" ON "receipt_checks"("file_id");
