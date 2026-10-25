export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed';

export interface EmailRow {
  id: string;
  email: string;
  subject: string;
  scheduled_at: string;
  sent_at: string | null;
  status: EmailStatus;
  error: string | null;
  preview_url: string | null;
  sender: string;
}

export interface ScheduleInput {
  subject: string;
  body: string;
  emails: string[];
  startTime?: string;
  delaySeconds: number;
  hourlyLimit?: number;
}

export interface ScheduleResult {
  batchId: string;
  total: number;
  duplicatesRemoved: number;
  senders: number;
  firstSendAt: string;
  lastSendAt: string;
}

export interface SlackStatus {
  connected: boolean;
  channel: string | null;
  team: string | null;
}
