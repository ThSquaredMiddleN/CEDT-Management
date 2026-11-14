-- CreateTable
CREATE TABLE "receipt_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "amount" TEXT,
    "payment_status" TEXT,
    "paid_at" TEXT,
    "funding" TEXT,
    "checks" JSONB NOT NULL,
    "verdict" TEXT NOT NULL,
    "checked_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "receipt_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_checks_student_id_term_key" ON "receipt_checks"("student_id", "term");

-- CreateIndex
CREATE INDEX "receipt_checks_reference_idx" ON "receipt_checks"("reference");

-- CreateIndex
CREATE INDEX "receipt_checks_term_idx" ON "receipt_checks"("term");

-- AddForeignKey
ALTER TABLE "receipt_checks" ADD CONSTRAINT "receipt_checks_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
