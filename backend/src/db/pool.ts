import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({ connectionString: env.databaseUrl });

const SCHEMA = `
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  google_id text unique not null,
  name text, email text not null, avatar text,
  created_at timestamptz not null default now()
);

create table if not exists senders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  email text not null,
  smtp_host text not null, smtp_port int not null,
  smtp_user text not null, smtp_pass text not null,
  created_at timestamptz not null default now()
);

create table if not exists batches (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  subject text not null, body text not null,
  start_time timestamptz not null,
  delay_ms int not null,
  hourly_limit int,
  total int not null,
  created_at timestamptz not null default now()
);

create table if not exists email_jobs (
  id uuid primary key,
  batch_id uuid not null references batches(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  sender_id uuid not null references senders(id),
  to_email text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled',
  sent_at timestamptz,
  error text,
  preview_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, to_email)
);
create index if not exists idx_jobs_user_status on email_jobs (user_id, status);
create index if not exists idx_jobs_status_sched on email_jobs (status, scheduled_at);

create table if not exists slack_connections (
  user_id uuid primary key references users(id) on delete cascade,
  webhook_url text not null,
  channel text, team_name text,
  created_at timestamptz not null default now()
);
`;

export async function initDb() {
  await pool.query(SCHEMA);
}
