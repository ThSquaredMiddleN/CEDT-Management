import { isDemoMode } from "@/demo/demoMode";

export function DemoModeNotice() {
  if (!isDemoMode) return null;

  return (
    <div
      role="status"
      className="border-b border-grey-200 bg-grey-100 px-4 py-2 font-body text-body-sm text-grey-700 md:px-8"
    >
      Demo Mode: ข้อมูลจำลองเฉพาะแท็บนี้ ไม่ได้บันทึกลง server/database และจะเริ่มใหม่เมื่อเปิดแท็บใหม่
    </div>
  );
}
