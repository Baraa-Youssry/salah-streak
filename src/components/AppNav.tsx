'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { useTheme } from '@/lib/theme/context';

const NAV = [
  { href: '/today', labelKey: 'nav.today' },
  { href: '/groups', labelKey: 'nav.groups' },
  { href: '/stats', labelKey: 'nav.stats' },
  { href: '/settings', labelKey: 'nav.settings' },
] as const;

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

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link
          href="/today"
          className="shrink-0 text-base font-bold text-teal-700 dark:text-teal-400 sm:text-lg"
        >
          {t('app.name')}
        </Link>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <nav className="flex items-center gap-0.5 overflow-x-auto sm:gap-1">
            {NAV.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex min-h-[40px] items-center rounded-md px-2 text-sm font-medium sm:px-3 ${
                    active
                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? t('settings.light') : t('settings.dark')}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex min-h-[40px] items-center rounded-md px-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:px-3"
          >
            <span className="sm:hidden">⎋</span>
            <span className="hidden sm:inline">{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
