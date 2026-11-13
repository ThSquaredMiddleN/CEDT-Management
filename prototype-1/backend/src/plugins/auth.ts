import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config, isProd } from "../config.js";
import { prisma } from "../db.js";
import { forbidden, unauthenticated } from "../lib/errors.js";

// "any" and "admin" both mean "staff": they predate the `student` role (Course Change) and
// are kept so the LabSync route configs don't all have to change. "user" is any signed-in
// account (staff or student); "student" is students only.
export type AuthLevel = "public" | "user" | "student" | "any" | "admin";

export type Role = "staff" | "student";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  titlePrefix: string | null;
  studentNo: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
  interface FastifyContextConfig {
    auth?: AuthLevel;
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
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return undefined;

  const u = session.user;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    titlePrefix: u.titlePrefix,
    studentNo: u.studentNo,
  };
}

export function registerAuth(app: FastifyInstance): void {
  // Every route must declare its auth level; an undeclared route is a startup error (§6.2).
  app.addHook("onRoute", (route) => {
    if (route.method === "HEAD" || route.method === "OPTIONS") return;
    if (!route.url.startsWith("/api/v1")) return;
    if (!route.config?.auth) {
      throw new Error(`Route ${route.method} ${route.url} does not declare config.auth`);
    }
  });

  app.addHook("preHandler", async (req) => {
    const level: AuthLevel = req.routeOptions.config?.auth ?? "any";

    // CSRF (§6.3): custom header required on every mutation; Origin must match when sent.
    if (req.method !== "GET" && req.method !== "HEAD") {
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
