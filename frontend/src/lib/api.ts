import type { EmailRow, ScheduleInput, ScheduleResult, SlackStatus, User } from '../types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  me: () => request<User>('/auth/me'),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  emails: (status: 'scheduled' | 'sent') => request<EmailRow[]>(`/api/emails?status=${status}`),
  schedule: (input: ScheduleInput) => request<ScheduleResult>('/api/emails/schedule', { method: 'POST', body: JSON.stringify(input) }),
  slackStatus: () => request<SlackStatus>('/api/slack/status'),
  slackDisconnect: () => request<{ ok: boolean }>('/api/slack', { method: 'DELETE' }),
  loginUrl: `${API_URL}/auth/google`,
  slackConnectUrl: `${API_URL}/api/slack/connect`,
};
