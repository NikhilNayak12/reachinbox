import { pool } from '../db/pool';

/** Sends a message to the user's connected Slack. No connection => silently skipped. */
export async function notifySlack(userId: string, text: string) {
  const r = await pool.query('select webhook_url from slack_connections where user_id=$1', [userId]);
  if (!r.rowCount) return false;
  try {
    const res = await fetch(r.rows[0].webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.warn('[slack] webhook responded', res.status);
    return res.ok;
  } catch (e) {
    console.warn('[slack] notify failed:', (e as Error).message);
    return false;
  }
}
