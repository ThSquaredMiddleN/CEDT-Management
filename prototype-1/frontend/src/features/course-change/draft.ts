import type { CcType } from "../../api/courseChange.ts";

export const DRAFT_PREFIX = "cedt:course-change:draft:v1:";
export const DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface StudentDraft {
  version: 1;
  type: CcType;
  courseId: string | null;
  reason: string;
  clientRequestId: string;
  attempted: boolean;
  updatedAt: number;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const draftKey = (userId: string, termId: string) => `${DRAFT_PREFIX}${userId}:${termId}`;
export const hasDraftContent = (draft: StudentDraft) => !!draft.courseId || !!draft.reason.trim() || draft.attempted;

export function readDraft(storage: DraftStorage, key: string, now = Date.now()): StudentDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as StudentDraft;
    if (!d || d.version !== 1 || !["drop", "withdraw"].includes(d.type) ||
      (d.courseId !== null && (typeof d.courseId !== "string" || !uuid.test(d.courseId))) ||
      typeof d.reason !== "string" || d.reason.length > 1000 || typeof d.attempted !== "boolean" ||
      typeof d.clientRequestId !== "string" || !uuid.test(d.clientRequestId) ||
      typeof d.updatedAt !== "number" || !Number.isFinite(d.updatedAt) ||
      d.updatedAt > now || now - d.updatedAt > DRAFT_MAX_AGE) {
      storage.removeItem(key);
      return null;
    }
    return hasDraftContent(d) ? d : null;
  } catch { return null; }
}

/** The browser tab owns this draft; never use localStorage for personal request reasons. */
export function saveDraft(storage: DraftStorage, key: string, draft: StudentDraft): boolean {
  try {
    if (hasDraftContent(draft)) storage.setItem(key, JSON.stringify(draft));
    else storage.removeItem(key);
    return true;
  } catch { return false; }
}

export function clearStudentDrafts(storage: Pick<Storage, "length" | "key" | "removeItem">) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys) if (key?.startsWith(DRAFT_PREFIX)) storage.removeItem(key);
}
