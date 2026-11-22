import { createClient } from '@/lib/supabase/server';
import { cairoToday, computeStreak, listRecentDates, shiftDate } from '@/lib/prayers';
import { PRAYERS, type Prayer } from '@/lib/constants';
import { buildDoneByDate, completionPercent, countDone } from '@/lib/stats';
import { StatsView } from './StatsView';
import type { Group } from '@/types/database.types';

export const dynamic = 'force-dynamic';

export default async function StatsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const today = cairoToday();
  const since = shiftDate(today, -400);

  const { data: logRows } = await supabase
    .from('prayer_logs')
    .select('date, prayer, status')
    .eq('user_id', user.id)
    .gte('date', since);

  const rows = (logRows ?? []) as Array<{
    date: string;
    prayer: Prayer;
    status: 'done' | 'missed';
  }>;

  const doneByDate = buildDoneByDate(rows);
  const streak = computeStreak(doneByDate, today);

  // Today completion against elapsed slots is computed client-side with live
  // prayer times; here we report raw done counts.
  const todayDone = countDone(doneByDate.get(today));

  // Last 7 full days (yesterday back 7): done slots / 35.
  const last7Dates = listRecentDates(shiftDate(today, -1), 7);
  let last7Done = 0;
  for (const d of last7Dates) {
    last7Done += countDone(doneByDate.get(d));
  }
  const last7Pct = completionPercent(last7Done, 35);

  // Per-prayer: last 30 calendar days including today.
  const last30Dates = new Set(listRecentDates(today, 30));
  const perPrayerDone: Record<Prayer, number> = {
    fajr: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0,
  };
  for (const row of rows) {
    if (row.status === 'done' && last30Dates.has(row.date)) {
      perPrayerDone[row.prayer] += 1;
    }
  }
  const perPrayerPct = PRAYERS.map((p) => ({
    prayer: p,
    pct: completionPercent(perPrayerDone[p], 30),
    done: perPrayerDone[p],
  }));

  // Groups: members + today's logs (RLS: only shared-group rows visible).
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id);
  const groupIds = (memberships ?? []).map((m) => m.group_id);

  type GroupSnap = {
    group: Group;
    members: Array<{ user_id: string; display_name: string; todayDone: number }>;
  };
  const groupSnaps: GroupSnap[] = [];

  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from('groups')
      .select('*')
      .in('id', groupIds)
      .order('created_at', { ascending: false });

    for (const group of (groups ?? []) as Group[]) {
      const { data: members } = await supabase
        .from('group_members')
        .select('user_id, profiles(display_name)')
        .eq('group_id', group.id);

      const memberRows = (members ?? []) as unknown as Array<{
        user_id: string;
        profiles: { display_name: string } | null;
      }>;
      const memberIds = memberRows.map((m) => m.user_id);

      let todayLogs: Array<{ user_id: string; prayer: Prayer; status: 'done' | 'missed' }> = [];
      if (memberIds.length > 0) {
        const { data } = await supabase
          .from('prayer_logs')
          .select('user_id, prayer, status')
          .eq('date', today)
          .in('user_id', memberIds)
          .eq('status', 'done');
        todayLogs = (data ?? []) as typeof todayLogs;
      }

      const doneByUser = new Map<string, Set<Prayer>>();
      for (const log of todayLogs) {
        let set = doneByUser.get(log.user_id);
        if (!set) {
          set = new Set();
          doneByUser.set(log.user_id, set);
        }
        set.add(log.prayer);
      }

      groupSnaps.push({
        group,
        members: memberRows.map((m) => ({
          user_id: m.user_id,
          display_name: m.profiles?.display_name ?? '—',
          todayDone: countDone(doneByUser.get(m.user_id)),
        })),
      });
    }
  }

  return (
    <StatsView
      streak={streak}
      todayDone={todayDone}
      last7Pct={last7Pct}
      last7Done={last7Done}
      perPrayer={perPrayerPct}
      groupSnaps={groupSnaps}
      hasAnyLogs={rows.length > 0}
    />
  );
}
