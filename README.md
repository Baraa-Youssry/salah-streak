# Salah Streak

Shared five-prayer tracker for friends. Log Fajr → Isha each day, build streaks together, and get push reminders when a prayer window opens — free tiers only.

| | |
|---|---|
| **Stack** | Next.js 14 (App Router) · TypeScript · Tailwind CSS |
| **Backend** | Supabase (Postgres · Auth · RLS · Realtime · Vault · pg_cron · pg_net) |
| **Times** | Aladhan API · Egyptian method (5) · Africa/Cairo |
| **Push** | Web Push + VAPID · `web-push` |
| **Scheduler** | pg_cron → `GET /api/cron/reminders` (no Vercel crons) |

---

## Features

- **Today** — five prayer rows with **Done / Missed**, current prayer highlighted, future prayers locked until their start time. Times auto-load for Cairo (Aladhan method 5; fallback copies the previous day if the API is down).
- **Streaks** — a day counts only when all five are ✅. Stats show your current streak, today’s progress, last-7-day completion, and per-prayer rates over 30 days.
- **Groups** — create a group, share a 6-char invite code, watch a live member-by-prayer table (Supabase Realtime).
- **Reminders** — every-minute cron claims an idempotent slot per user and fires a Web Push in the 20–60 min window after each prayer starts. Languages: **English / العربية** with full RTL.
- **PWA** — installable (manifest + service worker), dark mode, mobile-first layout with bottom tab bar and safe-area insets.

---

## Quick start

```bash
git clone <your-repo-url>
cd salah-streak
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
```

### Scripts

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

---

## Environment variables

Copy `.env.example` → `.env.local`. **Never commit real keys.**

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Public project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | same | **Server only.** Long `eyJ…` JWT. Used by `ensurePrayerTimes` and the cron route |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | Public half of the VAPID pair |
| `VAPID_PRIVATE_KEY` | same output | **Server only** |
| `VAPID_SUBJECT` | you | `mailto:you@example.com` or an `https:` URL (no localhost) |
| `CRON_SECRET` | `openssl rand -hex 32` | Bearer token for `/api/cron/reminders`; **must equal** Vault `cron_secret` |
| `NEXT_PUBLIC_SITE_URL` | you | Public origin, no trailing slash; **must equal** Vault `site_url` |

---

## Database migrations

Migrations live in `supabase/migrations/`. Apply them **in order** in the [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql/new) (or `supabase db reset` locally).

### 1. `0001_init.sql`

Creates 8 tables, enums, indexes, the `handle_new_user` signup trigger, RLS on every table, SECURITY DEFINER helpers (`is_group_member`, `shares_group_with`), and the `create_group` / `join_group` RPCs.

### 2. Vault secrets (before `0002`)

```sql
-- Public origin of the deployed app, no trailing slash
select vault.create_secret('https://your-app.vercel.app', 'site_url');

-- Same value as the app's CRON_SECRET env var
select vault.create_secret('<openssl rand -hex 32>', 'cron_secret');
```

### 3. `0002_cron.sql`

Schedules `salah-streak-reminders` → `GET {site_url}/api/cron/reminders` every minute via `pg_cron` + `pg_net`. The Authorization header is read from Vault at call time.

- Both secrets present → job is scheduled (idempotent re-run replaces it).
- Either secret missing → raises a notice and schedules **nothing**.

> **Run `0002` only after the app is deployed** so `site_url` points at a live origin.

### 4. Verify (recommended)

Paste `supabase/tests/verify_0001.sql` into a **new** SQL Editor window. It checks tables/RLS, function security, member vs outsider visibility, profile creation, and `reminders_sent` denial. Ends in `ROLLBACK` — no data left behind. Success = a series of `OK: …` notices ending in **ALL CHECKS PASSED**.

### Patches (optional)

If an older schema is already live, paste-only fixes are in `supabase/patches/`:

| File | Fixes |
|---|---|
| `fix_create_group.sql` | Replaces `create_group` with the bounded unique-retry version |
| `fix_function_grants.sql` | Revokes `EXECUTE` from `anon`/`public` on RPC helpers, re-grants to `authenticated` |

---

## App routes

| Route | |
|---|---|
| `/` | Redirects to `/today` or `/sign-in` |
| `/sign-in` · `/sign-up` | Password or magic-link auth; display name stored via `options.data` |
| `/auth/callback` | Exchanges the magic-link code for a session |
| `/today` | Five prayer rows · Done / Missed · current prayer highlight |
| `/groups` | Create / join · invite code · live member table |
| `/stats` | Streaks · completion % · per-prayer · group snapshot |
| `/settings` | Language (en/ar) · theme · notification prefs · push · profile |
| `GET/POST /api/cron/reminders` | Bearer `CRON_SECRET` only · 20–60 min window · 8s hard cap |

Middleware refreshes the session and protects `/today`, `/groups`, `/stats`, `/settings`.

---

## Deploy (Vercel)

1. Push to GitHub and import the repo in [Vercel](https://vercel.com/new).
2. Add every variable from `.env.local` under **Settings → Environment Variables**.
3. Deploy. Set `NEXT_PUBLIC_SITE_URL` to the production URL (no trailing slash).
4. Create the Vault secrets with that production URL.
5. Run `0002_cron.sql` (only now — after deploy).

No `vercel.json` and no Vercel cron jobs — the only scheduler is pg_cron in Supabase.

---

## Project layout

```
supabase/
  migrations/     0001_init.sql · 0002_cron.sql
  patches/        paste-only fixes for live schemas
  tests/          verify_0001.sql (ROLLBACK-safe)
src/
  app/            App Router pages, auth callback, cron route
  components/     AppNav, Providers, push button, SW register
  lib/            i18n (en/ar), theme, prayer times, Supabase clients
  middleware.ts   session refresh + route protection
  types/          database.types.ts
public/           manifest.webmanifest · sw.js · icons
```

---

## Design notes

- **RLS** — policies never query `group_members` inline (avoids 42P17); they call SECURITY DEFINER helpers. Membership is only granted through the RPCs.
- **Idempotent reminders** — `reminders_sent` PK is `(user, date, prayer)`; the claim insert doubles as the lock. Failed sends roll the claim back so the next minute can retry.
- **Mobile-first** — bottom tab bar with `env(safe-area-inset-bottom)`, `min-h-dvh`, 44×44 touch targets, sticky table columns, logical CSS properties for RTL.
- **Free tier only** — no paid APIs, no Vercel cron, no extra services.

---

## License

MIT
