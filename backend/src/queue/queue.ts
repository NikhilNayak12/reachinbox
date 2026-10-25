import { Queue } from 'bullmq';
import { env } from '../config/env';
import { bullConnection } from './redis';

export const emailQueue = new Queue(env.queueName, { connection: bullConnection });

export interface EnqueueRow {
  id: string;
  scheduledAt: Date;
}

/**
 * Adds one delayed BullMQ job per email. jobId === email_jobs.id, so adding the
 * same email twice (e.g. reconcile after a restart) is a no-op => idempotent.
 */
export async function enqueueRows(rows: EnqueueRow[]) {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const now = Date.now();
    await emailQueue.addBulk(
      chunk.map((r) => ({
        name: 'send',
        data: { emailJobId: r.id },
        opts: {
          jobId: r.id,
          delay: Math.max(0, r.scheduledAt.getTime() - now),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 86400, count: 5000 },
          removeOnFail: { age: 7 * 86400, count: 5000 },
        },
      })),
    );
  }
}
