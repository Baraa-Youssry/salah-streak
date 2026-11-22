-- ============================================================
-- Salah Streak — post-migration verification for 0001_init.sql
--
-- HOW TO RUN:
--   1. Run 0001_init.sql in the Supabase SQL Editor.
--   2. Paste this ENTIRE file into a new SQL Editor window and run it.
--   3. Everything runs inside one transaction that ends in ROLLBACK,
--      so no test data is left behind.
--   4. Success = a series of "OK: ..." notices and no ERROR.
--      Any failure raises an exception (script aborts before rollback
--      of that statement; the transaction still rolls back on error
--      when run as a single script — Supabase wraps editor runs).
--
-- Covers:
--   A. 8 tables exist, relrowsecurity = true
--   B. Helper/RPC functions: SECURITY DEFINER + search_path = public
--      + revoke from public/anon + grant to authenticated
--      + create_group has a unique_violation retry loop
--   C. Two users in one group + one outsider: no 42P17 on
--      group_members / prayer_logs; member visibility correct;
--      outsider sees 0 foreign rows
--   D. handle_new_user creates profiles.display_name from
--      raw_user_meta_data (and email-prefix fallback)
--   E. reminders_sent: 0 rows for SELECT, INSERT denied (RLS)
-- ============================================================

begin;

-- ------------------------------------------------------------
-- A. Tables exist with RLS enabled
-- ------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'profiles', 'groups', 'group_members', 'prayer_logs',
    'prayer_times', 'push_subscriptions', 'reminders_sent',
    'notification_preferences'
  ];
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relkind = 'r'
    ) then
      raise exception 'FAIL: table public.% does not exist', v_table;
    end if;

    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity = true
    ) then
      raise exception 'FAIL: RLS not enabled on public.%', v_table;
    end if;
  end loop;

  raise notice 'OK: all 8 tables exist with relrowsecurity = true';
end $$;

-- ------------------------------------------------------------
-- B. Helper + RPC functions
-- ------------------------------------------------------------
do $$
declare
  v_fn record;
  v_expected constant text[] := array[
    'is_group_member', 'shares_group_with', 'create_group', 'join_group'
  ];
  v_name text;
  v_src text;
begin
  foreach v_name in array v_expected loop
    select p.prosecdef, p.proconfig, p.prosrc
    into v_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_name;

    if not found then
      raise exception 'FAIL: function public.% does not exist', v_name;
    end if;

    if v_fn.prosecdef is not true then
      raise exception 'FAIL: % is not SECURITY DEFINER', v_name;
    end if;

    if v_fn.proconfig is null
       or not exists (
         select 1 from unnest(v_fn.proconfig) cfg
         where cfg like 'search_path=%public%'
       ) then
      raise exception 'FAIL: % missing "set search_path = public" (proconfig = %)',
        v_name, v_fn.proconfig;
    end if;

    if v_name = 'create_group' then
      -- Strip SQL comments first so commented-out code cannot satisfy the check.
      v_src := v_fn.prosrc;
      v_src := regexp_replace(v_src, '/\*.*?\*/', '', 'gs');
      v_src := regexp_replace(v_src, '--[^\r\n]*', '', 'g');
      v_src := lower(v_src);

      if position('loop' in v_src) = 0
         or position('unique_violation' in v_src) = 0
         or position('exception' in v_src) = 0 then
        raise exception 'FAIL: create_group must contain (in code, not comments): loop + unique_violation + exception';
      end if;
    end if;
  end loop;

  -- Privileges: no EXECUTE for anon (revoke public, anon happened);
  -- EXECUTE for authenticated.
  if has_function_privilege('anon', 'public.create_group(text)', 'EXECUTE') then
    raise exception 'FAIL: anon still has EXECUTE on create_group';
  end if;
  if has_function_privilege('anon', 'public.join_group(text)', 'EXECUTE') then
    raise exception 'FAIL: anon still has EXECUTE on join_group';
  end if;
  if has_function_privilege('anon', 'public.is_group_member(uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon still has EXECUTE on is_group_member';
  end if;
  if has_function_privilege('anon', 'public.shares_group_with(uuid)', 'EXECUTE') then
    raise exception 'FAIL: anon still has EXECUTE on shares_group_with';
  end if;

  if not has_function_privilege('authenticated', 'public.create_group(text)', 'EXECUTE') then
    raise exception 'FAIL: authenticated lacks EXECUTE on create_group';
  end if;
  if not has_function_privilege('authenticated', 'public.join_group(text)', 'EXECUTE') then
    raise exception 'FAIL: authenticated lacks EXECUTE on join_group';
  end if;
  if not has_function_privilege('authenticated', 'public.is_group_member(uuid)', 'EXECUTE') then
    raise exception 'FAIL: authenticated lacks EXECUTE on is_group_member';
  end if;
  if not has_function_privilege('authenticated', 'public.shares_group_with(uuid)', 'EXECUTE') then
    raise exception 'FAIL: authenticated lacks EXECUTE on shares_group_with';
  end if;

  raise notice 'OK: helpers/RPCs are SECURITY DEFINER, search_path=public, grants/revokes correct, create_group has retry loop';
end $$;

-- ------------------------------------------------------------
-- D (early): handle_new_user via auth.users inserts
--   alice: display_name from raw_user_meta_data
--   dave:  no display_name metadata -> email local part
-- ------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated', 'authenticated',
    'alice@example.test', 'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Alice Test"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated', 'authenticated',
    'bob@example.test', 'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Bob Builder"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated', 'authenticated',
    'carol@example.test', 'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated', 'authenticated',
    'dave.prayer@example.test', 'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now()
  );

