-- Salah Streak: core schema, RLS, helper functions, RPCs
-- Apply with: supabase db reset, or paste into the Supabase SQL editor.

-- ============================================================
-- Enums
-- ============================================================
create type public.prayer_type as enum ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha');
create type public.log_status as enum ('done', 'missed');

-- ============================================================
-- Tables
-- ============================================================

-- One row per auth.users; created by trigger on signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.prayer_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  prayer public.prayer_type not null,
  status public.log_status not null,
  logged_at timestamptz not null default now(),
  unique (user_id, date, prayer)
);

-- Cairo calendar date -> UTC instants of each prayer's start.
-- is_fallback = true means times were copied from a previous day after an API failure.
create table public.prayer_times (
  date date primary key,
  fajr timestamptz not null,
  dhuhr timestamptz not null,
  asr timestamptz not null,
  maghrib timestamptz not null,
  isha timestamptz not null,
  is_fallback boolean not null default false
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- At-most-one reminder per (user, date, prayer); PK doubles as the idempotency claim.
create table public.reminders_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  prayer public.prayer_type not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, date, prayer)
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default true,
  fajr boolean not null default true,
  dhuhr boolean not null default true,
  asr boolean not null default true,
  maghrib boolean not null default true,
  isha boolean not null default true,
  lang text not null default 'en' check (lang in ('en', 'ar'))
);

-- ============================================================
-- Indexes
-- ============================================================
create index prayer_logs_user_date_idx on public.prayer_logs (user_id, date);
create index prayer_logs_date_idx on public.prayer_logs (date);
create index prayer_logs_user_idx on public.prayer_logs (user_id);
create index group_members_user_idx on public.group_members (user_id);
create index group_members_group_idx on public.group_members (group_id);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ============================================================
-- Signup trigger: profile + default notification preferences
-- display_name comes from signUp options.data (raw_user_meta_data);
-- falls back to the email local part.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Friend'
    )
  )
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS helper functions (SECURITY DEFINER)
-- Policies must call these instead of querying group_members inline,
-- which would cause 42P17 infinite recursion.
-- ============================================================
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = p_group_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members m1
    join public.group_members m2 on m1.group_id = m2.group_id
    where m1.user_id = auth.uid()
      and m2.user_id = p_user_id
  );
$$;

-- ============================================================
-- Group RPCs (SECURITY DEFINER: join must read a group the user
-- is not yet a member of, which RLS would otherwise block)
-- ============================================================
create or replace function public.create_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  v_seed text;
  v_code text;
  v_idx int;
  i int;
  v_attempts int := 0;
  v_max_attempts constant int := 10;
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'group name is required';
  end if;

  -- Bounded retry: generate a 6-char code, insert, and on a collision
  -- (unique violation on invite_code) try again with a fresh code.
  loop
    v_seed := replace(gen_random_uuid()::text, '-', '');
    v_code := '';
    for i in 0..5 loop
      v_idx := ('x' || substr(v_seed, i * 2 + 1, 2))::bit(8)::int;
      v_code := v_code || substr(v_alphabet, (v_idx % length(v_alphabet)) + 1, 1);
    end loop;

    begin
      insert into public.groups (name, invite_code, created_by)
      values (btrim(p_name), v_code, auth.uid())
      returning * into v_group;
      exit; -- success
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts >= v_max_attempts then
        raise exception 'could not generate unique invite code';
      end if;
      -- else: fall through and generate a new code
    end;
  end loop;

  -- Creator is always a member of the group they created.
  insert into public.group_members (group_id, user_id)
  values (v_group.id, auth.uid());

  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'invite_code', v_group.invite_code,
    'created_at', v_group.created_at
  );
end;
$$;

-- join_group: lookup only (no code generation -> no retry loop).
-- One generic error whether the code is malformed or unknown.
create or replace function public.join_group(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group public.groups;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_code := upper(btrim(coalesce(p_code, '')));

  select * into v_group from public.groups where invite_code = v_code;
  if not found then
    raise exception 'invalid invite code';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'invite_code', v_group.invite_code,
    'created_at', v_group.created_at
  );
end;
$$;

-- ============================================================
-- Row Level Security (enabled on EVERY table)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.prayer_logs enable row level security;
alter table public.prayer_times enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminders_sent enable row level security;
alter table public.notification_preferences enable row level security;

-- profiles: read self or anyone sharing a group; update self only.
create policy "profiles_select_own_or_shared"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.shares_group_with(id));

create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- groups: members read; anyone authenticated may insert their own group
-- (create_group RPC also works as SECURITY DEFINER); creator updates.
create policy "groups_select_member"
on public.groups for select
to authenticated
using (public.is_group_member(id));

create policy "groups_insert_own"
on public.groups for insert
to authenticated
with check (created_by = auth.uid());

create policy "groups_update_creator"
on public.groups for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

-- group_members: read own rows + rows of groups you belong to.
-- INSERT intentionally has NO policy — membership is granted only via
-- create_group/join_group SECURITY DEFINER RPCs (avoids chicken-and-egg
-- and keeps invite-code checks server-side).
create policy "group_members_select"
on public.group_members for select
to authenticated
using (user_id = auth.uid() or public.is_group_member(group_id));

create policy "group_members_delete_own"
on public.group_members for delete
to authenticated
using (user_id = auth.uid());

-- prayer_logs: own rows, plus rows of users who share at least one group.
create policy "prayer_logs_select_own_or_shared"
on public.prayer_logs for select
to authenticated
using (user_id = auth.uid() or public.shares_group_with(user_id));

create policy "prayer_logs_insert_own"
on public.prayer_logs for insert
to authenticated
with check (user_id = auth.uid());

create policy "prayer_logs_update_own"
on public.prayer_logs for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "prayer_logs_delete_own"
on public.prayer_logs for delete
to authenticated
using (user_id = auth.uid());

-- prayer_times: read-only for signed-in users; written only by the server
-- (cron route / ensurePrayerTimes using the service role).
create policy "prayer_times_select_authenticated"
on public.prayer_times for select
to authenticated
using (true);

-- push_subscriptions: strict owner-only CRUD (no service role on the client).
create policy "push_subscriptions_select_own"
on public.push_subscriptions for select
to authenticated
using (user_id = auth.uid());

create policy "push_subscriptions_insert_own"
on public.push_subscriptions for insert
to authenticated
with check (user_id = auth.uid());

create policy "push_subscriptions_update_own"
on public.push_subscriptions for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own"
on public.push_subscriptions for delete
to authenticated
using (user_id = auth.uid());

-- reminders_sent: RLS on with ZERO policies -> deny-all for clients.
-- Only the service role (cron handler) writes/reads it.
-- (Deliberately no create policy here.)

create policy "notification_preferences_all_own"
on public.notification_preferences for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ============================================================
-- Grants
-- ============================================================
-- Revoke the default PUBLIC execute grant first, drop anon, then grant callers.
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;

grant execute on function public.is_group_member(uuid) to authenticated, service_role;
grant execute on function public.shares_group_with(uuid) to authenticated, service_role;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;

-- ============================================================
-- Realtime: group view listens to prayer_logs (+ membership changes)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'prayer_logs'
  ) then
    alter publication supabase_realtime add table public.prayer_logs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end $$;
