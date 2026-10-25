# ReachInbox – Full-stack Email Job Scheduler

Production-style email scheduler: Express + TypeScript API, **BullMQ delayed jobs on Redis** (no cron), Postgres,
Ethereal SMTP, Elasticsearch search, live Bull dashboard, Slack alerts, and a React + Tailwind dashboard with Google login.

## Quick start

**Prerequisites:** Node 18+, Docker.

```bash
# 1. infra (Redis with AOF, Postgres, Elasticsearch)
docker compose up -d

# 2. backend
cd backend
cp .env.example .env        # fill in Google (and Slack) credentials, see below
npm install
npm run dev                 # API on :4000        -> terminal 1
npm run dev:worker          # BullMQ worker       -> terminal 2

# 3. frontend
cd ../frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173   -> terminal 3
```

Open http://localhost:5173 → Sign in with Google → **Compose New Email**.
Live queue dashboard: http://localhost:4000/admin/queues (login required, same browser session).

You can run **more than one worker** (`npm run dev:worker` in extra terminals); all limits stay correct because state lives in Redis/Postgres.

## Configuration

### Google OAuth (login)
1. Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* (Web application).
2. Authorized redirect URI: `http://localhost:4000/auth/google/callback`
3. Put the ID/secret in `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). Add yourself as a test user on the consent screen.

### Ethereal Email (fake SMTP)
No manual setup needed: on a user's first schedule request the backend calls Ethereal's `createTestAccount()` and stores
`DEFAULT_SENDER_COUNT` (default 2) senders per user. Emails are round-robined across them. Every sent email stores an
Ethereal **preview URL** (shown as “preview” in the Sent tab) so you can open the delivered message.
To use your own Ethereal account: `POST /api/senders {"user":"x@ethereal.email","pass":"..."}`.

### Slack (rate-limit alerts)
1. https://api.slack.com/apps → Create app → add the **Incoming Webhooks** feature.
2. OAuth & Permissions → Redirect URL: `<BACKEND_URL>/api/slack/callback` (Slack needs HTTPS for non-localhost → use `ngrok http 4000` and set `BACKEND_URL` to the ngrok URL).
3. `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in `backend/.env`.
4. In the dashboard click **Connect Slack** → pick a channel. A confirmation message is posted immediately.
   Click the green Slack button to disconnect. Not connected ⇒ rate-limit hits just don't notify (no errors); connecting later works instantly (no redeploy).

### Rate-limit / throughput env vars (`backend/.env`)
| Var | Default | Meaning |
|---|---|---|
| `WORKER_CONCURRENCY` | 5 | parallel jobs per worker process |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | **2000** | minimum gap between two sends from the same sender |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 | hard per-sender hourly cap; the compose form's “Hourly limit” can only lower it |
| `DEFAULT_SENDER_COUNT` | 2 | Ethereal senders auto-created per user |

## Architecture

```
React ──► Express API ──► Postgres (source of truth)
              │  └──────► BullMQ delayed jobs (Redis, AOF)
              │  └──────► Elasticsearch (search index)
Worker(s) ◄── BullMQ ──► Ethereal SMTP ──► Slack webhook (on limit hit)
```

**Scheduling.** `POST /api/emails/schedule` stores a batch + one `email_jobs` row per lead in Postgres (single transaction), then adds
one BullMQ **delayed job** per email with `jobId = email_jobs.id`. Email *i* is scheduled at `start + floor(i / senders) × delay`,
so each sender sends one email per `delay` interval. No cron anywhere.

**Persistence / restart.** Delayed jobs live in Redis (AOF on), rows live in Postgres. On every worker boot a *reconcile* step
(1) returns rows stuck in `sending` (crash mid-send) to `scheduled` and (2) re-adds all `scheduled` rows to the queue; BullMQ ignores
ids that already exist, so nothing is duplicated and even a wiped Redis is rebuilt from the DB. Graceful shutdown lets in-flight jobs finish.

**Idempotency.** Three layers: (1) BullMQ `jobId` = row id (no duplicate jobs); (2) the worker claims a row with an atomic
`UPDATE … SET status='sending' WHERE status='scheduled'` – only one worker can win; (3) `UNIQUE(batch_id, to_email)` + dedupe on input;
a deterministic `Message-ID` header makes any duplicate delivery detectable.

