import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError, isExclusionViolation, isUniqueViolation } from "../lib/errors.js";

/** Single error envelope for every non-2xx response (§8.1). */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "Not found", details: [] } });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }

    if (err instanceof ZodError) {
      return reply.code(422).send({
        error: {
          code: "VALIDATION",
          message: "Validation failed",
          details: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        },
      });
    }

    // A race slipped past the app-level check and the DB backstop fired (BR-7).
    if (isExclusionViolation(err)) {
      return reply.code(409).send({
        error: {
          code: "CONFLICT",
          message: "That slot was just taken by another approved booking.",
          details: [],
        },
      });
    }

    if (isUniqueViolation(err)) {
      return reply
        .code(409)
        .send({ error: { code: "DUPLICATE", message: "That record already exists.", details: [] } });
    }

    if ((err as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send({ error: { code: "VALIDATION", message: "ไฟล์หรือข้อมูลใหญ่เกินขนาดที่รองรับ กรุณาตรวจสอบขนาดแล้วลองใหม่", details: [] } });
    }

    if ((err as { statusCode?: number }).statusCode === 400) {
      return reply
        .code(400)
        .send({ error: { code: "BAD_REQUEST", message: "Malformed request", details: [] } });
    }

    req.log.error({ err }, "unhandled error");
    return reply
      .code(500)
      .send({ error: { code: "INTERNAL", message: "Something went wrong", details: [] } });
  });
}
