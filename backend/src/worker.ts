import { DelayedError, Job, Worker } from 'bullmq';
import { env } from './config/env';
import { initDb, pool } from './db/pool';
import { bullConnection } from './queue/redis';
import { enqueueRows } from './queue/queue';
import { acquireGap, firstLimitHitInWindow, releaseGap, reserveSlot, windowIndex, windowStart } from './services/rateLimiter';
import { sendMail } from './services/mailer';
import { notifySlack } from './services/slack';
import { ensureIndex, updateEmailDoc } from './services/search';

interface JobData {
  emailJobId: string;
  reservedWindow?: number;
}

const JITTER = () => Math.floor(Math.random() * 250);

/**
 * Runs on every boot: makes the DB the source of truth.
 *  - rows stuck in 'sending' (worker crashed mid-send) go back to 'scheduled'
 *  - every still-'scheduled' row is (re)added; BullMQ ignores ids that already exist
 */
async function reconcile() {
  await pool.query(`update email_jobs set status='scheduled' where status='sending' and updated_at < now() - interval '2 minutes'`);
  const r = await pool.query(`select id, scheduled_at from email_jobs where status='scheduled'`);
  if (r.rowCount) {
    await enqueueRows(r.rows.map((x) => ({ id: x.id, scheduledAt: new Date(x.scheduled_at) })));
    console.log(`[reconcile] ensured ${r.rowCount} scheduled emails are queued`);
  }
}

async function process_(job: Job<JobData>, token?: string) {
  const id = job.data.emailJobId;
  const { rows } = await pool.query(
    `select j.id, j.user_id, j.to_email, j.status, j.sender_id,
            b.subject, b.body, b.hourly_limit,
            s.email as sender_email, s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass
     from email_jobs j join batches b on b.id=j.batch_id join senders s on s.id=j.sender_id
     where j.id=$1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.status === 'sent' || row.status === 'failed') return { skipped: true };

  const now = Date.now();
  const curWin = windowIndex(now);
  const limit = Math.min(row.hourly_limit ?? Infinity, env.maxEmailsPerHourPerSender);

  const delayTo = async (at: number) => {
    await job.moveToDelayed(at, token);
    throw new DelayedError();
  };

  // Woke up before the hour window we reserved? Go back to sleep.
  if (job.data.reservedWindow !== undefined && curWin < job.data.reservedWindow) {
    await delayTo(windowStart(job.data.reservedWindow) + JITTER());
  }

  // 1) Minimum delay between sends from the same sender (cross-worker, Redis lock)
  const wait = await acquireGap(row.sender_id, env.minDelayMs);
  if (wait > 0) await delayTo(now + wait + JITTER());

  // 2) Hourly limit per sender (cross-worker, atomic Lua counter)
  if (job.data.reservedWindow === undefined) {
    const slot = await reserveSlot(row.sender_id, limit, now);
    await job.updateData({ ...job.data, reservedWindow: curWin + slot.ahead });
    if (slot.ahead > 0) {
      await releaseGap(row.sender_id);
      const at = windowStart(curWin + slot.ahead) + (slot.position - 1) * env.minDelayMs;
      await pool.query(`update email_jobs set scheduled_at=$2, updated_at=now() where id=$1`, [id, new Date(at)]);
      void updateEmailDoc(id, { scheduled_at: new Date(at).toISOString() });
      if (await firstLimitHitInWindow(row.sender_id, curWin)) {
        await notifySlack(
          row.user_id,
          `:warning: *Hourly limit reached* for sender \`${row.sender_email}\` (${limit}/hour). Remaining emails were rescheduled to the next hour window (no emails dropped).`,
        );
      }
      await delayTo(at);
    }
  }

  // 3) Idempotent claim: only one worker may move scheduled -> sending
  const claim = await pool.query(
    `update email_jobs set status='sending', updated_at=now()
     where id=$1 and (status='scheduled' or (status='sending' and updated_at < now() - interval '2 minutes'))
     returning id`,
    [id],
  );
  if (!claim.rowCount) return { skipped: true };

  try {
    const previewUrl = await sendMail(
      { sender_id: row.sender_id, sender_email: row.sender_email, smtp_host: row.smtp_host, smtp_port: row.smtp_port, smtp_user: row.smtp_user, smtp_pass: row.smtp_pass },
      { id, to: row.to_email, subject: row.subject, body: row.body },
    );
    await pool.query(`update email_jobs set status='sent', sent_at=now(), preview_url=$2, error=null, updated_at=now() where id=$1`, [id, previewUrl]);
    void updateEmailDoc(id, { status: 'sent', sent_at: new Date().toISOString() });
    return { sent: true };
  } catch (e) {
    const msg = (e as Error).message;
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await pool.query(`update email_jobs set status=$2, error=$3, updated_at=now() where id=$1`, [id, finalAttempt ? 'failed' : 'scheduled', msg]);
    if (finalAttempt) void updateEmailDoc(id, { status: 'failed' });
    throw e; // BullMQ handles backoff + retry
  }
}

async function main() {
  await initDb();
  await ensureIndex();
  await reconcile();

  const worker = new Worker<JobData>(env.queueName, process_, {
    connection: bullConnection,
    concurrency: env.workerConcurrency,
  });
  worker.on('completed', (j) => console.log(`[worker] done ${j.id}`));
  worker.on('failed', (j, err) => console.warn(`[worker] failed ${j?.id}: ${err.message}`));
  worker.on('error', (err) => console.error('[worker] error', err.message));
  console.log(`Worker started | concurrency=${env.workerConcurrency} minDelay=${env.minDelayMs}ms maxPerHour/sender=${env.maxEmailsPerHourPerSender}`);

  const shutdown = async () => {
    await worker.close(); // lets in-flight jobs finish; remaining delayed jobs stay in Redis
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
