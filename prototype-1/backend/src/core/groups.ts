import type { GroupMemberRole, GroupType } from "@prisma/client";
import type { Tx } from "../db.js";
import { conflict, isUniqueViolation, validation } from "../lib/errors.js";

const GROUP_TYPES: readonly string[] = ["course_section", "club", "project", "personal"];
const ROLES: readonly string[] = ["member", "leader"];

/** Active groups the student belongs to, optionally limited to one term, ordered by name. */
export async function groupsOfStudent(tx: Tx, studentNo: string, termId?: string) {
  const memberships = await tx.groupMember.findMany({
    where: { studentNo, group: { isActive: true, ...(termId === undefined ? {} : { termId }) } },
    include: { group: true },
    orderBy: { group: { name: "asc" } },
  });
  return memberships.map(({ group, role }) => ({
    id: group.id,
    type: group.type,
    name: group.name,
    courseId: group.courseId,
    termId: group.termId,
    section: group.section,
    role,
  }));
}

export interface ImportGroupRow {
  row: number;
  action: "create" | "update" | "unchanged" | "error";
  message: string;
  /** Null for error rows, where the account lookup was not reached. */
  hasAccount: boolean | null;
}

export interface ImportGroupsResult {
  dryRun: boolean;
  summary: {
    create: number;
    update: number;
    unchanged: number;
    error: number;
    groupsCreated: number;
    /** Valid rows whose student has no active account yet (not an error). */
    noAccount: number;
  };
  rows: ImportGroupRow[];
}

interface ParsedRow {
  type: GroupType;
  name: string;
  courseId: string | null;
  termId: string | null;
  section: string | null;
  studentNo: string;
  role: GroupMemberRole;
}

/** A group the file refers to: either found in the database or new (created at write time). */
interface GroupRef {
  key: string;
  /** Null for a new group until it is written. */
  id: string | null;
  isNew: boolean;
  data: { type: GroupType; name: string; courseId: string | null; termId: string | null; section: string | null };
}

interface MemberWrite {
  group: GroupRef;
  studentNo: string;
  role: GroupMemberRole;
  action: "create" | "update";
}

interface Lookups {
  /** "academicYear/termNumber" -> term id, or null when no such term. */
  terms: Map<string, string | null>;
  /** courseCode -> course id, or null when no such course. */
  courses: Map<string, string | null>;
  /** Student numbers in the file that have an active account (one query for the whole file). */
  accounts: Set<string>;
}

/** Whole numbers that fit both Int and SmallInt columns. */
const isSmallInt = (s: string): boolean => /^\d+$/.test(s) && Number(s) <= 32767;

async function cached(
  map: Map<string, string | null>,
  key: string,
  load: () => Promise<string | null>,
): Promise<string | null> {
  if (!map.has(key)) map.set(key, await load());
  return map.get(key) ?? null;
}

/** Checks one CSV row. Returns the parsed row, or the error message for the row. */
async function parseRow(
  tx: Tx,
  rec: Record<string, string>,
  lookups: Lookups,
): Promise<ParsedRow | string> {
  const get = (k: string) => (rec[k] ?? "").trim();
  const type = get("type");
  // Collapse inner spaces so "Group  09" and "Group 09" are one group (matched case-insensitively below).
  const name = get("name").replace(/\s+/g, " ");
  const courseCode = get("courseCode");
  const academicYear = get("academicYear");
  const termNumber = get("termNumber");
  const studentNo = get("studentNo");
  const role = get("role") || "member";
  const section = get("section") || null;

  if (!GROUP_TYPES.includes(type)) return `type '${type}' must be course_section|club|project|personal`;
  if (!name) return "name is required";
  if (!/^\d{10}$/.test(studentNo)) return `studentNo '${studentNo}' must be 10 digits`;
  if (!ROLES.includes(role)) return `role '${role}' must be member|leader`;
  if ((academicYear === "") !== (termNumber === "")) {
    return "academicYear and termNumber must both be given, or both left empty";
  }
  if (academicYear && !(isSmallInt(academicYear) && isSmallInt(termNumber))) {
    return "academicYear and termNumber must be whole numbers";
  }

  let termId: string | null = null;
  if (academicYear) {
    const termKey = `${academicYear}/${termNumber}`;
    termId = await cached(lookups.terms, termKey, async () =>
      (
        await tx.term.findUnique({
          where: {
            academicYear_termNumber: { academicYear: Number(academicYear), termNumber: Number(termNumber) },
          },
          select: { id: true },
        })
      )?.id ?? null,
    );
    if (!termId) return `term ${termKey} does not exist`;
  }

  let courseId: string | null = null;
  if (courseCode) {
    courseId = await cached(lookups.courses, courseCode, async () =>
      (await tx.course.findUnique({ where: { code: courseCode }, select: { id: true } }))?.id ?? null,
    );
    if (!courseId) return `courseCode '${courseCode}' matches no course`;
  }

  if (type === "course_section" && (!courseId || !termId)) {
    return "course_section needs courseCode, academicYear and termNumber";
  }

  return {
    type: type as GroupType,
    name,
    courseId,
    termId,
    section,
    studentNo,
    role: role as GroupMemberRole,
  };
}

/** Active accounts among the file's well-formed student numbers, in one query. */
async function loadAccounts(tx: Tx, records: Record<string, string>[]): Promise<Set<string>> {
  const numbers = [...new Set(records.map((r) => (r.studentNo ?? "").trim()).filter((n) => /^\d{10}$/.test(n)))];
  if (numbers.length === 0) return new Set();
  const users = await tx.user.findMany({
    where: { studentNo: { in: numbers }, isActive: true },
    select: { studentNo: true },
  });
  return new Set(users.map((u) => u.studentNo as string));
}

