/**
 * Creates one PENDING one-off booking on the seeded data, so the "New request" (request_submitted) notification
 * can be tried. The app cannot do this itself: every staff booking is auto-approved, and only the seed makes
 * pending rows. The new request then shows in the dashboard queue, where it can be approved or rejected.
 *
 * Usage: npm run line:pending -- [--as <email>] [--date YYYY-MM-DD] [--start HH:MM] [--end HH:MM]
 * Defaults: --as somchai@cedt.edu, --date a week from today, 16:00-17:00. Course CEDT499, room E12-501,
 * instructor Somchai. Pick another slot if it clashes with an approved booking (409).
 */
import { parseArgs } from "node:util";
import { prisma } from "../src/db.js";
import { createBooking } from "../src/modules/bookings/service.js";
import type { SessionUser } from "../src/plugins/auth.js";

const { values } = parseArgs({
  options: {
    as: { type: "string", default: "somchai@cedt.edu" },
    date: { type: "string" },
    start: { type: "string", default: "16:00" },
    end: { type: "string", default: "17:00" },
  },
});

const inAWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

try {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: values.as } });
  const instructor = await prisma.user.findUniqueOrThrow({ where: { email: "somchai@cedt.edu" } });
  const term = await prisma.term.findFirstOrThrow({ where: { isActive: true } });
  const course = await prisma.course.findFirstOrThrow({ where: { code: "CEDT499" } });
  const room = await prisma.room.findFirstOrThrow({ where: { name: "E12-501" } });

  const actor: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    titlePrefix: user.titlePrefix,
  };
  const booking = await createBooking(
    {
      bookingType: "one_off",
      termId: term.id,
      courseId: course.id,
      instructorId: instructor.id,
      roomId: room.id,
      oneOffDate: values.date ?? inAWeek,
      startTime: values.start!,
      endTime: values.end!,
      studentCount: 10,
      section: "1",
      note: "LINE test",
    },
    actor,
    { autoApprove: false },
  );
  console.log(`Created ${booking.requestNo} (pending), requested by ${user.email}`);
} finally {
  await prisma.$disconnect();
}
