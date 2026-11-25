import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminHome } from "@/features/admin/pages/AdminHome";
import { AdminLayout } from "@/features/admin/layout/AdminLayout";
import { StudentHome } from "@/features/student/pages/StudentHome";
import { PortalLayout } from "@/features/portal/layout/PortalLayout";
import { useAuth } from "./AuthProvider";
import { can, isStaff } from "./permissions";
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
const LineSettingsPage = lazy(() =>
  import("@/features/line-link/LineSettingsPage").then((module) => ({
    default: module.LineSettingsPage,
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
const AccessPage = lazy(() =>
  import("@/features/access/AccessPage").then((module) => ({ default: module.AccessPage })),
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
const StorageHubPage = lazy(() =>
  import("@/features/storage/routes/StorageHubPage").then((module) => ({
    default: module.StorageHubPage,
  })),
);
const InventoryPage = lazy(() =>
  import("@/features/storage/routes/InventoryPage").then((module) => ({
    default: module.InventoryPage,
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

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-32 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="text-sm text-neutral-500">บัญชีนี้ยังไม่มีสิทธิ์ใช้หน้านี้ ติดต่อ IT Admin หากต้องการสิทธิ์</p>
    </div>
  );
}

/**
 * Signed-in users only. `permission` also requires that permission; `staff` requires any
 * `.view` permission (the /admin layout). Hides pages only: the API checks the same names.
 */
function RequireAuth({ children, permission, staff = false }: { children: ReactNode; permission?: string; staff?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if ((permission && !can(user, permission)) || (staff && !isStaff(user))) return <NoAccess />;
  return <>{children}</>;
}

/**
 * Course Change lives at /course-change for students and /admin/course-change for staff (same
 * page, permission-specific view). Staff who land on the student URL — e.g. from a notification
 * link — are forwarded to the admin one with the query string intact.
 */
function StudentCourseChange() {
  const { user } = useAuth();
  const { search } = useLocation();
  if (can(user, "course_change.view")) return <Navigate to={`/admin/course-change${search}`} replace />;
  return (
    <RequireAuth permission="course_change.use">
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
              <RequireAuth permission="bookings.use">
                <BookingForm />
              </RequireAuth>
            }
          />
          <Route
            path="requests"
            element={
              <RequireAuth permission="bookings.use">
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
          {/* LINE settings (connect, unlink) for anyone with line.use. */}
          <Route
            path="line"
            element={
              <RequireAuth permission="line.use">
                <LineSettingsPage />
              </RequireAuth>
            }
          />
          <Route path="student/storage" element={<RequireAuth permission="storage.use"><StorageHubPage /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="admin"
          element={
            <RequireAuth staff>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AdminHome />} />
          <Route path="dashboard" element={<RequireAuth permission="bookings.view"><AdminDashboard /></RequireAuth>} />
          <Route path="data" element={<RequireAuth permission="masterdata.manage"><MasterDataPage /></RequireAuth>} />
          <Route
            path="course-change"
            element={
              <RequireAuth permission="course_change.view">
                <DeferredPage>
                  <CourseChangePage />
                </DeferredPage>
              </RequireAuth>
            }
          />
          <Route path="receipts" element={<RequireAuth permission="receipts.view"><ReceiptChecksPage /></RequireAuth>} />
          <Route path="line" element={<RequireAuth permission="line.use"><LineSettingsPage /></RequireAuth>} />
          <Route path="access" element={<RequireAuth permission="core.permissions.manage"><AccessPage /></RequireAuth>} />
          <Route path="announcements" element={<RequireAuth permission="announcements.view"><AnnouncementListPage /></RequireAuth>} />
          <Route path="announcements/create" element={<RequireAuth permission="announcements.manage"><AnnouncementCreatePage /></RequireAuth>} />
          <Route path="announcements/:id" element={<RequireAuth permission="announcements.view"><AnnouncementDetailPage /></RequireAuth>} />
          <Route path="announcements/:id/edit" element={<RequireAuth permission="announcements.manage"><AnnouncementEditPage /></RequireAuth>} />
          <Route path="news" element={<RequireAuth permission="news.view"><NewsListPage /></RequireAuth>} />
          <Route path="news/create" element={<RequireAuth permission="news.manage"><NewsCreatePage /></RequireAuth>} />
          <Route path="news/:id" element={<RequireAuth permission="news.view"><NewsDetailPage /></RequireAuth>} />
          <Route path="news/:id/edit" element={<RequireAuth permission="news.manage"><NewsEditPage /></RequireAuth>} />
          <Route path="storage" element={<RequireAuth permission="storage.view"><StorageDashboardPage /></RequireAuth>} />
          <Route path="storage/inventory" element={<RequireAuth permission="storage.view"><InventoryPage /></RequireAuth>} />
          <Route path="storage/borrow" element={<RequireAuth permission="storage.manage.counter"><BorrowListPage /></RequireAuth>} />
          <Route path="storage/borrow/walk-in" element={<RequireAuth permission="storage.manage.counter"><WalkInPage /></RequireAuth>} />
          <Route path="storage/borrow/:id" element={<RequireAuth permission="storage.manage.counter"><BorrowDetailPage /></RequireAuth>} />
          <Route path="storage/return" element={<RequireAuth permission="storage.manage.counter"><ReturnPage /></RequireAuth>} />
          <Route path="storage/qc" element={<RequireAuth permission="storage.manage.qc"><QCListPage /></RequireAuth>} />
          <Route path="storage/qc/:id" element={<RequireAuth permission="storage.manage.qc"><QCDetailPage /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
