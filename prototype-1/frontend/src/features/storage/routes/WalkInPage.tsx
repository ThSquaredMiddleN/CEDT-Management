import { User } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInventory, useStudentLookup, useWalkInCheckout } from "../api/hooks";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { CartManager } from "../components/CartManager";
import { ResultDialog, StoragePage } from "../components/layout";
import { useCart, type CatalogEntry } from "../components/useCart";
import type { InventoryItem } from "../types";

function Workspace({ inventory }: { inventory: InventoryItem[] }) {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("6632199921");
  const [groupId, setGroupId] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const lookup = useStudentLookup();
  const checkout = useWalkInCheckout();

  const catalog = useMemo<CatalogEntry[]>(
    () =>
      inventory.map((i) => ({
        itemId: i.id,
        name: i.name,
        barcode: i.id,
        isUnique: i.isUnique,
        maxStock: i.available,
        serials: i.availableSerials,
      })),
    [inventory],
  );
  const cart = useCart([], { removeAtZero: true });
  const student = lookup.data;
  const canSubmit = !!student && !!groupId && cart.lines.length > 0 && !checkout.isPending;

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex min-w-0 flex-col gap-4 lg:w-7/12">
          <section className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="mb-4 border-b pb-2 font-body text-body-md-emphasize text-grey-900">
              ระบุตัวตนผู้เบิก (Context)
            </h2>
            <label htmlFor="walkin-sid" className="mb-1 block font-body text-body-sm-emphasize text-grey-400">
              รหัสนิสิต
            </label>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setGroupId("");
                lookup.mutate(studentId, { onSuccess: (s) => setGroupId(s.groups[0]?.id ?? "") });
              }}
            >
              <Input id="walkin-sid" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="h-10" />
              <Button type="submit" variant="filled" size="lg" className="px-5" loading={lookup.isPending}>
                ดึงข้อมูล
              </Button>
            </form>
            {lookup.isError && <p role="alert" className="mt-2 text-sm text-status-danger-fg">{(lookup.error as Error).message}</p>}

            {student && (
              <div className="mt-4 space-y-3 rounded-lg border border-status-info-border bg-status-info-bg p-4">
                <div>
                  <p className="text-xs text-status-info-fg">พบข้อมูลนิสิต</p>
                  <p className="flex items-center gap-2 font-bold text-status-info-fg">
                    <User className="size-4 text-status-info-fg" /> {student.name} ({student.studentId})
                  </p>
                </div>
                <div>
                  <label htmlFor="walkin-group" className="mb-1 block text-xs font-bold text-status-info-fg">
                    เลือกกลุ่มที่ต้องการอ้างอิงเบิกอุปกรณ์ <span className="text-status-danger-fg">*</span>
                  </label>
                  <select
                    id="walkin-group"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="h-9 w-full rounded-md border border-status-info-border bg-white px-2 text-sm font-bold shadow-sm"
                  >
                    {student.groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between border-b pb-2">
              <h2 className="font-body text-body-md-emphasize text-grey-900">ตะกร้ารอตัดสต็อก</h2>
              <span className="rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-xs font-bold text-grey-700">
                {cart.lines.length} รายการ
              </span>
            </div>
            <div className="min-h-[300px] rounded-xl border border-neutral-200 bg-neutral-50 p-4">
              <CartManager lines={cart.lines} onAdjust={cart.adjust} onRemoveSn={cart.removeSn} onRemove={cart.remove} />
            </div>
          </section>
        </div>

        <aside className="lg:w-5/12">
          <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5 lg:sticky lg:top-6">
            <h3 className="border-b pb-2 font-body text-body-md-emphasize text-grey-900">เครื่องมือสแกน (Scan)</h3>
            <BarcodeScanner catalog={catalog} onScan={cart.scan} />
            {checkout.isError && <p role="alert" className="text-sm text-status-danger-fg">{(checkout.error as Error).message}</p>}
            <Button
              variant="filled"
              size="lg"
              className="w-full"
              disabled={!canSubmit}
              loading={checkout.isPending}
              onClick={() =>
                checkout.mutate(
                  { studentId: student!.studentId, groupId, lines: cart.issued },
                  {
                    onSuccess: ({ swept }) =>
                      setDone(
                        "ตัดสต็อกตามตะกร้าเรียบร้อย" +
                          (swept.length ? `\n\nคำขอที่สต็อกไม่พอถูกปรับเป็น UNFULFILLED: ${swept.join(", ")}` : ""),
                      ),
                  },
                )
              }
            >
              ยืนยันการทำรายการ Walk-in
            </Button>
          </div>
        </aside>
      </div>

      <ResultDialog open={done !== null} title="ทำรายการสำเร็จ" message={done ?? ""} onClose={() => navigate("/admin/storage")} />
    </>
  );
}

export function WalkInPage() {
  const inv = useInventory();
  return (
    <StoragePage wide title="Scan-to-Cart (Walk-in)" backTo="/admin/storage" backLabel="กลับหน้า Dashboard">
      {inv.data ? <Workspace inventory={inv.data} /> : <div className="flex justify-center py-16"><Spinner /></div>}
    </StoragePage>
  );
}
