import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SlackStatus } from '../types';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

export function SlackButton() {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const toast = useToast();

  useEffect(() => {
    api.slackStatus().then(setStatus).catch(() => setStatus({ connected: false, channel: null, team: null }));
    const q = new URLSearchParams(window.location.search).get('slack');
    if (q === 'connected') toast('success', 'Slack connected');
    if (q === 'error') toast('error', 'Slack connection failed');
    if (q) window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status) return null;
  if (!status.connected)
    return <Button variant="secondary" onClick={() => (window.location.href = api.slackConnectUrl)}>Connect Slack</Button>;

  return (
    <Button
      variant="ghost"
      title="Click to disconnect"
      onClick={async () => {
        await api.slackDisconnect();
        setStatus({ connected: false, channel: null, team: null });
        toast('success', 'Slack disconnected');
      }}
    >
      ✅ Slack {status.channel ?? ''}
    </Button>
  );
}
