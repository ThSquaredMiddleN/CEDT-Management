import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api, patch, post } from "./client";
import { qk } from "./queryKeys";
import type {
  AppNotification,
  Announcement,
  AnnouncementInput,
  Booking,
  BookingDetail,
  BookingInput,
  BookingListResponse,
  Building,
  CalendarOccurrence,
  CheckConflictsResponse,
  Course,
  DirectoryUser,
  NotificationsResponse,
  Room,
  Term,
  User,
} from "./types";

// -------------------------------------------------------------------------- auth

export const fetchMe = () => api<{ user: User }>("/auth/me");

export const login = (body: { email: string; password: string }) =>
  post<{ user: User }>("/auth/login", body);

export const logout = () => post<void>("/auth/logout");

// --------------------------------------------------------------- announcements

export function useAnnouncements(enabled = true) {
  return useQuery({
    queryKey: qk.announcements,
    queryFn: () => api<{ items: Announcement[] }>("/announcements"),
    enabled,
  });
}

export function useAnnouncement(id: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.announcement(id ?? ""),
    queryFn: () => api<{ announcement: Announcement }>(`/announcements/${id}`),
    enabled: !!id && enabled,
  });
}

function useAnnouncementMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<{ announcement: Announcement }>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: ({ announcement }) => {
      qc.setQueryData(qk.announcement(announcement.id), { announcement });
      void qc.invalidateQueries({ queryKey: qk.announcements });
    },
  });
}

export const useCreateAnnouncement = () =>
  useAnnouncementMutation<AnnouncementInput>((body) =>
    post<{ announcement: Announcement }>("/announcements", body),
  );

export const useUpdateAnnouncement = (id: string) =>
  useAnnouncementMutation<AnnouncementInput>((body) =>
    patch<{ announcement: Announcement }>(`/announcements/${id}`, body),
  );

export const usePublishAnnouncement = (id: string) =>
  useAnnouncementMutation<void>(() =>
    post<{ announcement: Announcement }>(`/announcements/${id}/publish`),
  );

// ---------------------------------------------------------------------- calendar

export interface CalendarParams {
  from: string;
  to: string;
  buildingIds?: string[];
  roomIds?: string[];
  instructorIds?: string[];
  status?: string[];
}

function calendarQueryString(p: CalendarParams): string {
  const q = new URLSearchParams({ from: p.from, to: p.to });
  for (const id of p.buildingIds ?? []) q.append("buildingIds", id);
  for (const id of p.roomIds ?? []) q.append("roomIds", id);
  for (const id of p.instructorIds ?? []) q.append("instructorIds", id);
  if (p.status?.length) q.set("status", p.status.join(","));
  return q.toString();
}

