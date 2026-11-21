import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * Receiving PromptPay ID (phone, 13-digit national/tax ID or e-wallet ID).
 * Set VITE_PROMPTPAY_ID in .env; the fallback is a placeholder so a real
 * account is never hardcoded. Anyone who scans the QR can read this ID.
 */
const PROMPTPAY_ID = (import.meta.env.VITE_PROMPTPAY_ID as string | undefined) ?? "0812345678";

interface PromptPayQRProps {
  amount: number;
  size?: number;
}

export function PromptPayQR({ amount, size = 192 }: PromptPayQRProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    // Dynamic QR (amount embedded) — the payer cannot edit the amount in their banking app.
    const payload = generatePayload(PROMPTPAY_ID, { amount: Math.round(amount * 100) / 100 });
    QRCode.toDataURL(payload, { width: size * 2, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [amount, size]);

  if (failed) return <p role="alert" className="text-sm text-status-danger-fg">สร้าง QR ไม่สำเร็จ</p>;
  return (
    <div className="inline-block rounded-xl border border-neutral-200 bg-white p-3" style={{ width: size + 26 }}>
      {src ? (
        <img src={src} width={size} height={size} alt={`PromptPay QR ยอด ${amount.toLocaleString()} บาท`} />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded bg-neutral-100" />
      )}
    </div>
  );
}
