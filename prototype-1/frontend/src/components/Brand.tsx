import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ size = "sm" }: { size?: "sm" | "lg" }) {
  const lg = size === "lg";
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-neutral-900 text-neutral-50",
          lg ? "size-10" : "size-8",
        )}
      >
        <FlaskConical className={lg ? "size-5" : "size-4"} />
      </div>
      <span
        className={cn("font-semibold tracking-tight", lg ? "text-2xl" : "text-base")}
      >
        CEDT LabSync
      </span>
    </div>
  );
}
