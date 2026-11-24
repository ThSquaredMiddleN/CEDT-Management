ALTER TYPE course_change_event_type ADD VALUE 'workflow_updated';
ALTER TABLE course_change_requests ADD COLUMN workflow_version integer NOT NULL DEFAULT 1,
 ADD COLUMN phase text, ADD COLUMN workflow_plan jsonb, ADD COLUMN revision integer NOT NULL DEFAULT 0;
CREATE TABLE course_change_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), term_id uuid NOT NULL REFERENCES terms(id),
 course_id uuid NOT NULL REFERENCES courses(id), section text NOT NULL DEFAULT '*',
 request_type course_change_type NOT NULL, label text NOT NULL, format text NOT NULL,
 opens_on date NOT NULL, closes_on date NOT NULL, final_on date,
 flow course_change_flow NOT NULL, needs_signature boolean NOT NULL, needs_reg boolean NOT NULL,
 needs_pi boolean NOT NULL, needs_merge boolean NOT NULL, published boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (opens_on <= closes_on), CHECK (format IN ('block','full_term'))
);
CREATE INDEX course_change_schedules_term_id_course_id_request_type_idx ON course_change_schedules(term_id,course_id,request_type);
CREATE TABLE course_change_files (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES course_change_requests(id) ON DELETE CASCADE,
 kind text NOT NULL, filename text NOT NULL, sha256 text NOT NULL, data bytea NOT NULL,
 uploader_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_change_files_request_id_created_at_idx ON course_change_files(request_id,created_at);
