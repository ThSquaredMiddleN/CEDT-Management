import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminHome } from "@/features/admin/pages/AdminHome";
import { AdminLayout } from "@/features/admin/layout/AdminLayout";
import { AdminDashboard } from "@/features/admin-dashboard/AdminDashboard";
import { BookingForm } from "@/features/booking-form/BookingForm";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { LineLinkPage } from "@/features/line-link/LineLinkPage";
import { LoginPage } from "@/features/login/LoginPage";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { MyRequests } from "@/features/my-requests/MyRequests";
import { StudentHome } from "@/features/student/pages/StudentHome";
import { StudentLayout } from "@/features/student/layout/StudentLayout";
import { useAuth } from "./AuthProvider";
import { MapPage } from "./MapPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
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

      <Route element={<StudentLayout />}>
        <Route index element={<StudentHome />} />
        {/* Public: anyone can view the calendar without logging in. */}
        <Route path="calendar" element={<CalendarPage />} />

        {/* Staff-only pages — a single `staff` role, so plain auth gating. */}
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
        <Route
          path="schedule/a"
          element={
            <MapPage />
          }
        />
        {/* Token comes from the LINE chat link; RequireAuth's `next` keeps the ?token= query. */}
        <Route
          path="line/link"
          element={
            <RequireAuth>
              <LineLinkPage />
            </RequireAuth>
          }
        />
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
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
