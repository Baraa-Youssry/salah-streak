import { ALADHAN_METHOD, CAIRO_TZ, type Prayer } from './constants';
import { cairoToday } from './prayers';
import { createAdminClient } from './supabase/admin';
import type { PrayerTimes } from '@/types/database.types';
import { fromZonedTime } from 'date-fns-tz';

type AladhanTimings = Record<string, string>;

/** Turn any thrown value into a readable message (Supabase errors aren't Error instances). */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const obj = e as { message?: unknown; code?: unknown; hint?: unknown };
    if (typeof obj.message === 'string' && obj.message) {
      return typeof obj.code === 'string' && obj.code
        ? `${obj.message} (${obj.code})`
        : obj.message;
    }
  }
  if (typeof e === 'string' && e) return e;
  try {
    return JSON.stringify(e);
  } catch {
    return 'unknown error';
  }
}

function hasServiceRoleKey(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Real service_role keys are long JWTs (eyJ…). Reject obvious placeholders.
  return Boolean(key && key.length >= 40 && key.startsWith('eyJ'));
}

async function fetchAladhan(date: string): Promise<Omit<PrayerTimes, 'is_fallback'>> {
  const [y, m, d] = date.split('-');
  const url =
    `https://api.aladhan.com/v1/timingsByCity` +
    `?city=Cairo&country=Egypt&method=${ALADHAN_METHOD}&date=${d}-${m}-${y}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Aladhan HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    data?: { timings?: AladhanTimings };
    code?: number;
  };
  const timings = json.data?.timings;
  if (!timings || json.code !== 200) {
    throw new Error('Aladhan bad payload');
  }

  const pick = (key: string): string => {
    const raw = timings[key];
    if (!raw) throw new Error(`Aladhan missing ${key}`);
    const clock = raw.trim().split(/\s+/)[0];
    return fromZonedTime(`${date}T${clock}:00`, CAIRO_TZ).toISOString();
  };

  return {
    date,
    fajr: pick('Fajr'),
    dhuhr: pick('Dhuhr'),
    asr: pick('Asr'),
    maghrib: pick('Maghrib'),
    isha: pick('Isha'),
  };
}

async function readExisting(
  date: string
): Promise<PrayerTimes | null> {
  if (!hasServiceRoleKey()) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('prayer_times')
      .select('*')
      .eq('date', date)
      .maybeSingle();
    if (error) return null;
    return (data as PrayerTimes | null) ?? null;
  } catch {
    return null;
  }
}

async function tryPersist(
  row: Omit<PrayerTimes, 'is_fallback'>,
  isFallback: boolean
): Promise<PrayerTimes | null> {
  if (!hasServiceRoleKey()) return null;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('prayer_times')
      .upsert({ ...row, is_fallback: isFallback }, { onConflict: 'date' })
      .select('*')
      .single();
    if (error) return null;
    return (data as PrayerTimes | null) ?? null;
  } catch {
    return null;
  }
}

async function copyLatestPrior(date: string): Promise<Omit<PrayerTimes, 'is_fallback'>> {
  if (!hasServiceRoleKey()) {
    throw new Error('no prior prayer_times to copy for ' + date);
  }
  const admin = createAdminClient();
  const { data: prev, error } = await admin
    .from('prayer_times')
    .select('*')
    .lt('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!prev) throw new Error(`no prior prayer_times to copy for ${date}`);

  return {
    date,
    fajr: prev.fajr,
    dhuhr: prev.dhuhr,
    asr: prev.asr,
    maghrib: prev.maghrib,
    isha: prev.isha,
  };
}

/**
 * Ensure a row exists in prayer_times for `date` (Cairo calendar date).
 * Fetches from Aladhan (method 5); on failure copies the latest prior day
 * with is_fallback = true. If service-role is unavailable, still returns
 * live Aladhan times without persisting (page stays usable).
 */
export async function ensurePrayerTimes(date: string): Promise<PrayerTimes> {
  const existing = await readExisting(date);
  if (existing) return existing;

  let row: Omit<PrayerTimes, 'is_fallback'>;
  let isFallback = false;
  let aladhanError: unknown = null;

  try {
    row = await fetchAladhan(date);
  } catch (e) {
    aladhanError = e;
    try {
      row = await copyLatestPrior(date);
      isFallback = true;
    } catch (priorErr) {
      throw new Error(
        `Prayer times unavailable — Aladhan: ${errorMessage(aladhanError)}; prior day: ${errorMessage(priorErr)}`
      );
    }
  }

  const saved = await tryPersist(row, isFallback);
  if (saved) return saved;

  // Could not persist (no/invalid service role) — still serve the times.
  return { ...row, is_fallback: isFallback };
}

/** Ensure times for today; never throws if Aladhan (or a prior row) is reachable. */
export async function ensureTodayTimes(
  today: string = cairoToday()
): Promise<PrayerTimes> {
  return ensurePrayerTimes(today);
}

export function emptyTimes(): Record<Prayer, string> {
  return {
    fajr: '',
    dhuhr: '',
    asr: '',
    maghrib: '',
    isha: '',
  };
}

export function toTimeMap(row: PrayerTimes): Record<Prayer, string> {
  return {
    fajr: row.fajr,
    dhuhr: row.dhuhr,
    asr: row.asr,
    maghrib: row.maghrib,
    isha: row.isha,
  };
}

export type { Prayer };
