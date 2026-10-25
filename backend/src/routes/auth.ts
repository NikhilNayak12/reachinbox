import { Router } from 'express';
import { randomBytes } from 'crypto';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { requireAuth, signToken } from '../middleware/auth';

const router = Router();
const REDIRECT = `${env.backendUrl}/auth/google/callback`;

router.get('/google', (_req, res) => {
  const state = randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600_000 });
  const p = new URLSearchParams({
    client_id: env.google.clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.cookies?.oauth_state) throw new Error('Invalid OAuth state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error('Google token exchange failed');

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const info = (await infoRes.json()) as { sub: string; name?: string; email: string; picture?: string };

    const u = await pool.query(
      `insert into users (google_id,name,email,avatar) values ($1,$2,$3,$4)
       on conflict (google_id) do update set name=excluded.name, email=excluded.email, avatar=excluded.avatar
       returning id`,
      [info.sub, info.name ?? info.email, info.email, info.picture ?? null],
    );
    res.clearCookie('oauth_state');
    res.cookie('token', signToken(u.rows[0].id), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400_000 });
    res.redirect(`${env.frontendUrl}/dashboard`);
  } catch (e) {
    console.error('[auth]', (e as Error).message);
    res.redirect(`${env.frontendUrl}/?error=login_failed`);
  }
});

router.get('/me', requireAuth, async (_req, res) => {
  const r = await pool.query('select id,name,email,avatar from users where id=$1', [res.locals.userId]);
  if (!r.rowCount) return res.status(401).json({ error: 'unauthorized' });
  res.json(r.rows[0]);
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

export default router;
