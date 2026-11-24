import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { loadSessionUser } from "../../core/permissions.js";
import { badRequest, locked, unauthenticated } from "../../lib/errors.js";
import {
  clearSessionCookie,
  hashToken,
  newSessionToken,
  requireUser,
  setSessionCookie,
} from "../../plugins/auth.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "must be at least 8 characters"),
});

/** A hash of a random secret, made once: verifying against it costs the same as a real check and never matches. */
let dummy: Promise<string> | undefined;
const dummyHash = () => (dummy ??= argon2.hash(randomBytes(32).toString("hex"), { type: argon2.argon2id }));

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", { config: { auth: "public" } }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Generic 401 for unknown email, wrong password, and deactivated user alike (§6.1). These paths still run one
    // argon2 verify, so response time does not show which emails exist or have no password.
    if (!user || !user.isActive) {
      await argon2.verify(await dummyHash(), password);
      throw unauthenticated("Invalid email or password");
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw locked(`Account locked. Try again in ${mins} minutes`);
    }

    // MCV-only accounts have no password: same generic 401, and no failed-login count (there is nothing to guess).
    if (user.passwordHash === null) {
      await argon2.verify(await dummyHash(), password);
      throw unauthenticated("Invalid email or password");
    }

    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      if (failed >= MAX_FAILED) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
          },
        });
      } else {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: failed },
        });
      }
      throw unauthenticated("Invalid email or password");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const { raw, hash } = newSessionToken();
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + config.SESSION_TTL_HOURS * 3_600_000),
      },
    });
    setSessionCookie(reply, raw);

    const sessionUser = await loadSessionUser(user.id);
    return { user: { ...sessionUser!, role: user.role } };
  });

  app.post("/auth/logout", { config: { auth: "user" } }, async (req, reply) => {
    const raw = req.cookies[config.SESSION_COOKIE_NAME];
    if (raw) {
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(raw) } });
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  // Public so the SPA can bootstrap without a session — anonymous callers get `user: null`
  // rather than a 401 (which would bounce the public calendar to the login page).
  app.get("/auth/me", { config: { auth: "public" } }, async (req) => ({ user: req.user ?? null }));

  app.patch("/users/me/password", { config: { auth: "user" } }, async (req, reply) => {
    const me = requireUser(req);
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    if (user.passwordHash === null) throw badRequest("This account signs in through MCV and has no password");
    if (!(await argon2.verify(user.passwordHash, currentPassword))) {
      throw unauthenticated("Current password is incorrect");
    }

    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }) },
    });
    return reply.code(204).send();
  });
}
