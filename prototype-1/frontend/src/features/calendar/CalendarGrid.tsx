import type { CalendarOccurrence } from "@/api/types";
import { layoutColumn } from "@/lib/overlapLayout";
import { durToH, HOURS, HOUR_PX, slotFromOffsetY, SLOT_PX, timeToY } from "@/lib/slots";
import { cn } from "@/lib/utils";

/**
 * One engine, two views (§7a). Weekly buckets occurrences by date; daily buckets them by
 * room for a single date. Gutter, rows, block math and overlap layout are identical.
 */
export type ColumnModel =
  | { kind: "days"; columns: { date: string; label: string; sub: string; isWeekend: boolean }[] }
  | { kind: "rooms"; date: string; columns: { roomId: string; label: string; sub: string }[] };

export interface GhostBlock {
  date: string;
  roomId: string;
  startTime: string;
  endTime: string;
  label: string;
}

interface Props {
  model: ColumnModel;
  occurrences: CalendarOccurrence[];
  ghosts?: GhostBlock[];
  isLoading?: boolean;
  onOccurrenceClick?: (occ: CalendarOccurrence) => void;
  onEmptySlotClick?: (args: { date: string; roomId?: string; start: string; end: string }) => void;
}

function EventBlock({
  occ,
  leftPct,
  widthPct,
  onClick,
}: {
  occ: CalendarOccurrence;
  leftPct: number;
  widthPct: number;
  onClick?: (occ: CalendarOccurrence) => void;
}) {
  const approved = occ.status === "approved";
  const tentative = occ.isTentativeAnonymous;

  return (
    <button
      type="button"
      // Tentative holds carry no information and nothing to open.
      disabled={tentative}
      title={tentative ? "Tentative hold" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!tentative) onClick?.(occ);
      }}
      style={{
        top: timeToY(occ.startTime),
        height: Math.max(durToH(occ.startTime, occ.endTime), SLOT_PX),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      className={cn(
        "absolute overflow-hidden rounded-lg p-2 text-left transition-opacity",
        approved
          ? "bg-neutral-900 text-neutral-50 hover:opacity-90"
          : "stripes-pending border border-dashed border-neutral-200",
        tentative ? "cursor-default" : "cursor-pointer",
      )}
    >
      {tentative ? (
        <span className="text-[10px] font-medium text-neutral-500">Tentative</span>
      ) : (
        <>
          <div
            className={cn(
              "truncate text-xs font-semibold",
              approved ? "text-neutral-50" : "text-neutral-950",
            )}
          >
            {occ.courseCode ?? occ.title}
          </div>
          <div
            className={cn(
              "truncate text-[10px]",
              approved ? "text-neutral-300" : "text-neutral-500",
            )}
          >
            {occ.roomName}
          </div>
          <div
            className={cn(
              "truncate text-[10px]",
              approved ? "text-neutral-300" : "text-neutral-500",
            )}
          >
            {occ.startTime}–{occ.endTime}
          </div>
        </>
      )}
    </button>
  );
}

interface NormalizedColumn {
  key: string;
  label: string;
  sub: string;
  isWeekend: boolean;
  /** The date this column represents (the fixed date, in the daily view). */
  date: string;
  /** Set only in the daily view, where each column is a room lane. */
  roomId?: string;
}

