import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { ensureSenders } from '../services/senders';
import { enqueueRows } from '../queue/queue';
import { indexEmails, searchEmails } from '../services/search';

const router = Router();
router.use(requireAuth);

const scheduleSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1),
  emails: z.array(z.string().trim().email()).min(1).max(20000),
  startTime: z.coerce.date().optional(),
  delaySeconds: z.number().min(0).max(3600).default(2),
  hourlyLimit: z.number().int().min(1).max(100000).optional(),
});

router.post('/schedule', async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  const d = parsed.data;
  const userId: string = res.locals.userId;

  const senders = await ensureSenders(userId);
  const emails = [...new Set(d.emails.map((e) => e.toLowerCase()))];
  const start = d.startTime && d.startTime.getTime() > Date.now() ? d.startTime : new Date();
  const delayMs = Math.round(d.delaySeconds * 1000);
  const batchId = randomUUID();

  // Round-robin across senders; each sender gets one email per `delay` interval.
  const rows = emails.map((to, i) => ({
    id: randomUUID(),
    to,
    senderId: senders[i % senders.length].id,
    senderEmail: senders[i % senders.length].email,
    at: new Date(start.getTime() + Math.floor(i / senders.length) * delayMs),
  }));

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into batches (id,user_id,subject,body,start_time,delay_ms,hourly_limit,total)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [batchId, userId, d.subject, d.body, start.toISOString(), delayMs, d.hourlyLimit ?? null, rows.length],
    );
    for (let i = 0; i < rows.length; i += 2000) {
      const c = rows.slice(i, i + 2000);
      await client.query(
        `insert into email_jobs (id,batch_id,user_id,sender_id,to_email,scheduled_at)
         select u.id, $1, $2, u.sender_id, u.to_email, u.at
         from unnest($3::uuid[], $4::uuid[], $5::text[], $6::timestamptz[]) as u(id,sender_id,to_email,at)`,
        [batchId, userId, c.map((r) => r.id), c.map((r) => r.senderId), c.map((r) => r.to), c.map((r) => r.at.toISOString())],
      );
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    console.error('[schedule]', e);
    return res.status(500).json({ error: 'Failed to store emails' });
  } finally {
    client.release();
  }

  // DB is the source of truth; if enqueue fails, the worker's boot-time reconcile re-adds these rows.
  await enqueueRows(rows.map((r) => ({ id: r.id, scheduledAt: r.at })));
  void indexEmails(
    rows.map((r) => ({
      id: r.id, user_id: userId, to_email: r.to, subject: d.subject, body: d.body,
      sender_email: r.senderEmail, status: 'scheduled', scheduled_at: r.at.toISOString(),
    })),
  );

  res.status(201).json({
    batchId,
    total: rows.length,
    duplicatesRemoved: d.emails.length - rows.length,
    senders: senders.length,
    firstSendAt: rows[0].at,
    lastSendAt: rows[rows.length - 1].at,
  });
});

router.get('/', async (req, res) => {
  const status = req.query.status === 'sent' ? 'sent' : 'scheduled';
  const statuses = status === 'sent' ? ['sent', 'failed'] : ['scheduled', 'sending'];
  const order = status === 'sent' ? 'coalesce(j.sent_at, j.updated_at) desc' : 'j.scheduled_at asc';
  const r = await pool.query(
    `select j.id, j.to_email as email, b.subject, j.scheduled_at, j.sent_at, j.status, j.error, j.preview_url, s.email as sender
     from email_jobs j join batches b on b.id=j.batch_id join senders s on s.id=j.sender_id
     where j.user_id=$1 and j.status = any($2) order by ${order} limit 500`,
    [res.locals.userId, statuses],
  );
  res.json(r.rows);
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  try {
    const docs = await searchEmails(res.locals.userId, q);
    return res.json({ source: 'elasticsearch', results: docs });
  } catch (e) {
    console.warn('[search] ES unavailable, using SQL fallback:', (e as Error).message);
    const r = await pool.query(
      `select j.id, j.to_email, b.subject, j.status, j.scheduled_at, j.sent_at
       from email_jobs j join batches b on b.id=j.batch_id
       where j.user_id=$1 and ($2='' or j.to_email ilike $3 or b.subject ilike $3)
       order by j.scheduled_at desc limit 100`,
      [res.locals.userId, q, `%${q}%`],
    );
    res.json({ source: 'postgres', results: r.rows });
  }
});

export default router;
