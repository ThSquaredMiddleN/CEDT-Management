import { useCallback, useMemo, useState } from "react";
import type { IssuedLine } from "../types";

export interface CartLine {
  itemId: string;
  name: string;
  isUnique: boolean;
  qty: number; // for unique items always equals sns.length
  sns: string[];
  maxStock: number;
  reqQty?: number;
}

export interface CatalogEntry {
  itemId: string;
  name: string;
  barcode: string;
  isUnique: boolean;
  maxStock: number;
  reqQty?: number;
}

interface Options {
  /** Walk-in drops a bulk line when it reaches 0; Click & Collect keeps it at 0. */
  removeAtZero?: boolean;
}

function mockSerial(barcode: string, taken: string[]) {
  let sn: string;
  do {
    sn = `${barcode}-${Math.floor(Math.random() * 900 + 100)}`;
  } while (taken.includes(sn));
  return sn;
}

export function useCart(initial: CatalogEntry[] = [], { removeAtZero = false }: Options = {}) {
  const [lines, setLines] = useState<CartLine[]>(() =>
    initial.map((c) => ({ ...c, qty: 0, sns: [] })),
  );

  const scan = useCallback((entry: CatalogEntry) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.itemId === entry.itemId);
      const line: CartLine = idx >= 0 ? prev[idx] : { ...entry, qty: 0, sns: [] };
      if (line.qty >= line.maxStock) return prev; // never exceed real stock
      const next: CartLine = line.isUnique
        ? { ...line, sns: [...line.sns, mockSerial(entry.barcode, line.sns)], qty: line.qty + 1 }
        : { ...line, qty: line.qty + 1 };
      return idx >= 0 ? prev.map((l, i) => (i === idx ? next : l)) : [...prev, next];
    });
  }, []);

  const adjust = useCallback(
    (itemId: string, delta: number) => {
      setLines((prev) =>
        prev.flatMap((l) => {
          if (l.itemId !== itemId || l.isUnique) return [l];
          const qty = Math.min(l.maxStock, l.qty + delta);
          return qty < (removeAtZero ? 1 : 0) ? [] : [{ ...l, qty }];
        }),
      );
    },
    [removeAtZero],
  );

  const removeSn = useCallback(
    (itemId: string, sn: string) => {
      setLines((prev) =>
        prev.flatMap((l) => {
          if (l.itemId !== itemId) return [l];
          const sns = l.sns.filter((s) => s !== sn);
          return sns.length === 0 && removeAtZero ? [] : [{ ...l, sns, qty: sns.length }];
        }),
      );
    },
    [removeAtZero],
  );

  const remove = useCallback((itemId: string) => {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }, []);

  const issued: IssuedLine[] = useMemo(
    () => lines.map((l) => ({ itemId: l.itemId, qty: l.qty, sns: l.sns })),
    [lines],
  );

  return { lines, scan, adjust, removeSn, remove, issued, totalQty: lines.reduce((n, l) => n + l.qty, 0) };
}
