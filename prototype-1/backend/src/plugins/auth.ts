import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config, isProd } from "../config.js";
import { prisma } from "../db.js";
import { can, loadSessionUser, type SessionUser as CoreSessionUser } from "../core/permissions.js";
import { forbidden, unauthenticated } from "../lib/errors.js";

// "any" and "admin" both mean "staff": they predate the `student` role (Course Change) and
// are kept so the LabSync route configs don't all have to change. "user" is any signed-in
// account (staff or student); "student" is students only.
export type AuthLevel = "public" | "user" | "student" | "any" | "admin";

export type Role = "staff" | "student";

/** Until Task A7 the old role rides along; new code must use permissions. */
export type SessionUser = CoreSessionUser & { role: Role };

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
    select: { expiresAt: true, userId: true, user: { select: { role: true, isActive: true } } },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return undefined;
  const user = await loadSessionUser(session.userId);
  return user ? { ...user, role: session.user.role } : undefined;
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
  });

  app.addHook("preHandler", async (req) => {
    const level: AuthLevel = req.routeOptions.config?.auth ?? "any";

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
    if (level === "user") return;
    if (level === "student") {
      if (req.user.role !== "student") throw forbidden();
      return;
    }
    // "any" / "admin": staff only (CC-BR-10 — students never reach the LabSync API).
    if (req.user.role !== "staff") throw forbidden();
  });
}

/** Non-null user accessor for routes declared `any`/`admin`. */
export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthenticated();
  return req.user;
}
