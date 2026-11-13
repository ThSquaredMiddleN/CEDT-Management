import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Role } from "@/api/types";
import { AdminHome } from "@/features/admin/pages/AdminHome";
import { AdminLayout } from "@/features/admin/layout/AdminLayout";
import { StudentHome } from "@/features/student/pages/StudentHome";
import { StudentLayout } from "@/features/student/layout/StudentLayout";
import { roleLanding, useAuth } from "./AuthProvider";
import { DeferredPage } from "./DeferredPage";

const AdminDashboard = lazy(() =>
  import("@/features/admin-dashboard/AdminDashboard").then((module) => ({
    default: module.AdminDashboard,
  })),
);
const BookingForm = lazy(() =>
  import("@/features/booking-form/BookingForm").then((module) => ({
    default: module.BookingForm,
  })),
);
const CalendarPage = lazy(() =>
  import("@/features/calendar/CalendarPage").then((module) => ({
    default: module.CalendarPage,
  })),
);
const LoginPage = lazy(() =>
  import("@/features/login/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const MasterDataPage = lazy(() =>
  import("@/features/master-data/MasterDataPage").then((module) => ({
    default: module.MasterDataPage,
  })),
);
const CourseChangePage = lazy(() =>
  import("@/features/course-change/CourseChangePage").then((module) => ({
    default: module.CourseChangePage,
  })),
);
const MyRequests = lazy(() =>
  import("@/features/my-requests/MyRequests").then((module) => ({
    default: module.MyRequests,
  })),
);
const MapPage = lazy(() =>
  import("./MapPage").then((module) => ({ default: module.MapPage })),
);
const AnnouncementListPage = lazy(() =>
  import("@/features/announcements/pages/AnnouncementListPage").then((module) => ({
    default: module.AnnouncementListPage,
  })),
);
const AnnouncementCreatePage = lazy(() =>
  import("@/features/announcements/pages/AnnouncementCreatePage").then((module) => ({
    default: module.AnnouncementCreatePage,
  })),
);
const AnnouncementDetailPage = lazy(() =>
  import("@/features/announcements/pages/AnnouncementDetailPage").then((module) => ({
    default: module.AnnouncementDetailPage,
  })),
);
const AnnouncementEditPage = lazy(() =>
  import("@/features/announcements/pages/AnnouncementEditPage").then((module) => ({
    default: module.AnnouncementEditPage,
  })),
);

function PageLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Loading page">
      <span className="size-6 animate-spin rounded-full border-2 border-current border-r-transparent" />
    </div>
  );
}

/** Staff pages are the default; pass `roles` to open a page to students as well. */
function RequireAuth({ children, roles = ["staff"] }: { children: ReactNode; roles?: Role[] }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!roles.includes(user.role)) return <Navigate to={roleLanding(user.role)} replace />;
  return <>{children}</>;
}

/**
 * Course Change lives at /course-change for students and /admin/course-change for staff (same
 * page, role-specific view). Staff who land on the student URL — e.g. from a notification link —
 * are forwarded to the admin one with the query string intact.
 */
function StudentCourseChange() {
  const { user } = useAuth();
  const { search } = useLocation();
  if (user?.role === "staff") return <Navigate to={`/admin/course-change${search}`} replace />;
  return (
    <RequireAuth roles={["student"]}>
      <DeferredPage>
        <CourseChangePage />
      </DeferredPage>
    </RequireAuth>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-32 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-sm text-neutral-500">The page you're looking for doesn't exist.</p>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<StudentLayout />}>
          <Route index element={<StudentHome />} />
          {/* Public: anyone can view the calendar without logging in. */}
          <Route path="calendar" element={<CalendarPage />} />

          {/* Course Change (ลด / ถอนรายวิชา) — student view. */}
          <Route path="course-change" element={<StudentCourseChange />} />

          {/* Staff-only pages. */}
          <Route
            path="requests/new"
            element={
              <RequireAuth>
                <BookingForm />
              </RequireAuth>
            }
          />
          <Route
            path="requests"
            element={
              <RequireAuth>
                <MyRequests />
              </RequireAuth>
            }
          />
          <Route path="schedule/a" element={<MapPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminHome />} />
          <Route
            path="dashboard"
            element={
              <RequireAuth>
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="data"
            element={
              <RequireAuth>
                <MasterDataPage />
              </RequireAuth>
            }
          />
          <Route
            path="course-change"
            element={
              <RequireAuth>
                <DeferredPage>
                  <CourseChangePage />
                </DeferredPage>
              </RequireAuth>
            }
          />
          <Route
            path="announcements"
            element={
              <RequireAuth>
                <AnnouncementListPage />
              </RequireAuth>
            }
          />
          <Route
            path="announcements/create"
            element={
              <RequireAuth>
                <AnnouncementCreatePage />
              </RequireAuth>
            }
          />
          <Route
            path="announcements/:id"
            element={
              <RequireAuth>
                <AnnouncementDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="announcements/:id/edit"
            element={
              <RequireAuth>
                <AnnouncementEditPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
