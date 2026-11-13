import { useCallback, useEffect, useRef, useState } from "react";

type CameraState = "idle" | "starting" | "scanning" | "error";

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

const SCAN_INTERVAL_MS = 250;
const REPEAT_COOLDOWN_MS = 1500; // same code held in front of the camera counts once

/** Native BarcodeDetector where available (Chromium), otherwise the ZXing-WASM ponyfill. */
async function createDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: new (o?: object) => Detector }).BarcodeDetector;
  if (native) return new native();
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector() as unknown as Detector;
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในเบราว์เซอร์";
  if (name === "NotFoundError") return "ไม่พบกล้องในอุปกรณ์นี้";
  if (name === "NotReadableError") return "กล้องกำลังถูกใช้งานโดยแอปอื่น";
  if (!window.isSecureContext) return "ต้องเปิดผ่าน HTTPS หรือ localhost จึงจะใช้กล้องได้";
  return "เปิดกล้องไม่สำเร็จ";
}

export function useCameraScan(onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const [state, setState] = useState<CameraState>("idle");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setError(null);
    setState("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();

      const detector = await createDetector();
      let busy = false;
      timerRef.current = window.setInterval(async () => {
        if (busy || video.readyState < 2) return;
        busy = true;
        try {
          const found = await detector.detect(video);
          const code = found[0]?.rawValue?.trim();
          const now = Date.now();
          if (code && (code !== lastRef.current.code || now - lastRef.current.at > REPEAT_COOLDOWN_MS)) {
            lastRef.current = { code, at: now };
            onCodeRef.current(code);
          }
        } catch {
          /* a failed frame is not fatal; try the next one */
        } finally {
          busy = false;
        }
      }, SCAN_INTERVAL_MS);
      setState("scanning");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setError(cameraErrorMessage(err));
      setState("error");
    }
  }, [stop]);

  useEffect(() => stop, [stop]); // release the camera on unmount

  return { videoRef, state, error, start, stop };
}