export function useCalendar(params: CalendarParams) {
  return useQuery({
    queryKey: qk.calendar(params as unknown as Record<string, unknown>),
    queryFn: () =>
      api<{ occurrences: CalendarOccurrence[] }>(`/calendar?${calendarQueryString(params)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 45_000,
  });
}

// ---------------------------------------------------------------------- bookings

export function useBookings(
  params: { mine?: string; status?: string; sort?: string; order?: string; page?: number } = {},
  options: Partial<UseQueryOptions<BookingListResponse>> = {},
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));

  return useQuery({
    queryKey: qk.bookingList(params),
    queryFn: () => api<BookingListResponse>(`/bookings?${q.toString()}`),
    ...options,
  });
}

export function useBooking(id: string | null) {
  return useQuery({
    queryKey: qk.bookingDetail(id ?? ""),
    queryFn: () => api<{ booking: BookingDetail }>(`/bookings/${id}`),
    enabled: !!id,
  });
}

export const checkConflicts = (body: BookingInput, signal?: AbortSignal) =>
  post<CheckConflictsResponse>("/bookings/check-conflicts", body, { signal });

/** Every booking mutation invalidates the same three keys — the dataset is tiny, so coarse is fine. */
function useBookingMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["calendar"] });
      void qc.invalidateQueries({ queryKey: qk.bookings });
      void qc.invalidateQueries({ queryKey: qk.notifications });
    },
  });
}

export const useCreateBooking = () =>
  useBookingMutation<BookingInput>((body) => post<{ booking: Booking }>("/bookings", body));

export const useApproveBooking = () =>
  useBookingMutation<string>((id) => post<{ booking: Booking }>(`/bookings/${id}/approve`));

export const useRejectBooking = () =>
  useBookingMutation<{ id: string; reason: string }>(({ id, reason }) =>
    post<{ booking: Booking }>(`/bookings/${id}/reject`, { reason }),
  );

export const useCancelBooking = () =>
  useBookingMutation<{ id: string; reason?: string }>(({ id, reason }) =>
    post<{ booking: Booking }>(`/bookings/${id}/cancel`, reason ? { reason } : {}),
  );

export const useMoveBooking = () =>
  useBookingMutation<{ id: string; body: Record<string, unknown> }>(({ id, body }) =>
    patch<{ booking: Booking }>(`/bookings/${id}`, body),
  );

// ------------------------------------------------------------------- master data

export function useCourses(params: { q?: string; active?: string } = {}, enabled = true) {
  const s = new URLSearchParams();
  if (params.q) s.set("q", params.q);
  if (params.active) s.set("active", params.active);

  return useQuery({
    queryKey: qk.courses(params),
    queryFn: () => api<{ items: Course[] }>(`/courses?${s.toString()}`),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRooms(params: { active?: string } = {}) {
  const s = new URLSearchParams();
  if (params.active) s.set("active", params.active);

  return useQuery({
    queryKey: qk.rooms(params),
    queryFn: () => api<{ items: Room[] }>(`/rooms?${s.toString()}`),
    staleTime: 5 * 60_000,
  });
}

export function useBuildings() {
  return useQuery({
    queryKey: qk.buildings,
    queryFn: () => api<{ items: Building[] }>("/buildings"),
    staleTime: 5 * 60_000,
  });
}

export function useTerms() {
  return useQuery({
    queryKey: qk.terms,
    queryFn: () => api<{ items: Term[] }>("/terms"),
    staleTime: 5 * 60_000,
  });
}

export function useUsers(
  params: { role?: string; active?: string } = {},
  options: { enabled?: boolean } = {},
) {
  const s = new URLSearchParams();
  if (params.role) s.set("role", params.role);
  if (params.active) s.set("active", params.active);

  return useQuery({
    queryKey: qk.users(params),
    queryFn: () => api<{ items: DirectoryUser[] }>(`/users?${s.toString()}`),
    staleTime: 5 * 60_000,
    // `/users` is staff-only; skip the fetch for anonymous callers so the public calendar
    // never triggers a 401 (which would bounce it to the login page).
    enabled: options.enabled ?? true,
  });
}

/** Generic master-data writer: `POST /<resource>` or `PATCH /<resource>/:id`. */
export function useResourceMutation(resource: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id ? patch(`/${resource}/${id}`, body) : post(`/${resource}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [resource] });
      // Room/building edits change how the calendar renders, so refresh it too.
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

// ----------------------------------------------------------------- notifications

/**
 * One cache entry drives the bell badge, the bell panel and the My Requests unread dots
 * (§7d). Polling pauses automatically while the tab is hidden.
 */
export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<NotificationsResponse>("/notifications"),
    refetchInterval: 45_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) => post<void>("/notifications/read", body),
    // Optimistic: the server cannot meaningfully refuse a read receipt.
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueryData<NotificationsResponse>(qk.notifications);
      if (prev) {
        const markAll = "all" in body;
        const ids = new Set("ids" in body ? body.ids : []);
        const items: AppNotification[] = prev.items.map((n) =>
          markAll || ids.has(n.id) ? { ...n, isRead: true } : n,
        );
        qc.setQueryData<NotificationsResponse>(qk.notifications, {
          ...prev,
          items,
          unreadCount: items.filter((n) => !n.isRead).length,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.notifications, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.notifications });
      void qc.invalidateQueries({ queryKey: qk.bookings });
    },
  });
}

// --------------------------------------------------------------------------- line

/** Links the signed-in staff member's LINE account. 400 = invalid, expired or used token. */
export const linkLineAccount = (token: string) =>
  post<{ linked: true }>("/line/link", { token });

/** Read-only check run when the link page opens, before login. Only says whether Confirm would work. */
export const checkLineLinkToken = (token: string) =>
  post<{ valid: boolean }>("/line/link/check", { token });
