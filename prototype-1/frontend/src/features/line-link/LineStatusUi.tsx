import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** Thai line first, English line second (muted). */
export function Bilingual({ th, en }: { th: string; en: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-neutral-950">{th}</p>
      <p className="text-sm text-neutral-500">{en}</p>
    </div>
  );
}

export function StatusCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="flex w-full max-w-md flex-col items-center gap-6 p-6 text-center break-words sm:p-8">
      <div className="flex size-12 items-center justify-center rounded-xl bg-neutral-900 text-neutral-50">
        {icon}
      </div>
      <h1 className="flex flex-col gap-1 text-xl font-semibold tracking-tight">{title}</h1>
      {children}
    </Card>
  );
}
