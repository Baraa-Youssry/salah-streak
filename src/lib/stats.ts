import { PRAYERS, type Prayer, type Prayer as P } from './constants';
import type { PrayerState } from './prayers';

export type DoneByDate = Map<string, Set<P>>;

export function buildDoneByDate(
  rows: Array<{ date: string; prayer: P; status: 'done' | 'missed' }>
): DoneByDate {
  const map: DoneByDate = new Map();
  for (const row of rows) {
    if (row.status !== 'done') continue;
    let set = map.get(row.date);
    if (!set) {
      set = new Set();
      map.set(row.date, set);
    }
    set.add(row.prayer);
  }
  return map;
}

/** done / max(elapsed, 1) as 0–100. */
export function completionPercent(
  doneCount: number,
  elapsedCount: number
): number {
  if (elapsedCount <= 0) return 0;
  return Math.round((doneCount / elapsedCount) * 100);
}

export function countDone(
  done: ReadonlySet<Prayer> | undefined
): number {
  if (!done) return 0;
  let n = 0;
  for (const p of PRAYERS) if (done.has(p)) n++;
  return n;
}

export type { PrayerState };
