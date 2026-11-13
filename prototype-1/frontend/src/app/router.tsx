import { lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminDashboard } from "@/features/admin-dashboard/AdminDashboard";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { LoginPage } from "@/features/login/LoginPage";
import { MyRequests } from "@/features/my-requests/MyRequests";
import type { Role } from "@/api/types";
import { AppShell } from "./AppShell";
import { roleLanding, useAuth } from "./AuthProvider";
import { MapPage } from "./MapPage";
import { DeferredPage } from "./DeferredPage";

const CourseChangePage = lazy(() => import("@/features/course-change/CourseChangePage").then((m) => ({ default: m.CourseChangePage })));
const BookingForm = lazy(() => import("@/features/booking-form/BookingForm").then((m) => ({ default: m.BookingForm })));
const MasterDataPage = lazy(() => import("@/features/master-data/MasterDataPage").then((m) => ({ default: m.MasterDataPage })));

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* AppShell renders for everyone — the calendar is public. It tolerates a null user. */}
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/calendar" replace />} />
        {/* Public: anyone can view the calendar without logging in. */}
        <Route path="/calendar" element={<CalendarPage />} />

        {/* Course Change (ลด / ถอนรายวิชา) — students and staff, one page with two views. */}
        <Route
          path="/course-change"
          element={
            <RequireAuth roles={["student", "staff"]}>
              <DeferredPage><CourseChangePage /></DeferredPage>
            </RequireAuth>
          }
        />

        {/* Staff-only pages. */}
        <Route
          path="/requests/new"
          element={
            <RequireAuth>
              <DeferredPage><BookingForm /></DeferredPage>
            </RequireAuth>
          }
        />
        <Route
          path="/requests"
          element={
            <RequireAuth>
              <MyRequests />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/data"
          element={
            <RequireAuth>
              <DeferredPage><MasterDataPage /></DeferredPage>
            </RequireAuth>
          }
        />
        <Route
          path="/schedule/a"
          element={
            <MapPage />
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
