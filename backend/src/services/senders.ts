import nodemailer from 'nodemailer';
import { pool } from '../db/pool';
import { env } from '../config/env';

export interface Sender {
  id: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
}

export async function createSender(userId: string, creds?: { user: string; pass: string }): Promise<Sender> {
  let host = 'smtp.ethereal.email';
  let port = 587;
  let user: string;
  let pass: string;
  if (creds) {
    user = creds.user;
    pass = creds.pass;
  } else {
    const acct = await nodemailer.createTestAccount(); // fake Ethereal account
    host = acct.smtp.host;
    port = acct.smtp.port;
    user = acct.user;
    pass = acct.pass;
  }
  const r = await pool.query(
    `insert into senders (user_id,email,smtp_host,smtp_port,smtp_user,smtp_pass)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [userId, user, host, port, user, pass],
  );
  return r.rows[0];
}

export async function ensureSenders(userId: string): Promise<Sender[]> {
  const r = await pool.query('select * from senders where user_id=$1 order by created_at', [userId]);
  if (r.rows.length) return r.rows;
  const created: Sender[] = [];
  for (let i = 0; i < Math.max(1, env.defaultSenderCount); i++) created.push(await createSender(userId));
  return created;
}
