import { useState } from 'react';
import { api } from '../lib/api';
import { extractEmails } from '../lib/csv';
import { Button } from './ui/Button';
import { Field, Input, Textarea } from './ui/Input';
import { Modal } from './ui/Modal';
import { useToast } from './ui/Toast';

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function ComposeModal({ open, onClose, onScheduled }: { open: boolean; onClose: () => void; onScheduled: () => void }) {
  const toast = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [startTime, setStartTime] = useState(toLocalInput(new Date(Date.now() + 60_000)));
  const [delay, setDelay] = useState(2);
  const [hourly, setHourly] = useState(100);
  const [busy, setBusy] = useState(false);

  async function onFile(file?: File) {
    if (!file) return;
    const list = extractEmails(await file.text());
    setEmails(list);
    setFileName(file.name);
    if (!list.length) toast('error', 'No valid email addresses found in that file');
  }

  async function submit() {
    if (!subject.trim() || !body.trim()) return toast('error', 'Subject and body are required');
    if (!emails.length) return toast('error', 'Upload a CSV/text file with at least one email');
    setBusy(true);
    try {
      const r = await api.schedule({
        subject, body, emails,
        startTime: new Date(startTime).toISOString(),
        delaySeconds: delay,
        hourlyLimit: hourly,
      });
      toast('success', `Scheduled ${r.total} emails`);
      setSubject(''); setBody(''); setEmails([]); setFileName('');
      onScheduled();
      onClose();
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Compose New Email" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Quick question about…" /></Field>
        <Field label="Body"><Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your email…" /></Field>

        <Field label="Leads (CSV / text file)" hint={emails.length ? `${fileName}: ${emails.length} email addresses detected` : 'Any CSV or text file; emails are detected automatically'}>
          <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:text-brand" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Start time"><Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
          <Field label="Delay (seconds)"><Input type="number" min={0} value={delay} onChange={(e) => setDelay(Number(e.target.value))} /></Field>
          <Field label="Hourly limit"><Input type="number" min={1} value={hourly} onChange={(e) => setHourly(Number(e.target.value))} /></Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}>Schedule</Button>
        </div>
      </div>
    </Modal>
  );
}