/**
 * Adds or updates group members from a CSV (one row = one member). Only adds and updates; never removes.
 * With dryRun it writes nothing. Otherwise any error row aborts before the first write; the caller wraps
 * this in a transaction.
 */
export async function importGroups(
  tx: Tx,
  records: Record<string, string>[],
  opts: { dryRun: boolean },
): Promise<ImportGroupsResult> {
  const rows: ImportGroupRow[] = [];
  const lookups: Lookups = { terms: new Map(), courses: new Map(), accounts: await loadAccounts(tx, records) };
  /** groupId -> studentNo -> role, loaded once per existing group. */
  const members = new Map<string, Map<string, GroupMemberRole>>();
  /** Keyed by (termId, courseId, section, name): existing groups and groups new in this file. */
  const groups = new Map<string, GroupRef>();
  const writes: MemberWrite[] = [];
  /** "groupKey|studentNo" of every valid row so far, to catch a student listed twice. */
  const seen = new Set<string>();
  const inactiveKeys = new Set<string>();

  for (const [i, rec] of records.entries()) {
    const row = i + 2; // header is line 1
    const parsed = await parseRow(tx, rec, lookups);
    if (typeof parsed === "string") {
      rows.push({ row, action: "error", message: parsed, hasAccount: null });
      continue;
    }

    const { studentNo, role, name } = parsed;
    const key = JSON.stringify([parsed.termId, parsed.courseId, parsed.section, name.toLowerCase()]);
    if (seen.has(`${key}|${studentNo}`)) {
      rows.push({ row, action: "error", message: `${studentNo} is already listed in ${name} earlier in this file`, hasAccount: null });
      continue;
    }
    seen.add(`${key}|${studentNo}`);

    let group = groups.get(key);
    if (!group) {
      // Matches inactive groups too (the unique key covers them); rows for one are reported as errors below.
      const found = await tx.group.findFirst({
        where: {
          termId: parsed.termId,
          courseId: parsed.courseId,
          section: parsed.section,
          name: { equals: name, mode: "insensitive" },
        },
      });
      group = found
        ? { key, id: found.id, isNew: false, data: { type: found.type, name: found.name, courseId: found.courseId, termId: found.termId, section: found.section } }
        : { key, id: null, isNew: true, data: { type: parsed.type, name, courseId: parsed.courseId, termId: parsed.termId, section: parsed.section } };
      groups.set(key, group);
      if (found && !found.isActive) inactiveKeys.add(key);
      if (found) {
        const rows = await tx.groupMember.findMany({ where: { groupId: found.id }, select: { studentNo: true, role: true } });
        members.set(found.id, new Map(rows.map((m) => [m.studentNo, m.role])));
      }
    }
    if (inactiveKeys.has(key)) {
      rows.push({ row, action: "error", message: `${name} is inactive; reactivate it before adding members`, hasAccount: null });
      continue;
    }
    if (group.data.type !== parsed.type) {
      rows.push({ row, action: "error", message: `${name} already exists as type ${group.data.type}, not ${parsed.type}`, hasAccount: null });
      continue;
    }

    const existingRole = group.id ? members.get(group.id)?.get(studentNo) : undefined;
    const existing = existingRole === undefined ? null : { role: existingRole };
    const account = lookups.accounts.has(studentNo);
    const noAccount = account ? "" : " (no account yet)";

    if (!existing) {
      writes.push({ group, studentNo, role, action: "create" });
      rows.push({ row, action: "create", message: `${studentNo} added to ${name}${noAccount}`, hasAccount: account });
    } else if (existing.role !== role) {
      writes.push({ group, studentNo, role, action: "update" });
      rows.push({
        row,
        action: "update",
        message: `${studentNo} role changes from ${existing.role} to ${role} in ${name}${noAccount}`,
        hasAccount: account,
      });
    } else {
      rows.push({ row, action: "unchanged", message: `${studentNo} already in ${name} as ${role}${noAccount}`, hasAccount: account });
    }
  }

  const count = (action: ImportGroupRow["action"]) => rows.filter((r) => r.action === action).length;
  const summary = {
    create: count("create"),
    update: count("update"),
    unchanged: count("unchanged"),
    error: count("error"),
    groupsCreated: [...groups.values()].filter((g) => g.isNew).length,
    noAccount: rows.filter((r) => r.action !== "error" && r.hasAccount === false).length,
  };

  if (opts.dryRun) return { dryRun: true, summary, rows };
  // Any error fails the whole import; nothing has been written yet at this point.
  if (summary.error > 0) {
    throw validation("Import failed — fix the reported rows and try again", rows);
  }

  for (const group of groups.values()) {
    if (!group.isNew) continue;
    try {
      const created = await tx.group.create({ data: { ...group.data, createdById: null } });
      group.id = created.id;
    } catch (e) {
      // Another import created the same group after this one checked (unique key, NULLS NOT DISTINCT).
      if (isUniqueViolation(e)) throw conflict(`${group.data.name} was created by another import just now; run the import again`);
      throw e;
    }
  }

  const creates = writes.filter((w) => w.action === "create");
  if (creates.length > 0) {
    await tx.groupMember.createMany({
      data: creates.map((w) => ({ groupId: w.group.id as string, studentNo: w.studentNo, role: w.role })),
    });
  }
  for (const w of writes.filter((w) => w.action === "update")) {
    await tx.groupMember.update({
      where: { groupId_studentNo: { groupId: w.group.id as string, studentNo: w.studentNo } },
      data: { role: w.role },
    });
  }

  return { dryRun: false, summary, rows };
}
