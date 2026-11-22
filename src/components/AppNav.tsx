'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { useTheme } from '@/lib/theme/context';

const NAV = [
  { href: '/today', labelKey: 'nav.today', icon: '🕌' },
  { href: '/groups', labelKey: 'nav.groups', icon: '👥' },
  { href: '/stats', labelKey: 'nav.stats', icon: '📊' },
  { href: '/settings', labelKey: 'nav.settings', icon: '⚙️' },
] as const;

/**
 * Mobile: compact top bar (logo + theme + sign-out) + fixed bottom tab bar.
 * md+: full top nav (tabs + actions); bottom bar hidden.
 * Bottom bar uses safe-area-inset-bottom; main content has matching padding.
 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { theme, toggle } = useTheme();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/sign-in');
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* ── Top bar: always ── */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-3 md:px-4">
          <Link
            href="/today"
            className="min-w-0 shrink truncate text-base font-bold text-teal-700 dark:text-teal-400 md:text-lg"
          >
            {t('app.name')}
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            {/* Desktop tabs */}
            <nav
              className="hidden items-center gap-1 md:flex"
              aria-label="Primary"
            >
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={`inline-flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium ${
                    isActive(item.href)
                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={toggle}
              aria-label={
                theme === 'dark' ? t('settings.light') : t('settings.dark')
              }
              className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-md px-2 text-base text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Sign-out: always available (desktop text, mobile icon) */}
            <button
              type="button"
              onClick={handleSignOut}
              aria-label={t('nav.signOut')}
              className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground md:px-3"
            >
              <span aria-hidden className="text-base md:hidden">
                ⎋
              </span>
              <span className="hidden md:inline">{t('nav.signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Bottom tab bar: mobile only ── */}
      <nav
        aria-label="Primary mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-3xl grid-cols-4">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 text-[11px] font-medium leading-tight ${
                    active
                      ? 'text-teal-700 dark:text-teal-300'
                      : 'text-muted-foreground'
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none">
                    {item.icon}
                  </span>
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
