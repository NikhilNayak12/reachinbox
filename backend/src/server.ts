import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env';
import { initDb } from './db/pool';
import { emailQueue } from './queue/queue';
import { requireAuth } from './middleware/auth';
import { ensureIndex } from './services/search';
import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import senderRoutes from './routes/senders';
import slackRoutes from './routes/slack';

async function main() {
  await initDb();
  await ensureIndex();

  const app = express();
  app.use(cors({ origin: env.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', authRoutes);
  app.use('/api/emails', emailRoutes);
  app.use('/api/senders', senderRoutes);
  app.use('/api/slack', slackRoutes);

  // Live BullMQ dashboard (login required)
  const board = new ExpressAdapter();
  board.setBasePath('/admin/queues');
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: board });
  app.use('/admin/queues', requireAuth, board.getRouter());

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(env.port, () => console.log(`API on ${env.backendUrl}  |  Bull dashboard: ${env.backendUrl}/admin/queues`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
