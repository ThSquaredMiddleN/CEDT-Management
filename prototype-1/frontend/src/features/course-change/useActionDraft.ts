import { useEffect, useState } from "react";
import {
  actionDraftKey,
  hasActionDraft,
  readActionDraft,
  saveActionDraft,
  type ActionDraft,
} from "./actionDraft";

/** Save each edit immediately, before dialogs or request panes can unmount. No file bytes. */
export function useActionDraft(userId: string, requestId: string) {
  const [values, setValues] = useState<ActionDraft | null>(null);
  const [action, setAction] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [restored, setRestored] = useState(false);
  const open = (name: string, reason: string, revision: number) => {
    let previous: ActionDraft | null = null;
    try {
      previous = readActionDraft(
        sessionStorage,
        actionDraftKey(userId, requestId, name),
      );
    } catch {
      setStorageError(true);
    }
    const draft = previous ?? {
      version: 1 as const,
      note: "",
      reason,
      baseReason: reason,
      revision,
      updatedAt: Date.now(),
    };
    setAction(name);
    setValues(draft);
    setRestored(!!previous);
  };
  const update = (patch: Partial<Pick<ActionDraft, "note" | "reason">>) => {
    if (!values) return;
    const next = { ...values, ...patch, updatedAt: Date.now() };
    setValues(next);
    try {
      setStorageError(
        !saveActionDraft(
          sessionStorage,
          actionDraftKey(userId, requestId, action),
          next,
        ),
      );
    } catch {
      setStorageError(true);
    }
  };
  const clear = () => {
    try {
      setStorageError(
        !saveActionDraft(
          sessionStorage,
          actionDraftKey(userId, requestId, action),
          null,
        ),
      );
    } catch {
      setStorageError(true);
    }
    setValues(null);
    setRestored(false);
  };
  const dirty = !!values && hasActionDraft(values);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return { values, open, update, clear, dirty, storageError, restored };
}