**Concurrency.** `Worker({ concurrency: WORKER_CONCURRENCY })`. All shared state (counters, locks) is in Redis/Postgres, so many
workers/processes are safe.

**Minimum delay between sends.** Per-sender Redis lock `SET gap:<sender> NX PX <MIN_DELAY_BETWEEN_EMAILS_MS>` (2 s default). A worker that
can't take it moves its job to *delayed* for the remaining TTL (`job.moveToDelayed` + `DelayedError`: not a failure, no attempt consumed).

**Hourly rate limit (per sender, cross-worker).** A single atomic Lua script walks hour windows `rl:<sender>:<hourIndex>` from the current
hour and reserves a slot in the first window with capacity. If the current hour is full, the job is moved to the *delayed* set at the start of
the window it was assigned (+ position × min-delay). Consequences: nothing is dropped or failed, ordering is preserved (earlier jobs
reserve earlier slots), and there is no thundering herd at the top of the hour. The reserved window is stored in the job data so retries aren't double counted.

**Slack notification.** The first time a sender is pushed past its limit in an hour window (`SET NX` dedupe, so one alert per sender per hour),
the worker POSTs to the user's connected Slack webhook (obtained via real Slack OAuth v2, stored per user).

**Behaviour with 1000+ emails at the same time.** Rows are inserted in chunks via `unnest`, jobs are added with `addBulk` (500/chunk).
Per-sender spacing + the hourly Lua reservation spread the load automatically; e.g. 1000 emails, 2 senders, 200/hour/sender ⇒ 400 go out in
the first hour and the remaining 600 are assigned to the following hours in order. The API responds immediately; sending is fully async.

**Elasticsearch.** Every email is indexed on schedule and updated on send/fail. `GET /api/emails/search?q=` (fuzzy multi-match on
recipient/subject/body, filtered by user); falls back to Postgres `ILIKE` if ES is down. ES failures never block sending.

## Features implemented

**Backend:** TypeScript + Express · BullMQ delayed jobs (no cron) · Postgres · Ethereal multi-sender · restart-safe + reconcile ·
idempotent sends · configurable concurrency · min delay between sends · Redis-backed per-sender hourly limit with rescheduling to next window ·
Slack OAuth + live alert · Elasticsearch indexing/search · Bull dashboard at `/admin/queues` · Google OAuth (JWT httpOnly cookie).

**Frontend:** React + Vite + TypeScript + Tailwind · Google login · header with name/email/avatar/logout · Scheduled / Sent tabs ·
Compose modal (subject, body, CSV/text upload with detected-count, start time, delay, hourly limit) · loading, empty and error states, toasts ·
reusable UI components (`Button`, `Input`, `Modal`, `Badge`, `Spinner`, `EmptyState`, `Toast`) · auto-polling tables · Connect/Disconnect Slack.

## Assumptions, shortcuts, trade-offs
- UI follows the described layout; adjust spacing/colours to the Figma file as needed (the design file wasn't machine-readable).
- Sent-vs-duplicate: if a worker dies *after* SMTP accepted but *before* the DB update, the email can be re-sent after the 2-minute stale-claim window (at-least-once at the SMTP boundary; exactly-once for everything else). Fixing this fully needs an SMTP-side idempotency key, which Ethereal lacks.
- The min-delay lock is per sender, not a single global BullMQ limiter, so different senders run in parallel (closer to real providers).
- Hourly windows are fixed clock hours (not sliding); simpler and cheap in Redis, but allows a short burst across a window boundary.
- Elasticsearch is eventually consistent with Postgres (best-effort indexing).
- SMTP credentials are stored in plain text in Postgres (fake Ethereal accounts only). Encrypt them for real providers.
- Slack uses the Incoming Webhook scope (one channel chosen at install) for simplicity.

## Demo script (≤ 5 min)
1. Login with Google → Compose → upload `sample-leads.csv` (shows “N email addresses detected”) → Schedule (start in ~1 min, delay 2 s).
2. Show **Scheduled** tab, then **Sent** tab filling; open a “preview” link; show `/admin/queues`.
3. **Restart:** schedule 20 emails, `Ctrl+C` both API and worker, start them again → remaining emails still send once each (check Sent tab count + Bull dashboard).
4. **Rate limit:** set Hourly limit = 3 on a 10-email batch → 3 sends/sender, the rest show a next-hour scheduled time; Slack message appears.
#   r e a c h i n b o x  
 