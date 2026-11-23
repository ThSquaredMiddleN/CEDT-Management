import { MapPin } from "lucide-react";
import type { PickupDetails } from "../types";
import { formatDateTime } from "./dates";

export const LOCATION_LABEL: Record<PickupDetails["location"], string> = {
  locker: "ตู้ Smart Locker",
  counter: "เคาน์เตอร์ภาควิชาฯ",
  lab: "ห้องปฏิบัติการ (Lab)",
};

/** Where and when to collect, as set by staff when issuing. */
export function PickupCard({ pickup }: { pickup: PickupDetails }) {
  return (
    <div className="rounded-lg border border-status-success-border bg-status-success-bg p-4 font-body text-body-sm text-status-success-fg">
      <p className="flex items-center gap-2 font-bold">
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        รับที่{LOCATION_LABEL[pickup.location]} · {formatDateTime(new Date(pickup.pickupAt).getTime())}
      </p>
      {pickup.remark && <p className="mt-1 text-xs">หมายเหตุ: {pickup.remark}</p>}
    </div>
  );
}
