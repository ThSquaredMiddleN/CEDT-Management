import { useState } from "react";
import { EmptyState, SkeletonRow } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCatalog } from "../api/hooks";
import { ItemImage } from "../components/ItemImage";
import { QtyStepper, RequestForm } from "../components/RequestForm";
import type { CatalogItem } from "../types";

function CatalogCard({ item, qty, onChange }: { item: CatalogItem; qty: number; onChange: (qty: number) => void }) {
  const soldOut = item.available === 0;
  return (
    <div className="flex h-full flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3">
      <ItemImage name={item.name} className="size-auto h-28 w-full" />
      <div className="flex-1">
        <p className="font-body text-body-sm-emphasize text-grey-900">{item.name}</p>
        <p className="font-mono text-xs text-grey-400">{item.id}</p>
      </div>
      <p className={cn("text-xs font-bold", soldOut ? "text-status-warning-fg" : "text-status-success-fg")}>
        {soldOut ? "หมด · ต่อคิวได้" : `ว่าง ${item.available}`}
      </p>
      {qty === 0 ? (
        <Button variant="outlined" size="small" className="w-full px-0" onClick={() => onChange(1)}>
          + เพิ่ม
        </Button>
      ) : (
        <QtyStepper value={qty} max={item.total} onChange={onChange} label={item.name} />
      )}
    </div>
  );
}

/** Borrow tab: picture-card catalog with the cart column on the right. */
export function CatalogPage({ onSubmitted }: { onSubmitted: (requestId: string) => void }) {
  const inventory = useCatalog();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});

  const all = inventory.data ?? [];
  const q = search.trim().toLowerCase();
  const items = all.filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));

  const setQty = (itemId: string, qty: number) => {
    const item = all.find((i) => i.id === itemId);
    if (!item) return;
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = Math.min(qty, item.total);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="min-w-0 flex-1 space-y-4">
        <Input
          type="search"
          aria-label="ค้นหาอุปกรณ์"
          placeholder="ค้นหาอุปกรณ์ (ชื่อหรือรหัส)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {inventory.isLoading && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <SkeletonRow key={i} className="h-56" />)}
          </div>
        )}
        {inventory.isError && <EmptyState title="โหลดรายการอุปกรณ์ไม่สำเร็จ" />}
        {inventory.data && items.length === 0 && <EmptyState title="ไม่พบอุปกรณ์" />}
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <CatalogCard item={item} qty={cart[item.id] ?? 0} onChange={(qty) => setQty(item.id, qty)} />
            </li>
          ))}
        </ul>
      </section>
      <aside className="lg:w-80">
        <RequestForm
          inventory={all}
          cart={cart}
          onQtyChange={setQty}
          onSubmitted={(id) => {
            setCart({});
            onSubmitted(id);
          }}
        />
      </aside>
    </div>
  );
}
