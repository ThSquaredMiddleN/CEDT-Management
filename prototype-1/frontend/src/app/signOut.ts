import { logout } from "@/api/endpoints";
import { clearStudentDrafts } from "@/features/course-change/draft";

/**
 * Signs out from any layout. Ends the server session, drops unsent Course Change drafts, then
 * reloads into /login. The full reload clears every cached query and poll at once: clearing the
 * cache in place races React Router's transition, so the old page re-renders signed-out and
 * RequireAuth sends the user to /login?next=<old page> (or, with qc.clear(), back into a 401 loop).
 */
export async function signOut(): Promise<void> {
  await logout().catch(() => undefined);
  try {
    clearStudentDrafts(sessionStorage);
  } catch {
    /* Storage may be disabled. */
  }
  window.location.replace("/login");
}
