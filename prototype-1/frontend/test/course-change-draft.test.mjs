import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearStudentDrafts, DRAFT_MAX_AGE, draftKey, readDraft, saveDraft } from "../src/features/course-change/draft.ts";

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key), key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; } };
}
const now = Date.now();
const draft = { version: 1, type: "withdraw", courseId: "00000000-0000-4000-8000-000000000001",
  reason: "เหตุผลภาษาไทย\nบรรทัดสอง", clientRequestId: "00000000-0000-4000-8000-000000000002", attempted: true, updatedAt: now };
const key = draftKey("student-a", "term-a");

describe("tab-scoped student drafts", () => {
  it("restores Thai text, course, type and the original submission key after a reload", () => {
    const s = storage();
    assert.equal(saveDraft(s, key, draft), true);
    assert.deepEqual(readDraft(s, key, now), draft);
  });
  it("does not return another account's or another term's draft", () => {
    const s = storage(); saveDraft(s, key, draft);
    assert.equal(readDraft(s, draftKey("student-b", "term-a"), now), null);
    assert.equal(readDraft(s, draftKey("student-a", "term-b"), now), null);
  });
  it("expires drafts older than 24 hours", () => {
    const s = storage(); saveDraft(s, key, draft);
    assert.equal(readDraft(s, key, now + DRAFT_MAX_AGE + 1), null);
    assert.equal(s.getItem(key), null);
  });
  it("removes the draft after successful submission or explicit clearing", () => {
    const s = storage(); saveDraft(s, key, draft);
    saveDraft(s, key, { ...draft, courseId: null, reason: "", attempted: false });
    assert.equal(readDraft(s, key, now), null);
  });
  it("keeps an unresolved attempt even if its visible input is empty", () => {
    const s = storage();
    saveDraft(s, key, { ...draft, courseId: null, reason: "" });
    assert.equal(readDraft(s, key, now)?.attempted, true);
  });
  it("fails gracefully when storage is unavailable or full", () => {
    const broken = { getItem: () => { throw new Error("disabled"); }, setItem: () => { throw new Error("quota"); } };
    assert.equal(readDraft(broken, key, now), null);
    assert.equal(saveDraft(broken, key, draft), false);
  });
  it("clears only this feature's drafts on logout", () => {
    const s = storage(); saveDraft(s, key, draft); saveDraft(s, draftKey("b", "b"), draft);
    s.setItem("unrelated-preference", "keep");
    clearStudentDrafts(s);
    assert.equal(s.length, 1);
    assert.equal(s.getItem("unrelated-preference"), "keep");
  });
  it("ignores malformed JSON", () => {
    const s = storage(); s.setItem(key, "{broken");
    assert.equal(readDraft(s, key, now), null);
  });
  for (const patch of [
    { version: 2 }, { type: "unknown" }, { courseId: "bad" }, { clientRequestId: "bad" },
    { reason: "a".repeat(1001) }, { attempted: "yes" }, { updatedAt: null }, { updatedAt: now + 1 },
  ]) it(`rejects invalid stored fields ${JSON.stringify(patch).slice(0, 70)}`, () => {
    const s = storage(); s.setItem(key, JSON.stringify({ ...draft, ...patch }));
    assert.equal(readDraft(s, key, now), null);
  });
});
