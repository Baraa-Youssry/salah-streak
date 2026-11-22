'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import {
  formatPrayerTime,
  getPrayerState,
  isCompleteDay,
} from '@/lib/prayers';
import { PRAYERS, type Prayer } from '@/lib/constants';
import type { PrayerLog, PrayerTimes } from '@/types/database.types';

type Props = {
  date: string;
  times: PrayerTimes | null;
  timesError: string | null;
  initialLogs: PrayerLog[];
  logsError?: string | null;
  userId: string;
};

export function TodayClient({
  date,
  times,
  timesError,
  initialLogs,
  logsError,
  userId,
}: Props) {
  const { t } = useI18n();
  const [logs, setLogs] = useState<PrayerLog[]>(initialLogs);
  const [busy, setBusy] = useState<Prayer | null>(null);
  const [error, setError] = useState<string | null>(logsError ?? null);
  const [now, setNow] = useState(() => new Date());

  // Tick every 30s so "current prayer" / locks stay accurate.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const timeMap = useMemo(() => {
    if (!times) return null;
    return {
      fajr: times.fajr,
      dhuhr: times.dhuhr,
      asr: times.asr,
      maghrib: times.maghrib,
      isha: times.isha,
    } as Record<Prayer, string>;
  }, [times]);

  const state = useMemo(() => {
    if (!timeMap) {
      return { current: null, future: new Set<Prayer>(), elapsed: new Set<Prayer>() };
    }
    return getPrayerState(timeMap, now);
  }, [timeMap, now]);

  const statusByPrayer = useMemo(() => {
    const map = new Map<Prayer, 'done' | 'missed'>();
    for (const log of logs) {
      map.set(log.prayer, log.status);
    }
    return map;
  }, [logs]);

  const doneCount = PRAYERS.filter((p) => statusByPrayer.get(p) === 'done').length;
  const complete = isCompleteDay(
    new Set(PRAYERS.filter((p) => statusByPrayer.get(p) === 'done'))
  );

  const mark = useCallback(
    async (prayer: Prayer, status: 'done' | 'missed') => {
      setBusy(prayer);
      setError(null);
      const supabase = createClient();
      const { error: upsertErr } = await supabase.from('prayer_logs').upsert(
        {
          user_id: userId,
          date,
          prayer,
          status,
        },
        { onConflict: 'user_id,date,prayer' }
      );

      if (upsertErr) {
        setError(upsertErr.message);
        setBusy(null);
        return;
      }

      setLogs((prev) => {
        const rest = prev.filter((l) => l.prayer !== prayer);
        return [
          ...rest,
          {
            id: `${userId}:${date}:${prayer}`,
            user_id: userId,
            date,
            prayer,
            status,
            logged_at: new Date().toISOString(),
          },
        ];
      });
      setBusy(null);
    },
    [date, userId]
  );

  if (timesError || !times || !timeMap) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('today.title')}</h1>
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {timesError
            ? `${t('common.error')}: ${timesError}`
            : t('today.empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('today.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{date}</p>
        </div>
        <div
          className={`rounded-lg px-3 py-2 text-sm font-semibold ${
            complete
              ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200'
              : 'bg-muted text-muted-foreground'
          }`}
          aria-live="polite"
        >
          {t('today.progress', { done: doneCount, total: 5 })}
        </div>
      </div>

      {times.is_fallback && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          {t('today.fallbackNote')}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {PRAYERS.map((prayer) => {
          const status = statusByPrayer.get(prayer);
          const isFuture = state.future.has(prayer);
          const isCurrent = state.current === prayer;
          const isBusy = busy === prayer;

          return (
            <li
              key={prayer}
              className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border bg-card px-3 py-3.5 sm:px-4 ${
                isCurrent
                  ? 'border-teal-500 ring-2 ring-teal-500/40'
                  : 'border-border'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-foreground">
                    {t(`prayer.${prayer}`)}
                  </span>
                  {isCurrent && (
                    <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      now
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-sm text-muted-foreground">
                  {formatPrayerTime(timeMap[prayer])}
                </p>
              </div>

              <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                {isFuture ? (
                  <span className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg bg-muted px-3 text-sm font-medium text-muted-foreground">
                    {status === 'done'
                      ? `✓ ${t('status.done')}`
                      : status === 'missed'
                        ? `✕ ${t('status.missed')}`
                        : t('today.locked')}
                  </span>
                ) : (
                  <>
                    <ToggleButton
                      active={status === 'done'}
                      tone="done"
                      disabled={isBusy}
                      onClick={() => void mark(prayer, 'done')}
                      label={t('today.done')}
                      ariaLabel={t('today.markDone', {
                        prayer: t(`prayer.${prayer}`),
                      })}
                    />
                    <ToggleButton
                      active={status === 'missed'}
                      tone="missed"
                      disabled={isBusy}
                      onClick={() => void mark(prayer, 'missed')}
                      label={t('today.missed')}
                      ariaLabel={t('today.markMissed', {
                        prayer: t(`prayer.${prayer}`),
                      })}
                    />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ToggleButton({
  active,
  tone,
  disabled,
  onClick,
  label,
  ariaLabel,
}: {
  active: boolean;
  tone: 'done' | 'missed';
  disabled: boolean;
  onClick: () => void;
  label: string;
  ariaLabel: string;
}) {
  const base =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-60';

  if (tone === 'done') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={active}
        className={
          active
            ? `${base} bg-teal-600 text-white`
            : `${base} border border-border bg-background text-foreground hover:border-teal-500 hover:text-teal-700`
        }
      >
        ✓ {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={
        active
          ? `${base} bg-red-600 text-white`
          : `${base} border border-border bg-background text-foreground hover:border-red-500 hover:text-red-600`
      }
    >
      ✕ {label}
    </button>
  );
}
