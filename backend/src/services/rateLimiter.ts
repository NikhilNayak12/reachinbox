import { redis } from '../queue/redis';

const HOUR = 3_600_000;
export const windowIndex = (ts: number) => Math.floor(ts / HOUR);
export const windowStart = (idx: number) => idx * HOUR;

/**
 * Atomically reserves one send slot for a sender.
 * Walks forward from the current hour window and takes the first window that
 * still has capacity. It is one Lua script, so it is safe across any number of
 * workers/instances, and later jobs naturally land in later windows (order is
 * preserved, nothing is dropped).
 * Returns ahead=0 when a slot in the current hour was reserved, otherwise the
 * number of windows the job was pushed ahead (and its position in that window).
 */
const LUA = `
local max = tonumber(ARGV[1])
local base = tonumber(ARGV[2])
local horizon = tonumber(ARGV[3])
for i = 0, horizon do
  local k = KEYS[1] .. ':' .. (base + i)
  local c = tonumber(redis.call('GET', k) or '0')
  if c < max then
    redis.call('INCR', k)
    redis.call('EXPIRE', k, (i + 2) * 3600)
    return {i, c + 1}
  end
end
return {-1, 0}
`;

export async function reserveSlot(senderId: string, maxPerHour: number, now = Date.now()) {
  const res = (await redis.eval(LUA, 1, `rl:${senderId}`, maxPerHour, windowIndex(now), 168)) as [number, number];
  if (res[0] < 0) throw new Error('No capacity within the 7-day horizon');
  return { ahead: res[0], position: res[1] };
}

/**
 * Minimum gap between sends from the same sender. Returns 0 if the caller may
 * send now (and holds the gap lock), otherwise the ms to wait.
 */
export async function acquireGap(senderId: string, gapMs: number) {
  const key = `gap:${senderId}`;
  const ok = await redis.set(key, '1', 'PX', gapMs, 'NX');
  if (ok) return 0;
  const ttl = await redis.pttl(key);
  return ttl > 0 ? ttl : 50;
}

export const releaseGap = (senderId: string) => redis.del(`gap:${senderId}`);

/** True only once per sender per hour window (throttles Slack alerts). */
export async function firstLimitHitInWindow(senderId: string, win: number) {
  const ok = await redis.set(`slackhit:${senderId}:${win}`, '1', 'EX', 7200, 'NX');
  return !!ok;
}
