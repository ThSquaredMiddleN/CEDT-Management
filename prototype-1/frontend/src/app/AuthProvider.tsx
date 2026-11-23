import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { fetchMe } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { qk } from "@/api/queryKeys";
import type { Role, User } from "@/api/types";

interface AuthContextValue {
  user: User | null;
}

const AuthContext = createContext<AuthContextValue>({ user: null });

export const useAuth = () => useContext(AuthContext);

// Staff land on the calendar (Dashboard is one nav click away); students only have Course Change.
export const roleLanding = (role?: Role): string =>
  role === "student" ? "/course-change" : "/calendar";

/** Full-page splash while the session bootstraps — never a blank screen. */
function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-100">
      <div className="flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-neutral-900 text-neutral-50">
          <FlaskConical className="size-5" />
        </div>
        <span className="text-2xl font-semibold tracking-tight">CEDT LabSync</span>
      </div>
      <div className="h-1 w-40 animate-pulse rounded-full bg-neutral-200" />
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // The only session signal available to the SPA — the cookie itself is httpOnly.
  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: qk.me,
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  });

  if (isPending) return <Splash />;
  if (isError && !(error instanceof ApiError && error.status === 401)) return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
      <FlaskConical className="size-8 text-neutral-500" />
      <h1 className="text-lg font-semibold">เชื่อมต่อระบบไม่สำเร็จ</h1>
      <p className="max-w-md text-sm text-neutral-600">ยังตรวจสอบการเข้าสู่ระบบไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง ฉบับร่างในแท็บนี้ยังไม่ถูกล้าง</p>
      <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "กำลังเชื่อมต่อ…" : "ลองเชื่อมต่ออีกครั้ง"}</Button>
    </div>
  );

  return <AuthContext.Provider value={{ user: data?.user ?? null }}>{children}</AuthContext.Provider>;
}
