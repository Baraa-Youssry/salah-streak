import { NextResponse } from 'next/server';
import * as webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import { cairoToday } from '@/lib/prayers';
import { PRAYERS, type Prayer } from '@/lib/constants';
import type { Lang, NotificationPreferences, PushSubscription } from '@/types/database.types';

export const runtime = 'nodejs';
export const maxDuration = 10;
export const dynamic = 'force-dynamic';

const REMINDER_WINDOW_START_MS = 20 * 60 * 1000; // +20 min after start
const REMINDER_WINDOW_END_MS = 60 * 60 * 1000; // through +60 min
const HARD_RUNTIME_MS = 8_000;

const COPY: Record<Lang, Record<Prayer, { title: string; body: string }>> = {
  en: {
    fajr: { title: 'Fajr prayer time', body: 'Mark Fajr on Salah Streak.' },
    dhuhr: { title: 'Dhuhr prayer time', body: 'Mark Dhuhr on Salah Streak.' },
    asr: { title: 'Asr prayer time', body: 'Mark Asr on Salah Streak.' },
    maghrib: { title: 'Maghrib prayer time', body: 'Mark Maghrib on Salah Streak.' },
    isha: { title: 'Isha prayer time', body: 'Mark Isha on Salah Streak.' },
  },
  ar: {
    fajr: { title: 'حان وقت صلاة الفجر', body: 'سجّل الفجر في سلسلة الصلاة.' },
    dhuhr: { title: 'حان وقت صلاة الظهر', body: 'سجّل الظهر في سلسلة الصلاة.' },
    asr: { title: 'حان وقت صلاة العصر', body: 'سجّل العصر في سلسلة الصلاة.' },
    maghrib: { title: 'حان وقت صلاة المغرب', body: 'سجّل المغرب في سلسلة الصلاة.' },
    isha: { title: 'حان وقت صلاة العشاء', body: 'سجّل العشاء في سلسلة الصلاة.' },
  },
};

async function handle(request: Request): Promise<NextResponse> {
  const started = Date.now();
  const deadline = started + HARD_RUNTIME_MS;

  // --- Auth: Bearer CRON_SECRET only (no hard-coded secret). ---
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || !auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // --- VAPID (optional: skip send if unset, never hard-code). ---
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ ok: true, skipped: 'vapid_unconfigured' });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const admin = createAdminClient();
  const today = cairoToday();

  // --- Today's Cairo prayer times ---
  const { data: times, error: timesErr } = await admin
    .from('prayer_times')
    .select('fajr,dhuhr,asr,maghrib,isha')
    .eq('date', today)
    .maybeSingle();

  if (timesErr) {
    return NextResponse.json({ error: timesErr.message }, { status: 500 });
  }
  if (!times) {
    return NextResponse.json({ ok: true, skipped: 'no_times' });
  }

  // --- Which prayers are in [start+20m, start+60m) right now? ---
  const nowMs = Date.now();
  const windowPrayers: Prayer[] = PRAYERS.filter((p) => {
    const start = new Date(times[p]).getTime();
    return (
      nowMs >= start + REMINDER_WINDOW_START_MS &&
      nowMs < start + REMINDER_WINDOW_END_MS
    );
  });

  if (windowPrayers.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'outside_window' });
  }

  // --- Users with reminders enabled for these prayers ---
  const { data: prefs, error: prefsErr } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('enabled', true);

  if (prefsErr) {
    return NextResponse.json({ error: prefsErr.message }, { status: 500 });
  }

  const allPrefs = (prefs ?? []) as NotificationPreferences[];
  const eligible = allPrefs.filter((p) =>
    windowPrayers.some((prayer) => p[prayer] === true)
  );
  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_users' });
  }

  // --- Push subscriptions ---
  const { data: subs, error: subsErr } = await admin
    .from('push_subscriptions')
    .select('*');

  if (subsErr) {
    return NextResponse.json({ error: subsErr.message }, { status: 500 });
  }

  const subByUser = new Map<string, PushSubscription>();
  for (const s of (subs ?? []) as PushSubscription[]) {
    subByUser.set(s.user_id, s);
  }

  // --- Already sent today for these prayers ---
  const { data: sentRows, error: sentErr } = await admin
    .from('reminders_sent')
    .select('user_id, prayer')
    .eq('date', today)
    .in('prayer', windowPrayers);

  if (sentErr) {
    return NextResponse.json({ error: sentErr.message }, { status: 500 });
  }

  const sentSet = new Set(
    (sentRows ?? []).map((r) => `${r.user_id}:${r.prayer}`)
  );

  // --- Claim + send with allSettled; 8s hard cap ---
  let claimed = 0;
  let delivered = 0;
  let failed = 0;
  const results = await Promise.allSettled(
    eligible.flatMap((pref) => {
      if (!subByUser.has(pref.user_id)) return [];
      return windowPrayers
        .filter((prayer) => pref[prayer] === true)
        .filter((prayer) => !sentSet.has(`${pref.user_id}:${prayer}`))
        .filter(() => Date.now() < deadline)
        .map(async (prayer) => {
          // Idempotent claim (PK = user,date,prayer).
          const { data: claim, error: claimErr } = await admin
            .from('reminders_sent')
            .insert({ user_id: pref.user_id, date: today, prayer })
            .select('user_id, prayer')
            .maybeSingle();

          if (claimErr) {
            // 23505 = already claimed by a concurrent run.
            return { ok: false as const, reason: claimErr.code ?? claimErr.message };
          }
          if (!claim) return { ok: false as const, reason: 'no_claim' };
          claimed += 1;

          const sub = subByUser.get(pref.user_id)!;
          const copy = COPY[pref.lang ?? 'en'][prayer];
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({
                title: copy.title,
                body: copy.body,
                tag: `prayer-${prayer}-${today}`,
                prayer,
                date: today,
              })
            );
            delivered += 1;
            return { ok: true as const };
          } catch (err) {
            // Roll back claim so the next minute can retry transient failures.
            await admin
              .from('reminders_sent')
              .delete()
              .eq('user_id', pref.user_id)
              .eq('date', today)
              .eq('prayer', prayer);
            failed += 1;
            return {
              ok: false as const,
              reason: err instanceof Error ? err.message : 'send_failed',
            };
          }
        });
    })
  );

  const rejected = results.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({
    ok: true,
    window: windowPrayers,
    eligible: eligible.length,
    claimed,
    delivered,
    failed,
    rejected,
    elapsedMs: Date.now() - started,
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