export function CalendarGrid({
  model,
  occurrences,
  ghosts = [],
  isLoading,
  onOccurrenceClick,
  onEmptySlotClick,
}: Props) {
  // Flatten the two view shapes into one column descriptor so the render loop is shared.
  const columns: NormalizedColumn[] =
    model.kind === "days"
      ? model.columns.map((c) => ({
          key: c.date,
          label: c.label,
          sub: c.sub,
          isWeekend: c.isWeekend,
          date: c.date,
        }))
      : model.columns.map((c) => ({
          key: c.roomId,
          label: c.label,
          sub: c.sub,
          isWeekend: false,
          date: model.date,
          roomId: c.roomId,
        }));

  const columnCount = columns.length;

  // Weekly buckets occurrences by date; daily buckets them by room.
  const bucketOf = (occ: CalendarOccurrence): string =>
    model.kind === "days" ? occ.date : occ.roomId;

  return (
    <div className="overflow-x-auto">
      <div
        className={cn(model.kind === "rooms" && columnCount > 8 && "min-w-[1200px]")}
        style={{ minWidth: model.kind === "rooms" ? `${64 + columnCount * 140}px` : undefined }}
      >
        {/* Sticky header row */}
        <div
          className="sticky top-0 z-10 grid border-b border-neutral-200 bg-neutral-100"
          style={{ gridTemplateColumns: `64px repeat(${columnCount}, minmax(0, 1fr))` }}
        >
          <div className="border-r border-neutral-200" />
          {columns.map((col) => (
            <div
              key={col.key}
              className="flex flex-col items-center gap-0.5 border-r border-neutral-200 py-2 last:border-r-0"
            >
              <span
                className={cn(
                  "text-xs font-medium",
                  col.isWeekend ? "text-neutral-500" : "text-neutral-950",
                )}
              >
                {col.label}
              </span>
              <span className="text-[11px] text-neutral-500">{col.sub}</span>
            </div>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="max-h-[520px] overflow-y-auto">
          <div
            className="grid"
            style={{ gridTemplateColumns: `64px repeat(${columnCount}, minmax(0, 1fr))` }}
          >
            {/* Time gutter: 07:00 … 20:00 */}
            <div className="border-r border-neutral-200">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-b border-neutral-200 px-2 pt-1 text-right text-[10px] text-neutral-500"
                  style={{ height: HOUR_PX }}
                >
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>

            {columns.map((col) => {
              const { date, roomId } = col;

              const inColumn = occurrences.filter((o) => bucketOf(o) === col.key);
              const laid = layoutColumn(inColumn);

              const columnGhosts = ghosts.filter((g) =>
                model.kind === "days" ? g.date === date : g.roomId === roomId && g.date === date,
              );

              return (
                <div
                  key={col.key}
                  className={cn(
                    "relative border-r border-neutral-200 last:border-r-0",
                    col.isWeekend && "bg-neutral-100/40",
                  )}
                  onClick={(e) => {
                    if (!onEmptySlotClick) return;
                    const { start, end } = slotFromOffsetY(e.nativeEvent.offsetY);
                    onEmptySlotClick({ date, roomId, start, end });
                  }}
                >
                  {/* Background hour rows double as the empty-slot click targets. */}
                  {HOURS.map((h) => (
                    <div
                      key={h}
                      className="group border-b border-neutral-200"
                      style={{ height: HOUR_PX }}
                    >
                      {onEmptySlotClick && (
                        <span className="pointer-events-none flex h-full items-center justify-center text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100">
                          +
                        </span>
                      )}
                    </div>
                  ))}

                  {isLoading
                    ? [0, 2, 5].map((slot) => (
                        <div
                          key={slot}
                          className="absolute inset-x-1 animate-pulse rounded-lg bg-neutral-100"
                          style={{ top: slot * HOUR_PX + 8, height: HOUR_PX * 1.5 }}
                        />
                      ))
                    : laid.map((occ) => (
                        <EventBlock
                          key={occ.occurrenceId}
                          occ={occ}
                          leftPct={occ.leftPct}
                          widthPct={occ.widthPct}
                          onClick={onOccurrenceClick}
                        />
                      ))}

                  {/* Ghost overlay: the request being previewed from the queue (?ghost=). */}
                  {columnGhosts.map((g, i) => (
                    <div
                      key={`${g.date}-${i}`}
                      style={{
                        top: timeToY(g.startTime),
                        height: Math.max(durToH(g.startTime, g.endTime), SLOT_PX),
                      }}
                      className="stripes-pending pointer-events-none absolute inset-x-1 rounded-lg p-2 opacity-80 ring-2 ring-neutral-900"
                    >
                      <div className="truncate text-xs font-semibold text-neutral-950">{g.label}</div>
                      <div className="truncate text-[10px] text-neutral-500">
                        {g.startTime}–{g.endTime}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
