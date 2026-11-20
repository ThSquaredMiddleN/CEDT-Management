import { useQuery } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import { fetchMe } from "@/api/endpoints";
import { isDemoMode } from "@/demo/demoMode";
import { qk } from "@/api/queryKeys";
import type { Role, User } from "@/api/types";
import { Button } from "@/components/ui/button";

interface AuthContextValue {
  user: User | null;
}

const AuthContext = createContext<AuthContextValue>({ user: null });

export const useAuth = () => useContext(AuthContext);

// Single `staff` role: everyone lands on the calendar after login (Dashboard is one nav click away).
export const roleLanding = (_role?: Role): string => "/calendar";

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
  const { data, error, isPending, refetch } = useQuery({
    queryKey: qk.me,
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  });

  if (isPending) return <Splash />;
  if (isDemoMode && error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-body text-body-md text-grey-700" role="alert">
          เริ่ม Demo Mode ไม่สำเร็จ: {error instanceof Error ? error.message : "เกิดข้อผิดพลาด"}
        </p>
        <Button variant="outlined" size="medium" onClick={() => void refetch()}>
          ลองอีกครั้ง
        </Button>
      </main>
    );
  }

  return <AuthContext.Provider value={{ user: data?.user ?? null }}>{children}</AuthContext.Provider>;
}
