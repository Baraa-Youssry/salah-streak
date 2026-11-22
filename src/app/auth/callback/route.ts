import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/today';
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(error)}`
    );
  }

  if (code) {
    const supabase = createClient();
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Only allow relative redirects (open-redirect guard).
      const safeNext =
        next.startsWith('/') && !next.startsWith('//') ? next : '/today';
      return NextResponse.redirect(`${origin}${safeNext}`);
    }

    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent(exchangeError.message)}`
    );
  }

  return NextResponse.redirect(`${origin}/sign-in?error=missing_code`);
}
