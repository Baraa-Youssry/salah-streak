'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { useTheme } from '@/lib/theme/context';
import { PRAYERS } from '@/lib/constants';
import { PushSubscribeButton } from '@/components/PushSubscribeButton';
import type { Lang, NotificationPreferences, Profile } from '@/types/database.types';

type Props = {
  userId: string;
  profile: Profile | null;
  preferences: NotificationPreferences | null;
};

export function SettingsClient({ userId, profile, preferences }: Props) {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(preferences);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const savePrefs = useCallback(
    async (next: NotificationPreferences) => {
      setPrefs(next);
      const supabase = createClient();
      const { error: err } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: userId,
            enabled: next.enabled,
            fajr: next.fajr,
            dhuhr: next.dhuhr,
            asr: next.asr,
            maghrib: next.maghrib,
            isha: next.isha,
            lang: next.lang,
          },
          { onConflict: 'user_id' }
        );
      if (err) setError(err.message);
      else setError(null);
    },
    [userId]
  );

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', userId);
    setBusy(false);
    if (err) setError(err.message);
    else setMessage(t('common.saved'));
  }

  function changeLang(next: Lang) {
    setLang(next);
    if (prefs) void savePrefs({ ...prefs, lang: next });
    setMessage(t('common.saved'));
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>

      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
        >
          {message}
        </p>
      )}

      {/* Cards: stacked on mobile, 2-col from md */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Language */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            {t('settings.language')}
          </h2>
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label={t('settings.language')}
          >
            {(['en', 'ar'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                onClick={() => changeLang(l)}
                className={`min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium ${
                  lang === l
                    ? 'bg-teal-600 text-white'
                    : 'border border-border bg-background hover:bg-muted'
                }`}
              >
                {l === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>
        </section>

        {/* Theme */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            {t('settings.theme')}
          </h2>
          <div
            className="grid grid-cols-2 gap-2"
            role="radiogroup"
            aria-label={t('settings.theme')}
          >
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'light'}
              onClick={() => setTheme('light')}
              className={`min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium ${
                theme === 'light'
                  ? 'bg-teal-600 text-white'
                  : 'border border-border bg-background hover:bg-muted'
              }`}
            >
              ☀️ {t('settings.light')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={theme === 'dark'}
              onClick={() => setTheme('dark')}
              className={`min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium ${
                theme === 'dark'
                  ? 'bg-teal-600 text-white'
                  : 'border border-border bg-background hover:bg-muted'
              }`}
            >
              🌙 {t('settings.dark')}
            </button>
          </div>
        </section>

        {/* Profile */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            {t('settings.profile')}
          </h2>
          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label
                htmlFor="display-name"
                className="mb-1 block text-sm font-medium text-muted-foreground"
              >
                {t('settings.displayName')}
              </label>
              <input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={100}
                className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[44px] w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {t('common.save')}
            </button>
          </form>
        </section>

        {/* Notification preferences */}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">
            {t('settings.notifications')}
          </h2>

          <label className="mb-4 flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
            <span className="text-sm font-medium">
              {t('settings.notificationsEnabled')}
            </span>
            <input
              type="checkbox"
              checked={prefs?.enabled ?? false}
              onChange={(e) => {
                if (!prefs) return;
                void savePrefs({ ...prefs, enabled: e.target.checked });
              }}
              className="h-5 w-5 shrink-0 accent-teal-600"
            />
          </label>

          <fieldset
            disabled={!prefs?.enabled}
            className="space-y-2 disabled:opacity-50"
          >
            <legend className="mb-2 text-sm font-medium text-muted-foreground">
              {t('settings.perPrayer')}
            </legend>
            {PRAYERS.map((p) => (
              <label
                key={p}
                className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="text-sm font-medium">{t(`prayer.${p}`)}</span>
                <input
                  type="checkbox"
                  checked={prefs?.[p] ?? false}
                  onChange={(e) => {
                    if (!prefs) return;
                    void savePrefs({ ...prefs, [p]: e.target.checked });
                  }}
                  className="h-5 w-5 shrink-0 accent-teal-600"
                />
              </label>
            ))}
          </fieldset>
        </section>
      </div>

      {/* Push — full width */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">{t('settings.push')}</h2>
        <PushSubscribeButton />
      </section>

      <button
        type="button"
        onClick={() => void signOut()}
        className="min-h-[44px] w-full rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        {t('settings.signOut')}
      </button>
    </div>
  );
}
