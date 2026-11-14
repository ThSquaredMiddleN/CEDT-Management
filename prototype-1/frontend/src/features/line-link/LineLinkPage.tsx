import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Home, Link2, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { checkLineLinkToken, linkLineAccount } from "@/api/endpoints";
import { roleLanding, useAuth } from "@/app/AuthProvider";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type View = "checking" | "login" | "confirm" | "success" | "invalid" | "error";

/** Thai line first, English line second (muted). */
function Bilingual({ th, en }: { th: string; en: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-neutral-950">{th}</p>
      <p className="text-sm text-neutral-500">{en}</p>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="flex w-full max-w-md flex-col items-center gap-6 p-6 text-center break-words sm:p-8">
      <div className="flex size-12 items-center justify-center rounded-xl bg-neutral-900 text-neutral-50">
        {icon}
      </div>
      <h1 className="flex flex-col gap-1 text-xl font-semibold tracking-tight">{title}</h1>
      {children}
    </Card>
  );
}

export function LineLinkPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  // Staff land on the calendar (roleLanding), not the student home at "/".
  const home = roleLanding(user?.role);

  // Read the token once and keep it in state. Nothing is sent until the user confirms.
  const [token] = useState(() => params.get("token")?.trim() ?? "");

  // Checked as soon as the page opens, before login. Read-only on the server. A failed check does not block
  // the page: it falls back to login and Confirm, and Confirm still checks the token on the server.
  const check = useQuery({
    queryKey: ["line-link-check", token],
    queryFn: () => checkLineLinkToken(token),
    enabled: token !== "",
    retry: false,
    refetchOnWindowFocus: false,
  });

  const link = useMutation({ mutationFn: linkLineAccount });
  const { mutate } = link;

  const checking = token !== "" && check.isPending;
  const checkedInvalid = !token || check.data?.valid === false;

  // A successful Confirm wins over the check: the token is used up by then, so a refetched check says invalid.
  const view: View = link.isSuccess
    ? "success"
    : checking
      ? "checking"
      : checkedInvalid
        ? "invalid"
        : link.isError
          ? link.error instanceof ApiError && link.error.status === 400
            ? "invalid"
            : "error"
          : user
            ? "confirm"
            : "login";

  // Drop only the token param from the address bar, once the attempt has settled as success or invalid.
  // Until then the token stays in the URL, so a reload before Confirm still shows the confirm view. "error"
  // keeps it too, so Try again and reload both work. history.state is kept so react-router's history index
  // survives. Harmless under StrictMode's double effect: the second run finds no token param.
  useEffect(() => {
    if (view !== "success" && view !== "invalid") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token")) return;
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [view]);

  // Same redirect as RequireAuth: `next` keeps the ?token= query, so login brings the user back here.
  if (view === "login") {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return (
    <main className="flex min-w-0 flex-col items-center px-4 py-8 sm:px-12 sm:py-16">
      {view === "checking" && (
        <div role="status" aria-label="Checking LINE link">
          <Spinner className="size-6" />
        </div>
      )}

      {view === "confirm" && (
        <StatusCard
          icon={<Link2 className="size-5" />}
          title={
            <>
              <span>ยืนยันการเชื่อมต่อ LINE</span>
              <span className="text-sm font-normal text-neutral-500">Confirm LINE link</span>
            </>
          }
        >
          {user && (
            <Bilingual
              th={`เชื่อมต่อ LINE กับบัญชี ${user.name} (${user.email})?`}
              en={`Link LINE to ${user.name} (${user.email})?`}
            />
          )}
          <div className="flex flex-col items-center gap-3">
            <Button onClick={() => mutate(token)} disabled={link.isPending || !user}>
              {link.isPending && <Spinner className="size-4" />}
              ยืนยัน · Confirm
            </Button>
            <Link to={home} className="text-sm text-neutral-500 underline-offset-4 hover:underline">
              ยกเลิก · Cancel
            </Link>
          </div>
        </StatusCard>
      )}

      {view === "success" && (
        <StatusCard
          icon={<CheckCircle2 className="size-5" />}
          title={
            <>
              <span>เชื่อมต่อ LINE สำเร็จ</span>
              <span className="text-sm font-normal text-neutral-500">LINE account linked</span>
            </>
          }
        >
          <Bilingual
            th="ตั้งแต่นี้ไป การแจ้งเตือนจะถูกส่งเข้า LINE ของคุณ"
            en="Notifications will now arrive in your LINE chat."
          />
          <Button asChild>
            <Link to={home}>
              <Home className="size-4" />
              กลับหน้าหลัก · Back to home
            </Link>
          </Button>
        </StatusCard>
      )}

      {view === "invalid" && (
        <StatusCard
          icon={<AlertCircle className="size-5" />}
          title={
            <>
              <span>ลิงก์นี้ไม่ถูกต้องหรือหมดอายุแล้ว</span>
              <span className="text-sm font-normal text-neutral-500">
                This link is invalid or has expired
              </span>
            </>
          }
        >
          <Bilingual
            th="กรุณาส่งข้อความใดก็ได้ไปยัง LINE Official Account เพื่อรับลิงก์ใหม่"
            en="Send any message to the LINE Official Account to get a new link."
          />
        </StatusCard>
      )}

      {view === "error" && (
        <StatusCard
          icon={<AlertCircle className="size-5" />}
          title={
            <>
              <span>ไม่สามารถเชื่อมต่อ LINE ได้ในขณะนี้</span>
              <span className="text-sm font-normal text-neutral-500">
                Couldn't link your LINE account right now
              </span>
            </>
          }
        >
          <Bilingual
            th="กรุณาลองอีกครั้ง หากยังไม่ได้ ให้ติดต่อเจ้าหน้าที่"
            en="Try again. If it still fails, contact CEDT staff."
          />
          <Button variant="outline" onClick={() => mutate(token)}>
            <RotateCcw className="size-4" />
            ลองอีกครั้ง · Try again
          </Button>
        </StatusCard>
      )}
    </main>
  );
}
