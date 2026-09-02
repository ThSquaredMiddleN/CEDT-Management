import { parse } from "csv-parse/sync";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { prisma } from "../../db.js";
import { badRequest, validation } from "../../lib/errors.js";

interface RowReport {
  row: number;
  action: "create" | "update" | "error";
  message: string;
}

/** Prototype simplification (§1.5): the whole (tiny) file is buffered, not streamed. */
async function readCsv(req: FastifyRequest): Promise<Record<string, string>[]> {
  const file = await req.file();
  if (!file) throw badRequest("A `file` field is required");
  const buf = await file.toBuffer();
  try {
    return parse(buf, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    throw badRequest("Could not parse the CSV file");
  }
}

const isDryRun = (req: FastifyRequest): boolean =>
  (req.query as { dryRun?: string }).dryRun === "true";

export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post("/import/courses", { config: { auth: "admin" } }, async (req) => {
    const records = await readCsv(req);
    const dryRun = isDryRun(req);

    const rows: RowReport[] = [];
    const upserts: { code: string; name: string; defaultInstructorId: string | null }[] = [];

    for (const [i, rec] of records.entries()) {
      const lineNo = i + 2; // header is line 1
      const code = rec.code?.trim();
      const name = rec.name?.trim();
      const email = rec.defaultInstructorEmail?.trim();

      if (!code || !name) {
        rows.push({ row: lineNo, action: "error", message: "code and name are required" });
        continue;
      }

      let defaultInstructorId: string | null = null;
      if (email) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          rows.push({
            row: lineNo,
            action: "error",
            message: `defaultInstructorEmail '${email}' matches no user`,
          });
          continue;
        }
        defaultInstructorId = user.id;
      }

      const existing = await prisma.course.findUnique({ where: { code } });
      rows.push({
        row: lineNo,
        action: existing ? "update" : "create",
        message: existing
          ? `${code} exists — name will be updated`
          : `${code} will be created`,
      });
      upserts.push({ code, name, defaultInstructorId });
    }

    const summary = {
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      error: rows.filter((r) => r.action === "error").length,
    };

    if (dryRun) return { dryRun: true, summary, rows };
    // Any error fails the whole import — all-or-nothing, in one transaction.
    if (summary.error > 0) {
      throw validation("Import failed — fix the reported rows and try again", rows);
    }

    await prisma.$transaction(
      upserts.map((u) =>
        prisma.course.upsert({
          where: { code: u.code },
          create: u,
          update: { name: u.name, defaultInstructorId: u.defaultInstructorId },
        }),
      ),
    );
    return { dryRun: false, summary, rows };
  });

  app.post("/import/rooms", { config: { auth: "admin" } }, async (req) => {
    const records = await readCsv(req);
    const dryRun = isDryRun(req);

    const rows: RowReport[] = [];
    const upserts: {
      buildingId: string;
      name: string;
      capacity: number;
      roomType: "lecture" | "lab" | "hardware" | "meeting";
      equipment: string[];
    }[] = [];

    for (const [i, rec] of records.entries()) {
      const lineNo = i + 2;
      const buildingCode = rec.buildingCode?.trim();
      const name = rec.name?.trim();
      const capacity = Number(rec.capacity);
      const type = rec.type?.trim();

      if (!buildingCode || !name) {
        rows.push({ row: lineNo, action: "error", message: "buildingCode and name are required" });
        continue;
      }
      if (!Number.isInteger(capacity) || capacity < 1) {
        rows.push({ row: lineNo, action: "error", message: "capacity must be a positive integer" });
        continue;
      }
      if (!["lecture", "lab", "hardware", "meeting"].includes(type ?? "")) {
        rows.push({
          row: lineNo,
          action: "error",
          message: `type '${type}' must be lecture|lab|hardware|meeting`,
        });
        continue;
      }

      const building = await prisma.building.findUnique({ where: { code: buildingCode } });
      if (!building) {
        rows.push({
          row: lineNo,
          action: "error",
          message: `buildingCode '${buildingCode}' matches no building`,
        });
        continue;
      }

      const existing = await prisma.room.findUnique({
        where: { buildingId_name: { buildingId: building.id, name } },
      });
      rows.push({
        row: lineNo,
        action: existing ? "update" : "create",
        message: existing ? `${name} exists — will be updated` : `${name} will be created`,
      });
      upserts.push({
        buildingId: building.id,
        name,
        capacity,
        roomType: type as "lecture" | "lab" | "hardware" | "meeting",
        equipment: (rec.equipment ?? "").split(";").map((s) => s.trim()).filter(Boolean),
      });
    }

    const summary = {
      create: rows.filter((r) => r.action === "create").length,
      update: rows.filter((r) => r.action === "update").length,
      error: rows.filter((r) => r.action === "error").length,
    };

    if (dryRun) return { dryRun: true, summary, rows };
    if (summary.error > 0) {
      throw validation("Import failed — fix the reported rows and try again", rows);
    }

    await prisma.$transaction(
      upserts.map((u) =>
        prisma.room.upsert({
          where: { buildingId_name: { buildingId: u.buildingId, name: u.name } },
          create: u,
          update: { capacity: u.capacity, roomType: u.roomType, equipment: u.equipment },
        }),
      ),
    );
    return { dryRun: false, summary, rows };
  });
}
