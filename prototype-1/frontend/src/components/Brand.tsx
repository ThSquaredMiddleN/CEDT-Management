import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({
  size = "sm",
  tone = "neutral",
}: {
  size?: "sm" | "lg";
  tone?: "neutral" | "primary";
}) {
  const lg = size === "lg";
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg",
          tone === "primary"
            ? "bg-brand-primary text-white"
            : "bg-neutral-900 text-neutral-50",
          lg ? "size-10" : "size-8",
        )}
      >
        <FlaskConical className={lg ? "size-5" : "size-4"} />
      </div>
      <span
        className={cn(
          "font-semibold tracking-tight",
          lg
            ? "text-2xl"
            : "text-body-sm-emphasize font-bold leading-[21px] text-grey-900",
        )}
      >
        CEDT LabSync
      </span>
    </div>
  );
}
