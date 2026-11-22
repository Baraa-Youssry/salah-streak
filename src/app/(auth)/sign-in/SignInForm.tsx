'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Mode = 'password' | 'magic';

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/today';

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });

    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    setNotice('Check your email for a magic link.');
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => {
            setMode('password');
            setError(null);
            setNotice(null);
          }}
          className={
            mode === 'password'
              ? 'rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm'
              : 'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground'
          }
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('magic');
            setError(null);
            setNotice(null);
          }}
          className={
            mode === 'magic'
              ? 'rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm'
              : 'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground'
          }
        >
          Magic link
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"
        >
          {notice}
        </p>
      )}

      <form
        onSubmit={mode === 'password' ? handlePasswordSignIn : handleMagicLink}
        className="space-y-4"
      >
        <div>
          <label
            htmlFor="email"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
            placeholder="you@example.com"
          />
        </div>

        {mode === 'password' && (
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              placeholder="••••••••"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60"
        >
          {loading
            ? 'Please wait…'
            : mode === 'password'
              ? 'Sign in'
              : 'Send magic link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link
          href="/sign-up"
          className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
