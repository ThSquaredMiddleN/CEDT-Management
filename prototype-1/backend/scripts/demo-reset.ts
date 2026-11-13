import { prisma } from "../src/db.js";

/**
 * Resets ONLY the live-demo request so the presentation can be repeated
 * (docs/course-change/DEMO-GUIDE.md §L).
 *
 *   npm run demo:reset              # dry run: shows what would be removed
 *   npm run demo:reset -- --apply   # removes it
 *
 * Scope: Course Change requests of the demo student for the demo course in the active term,
 * plus their audit events and notifications. Users, enrollments, the catalog, terms, windows,
 * announcements, the seeded scenario requests and all LabSync booking data are never touched.
 */

const DEMO_STUDENT = "student@cedt.edu";
const DEMO_COURSE = "2110423"; // วิศวกรรมซอฟต์แวร์

/** Seeded test accounts — the only students this script will ever act on. */
const TEST_STUDENTS = new Set(["student@cedt.edu", "student2@cedt.edu", "student3@cedt.edu"]);

const apply = process.argv.includes("--apply");

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing to run against non-local database host "${url.hostname}"`);
  }
  console.log(`Database: ${url.pathname.slice(1)} on ${url.hostname}:${url.port} (${apply ? "APPLY" : "dry run"})`);

  if (!TEST_STUDENTS.has(DEMO_STUDENT)) throw new Error("Demo student is not a seeded test account");

  const [student, course, term] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: DEMO_STUDENT } }),
    prisma.course.findUniqueOrThrow({ where: { code: DEMO_COURSE } }),
    prisma.term.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  if (student.role !== "student") throw new Error(`${DEMO_STUDENT} is not a student account`);
  if (!course.catalogSource) throw new Error(`${DEMO_COURSE} is not a CEDT catalog course`);

  const targets = await prisma.courseChangeRequest.findMany({
    where: { studentId: student.id, courseId: course.id, termId: term.id },
    include: { _count: { select: { events: true, notifications: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (targets.length === 0) {
    console.log(`Nothing to reset: ${DEMO_STUDENT} has no request for ${DEMO_COURSE} ${course.name}.`);
    return;
  }

  for (const r of targets) {
    console.log(
      `  ${r.requestNo}  ${r.requestType} ${DEMO_COURSE}  status=${r.status}  ` +
        `events=${r._count.events}  notifications=${r._count.notifications}`,
    );
  }
  if (!apply) {
    console.log("Dry run — re-run with `npm run demo:reset -- --apply` to remove the request(s) above.");
    return;
  }

  const ids = targets.map((r) => r.id);
  const result = await prisma.$transaction(async (tx) => {
    // Children first; only notifications that belong to these requests (never booking ones).
    const notifications = await tx.notification.deleteMany({
      where: { courseChangeRequestId: { in: ids }, bookingId: null },
    });
    const events = await tx.courseChangeEvent.deleteMany({ where: { requestId: { in: ids } } });
    const requests = await tx.courseChangeRequest.deleteMany({ where: { id: { in: ids } } });
    if (requests.count !== ids.length) throw new Error("Request count changed during reset — rolled back");
    return { notifications: notifications.count, events: events.count, requests: requests.count };
  });

  console.log(
    `Removed ${result.requests} request(s), ${result.events} event(s), ${result.notifications} notification(s). ` +
      `${DEMO_COURSE} is selectable again for ${DEMO_STUDENT}.`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
