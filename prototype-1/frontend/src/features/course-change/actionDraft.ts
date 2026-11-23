import { DRAFT_PREFIX, DRAFT_MAX_AGE } from "./draft.ts";
export interface ActionDraft {
  version: 1;
  note: string;
  reason: string;
  baseReason: string;
  revision: number;
  updatedAt: number;
}
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const actionDraftKey = (
  userId: string,
  requestId: string,
  action: string,
) => `${DRAFT_PREFIX}action:${userId}:${requestId}:${action}`;
export const hasActionDraft = (draft: ActionDraft) =>
  !!draft.note.trim() || draft.reason !== draft.baseReason;
export function readActionDraft(
  storage: DraftStorage,
  key: string,
  now = Date.now(),
): ActionDraft | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ActionDraft;
    if (
      !draft ||
      draft.version !== 1 ||
      ![draft.note, draft.reason, draft.baseReason].every(
        (s) => typeof s === "string" && s.length <= 1000,
      ) ||
      !Number.isInteger(draft.revision) ||
      draft.revision < 0 ||
      !Number.isFinite(draft.updatedAt) ||
      draft.updatedAt > now ||
      now - draft.updatedAt > DRAFT_MAX_AGE
    ) {
      storage.removeItem(key);
      return null;
    }
    return hasActionDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}
export function saveActionDraft(
  storage: DraftStorage,
  key: string,
  draft: ActionDraft | null,
): boolean {
  try {
    if (draft && hasActionDraft(draft))
      storage.setItem(key, JSON.stringify(draft));
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
