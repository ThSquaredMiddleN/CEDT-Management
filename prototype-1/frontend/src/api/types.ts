export type Role = "staff" | "student";
export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";
export type BookingType = "recurring" | "one_off";
export type RoomType = "lecture" | "lab" | "hardware" | "meeting";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  titlePrefix: string | null;
  studentNo?: string | null;
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
  role?: Role;
  isActive?: boolean;
}

export type NotificationType =
  | "request_submitted"
  | "request_approved"
  | "request_rejected"
  | "booking_moved"
  | "booking_cancelled_by_instructor"
  | "request_withdrawn"
  | "cc_submitted"
  | "cc_approved"
  | "cc_rejected"
  | "cc_completed"
  | "cc_cancelled";

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  bookingId: string | null;
  courseChangeRequestId?: string | null;
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
