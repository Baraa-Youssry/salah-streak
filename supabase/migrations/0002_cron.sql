-- Salah Streak: every-minute reminder job via pg_cron + pg_net
-- The only scheduler (no Vercel crons — Hobby limits those to daily/GET anyway).
--
-- Secrets are read from Supabase Vault at call time — never hard-coded here.
-- Create them BEFORE running this migration (see README "Applying migrations"):
--   select vault.create_secret('https://your-app.vercel.app', 'site_url');
--   select vault.create_secret('<openssl rand -hex 32>', 'cron_secret');
-- Mirror the same cron_secret in the app's CRON_SECRET env var.
--
-- Guard: if either Vault secret is missing, this file schedules NOTHING
-- (raises a notice) so we never create a job that fails every minute.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema "extensions";

do $$
declare
  v_site_url text;
  v_cron_secret text;
begin
  select decrypted_secret into v_site_url
  from vault.decrypted_secrets
  where name = 'site_url'
  limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if v_site_url is null or btrim(v_site_url) = ''
     or v_cron_secret is null or btrim(v_cron_secret) = '' then
    raise notice 'SKIPPED scheduling ''salah-streak-reminders'': Vault secrets ''site_url'' and/or ''cron_secret'' are missing or empty. Create them with vault.create_secret(...), then re-run 0002_cron.sql.';
    return;
  end if;

  -- Idempotent: drop any previous job with this name, then (re)schedule.
  -- The scheduled SQL still reads Vault at call time (secrets are NOT
  -- baked into cron.job).
  perform cron.unschedule('salah-streak-reminders')
  where exists (
    select 1 from cron.job where jobname = 'salah-streak-reminders'
  );

  perform cron.schedule(
    'salah-streak-reminders',
    '* * * * *',
    $job$
      select net.http_get(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url')
               || '/api/cron/reminders',
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        timeout_milliseconds := 30000
      ) as request_id;
    $job$
  );

  raise notice 'Scheduled job ''salah-streak-reminders'' every minute -> %/api/cron/reminders', v_site_url;
end $$;
