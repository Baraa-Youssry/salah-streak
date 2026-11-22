This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Applying migrations

Migrations live in `supabase/migrations/`. Apply them **in order**. The cron job (`0002`) will not schedule itself until its Vault secrets exist.

### 1. Run `0001_init.sql` first

Paste the contents of `supabase/migrations/0001_init.sql` into the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new) and run it (or use `supabase db reset` locally). This creates all 8 tables, RLS policies, helper functions, and the group RPCs.

### 2. Create the Vault secrets

Still in the SQL Editor, run (substitute your deployed URL and a fresh random secret):

```sql
-- Public origin of the app, no trailing slash
select vault.create_secret('https://your-app.vercel.app', 'site_url');

-- Shared secret for the reminder route; mirror it into CRON_SECRET env var
select vault.create_secret('<openssl rand -hex 32>', 'cron_secret');
```

Then set the same value in Vercel → Project → Settings → Environment Variables as `CRON_SECRET`.

### 3. Run `0002_cron.sql`

Paste `supabase/migrations/0002_cron.sql` into the SQL Editor and run it.

- If **both** Vault secrets are present, it schedules `salah-streak-reminders` to `GET /api/cron/reminders` every minute (via `pg_cron` + `pg_net`, Authorization header from Vault).
- If **either** secret is missing, it raises a notice and schedules **nothing** — fix the secrets and re-run this file.

### 4. (Recommended) Verify `0001`

Paste `supabase/tests/verify_0001.sql` into a **new** SQL Editor window and run it. It checks tables/RLS, helper-function security attributes, member vs outsider visibility (no recursion errors), profile creation, and `reminders_sent` denial. The script ends in `ROLLBACK` and leaves no data behind. Success looks like a series of `OK: ...` notices.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
