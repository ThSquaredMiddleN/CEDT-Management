import { useEffect, useState } from "react";
import type { CcType } from "@/api/courseChange";
import { draftKey, readDraft, saveDraft, type StudentDraft } from "./draft";

function emptyDraft(type: CcType): StudentDraft {
  return { version: 1, type, courseId: null, reason: "", clientRequestId: crypto.randomUUID(), attempted: false, updatedAt: Date.now() };
}

export function useStudentDraft(userId: string, termId: string, defaultType: CcType) {
  const key = draftKey(userId, termId);
  const [initial] = useState(() => {
    try { return readDraft(sessionStorage, key); } catch { return null; }
  });
  const [draft, setDraft] = useState<StudentDraft>(() => initial ?? emptyDraft(defaultType));
  const [storageError, setStorageError] = useState(false);
  const [restored, setRestored] = useState(!!initial);
  useEffect(() => {
    try { setStorageError(!saveDraft(sessionStorage, key, draft)); }
    catch { setStorageError(true); }
  }, [draft, key]);

  const update = (patch: Partial<Pick<StudentDraft, "type" | "courseId" | "reason">>) => setDraft((previous) => ({
    ...previous, ...patch, clientRequestId: crypto.randomUUID(), attempted: false, updatedAt: Date.now(),
  }));
  const setAttempted = (attempted: boolean) => setDraft((previous) => ({ ...previous, attempted, updatedAt: Date.now() }));
  const reset = () => { setRestored(false); setDraft(emptyDraft(draft.type)); };
  return { draft, update, setAttempted, reset, restored, storageError };
}
