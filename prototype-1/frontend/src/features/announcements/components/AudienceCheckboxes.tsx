import type { AnnouncementAudience } from "@/api/types";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_YEAR_AUDIENCES,
  type AnnouncementYearAudience,
} from "../announcement-utils";

export function AudienceCheckboxes({
  value,
  onChange,
}: {
  value: AnnouncementYearAudience[];
  onChange: (value: AnnouncementYearAudience[]) => void;
}) {
  const allSelected = ANNOUNCEMENT_YEAR_AUDIENCES.every((audience) =>
    value.includes(audience),
  );

  const toggle = (audience: AnnouncementAudience, checked: boolean) => {
    if (audience === "all") {
      onChange(checked ? [...ANNOUNCEMENT_YEAR_AUDIENCES] : []);
      return;
    }

    onChange(
      checked
        ? value.includes(audience)
          ? value
          : [...value, audience]
        : value.filter((selected) => selected !== audience),
    );
  };

  return (
    <fieldset className="min-w-0">
      <legend className="font-body text-body-sm-emphasize text-brand-primary">Options</legend>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
        {ANNOUNCEMENT_AUDIENCES.map(({ value: audience, label }) => (
          <label
            key={audience}
            className="inline-flex cursor-pointer items-center gap-2 font-body text-body-sm text-brand-primary"
          >
            <input
              type="checkbox"
              checked={audience === "all" ? allSelected : value.includes(audience)}
              onChange={(event) => toggle(audience, event.target.checked)}
              className="size-5 cursor-pointer rounded accent-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
