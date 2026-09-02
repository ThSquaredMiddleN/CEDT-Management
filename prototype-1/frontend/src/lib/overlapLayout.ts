import { timeToMin } from "./slots";

export interface Positioned {
  leftPct: number;
  widthPct: number;
  track: number;
}

interface HasTime {
  startTime: string;
  endTime: string;
}

/** Half-open overlap test — back-to-back blocks (12:00 end / 12:00 start) do not overlap. */
const overlaps = (a: HasTime, b: HasTime): boolean =>
  timeToMin(a.startTime) < timeToMin(b.endTime) && timeToMin(a.endTime) > timeToMin(b.startTime);

/**
 * Lay out one column's blocks side by side (§7a):
 *   1. sort by start asc, duration desc
 *   2. sweep into clusters of transitively overlapping blocks
 *   3. greedily assign each block the lowest free track within its cluster
 *   4. width = 100 / tracks in that cluster
 */
export function layoutColumn<T extends HasTime>(items: T[]): (T & Positioned)[] {
  const sorted = [...items].sort((a, b) => {
    const s = timeToMin(a.startTime) - timeToMin(b.startTime);
    if (s !== 0) return s;
    const durA = timeToMin(a.endTime) - timeToMin(a.startTime);
    const durB = timeToMin(b.endTime) - timeToMin(b.startTime);
    return durB - durA;
  });

  const out: (T & Positioned)[] = [];

  let cluster: T[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;

    // Greedy track assignment: reuse the lowest track whose last block has already ended.
    const trackEnds: number[] = [];
    const assigned = cluster.map((item) => {
      let track = trackEnds.findIndex((end) => end <= timeToMin(item.startTime));
      if (track === -1) {
        track = trackEnds.length;
        trackEnds.push(0);
      }
      trackEnds[track] = timeToMin(item.endTime);
      return { item, track };
    });

    const tracks = trackEnds.length;
    for (const { item, track } of assigned) {
      out.push({
        ...item,
        track,
        leftPct: (track / tracks) * 100,
        widthPct: 100 / tracks,
      });
    }

    cluster = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const startsAfterCluster = timeToMin(item.startTime) >= clusterEnd;
    const touchesCluster = cluster.some((c) => overlaps(c, item));

    if (cluster.length > 0 && startsAfterCluster && !touchesCluster) flush();

    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, timeToMin(item.endTime));
  }
  flush();

  return out;
}
