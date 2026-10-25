import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { createSender, ensureSenders } from '../services/senders';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const senders = await ensureSenders(res.locals.userId);
  res.json(senders.map((s) => ({ id: s.id, email: s.email, host: s.smtp_host })));
});

// Optional: add a sender from your own Ethereal credentials; empty body auto-creates one.
router.post('/', async (req, res) => {
  const body = z.object({ user: z.string().email(), pass: z.string().min(1) }).partial().parse(req.body ?? {});
  const s = await createSender(res.locals.userId, body.user && body.pass ? { user: body.user, pass: body.pass } : undefined);
  res.status(201).json({ id: s.id, email: s.email });
});

router.get('/usage', async (_req, res) => {
  const r = await pool.query(
    `select s.email, count(j.id) filter (where j.status='sent' and j.sent_at > now() - interval '1 hour') as sent_last_hour
     from senders s left join email_jobs j on j.sender_id=s.id where s.user_id=$1 group by s.email`,
    [res.locals.userId],
  );
  res.json(r.rows);
});

export default router;
