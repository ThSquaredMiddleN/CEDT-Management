/** Calendar grid geometry (§7a). Pure and unit-testable — no dates, no timezones. */

export const DAY_START_MIN = 7 * 60; // 07:00
export const DAY_END_MIN = 21 * 60; // 21:00
export const SLOT_MIN = 30; // grid resolution
export const HOUR_PX = 56; // h-14 per hour, per the wireframes
export const SLOT_PX = HOUR_PX / 2; // 28px per half hour
export const HOURS = Array.from({ length: 14 }, (_, i) => 7 + i); // 07:00 … 20:00

export const timeToMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export const minToTime = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Pixel offset from the top of the grid body. */
export const timeToY = (t: string): number =>
  ((timeToMin(t) - DAY_START_MIN) / 60) * HOUR_PX;

export const durToH = (start: string, end: string): number =>
  ((timeToMin(end) - timeToMin(start)) / 60) * HOUR_PX;

/** Snap a click/drag y-offset to the nearest half-hour slot index. */
export const yToNearestSlot = (y: number): number => Math.round(y / SLOT_PX);

/** Clicking an empty slot pre-fills the booking form with a 1-hour block. */
export function slotFromOffsetY(offsetY: number): { start: string; end: string } {
  const slotIndex = Math.floor(offsetY / SLOT_PX);
  const startMin = Math.min(DAY_START_MIN + slotIndex * SLOT_MIN, DAY_END_MIN - 60);
  return { start: minToTime(startMin), end: minToTime(startMin + 60) };
}
