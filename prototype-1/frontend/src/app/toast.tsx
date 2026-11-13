import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

interface Toast {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);
  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);

  const show = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }].slice(-3));
    timers.current.set(id, setTimeout(() => dismiss(id), 6500));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-label="ผลการทำรายการ" className="pointer-events-none fixed bottom-4 left-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-6 sm:left-6 sm:right-auto sm:w-96">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex animate-in items-start justify-between gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm leading-relaxed text-neutral-50 shadow-lg duration-200 slide-in-from-bottom-2"
          >
            <span className="min-w-0 break-words">{t.message}</span>
            <button type="button" aria-label="ปิดการแจ้งเตือน" onClick={() => dismiss(t.id)} className="mt-0.5 shrink-0 rounded p-0.5 text-neutral-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
