'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n/context';
import { cairoToday } from '@/lib/prayers';
import { PRAYERS, type Prayer } from '@/lib/constants';
import type { Group } from '@/types/database.types';

type MemberRow = {
  user_id: string;
  profiles: { display_name: string } | null;
};

type MemberLog = {
  user_id: string;
  prayer: Prayer;
  status: 'done' | 'missed';
};

type GroupBundle = {
  members: MemberRow[];
  logs: MemberLog[];
};

type Props = {
  initialGroups: Group[];
  userId: string;
};

export function GroupsClient({ initialGroups, userId }: Props) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [bundles, setBundles] = useState<Record<string, GroupBundle>>({});
  const [selected, setSelected] = useState<string | null>(
    initialGroups[0]?.id ?? null
  );

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => cairoToday(), []);

  const loadBundle = useCallback(
    async (groupId: string) => {
      const supabase = createClient();

      const { data: members, error: mErr } = await supabase
        .from('group_members')
        .select('user_id, profiles(display_name)')
        .eq('group_id', groupId);

      if (mErr) {
        setError(mErr.message);
        return;
      }

      const memberRows = (members ?? []) as unknown as MemberRow[];
      const memberIds = memberRows.map((m) => m.user_id);

      let logs: MemberLog[] = [];
      if (memberIds.length > 0) {
        const { data: logRows, error: lErr } = await supabase
          .from('prayer_logs')
          .select('user_id, prayer, status')
          .eq('date', today)
          .in('user_id', memberIds);

        if (lErr) setError(lErr.message);
        else logs = (logRows ?? []) as MemberLog[];
      }

      setBundles((prev) => ({ ...prev, [groupId]: { members: memberRows, logs } }));
    },
    [today]
  );

  const refreshAll = useCallback(
    async (nextGroups?: Group[]) => {
      const list = nextGroups ?? groups;
      await Promise.all(list.map((g) => loadBundle(g.id)));
    },
    [groups, loadBundle]
  );

  useEffect(() => {
    void refreshAll(initialGroups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: refresh when logs or membership change.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('groups-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prayer_logs' },
        () => {
          void refreshAll();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members' },
        () => {
          void reloadGroups();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadGroups() {
    const supabase = createClient();
    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId);
    const ids = (memberships ?? []).map((m) => m.group_id);
    if (ids.length === 0) {
      setGroups([]);
      setBundles({});
      return;
    }
    const { data } = await supabase
      .from('groups')
      .select('*')
      .in('id', ids)
      .order('created_at', { ascending: false });
    const next = data ?? [];
    setGroups(next);
    await refreshAll(next);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc('create_group', {
      p_name: name,
    });
    setBusy(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage(t('groups.created'));
    setName('');
    await reloadGroups();
    if (data && typeof data === 'object' && 'id' in data) {
      setSelected(String((data as { id: string }).id));
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc('join_group', {
      p_code: code,
    });
    setBusy(false);

    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }

    setMessage(t('groups.joined'));
    setCode('');
    await reloadGroups();
    if (data && typeof data === 'object' && 'id' in data) {
      setSelected(String((data as { id: string }).id));
    }
  }

  async function copyCode(invite: string) {
    try {
      await navigator.clipboard.writeText(invite);
      setMessage(t('common.copied'));
    } catch {
      setMessage(invite);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('groups.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('groups.subtitle')}
        </p>
      </div>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 className="mb-3 text-base font-semibold">
            {t('groups.createHeading')}
          </h2>
          <label
            htmlFor="group-name"
            className="mb-1 block text-sm font-medium text-muted-foreground"
          >
            {t('groups.createName')}
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder={t('groups.createPlaceholder')}
            className="mb-3 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-[44px] w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {t('groups.createSubmit')}
          </button>
        </form>

        <form
          onSubmit={handleJoin}
          className="rounded-xl border border-border bg-card p-4"
        >
          <h2 className="mb-3 text-base font-semibold">
            {t('groups.joinHeading')}
          </h2>
          <label
            htmlFor="invite-code"
            className="mb-1 block text-sm font-medium text-muted-foreground"
          >
            {t('groups.joinCode')}
          </label>
          <input
            id="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            required
            minLength={6}
            maxLength={6}
            placeholder={t('groups.joinPlaceholder')}
            className="mb-3 w-full rounded-lg border border-input bg-background px-3 py-2.5 font-mono text-base uppercase tracking-widest focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-[44px] w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {t('groups.joinSubmit')}
          </button>
        </form>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          {t('groups.empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const bundle = bundles[g.id];
            const isOpen = selected === g.id;
            return (
              <div
                key={g.id}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{g.name}</h3>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="font-mono uppercase tracking-wider">
                        {g.invite_code}
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyCode(g.invite_code)}
                        className="rounded px-1.5 py-0.5 text-xs font-medium text-teal-600 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/40"
                      >
                        {t('common.copy')}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('groups.shareHint')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = isOpen ? null : g.id;
                      setSelected(next);
                      if (next && !bundles[g.id]) void loadBundle(g.id);
                    }}
                    className="min-h-[40px] rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    {isOpen ? t('common.close') : t('groups.members')}
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-border px-4 py-4">
                    {!bundle ? (
                      <p className="text-sm text-muted-foreground">
                        {t('common.loading')}
                      </p>
                    ) : (
                      <MemberTable bundle={bundle} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberTable({ bundle }: { bundle: GroupBundle }) {
  const { t } = useI18n();
  const { members, logs } = bundle;

  const logKey = (userId: string, prayer: Prayer) => `${userId}:${prayer}`;
  const statusMap = new Map<string, 'done' | 'missed'>();
  for (const log of logs) {
    statusMap.set(logKey(log.user_id, log.prayer), log.status);
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('groups.empty')}</p>
    );
  }

  return (
    <div>
      <h4 className="mb-3 text-sm font-medium text-muted-foreground">
        {t('groups.memberTable')}
      </h4>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-start">
              <th className="px-2 py-2 text-start font-medium text-muted-foreground">
                {t('settings.displayName')}
              </th>
              {PRAYERS.map((p) => (
                <th
                  key={p}
                  className="px-2 py-2 text-center font-medium text-muted-foreground"
                >
                  {t(`prayer.${p}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              let doneCount = 0;
              return (
                <tr key={m.user_id} className="border-b border-border/50">
                  <td className="max-w-[140px] truncate px-2 py-2.5 font-medium">
                    {m.profiles?.display_name ?? '—'}
                  </td>
                  {PRAYERS.map((p) => {
                    const status = statusMap.get(logKey(m.user_id, p));
                    if (status === 'done') doneCount++;
                    return (
                      <td key={p} className="px-2 py-2.5 text-center">
                        <Cell status={status} />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2.5 text-center text-xs font-semibold text-teal-600 dark:text-teal-400">
                    {t('groups.todayDone', { done: doneCount })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ status }: { status?: 'done' | 'missed' }) {
  if (status === 'done') {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal-100 text-sm text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
        ✓
      </span>
    );
  }
  if (status === 'missed') {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-sm text-red-600 dark:bg-red-950/60 dark:text-red-300">
        ✕
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground">
      ·
    </span>
  );
}
