export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Conflict entries returned in 409 CONFLICT `details` and by check-conflicts. */
export interface ConflictDetail {
  date: string;
  roomName: string;
  existing: {
    courseCode: string | null;
    title: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number | null;
  };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: "include", // send the httpOnly session cookie
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest", // required by the backend CSRF check on mutations
      ...init.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? "UNKNOWN", e.message ?? res.statusText, e.details);
  }
  return body as T;
}

export const post = <T>(path: string, body?: unknown, init: RequestInit = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}), ...init });

export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