do $$
declare
  v_name text;
begin
  select display_name into v_name from public.profiles
  where id = '11111111-1111-4111-8111-111111111111';
  if v_name is distinct from 'Alice Test' then
    raise exception 'FAIL: alice display_name = %, expected "Alice Test"', v_name;
  end if;

  select display_name into v_name from public.profiles
  where id = '22222222-2222-4222-8222-222222222222';
  if v_name is distinct from 'Bob Builder' then
    raise exception 'FAIL: bob display_name = %, expected "Bob Builder"', v_name;
  end if;

  -- carol: no metadata display_name, email prefix = "carol"
  select display_name into v_name from public.profiles
  where id = '33333333-3333-4333-8333-333333333333';
  if v_name is distinct from 'carol' then
    raise exception 'FAIL: carol display_name = %, expected email prefix "carol"', v_name;
  end if;

  -- dave: email local part includes a dot
  select display_name into v_name from public.profiles
  where id = '44444444-4444-4444-8444-444444444444';
  if v_name is distinct from 'dave.prayer' then
    raise exception 'FAIL: dave display_name = %, expected "dave.prayer"', v_name;
  end if;

  if not exists (
    select 1 from public.notification_preferences
    where user_id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'FAIL: notification_preferences row not created for alice';
  end if;

  raise notice 'OK: handle_new_user created profiles with display_name from metadata and email-prefix fallback';
end $$;

-- ------------------------------------------------------------
-- Seed: one group (alice + bob members), outsider carol,
--       prayer_logs for all three (as postgres — bypasses RLS)
-- ------------------------------------------------------------
insert into public.groups (id, name, invite_code, created_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Verify Group',
  'VRFY01',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.group_members (group_id, user_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222');

-- A second group with a known code for join_group() testing later
insert into public.groups (id, name, invite_code, created_by)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Join Target',
  'J01N23',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.prayer_logs (user_id, date, prayer, status) values
  ('11111111-1111-4111-8111-111111111111', current_date, 'fajr',  'done'),
  ('11111111-1111-4111-8111-111111111111', current_date, 'dhuhr', 'missed'),
  ('22222222-2222-4222-8222-222222222222', current_date, 'fajr',  'done'),
  ('22222222-2222-4222-8222-222222222222', current_date, 'dhuhr', 'done'),
  ('33333333-3333-4333-8333-333333333333', current_date, 'fajr',  'missed');

-- ------------------------------------------------------------
-- C. RLS as authenticated: members see each other, outsider sees nothing,
--    and NO 42P17 recursion on group_members / prayer_logs
-- ------------------------------------------------------------

-- C1. Alice (member): group_members + prayer_logs
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_count int;
begin
  -- Would raise 42P17 if policies queried group_members inline
  select count(*) into v_count from public.group_members;
  if v_count <> 2 then
    raise exception 'FAIL: alice group_members = %, expected 2', v_count;
  end if;

  select count(*) into v_count from public.prayer_logs;
  if v_count <> 4 then
    raise exception 'FAIL: alice prayer_logs = %, expected 4 (own 2 + bob 2, not carol)', v_count;
  end if;

  if exists (
    select 1 from public.prayer_logs
    where user_id = '33333333-3333-4333-8333-333333333333'
  ) then
    raise exception 'FAIL: alice can see carol''s prayer_logs (outsider leakage)';
  end if;

  if not exists (
    select 1 from public.prayer_logs
    where user_id = '22222222-2222-4222-8222-222222222222'
  ) then
    raise exception 'FAIL: alice cannot see bob''s prayer_logs (shared group)';
  end if;

  if not exists (
    select 1 from public.groups where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then
    raise exception 'FAIL: alice cannot read her group row';
  end if;

  if exists (
    select 1 from public.groups where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) then
    raise exception 'FAIL: alice can read a group she is not a member of';
  end if;

  raise notice 'OK: alice (member) sees 2 group_members, 4 prayer_logs, no 42P17, no outsider rows';
end $$;

-- C2. Bob (member): mirrors alice's visibility
set local request.jwt.claims =
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.group_members;
  if v_count <> 2 then
    raise exception 'FAIL: bob group_members = %, expected 2', v_count;
  end if;

  select count(*) into v_count from public.prayer_logs;
  if v_count <> 4 then
    raise exception 'FAIL: bob prayer_logs = %, expected 4', v_count;
  end if;

  raise notice 'OK: bob (member) sees 2 group_members, 4 prayer_logs, no 42P17';
end $$;

-- C3. Carol (outsider): 0 group_members, only her own log, no foreign groups
set local request.jwt.claims =
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.group_members;
  if v_count <> 0 then
    raise exception 'FAIL: carol (outsider) group_members = %, expected 0', v_count;
  end if;

  select count(*) into v_count from public.prayer_logs;
  if v_count <> 1 then
    raise exception 'FAIL: carol prayer_logs = %, expected 1 (own only)', v_count;
  end if;

  if exists (
    select 1 from public.prayer_logs
    where user_id in (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222'
    )
  ) then
    raise exception 'FAIL: carol can see member prayer_logs';
  end if;

  if exists (select 1 from public.groups) then
    raise exception 'FAIL: carol (outsider) can read any group rows';
  end if;

  if exists (
    select 1 from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'FAIL: carol can read alice profile (no shared group)';
  end if;

  raise notice 'OK: carol (outsider) sees 0 group_members, 0 foreign logs/groups/profiles, no 42P17';
end $$;

-- C4. Self-join on group_members as a member (mirrors shares_group_with
--     internals) must not raise 42P17
set local request.jwt.claims =
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.group_members m1
  join public.group_members m2 on m1.group_id = m2.group_id
  where m1.user_id = auth.uid()
    and m2.user_id <> auth.uid();

  if v_count < 1 then
    raise exception 'FAIL: self-join on group_members returned %, expected >= 1', v_count;
  end if;

  if not public.shares_group_with('22222222-2222-4222-8222-222222222222') then
    raise exception 'FAIL: shares_group_with(bob) should be true for alice';
  end if;

  if public.shares_group_with('33333333-3333-4333-8333-333333333333') then
    raise exception 'FAIL: shares_group_with(carol) should be false for alice';
  end if;

  raise notice 'OK: group_members self-join + shares_group_with helpers work with no recursion';
end $$;

-- ------------------------------------------------------------
-- E. reminders_sent: SELECT -> 0 rows, INSERT -> RLS denial
-- ------------------------------------------------------------
do $$
declare
  v_count int;
begin
  -- SELECT: pass on 0 rows OR on 42501 (insufficient_privilege);
  -- fail only if rows are actually visible.
  begin
    select count(*) into v_count from public.reminders_sent;
  exception
    when insufficient_privilege then
      v_count := 0;
  end;

  if v_count > 0 then
    raise exception 'FAIL: authenticated selected % rows from reminders_sent, expected 0', v_count;
  end if;

  begin
    insert into public.reminders_sent (user_id, date, prayer)
    values (
      '11111111-1111-4111-8111-111111111111',
      current_date,
      'fajr'
    );
    raise exception 'FAIL: INSERT into reminders_sent succeeded for authenticated';
  exception
    when insufficient_privilege then
      raise notice 'OK: reminders_sent SELECT returns 0 rows, INSERT denied (42501)';
  end;
end $$;

-- ------------------------------------------------------------
-- B/F extra: RPC functional smoke tests (still as alice)
-- create_group as alice -> she becomes sole member
-- ------------------------------------------------------------
do $$
declare
  v_result jsonb;
  v_code text;
  v_count int;
begin
  v_result := public.create_group('RPC Smoke Group');
  if v_result is null or v_result ->> 'id' is null then
    raise exception 'FAIL: create_group returned %', v_result;
  end if;
  if v_result ->> 'invite_code' is null
     or v_result ->> 'invite_code' !~ '^[A-Z0-9]{6}$' then
    raise exception 'FAIL: create_group invite_code = %', v_result ->> 'invite_code';
  end if;

  select count(*) into v_count from public.group_members
  where group_id = (v_result ->> 'id')::uuid
    and user_id = auth.uid();
  if v_count <> 1 then
    raise exception 'FAIL: create_group did not add creator as member (got %)', v_count;
  end if;

  raise notice 'OK: create_group works (code %), creator is member', v_result ->> 'invite_code';
end $$;

-- join_group as bob using the pre-seeded known code J01N23
set local request.jwt.claims =
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_result jsonb;
  v_count int;
begin
  v_result := public.join_group('J01N23');
  if v_result is null or v_result ->> 'id' is distinct from 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' then
    raise exception 'FAIL: join_group returned %', v_result;
  end if;

  select count(*) into v_count from public.group_members
  where group_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    and user_id = auth.uid();
  if v_count <> 1 then
    raise exception 'FAIL: join_group did not insert membership (got %)', v_count;
  end if;

  -- invalid code must raise
  begin
    perform public.join_group('XXXXXX');
    raise exception 'FAIL: join_group accepted invalid code';
  exception
    when raise_exception then
      if sqlerrm like 'invalid invite code%' then
        raise notice 'OK: join_group works, invalid code rejected';
      else
        raise;
      end if;
  end;

  raise notice 'OK: join_group membership inserted for bob';
end $$;

-- ------------------------------------------------------------
-- Done — discard every change made above
-- ------------------------------------------------------------
do $$
begin
  raise notice 'ALL CHECKS PASSED — rolling back all test data';
end $$;

rollback;
