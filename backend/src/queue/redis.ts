import IORedis from 'ioredis';
import { env } from '../config/env';

const u = new URL(env.redisUrl);

/** Connection options for BullMQ (workers need maxRetriesPerRequest: null). */
export const bullConnection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  username: u.username || undefined,
  password: u.password || undefined,
  tls: u.protocol === 'rediss:' ? {} : undefined,
  maxRetriesPerRequest: null as null,
};

/** General purpose client: rate-limit counters, locks, notification dedupe. */
export const redis = new IORedis(env.redisUrl);
