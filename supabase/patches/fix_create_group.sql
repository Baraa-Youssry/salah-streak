-- Paste this into the Supabase SQL Editor to replace ONLY public.create_group
-- without re-running 0001_init.sql. Idempotent (create or replace).
--
-- Fixes: bounded unique-retry loop (max 10 attempts) for invite_code
-- collisions; creator is inserted into group_members in the same call.

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
