import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { Role } from "@/api/types";
import { AdminHome } from "@/features/admin/pages/AdminHome";
import { AdminLayout } from "@/features/admin/layout/AdminLayout";
import { StudentHome } from "@/features/student/pages/StudentHome";
import { PortalLayout } from "@/features/portal/layout/PortalLayout";
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
const LineLinkPage = lazy(() =>
  import("@/features/line-link/LineLinkPage").then((module) => ({
    default: module.LineLinkPage,
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
const ReceiptChecksPage = lazy(() =>
  import("@/features/receipts/ReceiptChecksPage").then((module) => ({
    default: module.ReceiptChecksPage,
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
const StorageDashboardPage = lazy(() =>
  import("@/features/storage/routes/StorageDashboardPage").then((module) => ({
    default: module.StorageDashboardPage,
  })),
);
const BorrowListPage = lazy(() =>
  import("@/features/storage/routes/BorrowListPage").then((module) => ({
    default: module.BorrowListPage,
  })),
);
const BorrowDetailPage = lazy(() =>
  import("@/features/storage/routes/BorrowDetailPage").then((module) => ({
    default: module.BorrowDetailPage,
  })),
);
const WalkInPage = lazy(() =>
  import("@/features/storage/routes/WalkInPage").then((module) => ({
    default: module.WalkInPage,
  })),
);
const ReturnPage = lazy(() =>
  import("@/features/storage/routes/ReturnPage").then((module) => ({
    default: module.ReturnPage,
  })),
);
const QCListPage = lazy(() =>
  import("@/features/storage/routes/QCListPage").then((module) => ({
    default: module.QCListPage,
  })),
);
const QCDetailPage = lazy(() =>
  import("@/features/storage/routes/QCDetailPage").then((module) => ({
    default: module.QCDetailPage,
  })),
);
const StudentStoragePage = lazy(() =>
  import("@/features/storage/routes/StudentStoragePage").then((module) => ({
    default: module.StudentStoragePage,
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
const StudentNewsListPage = lazy(() =>
  import("@/features/news/pages/StudentNewsListPage").then((module) => ({
    default: module.StudentNewsListPage,
  })),
);
const StudentNewsDetailPage = lazy(() =>
  import("@/features/news/pages/StudentNewsDetailPage").then((module) => ({
    default: module.StudentNewsDetailPage,
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

        <Route element={<PortalLayout />}>
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
          <Route path="links" element={<CuLinksPage />} />
          <Route path="announcements" element={<StudentAnnouncementListPage />} />
          <Route path="announcements/:id" element={<StudentAnnouncementDetailPage />} />
          <Route path="news" element={<StudentNewsListPage />} />
          <Route path="news/:id" element={<StudentNewsDetailPage />} />
          {/* Token comes from the LINE chat link. Not wrapped in RequireAuth: the page checks the token before login. */}
          <Route path="line/link" element={<LineLinkPage />} />
          {/* Student storage. No RequireAuth yet: student auth is not decided (mock identity). */}
          <Route path="student/storage" element={<StudentStoragePage />} />
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
          <Route
            path="course-change"
            element={
              <DeferredPage>
                <CourseChangePage />
              </DeferredPage>
            }
          />
          <Route path="receipts" element={<ReceiptChecksPage />} />
          <Route path="announcements" element={<AnnouncementListPage />} />
          <Route path="announcements/create" element={<AnnouncementCreatePage />} />
          <Route path="announcements/:id" element={<AnnouncementDetailPage />} />
          <Route path="announcements/:id/edit" element={<AnnouncementEditPage />} />
          <Route path="news" element={<NewsListPage />} />
          <Route path="news/create" element={<NewsCreatePage />} />
          <Route path="news/:id" element={<NewsDetailPage />} />
          <Route path="news/:id/edit" element={<NewsEditPage />} />
          <Route
            path="storage"
            element={
              <StorageDashboardPage />
            }
          />
          <Route
            path="storage/borrow"
            element={
              <BorrowListPage />
            }
          />
          <Route
            path="storage/borrow/walk-in"
            element={
              <WalkInPage />
            }
          />
          <Route
            path="storage/borrow/:id"
            element={
              <BorrowDetailPage />
            }
          />
          <Route
            path="storage/return"
            element={
              <ReturnPage />
            }
          />
          <Route
            path="storage/qc"
            element={
              <QCListPage />
            }
          />
          <Route
            path="storage/qc/:id"
            element={
              <QCDetailPage />
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
