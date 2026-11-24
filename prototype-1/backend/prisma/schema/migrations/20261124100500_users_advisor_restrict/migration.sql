-- users.advisor_id: refuse deleting an advisor who still has advisees (plan 3.2), instead of clearing the link.
ALTER TABLE "users" DROP CONSTRAINT "users_advisor_id_fkey";
ALTER TABLE "users" ADD CONSTRAINT "users_advisor_id_fkey" FOREIGN KEY ("advisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
