-- Paste this into the Supabase SQL Editor to fix EXECUTE privileges on the
-- group/RPC functions without re-running 0001_init.sql.
--
-- Why: Supabase default privileges (and/or an older 0001 run) can leave
-- anon (and/or PUBLIC) with EXECUTE. verify_0001.sql requires anon to
-- have NO execute on these functions.
--
-- Idempotent: safe to run multiple times.

-- 1) Drop the default PUBLIC grant and any direct anon grant.
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
revoke execute on function public.create_group(text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;

-- 2) Grant only the intended callers.
grant execute on function public.is_group_member(uuid) to authenticated, service_role;
grant execute on function public.shares_group_with(uuid) to authenticated, service_role;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;

-- 3) Diagnostics: each line should print false / true / true as appropriate.
do $$
declare
  v_role text;
  v_fn text;
  v_has boolean;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_fn in array array[
      'public.is_group_member(uuid)',
      'public.shares_group_with(uuid)',
      'public.create_group(text)',
      'public.join_group(text)'
    ] loop
      v_has := has_function_privilege(v_role, v_fn, 'EXECUTE');
      raise notice 'privilege: % on % => %', v_role, v_fn, v_has;
    end loop;
  end loop;
end $$;
