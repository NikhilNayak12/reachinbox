import 'dotenv/config';

const num = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number(v));

export const env = {
  port: num(process.env.PORT, 4000),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL ?? 'http://localhost:4000',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/reachinbox',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  esUrl: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID ?? '',
    clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
  },
  workerConcurrency: num(process.env.WORKER_CONCURRENCY, 5),
  minDelayMs: num(process.env.MIN_DELAY_BETWEEN_EMAILS_MS, 2000),
  maxEmailsPerHourPerSender: num(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER, 200),
  defaultSenderCount: num(process.env.DEFAULT_SENDER_COUNT, 2),
  queueName: 'email-send',
};
