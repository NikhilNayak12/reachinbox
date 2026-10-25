import type { EmailRow } from '../types';
import { Badge } from './ui/Badge';
import { EmptyState } from './ui/EmptyState';
import { Spinner } from './ui/Spinner';

interface Props {
  rows: EmailRow[];
  loading: boolean;
  error: string | null;
  mode: 'scheduled' | 'sent';
}

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

export function EmailTable({ rows, loading, error, mode }: Props) {
  if (loading) return <Spinner />;
  if (error) return <p className="py-10 text-center text-sm text-red-600">{error}</p>;
  if (!rows.length)
    return mode === 'scheduled'
      ? <EmptyState title="No scheduled emails" hint="Click “Compose New Email” to schedule your first campaign." />
      : <EmptyState title="No sent emails yet" hint="Emails appear here once they are delivered." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">{mode === 'scheduled' ? 'Scheduled time' : 'Sent time'}</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{r.email}</td>
              <td className="max-w-xs truncate px-4 py-3 text-gray-600">{r.subject}</td>
              <td className="whitespace-nowrap px-4 py-3 text-gray-600">{fmt(mode === 'scheduled' ? r.scheduled_at : r.sent_at ?? r.scheduled_at)}</td>
              <td className="px-4 py-3">
                <Badge status={r.status} />
                {r.preview_url && <a href={r.preview_url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-brand underline">preview</a>}
                {r.error && <span title={r.error} className="ml-2 cursor-help text-xs text-red-500">ⓘ</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
