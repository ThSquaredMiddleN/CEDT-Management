-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('staff');

-- CreateEnum
CREATE TYPE "room_type" AS ENUM ('lecture', 'lab', 'hardware', 'meeting');

-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "booking_type" AS ENUM ('recurring', 'one_off');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('created', 'approved', 'rejected', 'withdrawn', 'cancelled', 'moved_occurrence', 'moved_series', 'edited', 'occurrence_cancelled');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('request_submitted', 'request_approved', 'request_rejected', 'booking_moved', 'booking_cancelled_by_instructor', 'request_withdrawn');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title_prefix" TEXT,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "building_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "room_type" "room_type" NOT NULL,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_instructor_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year" INTEGER NOT NULL,
    "term_number" SMALLINT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_no" TEXT NOT NULL,
    "status" "booking_status" NOT NULL DEFAULT 'pending',
    "booking_type" "booking_type" NOT NULL,
    "term_id" UUID NOT NULL,
    "course_id" UUID,
    "title" TEXT NOT NULL,
    "section" TEXT,
    "instructor_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "day_of_week" SMALLINT,
    "start_date" DATE,
    "end_date" DATE,
    "one_off_date" DATE,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "student_count" INTEGER NOT NULL,
    "note" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "cancel_reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_occurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "end_time" TIME(0) NOT NULL,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "is_blocking" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "booking_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_events" (
    "id" BIGSERIAL NOT NULL,
    "booking_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "event_type" "event_type" NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "message" TEXT NOT NULL,
    "booking_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_email_at" TIMESTAMPTZ(6),
    "delivered_line_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_code_key" ON "buildings"("code");

-- CreateIndex
CREATE INDEX "rooms_building_id_idx" ON "rooms"("building_id");

-- CreateIndex
CREATE INDEX "rooms_is_active_idx" ON "rooms"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_building_id_name_key" ON "rooms"("building_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "terms_academic_year_term_number_key" ON "terms"("academic_year", "term_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_request_no_key" ON "bookings"("request_no");

-- CreateIndex
CREATE INDEX "bookings_status_created_at_idx" ON "bookings"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bookings_requested_by_created_at_idx" ON "bookings"("requested_by", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bookings_instructor_id_idx" ON "bookings"("instructor_id");

-- CreateIndex
CREATE INDEX "bookings_term_id_idx" ON "bookings"("term_id");

-- CreateIndex
CREATE INDEX "booking_occurrences_booking_id_idx" ON "booking_occurrences"("booking_id");

-- CreateIndex
CREATE INDEX "booking_occurrences_room_id_date_idx" ON "booking_occurrences"("room_id", "date");

-- CreateIndex
CREATE INDEX "booking_occurrences_date_idx" ON "booking_occurrences"("date");

-- CreateIndex
CREATE INDEX "booking_events_booking_id_created_at_idx" ON "booking_events"("booking_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_default_instructor_id_fkey" FOREIGN KEY ("default_instructor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_occurrences" ADD CONSTRAINT "booking_occurrences_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_occurrences" ADD CONSTRAINT "booking_occurrences_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_events" ADD CONSTRAINT "booking_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
