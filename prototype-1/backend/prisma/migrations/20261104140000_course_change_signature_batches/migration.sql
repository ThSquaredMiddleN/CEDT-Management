CREATE TABLE course_change_signature_batches (
 id uuid PRIMARY KEY, term_id uuid NOT NULL REFERENCES terms(id), course_id uuid NOT NULL REFERENCES courses(id),
 actor_id uuid NOT NULL REFERENCES users(id), recipient text NOT NULL, sent_on date NOT NULL,
 note text NOT NULL, payload_hash text NOT NULL, summary jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX course_change_signature_batches_term_id_created_at_idx ON course_change_signature_batches(term_id,created_at DESC);
