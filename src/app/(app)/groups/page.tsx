import { createClient } from '@/lib/supabase/server';
import { GroupsClient } from './GroupsClient';
import type { Group } from '@/types/database.types';

export const dynamic = 'force-dynamic';

export default async function GroupsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', user.id);

  const ids = (memberships ?? []).map((m) => m.group_id);

  let groups: Group[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from('groups')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false });
    groups = data ?? [];
  }

  return (
    <GroupsClient initialGroups={groups} userId={user.id} />
  );
}
