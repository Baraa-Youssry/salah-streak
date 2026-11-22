import { createClient } from '@/lib/supabase/server';
import { ensureTodayTimes, errorMessage } from '@/lib/prayer-times';
import { cairoToday } from '@/lib/prayers';
import { TodayClient } from './TodayClient';
import type { PrayerLog, PrayerTimes } from '@/types/database.types';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Today</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          Auth error: {authError.message}
        </p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const today = cairoToday();

  let times: PrayerTimes | null = null;
  let timesError: string | null = null;
  try {
    times = await ensureTodayTimes(today);
  } catch (e) {
    timesError = errorMessage(e);
  }

  // Prefer a direct read first (works with just the anon key + RLS).
  if (!times) {
    const { data: existing, error: readErr } = await supabase
      .from('prayer_times')
      .select('*')
      .eq('date', today)
      .maybeSingle();
    if (existing) times = existing as PrayerTimes;
    else if (readErr) {
      timesError = timesError ?? errorMessage(readErr);
    }
  }

  const { data: logs, error: logErr } = await supabase
    .from('prayer_logs')
    .select('*')
    .eq('date', today)
    .eq('user_id', user.id);

  return (
    <TodayClient
      date={today}
      times={times}
      timesError={timesError && !times ? timesError : null}
      initialLogs={(logs ?? []) as PrayerLog[]}
      logsError={logErr ? errorMessage(logErr) : null}
      userId={user.id}
    />
  );
}
