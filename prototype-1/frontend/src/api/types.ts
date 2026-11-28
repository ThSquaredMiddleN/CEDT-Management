export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";
export type BookingType = "recurring" | "one_off";
export type RoomType = "lecture" | "lab" | "hardware" | "meeting";

export interface User {
  id: string;
  name: string;
  email: string;
  titlePrefix: string | null;
  studentNo: string | null;
  /** studentNo != null. For finding the user's own data only; use can() for features. */
  isStudent: boolean;
  /** Effective permissions from /auth/me. */
  permissions: string[];
}

export interface CalendarOccurrence {
  occurrenceId: string;
  bookingId: string;
  status: "approved" | "pending";
  date: string;
  startTime: string;
  endTime: string;
  roomId: string;
  roomName: string;
  buildingCode: string;
  isOwn: boolean;
  isTentativeAnonymous: boolean;
  // Absent on anonymized (tentative) occurrences — the server strips them (BR-16).
  courseCode?: string | null;
  title?: string;
  section?: string | null;
  instructorName?: string;
}

export interface Booking {
  id: string;
  requestNo: string;
  status: BookingStatus;
  bookingType: BookingType;
  termId: string;
  courseId: string | null;
  courseCode: string | null;
  title: string;
  section: string | null;
  instructorId: string;
  instructorName: string;
  requestedBy: string;
  roomId: string;
  roomName: string;
  buildingCode: string;
  roomType: RoomType | null;
  roomCapacity: number | null;
  dayOfWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  oneOffDate: string | null;
  startTime: string;
  endTime: string;
  studentCount: number;
  note: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  occurrenceCount: number;
  createdAt: string;
  hasUnreadStatusChange?: boolean;
}

export interface BookingDetail extends Booking {
  occurrences: {
    occurrenceId: string;
    date: string;
    startTime: string;
    endTime: string;
    roomId: string;
    roomName: string;
    isCancelled: boolean;
  }[];
  events: { eventType: string; actorName: string; reason: string | null; createdAt: string }[];
}

export interface BookingListResponse {
  items: Booking[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CheckConflictsResponse {
  hasBlockingConflicts: boolean;
  conflicts: {
    date: string;
    roomName: string;
    existing: {
      courseCode: string | null;
      title: string;
      startTime: string;
      endTime: string;
      dayOfWeek: number | null;
    };
  }[];
  pendingOverlaps: { date: string; startTime: string; endTime: string }[];
  capacityWarning: { roomCapacity: number; studentCount: number } | null;
  alternativeRooms: { roomId: string; roomName: string; buildingCode: string; capacity: number }[];
}

export interface BookingInput {
  bookingType: BookingType;
  termId: string;
  courseId: string | null;
  title?: string | null;
  section?: string | null;
  instructorId: string;
  roomId: string;
  dayOfWeek?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  oneOffDate?: string | null;
  startTime: string;
  endTime: string;
  studentCount: number;
  note?: string | null;
  excludeBookingId?: string | null;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  defaultInstructor: { id: string; name: string; titlePrefix: string | null } | null;
}

export interface Room {
  id: string;
  name: string;
  buildingId: string;
  buildingCode: string;
  capacity: number;
  roomType: RoomType;
  equipment: string[];
  isActive: boolean;
}

export interface Building {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface Term {
  id: string;
  academicYear: number;
  termNumber: number;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface DirectoryUser {
  id: string;
  name: string;
  titlePrefix: string | null;
  email?: string;
  roles: string[];
  isActive?: boolean;
}

/** `type` is `<module>.<event>`, e.g. `bookings.request_approved`, `course_change.approved`. */
export interface AppNotification {
  id: string;
  type: string;
  module: string;
  subjectId: string | null;
  message: string;
  /** In-app path (e.g. `/requests`), or null when there is nothing to open. */
  link: string | null;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
}

export type AnnouncementAudience = "all" | "year1" | "year2" | "year3" | "year4";
export type AnnouncementStatus = "draft" | "published";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  audiences: AnnouncementAudience[];
  status: AnnouncementStatus;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnnouncementInput = Pick<Announcement, "title" | "content" | "audiences">;

export type NewsTag =
  | "competition"
  | "activities"
  | "scholarship"
  | "internship"
  | "academic"
  | "other";
export type NewsStatus = "draft" | "published";

export interface NewsImage {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  position: number;
}

export interface NewsArticle {
  id: string;
  title: string;
  content: string;
  tags: NewsTag[];
  status: NewsStatus;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  images: NewsImage[];
}

export type NewsInput = Pick<NewsArticle, "title" | "content" | "tags">;

/** Affected-bookings list returned with 409 NEEDS_CONFIRM when deactivating master data. */
export interface AffectedBooking {
  bookingId: string;
  requestNo: string;
  courseCode: string | null;
  title: string;
  nextDate: string;
  roomName: string;
  startTime: string;
  endTime: string;
}

// ------------------------------------------------------------------ receipt checks

export type ReceiptVerdict = "ok" | "warn" | "fail";
export type ReceiptCheckState = "ok" | "warn" | "fail" | "info";
/** Staff decision on a warn check (POST /receipts/:id/settle). */
export type ReceiptSettlement = "pass" | "fail";

export interface ReceiptCheckItem {
  name: string;
  state: ReceiptCheckState;
  detail: string;
}

/** A saved check row. Never carries the student's name (it is not stored). */
export interface ReceiptCheckRow {
  id: string;
  studentId: string;
  term: string;
  kind: "pdf" | "screenshot";
  reference: string | null;
  amount: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  funding: string | null;
  checks: ReceiptCheckItem[];
  verdict: ReceiptVerdict;
  checkedById: string;
  createdAt: string;
  updatedAt: string;
  /** A stored copy of the upload exists (GET /receipts/:id/file works). */
  hasFile: boolean;
  /** The name read from the receipt. Only sent to staff who can manage receipts; null otherwise. */
  ocrName: string | null;
  /** Staff decision on a warn check. Null until settled. */
  settlement: ReceiptSettlement | null;
  settleNote: string | null;
  settledAt: string | null;
  settledByName: string | null;
  checkedByName: string | null;
}

/** Sidecar field: `value` is what the page shows; `pii` marks name, student ID and reference. */
export interface ReceiptField {
  value: string | null;
  box: unknown;
  pii: boolean;
}

/** Returned by POST /receipts/check. `fields` is for the staff member's screen only. */
export interface ReceiptCheckResponse {
  check: ReceiptCheckRow;
  fields: Record<string, ReceiptField>;
}

/** The signed-in user's LINE link state. addFriendUrl is null until LINE_OA_BASIC_ID is set on the backend. */
export interface LineStatus {
  enabled: boolean;
  linked: boolean;
  linkedAt: string | null;
  addFriendUrl: string | null;
}

// ------------------------------------------------- student's own receipt checks

/** Student view of a check (GET/POST /receipts/mine). No fields read, no name, no reference. */
export interface MyReceiptCheckItem {
  name: string;
  /** "info" is shown as a neutral note. The Funding row is staff-only and never sent here. */
  state: ReceiptCheckState;
}

export interface MyReceiptCheck {
  id: string;
  term: string;
  kind: "pdf" | "screenshot";
  verdict: ReceiptVerdict;
  createdAt: string;
  checks: MyReceiptCheckItem[];
  /** True when staff ran this check. Not the lock: the list response's `locked` decides that. */
  staffChecked: boolean;
  /** Staff decision on a warn check. `fail` comes with `settleNote`, the reason shown to the student. */
  settlement: ReceiptSettlement | null;
  settleNote: string | null;
}
