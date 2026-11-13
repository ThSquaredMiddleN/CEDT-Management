import { useEffect, useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import type { CcRequest } from "@/api/courseChange";
import { fmtDateTime } from "./shared";
const owners: Record<string, string> = {
  staff: "เจ้าหน้าที่",
  student: "นิสิต",
  signer: "ผู้ลงนาม · เจ้าหน้าที่ติดตาม",
  registry: "ทะเบียน / สนท. · เจ้าหน้าที่ติดตาม",
};
export function PhaseWait({ r }: { r: CcRequest }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!r.phaseSince) return;
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, [r.phaseSince]);
  if (!r.phaseSince) return null;
  return (
    <span className="flex flex-col gap-1 text-xs leading-relaxed text-neutral-600">
      <span>รอ: {owners[r.waitingOn ?? ""] ?? "ตรวจสอบผู้รับผิดชอบ"}</span>
      <span title={`เริ่มขั้นตอน ${fmtDateTime(r.phaseSince)}`}>
        อยู่ในขั้นนี้มา{" "}
        {formatDistanceToNow(parseISO(r.phaseSince), { locale: th })}
      </span>
    </span>
  );
}
