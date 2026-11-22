'use client';

import { useI18n } from '@/lib/i18n/context';
import type { Prayer } from '@/lib/constants';

type PerPrayer = { prayer: Prayer; pct: number; done: number };

type GroupSnap = {
  group: { id: string; name: string };
  members: Array<{ user_id: string; display_name: string; todayDone: number }>;
};

type Props = {
  streak: number;
  todayDone: number;
  last7Pct: number;
  last7Done: number;
  perPrayer: PerPrayer[];
  groupSnaps: GroupSnap[];
  hasAnyLogs: boolean;
};

export function StatsView({
  streak,
  todayDone,
  last7Pct,
  last7Done,
  perPrayer,
  groupSnaps,
  hasAnyLogs,
}: Props) {
  const { t } = useI18n();

  if (!hasAnyLogs) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t('stats.title')}</h1>
        <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          {t('stats.noData')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('stats.title')}</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('stats.streak')}
          value={t('stats.streakDays', { count: streak })}
          accent
        />
        <StatCard
          label={t('stats.todayCompletion')}
          value={t('stats.ofTotal', { done: todayDone, total: 5 })}
        />
        <StatCard
          label={t('stats.last7')}
          value={t('stats.pct', { value: last7Pct })}
          sub={t('stats.ofTotal', { done: last7Done, total: 35 })}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 text-base font-semibold">{t('stats.perPrayer')}</h2>
        <ul className="space-y-3">
          {perPrayer.map(({ prayer, pct, done }) => (
            <li key={prayer}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{t(`prayer.${prayer}`)}</span>
                <span className="text-muted-foreground">
                  {t('stats.pct', { value: pct })} · {done}/30
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t(`prayer.${prayer}`)}
              >
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {groupSnaps.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-base font-semibold">{t('stats.groupTitle')}</h2>
          <div className="space-y-4">
            {groupSnaps.map((snap) => (
              <div key={snap.group.id}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                  {snap.group.name}
                </h3>
                <ul className="space-y-2">
                  {snap.members.map((m) => (
                    <li
                      key={m.user_id}
                      className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
                    >
                      <span className="truncate font-medium">
                        {m.display_name}
                      </span>
                      <span
                        className={`shrink-0 font-semibold ${
                          m.todayDone === 5
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {t('groups.todayDone', { done: m.todayDone })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? 'border-teal-500/40 bg-teal-50/60 dark:bg-teal-950/30'
          : 'border-border bg-card'
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${
          accent ? 'text-teal-700 dark:text-teal-300' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
