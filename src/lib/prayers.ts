import { formatInTimeZone } from 'date-fns-tz';
import { CAIRO_TZ, PRAYERS, type Prayer } from './constants';

export type { Prayer } from './constants';

/** Calendar date string (yyyy-MM-dd) for "now" in Cairo. */
export function cairoToday(d: Date = new Date()): string {
  return formatInTimeZone(d, CAIRO_TZ, 'yyyy-MM-dd');
}

/** Format a stored timestamptz as a Cairo-local time label. */
export function formatPrayerTime(iso: string): string {
  return formatInTimeZone(new Date(iso), CAIRO_TZ, 'h:mm a');
}

export type PrayerState = {
  /** Prayer currently in its window (last started, not yet past day end), or null. */
  current: Prayer | null;
  /** Prayers whose start time is still in the future (locked). */
  future: ReadonlySet<Prayer>;
  /** Prayers whose start time has passed (markable). */
  elapsed: ReadonlySet<Prayer>;
};

/**
 * Classify each prayer against `now` using UTC start instants.
 * - future: now < start (locked)
 * - elapsed: now >= start (Done/Missed allowed)
 * - current: the latest elapsed prayer (highlighted)
 */
export function getPrayerState(
  times: Record<Prayer, string>,
  now: Date = new Date()
): PrayerState {
  const t = now.getTime();
  const future = new Set<Prayer>();
  const elapsed = new Set<Prayer>();
  let current: Prayer | null = null;

  for (const p of PRAYERS) {
    const start = new Date(times[p]).getTime();
    if (t < start) future.add(p);
    else {
      elapsed.add(p);
      current = p;
    }
  }

  return { current, future, elapsed };
}

/** All five done on a given day? */
export function isCompleteDay(
  donePrayers: ReadonlySet<Prayer> | ReadonlyArray<Prayer>
): boolean {
  const set = donePrayers instanceof Set ? donePrayers : new Set(donePrayers);
  return PRAYERS.every((p) => set.has(p));
}

/**
 * Consecutive days (ending today or yesterday) with all five done.
 * If today is incomplete, streak is counted through yesterday (day still in progress).
 */
export function computeStreak(
  doneByDate: ReadonlyMap<string, ReadonlySet<Prayer>>,
  today: string
): number {
  let streak = 0;
  let cursor = today;

  // If today is not complete yet, don't break the streak — start from yesterday.
  if (!isCompleteDay(doneByDate.get(today) ?? new Set())) {
    cursor = shiftDate(today, -1);
  }

  for (let i = 0; i < 400; i++) {
    const set = doneByDate.get(cursor);
    if (!set || !isCompleteDay(set)) break;
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }

  return streak;
}

/** Shift a yyyy-MM-dd date by whole days (UTC-safe for date-only strings). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Days between two yyyy-MM-dd strings (a - b). */
export function daysBetween(a: string, b: string): number {
  const pa = Date.parse(`${a}T00:00:00Z`);
  const pb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((pa - pb) / 86_400_000);
}

export function listRecentDates(today: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(shiftDate(today, -i));
  }
  return out;
}
