import { Info, Lock, User, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EmptyState, Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBorrowRequest, useConfirmBorrow, useInventory } from "../api/hooks";
import { TaskStatusBadge } from "../components/badges";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { CartManager } from "../components/CartManager";
import { ResultDialog, StoragePage } from "../components/layout";
import { useCart, type CatalogEntry } from "../components/useCart";
import type { BorrowRequest, InventoryItem, PickupDetails } from "../types";

function Workspace({ req, inventory }: { req: BorrowRequest; inventory: InventoryItem[] }) {
  const navigate = useNavigate();
  const confirm = useConfirmBorrow();
  const [pickupAt, setPickupAt] = useState("");
  const [location, setLocation] = useState<PickupDetails["location"]>("locker");
  const [remark, setRemark] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const readOnly = req.status !== "OPEN";

  const catalog = useMemo<CatalogEntry[]>(
    () =>
      req.items.map((it) => ({
        itemId: it.itemId,
        name: it.name,
        barcode: it.itemId,
        isUnique: it.isUnique,
        reqQty: it.reqQty,
        maxStock: inventory.find((i) => i.id === it.itemId)?.available ?? 0,
      })),
    [req, inventory],
  );

  // Partial fulfilment: every requested line starts at zero.
  const cart = useCart(catalog);

  const readOnlyLines = req.items.map((it) => ({
    itemId: it.itemId,
    name: it.name,
    isUnique: it.isUnique,
    qty: req.status === "UNFULFILLED" ? 0 : it.issuedQty,
    sns: [],
    maxStock: inventory.find((i) => i.id === it.itemId)?.available ?? 0,
    reqQty: it.reqQty,
  }));

  const canSubmit = cart.totalQty > 0 && !!pickupAt && !confirm.isPending;

  const submit = () => {
    confirm.mutate(
      { id: req.id, lines: cart.issued, pickup: { pickupAt, location, remark } },
      {
        onSuccess: ({ swept }) =>
          setResult(
            "อัปเดตสต็อกพร้อมส่งแจ้งเตือนนัดหมายไปยังนิสิตเรียบร้อย Task เปลี่ยนสถานะเป็น READY_FOR_PICKUP" +
              (swept.length ? `\n\nระบบปรับคำขอที่สต็อกไม่พอเป็น UNFULFILLED อัตโนมัติ: ${swept.join(", ")}` : ""),
          ),
      },
    );
  };

  return (
    <>
      <div className={readOnly ? "mx-auto max-w-4xl" : "flex flex-col gap-6 lg:flex-row"}>
        <section className={readOnly ? "" : "min-w-0 lg:w-7/12"}>
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 p-5">
              <div>
                <h2 className="font-body text-body-md-emphasize text-grey-900">{req.id}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 font-body text-body-sm text-grey-400">
                  <span className="flex items-center gap-1"><User className="size-3.5" /> {req.studentId} {req.user}</span>
                  <span className="flex items-center gap-1"><Users className="size-3.5" /> {req.group}</span>
                </p>
              </div>
              <TaskStatusBadge status={req.status} />
            </div>

            <div className="space-y-4 p-6">
              {readOnly ? (
                <div className="flex gap-3 rounded-lg border border-neutral-300 bg-neutral-100 p-3 font-body text-body-sm text-grey-700">
                  <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p className={req.status === "UNFULFILLED" ? "font-bold text-red-700" : ""}>
                    {req.status === "UNFULFILLED"
                      ? "คำขอนี้ถูกยกเลิกเนื่องจากอุปกรณ์ในคลังไม่เพียงพอ (UNFULFILLED) - Read-only View"
                      : "รายการนี้ถูกจัดการเรียบร้อยแล้ว (Read-only View)"}
                  </p>
                </div>
              ) : (
                <div className="flex gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 font-body text-body-sm text-blue-800">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    กำหนดจำนวนจ่าย (เริ่มที่ 0) สแกนบาร์โค้ดเพื่อเพิ่มจำนวน
                    <br />
                    <span className="text-xs font-bold text-blue-600">
                      สามารถจ่ายน้อยกว่าที่ขอได้ โดยระบบจะไม่ให้กรอกเกินจำนวนจริงในคลัง
                    </span>
                  </p>
                </div>
              )}

              {readOnly ? (
                <ul className="space-y-3">
                  {readOnlyLines.map((l) => (
                    <li key={l.itemId} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 opacity-80">
                      <span className="font-body text-body-sm-emphasize text-grey-900">{l.name}</span>
                      <span className="rounded border border-neutral-200 bg-neutral-100 px-4 py-2 font-body text-body-sm-emphasize text-grey-400">
                        จ่ายแล้ว: {l.qty} / ขอ: {l.reqQty}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <CartManager
                  showRequested
                  lines={cart.lines}
                  onAdjust={cart.adjust}
                  onRemoveSn={cart.removeSn}
                />
              )}
            </div>
          </div>
        </section>

        {!readOnly && (
          <aside className="lg:w-5/12">
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-6">
              <h3 className="border-b pb-2 font-body text-body-md-emphasize text-grey-900">
                เครื่องมือจ่ายอุปกรณ์ (Scan)
              </h3>
              <BarcodeScanner catalog={catalog} onScan={cart.scan} />

              <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/50 p-4">
                <div>
                  <label htmlFor="pickup-at" className="mb-1 block text-xs font-bold text-blue-800">
                    กำหนดเวลานัดรับ <span className="text-red-500">*</span>
                  </label>
                  <Input id="pickup-at" type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="pickup-loc" className="mb-1 block text-xs font-bold text-blue-800">
                    สถานที่รับอุปกรณ์ <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="pickup-loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value as PickupDetails["location"])}
                    className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950"
                  >
                    <option value="locker">ตู้ Smart Locker (รับรหัสผ่านทางแอป)</option>
                    <option value="counter">เคาน์เตอร์ภาควิชาฯ (ติดต่อเจ้าหน้าที่)</option>
                    <option value="lab">ห้องปฏิบัติการ (Lab)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pickup-remark" className="mb-1 block text-xs font-bold text-blue-800">
                    หมายเหตุ (Remark ถึงผู้ยืม)
                  </label>
                  <Textarea id="pickup-remark" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="เช่น จ่ายของให้บางส่วนก่อน..." />
                </div>
              </div>

              {confirm.isError && (
                <p role="alert" className="text-sm text-red-600">{(confirm.error as Error).message}</p>
              )}
              <Button variant="default" size="lg" className="w-full" disabled={!canSubmit} loading={confirm.isPending} onClick={submit}>
                ยืนยันการจัดเตรียม (ส่งแจ้งเตือน)
              </Button>
              {cart.totalQty === 0 && (
                <p className="text-center text-xs text-grey-200">ต้องจ่ายอย่างน้อย 1 ชิ้น และกำหนดเวลานัดรับ</p>
              )}
            </div>
          </aside>
        )}
      </div>

      <ResultDialog
        open={result !== null}
        title="บันทึกสำเร็จ"
        message={result ?? ""}
        onClose={() => navigate("/admin/storage")}
      />
    </>
  );
}

export function BorrowDetailPage() {
  const { id = "" } = useParams();
  const req = useBorrowRequest(id);
  const inv = useInventory();

  return (
    <StoragePage wide title="รายละเอียดคำขอ" backTo="/admin/storage/borrow" backLabel="กลับหน้ารายการ">
      {req.isError ? (
        <EmptyState title="ไม่พบคำขอนี้" />
      ) : !req.data || !inv.data ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <Workspace req={req.data} inventory={inv.data} />
      )}
    </StoragePage>
  );
}
