import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return (
      <main role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center">
        <h1 className="text-lg font-semibold">เปิดหน้านี้ไม่สำเร็จ</h1>
        <p className="text-sm text-neutral-600">ตรวจสอบการเชื่อมต่อแล้วโหลดหน้าอีกครั้ง หากมีข้อมูลที่ยังไม่บันทึกให้ตรวจสอบก่อนออกจากหน้า</p>
        <Button variant="outline" onClick={() => window.location.reload()}>โหลดหน้าใหม่</Button>
      </main>
    );
    return this.props.children;
  }
}

export function DeferredPage({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <PageErrorBoundary key={location.pathname}>
      <Suspense fallback={<div role="status" aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
        <span className="text-sm text-neutral-600">กำลังเปิดหน้า…</span>
        <div className="h-10 w-64 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
      </div>}>
        {children}
      </Suspense>
    </PageErrorBoundary>
  );
}
