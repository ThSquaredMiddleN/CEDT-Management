import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config, isProd } from "../config.js";
import { prisma } from "../db.js";
import { can, loadSessionUser, type SessionUser } from "../core/permissions.js";
import { forbidden, unauthenticated } from "../lib/errors.js";

// "public" = no session needed; "user" = any signed-in account. What the user may do is decided
// by config.permission (see can()), never by the level.
export type AuthLevel = "public" | "user";

export type { SessionUser };

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
  interface FastifyContextConfig {
    auth?: AuthLevel;
    /**
     * Permission the caller must hold. `null` = any signed-in user; the handler checks ownership
     * itself. Required (string or null) on every non-public route that changes data.
     */
    permission?: string | null;
    /** Set `csrf: false` only on routes with their own request authentication (the LINE webhook). */
    csrf?: boolean;
  }
}

export const hashToken = (raw: string): string =>
  crypto.createHash("sha256").update(raw).digest("hex");

export function newSessionToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function setSessionCookie(reply: FastifyReply, raw: string): void {
  reply.setCookie(config.SESSION_COOKIE_NAME, raw, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: isProd,
    maxAge: config.SESSION_TTL_HOURS * 3600,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.SESSION_COOKIE_NAME, { path: "/" });
}

/** Resolve the session cookie to a live user (§6.2): valid session + active user. */
async function resolveUser(req: FastifyRequest): Promise<SessionUser | undefined> {
  const raw = req.cookies[config.SESSION_COOKIE_NAME];
  if (!raw) return undefined;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(raw) },
    select: { expiresAt: true, userId: true },
  });
  if (!session || session.expiresAt <= new Date()) return undefined;
  return (await loadSessionUser(session.userId)) ?? undefined;
}

export function registerAuth(app: FastifyInstance, knownPermissions: ReadonlySet<string>): void {
  // Every route must declare its auth level; an undeclared route is a startup error (§6.2).
  app.addHook("onRoute", (route) => {
    if (route.method === "HEAD" || route.method === "OPTIONS") return;
    if (!route.url.startsWith("/api/v1")) return;
    if (!route.config?.auth) {
      throw new Error(`Route ${route.method} ${route.url} does not declare config.auth`);
    }
    const p = route.config.permission;
    if (typeof p === "string" && !knownPermissions.has(p)) {
      throw new Error(`Route ${route.method} ${route.url} uses unknown permission "${p}"`);
    }
    const methods = [route.method].flat();
    const changesData = methods.some((m) => !["GET", "HEAD", "OPTIONS"].includes(m));
    const declared = Object.prototype.hasOwnProperty.call(route.config, "permission");
    if (route.config.auth !== "public" && changesData && !declared) {
      throw new Error(
        `Route ${methods.join(",")} ${route.url} changes data but does not declare config.permission (use null for own-data routes)`,
      );
    }
    if (route.config.auth === "public" && p) {
      throw new Error(`Route ${methods.join(",")} ${route.url} is public but declares a permission`);
    }
  });

  app.addHook("preHandler", async (req) => {
    const level: AuthLevel = req.routeOptions.config?.auth ?? "user";

    // CSRF (§6.3): custom header required on every mutation; Origin must match when sent.
    if (req.method !== "GET" && req.method !== "HEAD" && req.routeOptions.config?.csrf !== false) {
      if (req.headers["x-requested-with"] !== "XMLHttpRequest") {
        throw forbidden("Missing X-Requested-With header");
      }
      const origin = req.headers.origin;
      if (origin && origin !== config.APP_ORIGIN) {
        throw forbidden("Bad origin");
      }
    }

    req.user = await resolveUser(req);

    if (level === "public") return;
    if (!req.user) throw unauthenticated();
    const permission = req.routeOptions.config?.permission;
    if (permission && !can(req.user, permission)) throw forbidden();
  });
}

/** Non-null user accessor for routes declared `user`. */
export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
