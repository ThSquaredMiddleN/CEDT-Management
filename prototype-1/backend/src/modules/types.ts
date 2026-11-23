import type { FastifyInstance } from "fastify";
import type { LineClient } from "./line/client.js";

/** Every module's routes live under this prefix. */
export const API_PREFIX = "/api/v1";

/**
 * Options passed to buildApp(). Tests use them to swap out external services;
 * a module that needs an override adds its own optional field here.
 */
export interface BuildOptions {
  /** Tests pass a fake LINE client so no request leaves the process. */
  lineClient?: LineClient;
}

export interface AppModule {
  /** Module name: the prefix of its permissions, notification types, audit actions and env vars. */
  name: string;
  /** Registers the module's routes (under API_PREFIX) and starts any background work. */
  setup(app: FastifyInstance, opts: BuildOptions): Promise<void>;
}
