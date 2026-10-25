import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { notifySlack } from '../services/slack';

const router = Router();
const REDIRECT = `${env.backendUrl}/api/slack/callback`;

// Browser navigates here from the "Connect Slack" button.
router.get('/connect', requireAuth, (_req, res) => {
  const state = jwt.sign({ uid: res.locals.userId }, env.jwtSecret, { expiresIn: '10m' });
  const p = new URLSearchParams({
    client_id: env.slack.clientId,
    scope: 'incoming-webhook',
    redirect_uri: REDIRECT,
    state,
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${p}`);
});

router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const { uid } = jwt.verify(state ?? '', env.jwtSecret) as { uid: string };
    if (!code) throw new Error('Missing code');

    const r = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.slack.clientId,
        client_secret: env.slack.clientSecret,
        redirect_uri: REDIRECT,
      }),
    });
    const data = (await r.json()) as {
      ok: boolean;
      error?: string;
      team?: { name: string };
      incoming_webhook?: { url: string; channel: string };
    };
    if (!data.ok || !data.incoming_webhook) throw new Error(data.error ?? 'Slack OAuth failed');

    await pool.query(
      `insert into slack_connections (user_id,webhook_url,channel,team_name) values ($1,$2,$3,$4)
       on conflict (user_id) do update set webhook_url=excluded.webhook_url, channel=excluded.channel,
       team_name=excluded.team_name, created_at=now()`,
      [uid, data.incoming_webhook.url, data.incoming_webhook.channel, data.team?.name ?? null],
    );
    await notifySlack(uid, ':white_check_mark: ReachInbox Scheduler is connected. You will be alerted when a sender hits its hourly limit.');
    res.redirect(`${env.frontendUrl}/dashboard?slack=connected`);
  } catch (e) {
    console.error('[slack]', (e as Error).message);
    res.redirect(`${env.frontendUrl}/dashboard?slack=error`);
  }
});

router.get('/status', requireAuth, async (_req, res) => {
  const r = await pool.query('select channel, team_name from slack_connections where user_id=$1', [res.locals.userId]);
  res.json({ connected: !!r.rowCount, channel: r.rows[0]?.channel ?? null, team: r.rows[0]?.team_name ?? null });
});

router.delete('/', requireAuth, async (_req, res) => {
  await pool.query('delete from slack_connections where user_id=$1', [res.locals.userId]);
  res.json({ ok: true });
});

export default router;
