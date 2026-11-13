export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "DUPLICATE"
  | "NEEDS_CONFIRM"
  | "VALIDATION"
  | "LOCKED"
  | "WINDOW_CLOSED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  DUPLICATE: 409,
  NEEDS_CONFIRM: 409,
  VALIDATION: 422,
  LOCKED: 423,
  WINDOW_CLOSED: 422,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
    this.statusCode = STATUS[code];
  }
}

export const badRequest = (m: string, d: unknown[] = []) => new AppError("BAD_REQUEST", m, d);
export const unauthenticated = (m = "Not authenticated") => new AppError("UNAUTHENTICATED", m);
export const forbidden = (m = "You do not have permission to do that") => new AppError("FORBIDDEN", m);
export const notFound = (m = "Not found") => new AppError("NOT_FOUND", m);
export const conflict = (m: string, d: unknown[] = []) => new AppError("CONFLICT", m, d);
export const invalidTransition = (m: string) => new AppError("INVALID_TRANSITION", m);
export const duplicate = (m: string, d: unknown[] = []) => new AppError("DUPLICATE", m, d);
export const needsConfirm = (m: string, d: unknown[] = []) => new AppError("NEEDS_CONFIRM", m, d);
export const validation = (m: string, d: unknown[] = []) => new AppError("VALIDATION", m, d);
export const locked = (m: string) => new AppError("LOCKED", m);
export const windowClosed = (m: string) => new AppError("WINDOW_CLOSED", m);

/**
 * Postgres exclusion-constraint violation (BR-7): the no_double_booking backstop fired.
 * Prisma surfaces raw-query errors with the SQLSTATE and constraint name in the message
 * or in `meta`, so we look in both.
 */
export function isExclusionViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { message?: string; meta?: unknown; code?: string };
  const haystack = `${err.message ?? ""} ${JSON.stringify(err.meta ?? {})}`;
  return haystack.includes("23P01") || haystack.includes("no_double_booking");
}

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002"
  );
}
