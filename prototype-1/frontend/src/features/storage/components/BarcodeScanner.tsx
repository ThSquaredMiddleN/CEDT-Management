import { Barcode, Camera, CameraOff, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IndexTypeBadge } from "./badges";
import { useCameraScan } from "./useCameraScan";
import type { CatalogEntry } from "./useCart";

interface BarcodeScannerProps {
  catalog: CatalogEntry[];
  onScan: (entry: CatalogEntry) => void;
  disabled?: boolean;
}

/**
 * Hardware scanners type the barcode and press Enter, so the search box doubles
 * as the scanner input: an exact barcode match on Enter is a scan. The camera
 * uses BarcodeDetector (native or ZXing-WASM fallback); the result buttons
 * remain as a manual fallback.
 */
export function BarcodeScanner({ catalog, onScan, disabled }: BarcodeScannerProps) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.name.toLowerCase().includes(q) || c.barcode.toLowerCase().includes(q));
  }, [catalog, query]);

  const [notice, setNotice] = useState<string | null>(null);

  const scan = (entry: CatalogEntry) => {
    if (disabled) return;
    setNotice(null);
    onScan(entry);
  };

  const handleCode = (code: string) => {
    const hit = catalog.find((c) => c.barcode.toLowerCase() === code.toLowerCase());
    if (hit) scan(hit);
    else setNotice(`ไม่พบบาร์โค้ด "${code}" ในรายการที่จ่ายได้`);
  };

  const camera = useCameraScan(handleCode);
  const cameraOn = camera.state === "scanning" || camera.state === "starting";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-400">
          <video
            ref={camera.videoRef}
            muted
            playsInline
            className={cameraOn ? "absolute inset-0 size-full object-cover" : "hidden"}
          />
          {!cameraOn && (
            <>
              {camera.state === "error" ? (
                <CameraOff className="mb-2 size-9 text-neutral-600" aria-hidden="true" />
              ) : (
                <Camera className="mb-2 size-9 text-neutral-600" aria-hidden="true" />
              )}
              <span className="px-4 text-center font-body text-body-xs text-neutral-500">
                {camera.error ?? "กดเปิดกล้องเพื่อสแกนบาร์โค้ด"}
              </span>
            </>
          )}
          {camera.state === "scanning" && (
            <div className="absolute top-1/2 h-0.5 w-full bg-brand-primary/60 shadow-[0_0_8px_2px_rgba(42,122,226,0.6)]" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={disabled || camera.state === "starting"}
          onClick={cameraOn ? camera.stop : camera.start}
        >
          {cameraOn ? "ปิดกล้อง" : "เปิดกล้องสแกน"}
        </Button>
        {notice && (
          <p role="status" className="text-center text-xs text-red-600">
            {notice}
          </p>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-grey-200" aria-hidden="true" />
        <Input
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const exact = catalog.find((c) => c.barcode.toLowerCase() === query.trim().toLowerCase());
            if (exact) {
              scan(exact);
              setQuery("");
            }
          }}
          placeholder="ค้นหาด้วยชื่อ หรือ ยิงเลขบาร์โค้ด..."
          aria-label="ค้นหาหรือสแกนบาร์โค้ด"
          className="h-11 pl-9"
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <p className="mb-3 font-body text-body-xs-emphasize uppercase tracking-wide text-grey-400">
          จำลองยิงบาร์โค้ด
        </p>
        {results.length === 0 ? (
          <p className="py-2 text-center font-body text-body-xs text-grey-200">ไม่พบอุปกรณ์</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {results.map((c) => (
              <button
                key={c.itemId}
                type="button"
                disabled={disabled}
                onClick={() => scan(c)}
                className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-left transition-colors hover:border-brand-primary disabled:opacity-50"
              >
                <span className="flex min-w-0 items-center gap-2 font-body text-body-sm-emphasize text-grey-900">
                  <Barcode className="size-4 shrink-0 text-grey-200" aria-hidden="true" />
                  <span className="truncate">{c.name}</span>
                </span>
                <IndexTypeBadge isUnique={c.isUnique} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
