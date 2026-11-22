import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminHome } from "@/features/admin/pages/AdminHome";
import { AdminLayout } from "@/features/admin/layout/AdminLayout";
import { StudentHome } from "@/features/student/pages/StudentHome";
import { StudentLayout } from "@/features/student/layout/StudentLayout";
import { useAuth } from "./AuthProvider";

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
const MyRequests = lazy(() =>
  import("@/features/my-requests/MyRequests").then((module) => ({
    default: module.MyRequests,
  })),
);
const MapPage = lazy(() =>
  import("./MapPage").then((module) => ({ default: module.MapPage })),
);
const CuLinksPage = lazy(() =>
  import("@/features/cu-links/pages/CuLinksPage").then((module) => ({
    default: module.CuLinksPage,
  })),
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
const StudentAnnouncementListPage = lazy(() =>
  import("@/features/announcements/pages/StudentAnnouncementListPage").then((module) => ({
    default: module.StudentAnnouncementListPage,
  })),
);
const StudentAnnouncementDetailPage = lazy(() =>
  import("@/features/announcements/pages/StudentAnnouncementDetailPage").then((module) => ({
    default: module.StudentAnnouncementDetailPage,
  })),
);
const NewsListPage = lazy(() =>
  import("@/features/news/pages/NewsListPage").then((module) => ({
    default: module.NewsListPage,
  })),
);
const NewsCreatePage = lazy(() =>
  import("@/features/news/pages/NewsCreatePage").then((module) => ({
    default: module.NewsCreatePage,
  })),
);
const NewsDetailPage = lazy(() =>
  import("@/features/news/pages/NewsDetailPage").then((module) => ({
    default: module.NewsDetailPage,
  })),
);
const NewsEditPage = lazy(() =>
  import("@/features/news/pages/NewsEditPage").then((module) => ({
    default: module.NewsEditPage,
  })),
);

function PageLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Loading page">
      <span className="size-6 animate-spin rounded-full border-2 border-current border-r-transparent" />
    </div>
  );
}

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
    <Suspense fallback={<PageLoading />}>
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
          <Route path="schedule/a" element={<MapPage />} />
          <Route path="links" element={<CuLinksPage />} />
          <Route path="announcements" element={<StudentAnnouncementListPage />} />
          <Route path="announcements/:id" element={<StudentAnnouncementDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AdminHome />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="data" element={<MasterDataPage />} />
          <Route path="announcements" element={<AnnouncementListPage />} />
          <Route path="announcements/create" element={<AnnouncementCreatePage />} />
          <Route path="announcements/:id" element={<AnnouncementDetailPage />} />
          <Route path="announcements/:id/edit" element={<AnnouncementEditPage />} />
          <Route path="news" element={<NewsListPage />} />
          <Route path="news/create" element={<NewsCreatePage />} />
          <Route path="news/:id" element={<NewsDetailPage />} />
          <Route path="news/:id/edit" element={<NewsEditPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
