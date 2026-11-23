import { PlusIcon, XMarkIcon } from "@heroicons/react/20/solid";
import type { NewsTag } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NEWS_TAGS, newsTagLabel, newsTagClassName } from "../news-utils";

export function NewsTagsField({
  value,
  onChange,
}: {
  value: NewsTag[];
  onChange: (value: NewsTag[]) => void;
}) {
  const toggle = (tag: NewsTag, checked: boolean) => {
    onChange(
      checked
        ? value.includes(tag)
          ? value
          : [...value, tag]
        : value.filter((selected) => selected !== tag),
    );
  };

  return (
    <fieldset className="min-w-0">
      <legend className="font-body text-body-md-emphasize text-brand-primary">Tags</legend>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {value.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className={`gap-1 rounded-full border-transparent font-body text-body-xs ${newsTagClassName(tag)}`}
          >
            {newsTagLabel(tag)}
            <button
              type="button"
              aria-label={`ลบแท็ก ${newsTagLabel(tag)}`}
              onClick={() => toggle(tag, false)}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            >
              <XMarkIcon className="size-3" aria-hidden="true" />
            </button>
          </Badge>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost-primary"
              size="small"
              className="size-7 min-w-7 rounded-full p-0"
              aria-label="เพิ่มแท็กข่าว"
            >
              <PlusIcon className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="space-y-1">
              {NEWS_TAGS.map(({ value: tag, label }) => (
                <label
                  key={tag}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 font-body text-body-sm text-grey-700 hover:bg-grey-100"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(tag)}
                    onChange={(event) => toggle(tag, event.target.checked)}
                    className="size-4 accent-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </fieldset>
  );
}
