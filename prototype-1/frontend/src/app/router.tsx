import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminHome } from "@/features/admin-home/AdminHome";
import { AdminDashboard } from "@/features/admin-dashboard/AdminDashboard";
import { BookingForm } from "@/features/booking-form/BookingForm";
import { CalendarPage } from "@/features/calendar/CalendarPage";
import { LoginPage } from "@/features/login/LoginPage";
import { MasterDataPage } from "@/features/master-data/MasterDataPage";
import { MyRequests } from "@/features/my-requests/MyRequests";
import { AppShell } from "./AppShell";
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

      {/* AppShell renders for everyone and tolerates a null user. */}
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/admin" replace />} />
        {/* Public: anyone can view the calendar without logging in. */}
        <Route path="/calendar" element={<CalendarPage />} />

        {/* Staff-only pages — a single `staff` role, so plain auth gating. */}
        <Route
          path="/requests/new"
          element={
            <RequireAuth>
              <BookingForm />
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
          element={<AdminHome />}
        />
        <Route
          path="/admin/dashboard"
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
              <MasterDataPage />
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
