import type { MouseEvent } from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import type { CuLinkItem } from "../data/cuLinks";

interface ServiceLinkCardProps {
  item: CuLinkItem;
}

export function ServiceLinkCard({ item }: ServiceLinkCardProps) {
  const hasHref = Boolean(item.href);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!hasHref) {
      event.preventDefault();
    }
  };

  return (
    <a
      href={item.href ?? "#"}
      target={hasHref ? "_blank" : undefined}
      rel={hasHref ? "noopener noreferrer" : undefined}
      aria-disabled={!hasHref ? "true" : undefined}
      onClick={handleClick}
      className="flex items-center gap-4 rounded-xl border border-grey-200 bg-surface p-3 transition-colors hover:border-brand-primary/50 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
    >
      {item.iconSrc ? (
        <img
          src={item.iconSrc}
          alt=""
          className="h-[46px] w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="h-[46px] w-12 shrink-0 rounded-lg bg-grey-200"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <h2 className="font-body text-body-md-emphasize text-grey-900">
          {item.title}
        </h2>
        <p className="font-body text-body-sm text-grey-700">
          {item.description}
        </p>
      </div>

      <ArrowTopRightOnSquareIcon
        className="size-5 shrink-0 text-grey-900"
        aria-hidden="true"
      />
    </a>
  );
}
