import type { FastifyInstance } from "fastify";
import { storageTx } from "./tx.js";

/** One sweep: storageTx settles expired holds before running its (empty) work. */
export const runExpirySweep = (): Promise<void> => storageTx(async () => undefined);

/** Every 60 s, so a hold expires (and its owners are told) even when nobody uses storage. Off in tests. */
export function startExpiryJob(app: FastifyInstance): void {
  if (process.env.NODE_ENV === "test" || process.env.STORAGE_JOB === "false") return;
  const timer = setInterval(() => {
    runExpirySweep().catch((err: unknown) => app.log.error({ err }, "storage expiry sweep failed"));
  }, 60_000);
  timer.unref();
  app.addHook("onClose", async () => clearInterval(timer));
}
