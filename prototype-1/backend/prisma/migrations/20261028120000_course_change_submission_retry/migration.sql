ALTER TABLE "course_change_requests" ADD COLUMN "client_request_id" UUID;
CREATE UNIQUE INDEX "course_change_requests_student_id_client_request_id_key"
ON "course_change_requests" ("student_id", "client_request_id");
