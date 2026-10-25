import { useState } from 'react';
import { Header } from '../components/Header';
import { ComposeModal } from '../components/ComposeModal';
import { EmailTable } from '../components/EmailTable';
import { Button } from '../components/ui/Button';
import { useEmails } from '../hooks/useEmails';
import type { User } from '../types';

type Tab = 'scheduled' | 'sent';

export function Dashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('scheduled');
  const [open, setOpen] = useState(false);
  const scheduled = useEmails('scheduled');
  const sent = useEmails('sent');
  const active = tab === 'scheduled' ? scheduled : sent;

  return (
    <div className="min-h-screen">
      <Header user={user} onLogout={onLogout} />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(['scheduled', 'sent'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${tab === t ? 'bg-white shadow-sm' : 'text-gray-500'}`}>
                {t} Emails {t === 'scheduled' && scheduled.rows.length > 0 && <span className="ml-1 text-xs text-gray-400">({scheduled.rows.length})</span>}
              </button>
            ))}
          </div>
          <Button onClick={() => setOpen(true)}>+ Compose New Email</Button>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-gray-200">
          <EmailTable rows={active.rows} loading={active.loading} error={active.error} mode={tab} />
        </div>
      </main>
      <ComposeModal open={open} onClose={() => setOpen(false)} onScheduled={() => { scheduled.reload(); setTab('scheduled'); }} />
    </div>
  );
}
