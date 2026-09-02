import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { locked, unauthenticated } from "../../lib/errors.js";
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

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", { config: { auth: "public" } }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    // Generic 401 for unknown email, wrong password, and deactivated user alike (§6.1).
    if (!user || !user.isActive) throw unauthenticated("Invalid email or password");

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw locked(`Account locked. Try again in ${mins} minutes`);
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

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        titlePrefix: user.titlePrefix,
      },
    };
  });

  app.post("/auth/logout", { config: { auth: "any" } }, async (req, reply) => {
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

  app.patch("/users/me/password", { config: { auth: "any" } }, async (req, reply) => {
    const me = requireUser(req);
    const { currentPassword, newPassword } = passwordSchema.parse(req.body);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
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
