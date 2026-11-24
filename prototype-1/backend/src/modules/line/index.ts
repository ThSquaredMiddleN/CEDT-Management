import { config, lineDryRun } from "../../config.js";
import { prisma } from "../../db.js";
import { API_PREFIX, type AppModule } from "../types.js";
import { createDryRunLineClient, createLineClient } from "./client.js";
import { startLineDispatcher } from "./dispatcher.js";
import { lineRoutes } from "./routes.js";

export const lineModule: AppModule = {
  name: "line",
  async setup(app, opts) {
    // LINE_DRY_RUN: prints each message to this console instead of sending it (see createDryRunLineClient).
    const dryRunClient = lineDryRun ? createDryRunLineClient(app.log) : undefined;
    if (lineDryRun) app.log.warn("LINE is in dry-run mode: nothing is sent; replies and pushes are printed here");

    await app.register(lineRoutes, { prefix: API_PREFIX, client: opts.lineClient ?? dryRunClient });

    // Starts on ready only when LINE is enabled and not under test (see startLineDispatcher).
    startLineDispatcher(app, {
      prisma,
      client: opts.lineClient ?? dryRunClient ?? createLineClient(config.LINE_CHANNEL_ACCESS_TOKEN ?? ""),
      appOrigin: config.APP_ORIGIN,
      intervalMs: config.LINE_DISPATCH_INTERVAL_MS,
    });
  },
};
