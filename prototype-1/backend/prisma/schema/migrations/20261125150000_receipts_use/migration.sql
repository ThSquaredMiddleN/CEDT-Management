-- Students may submit their own tuition receipt (POST /receipts/mine, GET /receipts/mine).
-- Granted to the student role the same way line.use was in 20261124130000_core_permissions.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."id", p.permission
FROM "roles" r
JOIN (VALUES
  ('student', 'receipts.use')
) AS p(role_key, permission) ON p.role_key = r."key";
