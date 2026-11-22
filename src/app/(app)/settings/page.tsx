import { createClient } from '@/lib/supabase/server';
import { SettingsClient } from './SettingsClient';
import type { NotificationPreferences, Profile } from '@/types/database.types';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: profile }, { data: prefs }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  // Edge: prefs row missing (user created before trigger) — insert defaults.
  let preferences = prefs as NotificationPreferences | null;
  if (!preferences) {
    const { data: created } = await supabase
      .from('notification_preferences')
      .insert({ user_id: user.id })
      .select('*')
      .single();
    preferences = (created as NotificationPreferences) ?? null;
  }

  return (
    <SettingsClient
      userId={user.id}
      profile={(profile as Profile | null) ?? null}
      preferences={preferences}
    />
  );
}
