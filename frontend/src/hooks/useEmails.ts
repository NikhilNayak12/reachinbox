import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { EmailRow } from '../types';

/** Loads a list and silently polls so the table updates while emails send. */
export function useEmails(status: 'scheduled' | 'sent', pollMs = 5000) {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.emails(status));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { rows, loading, error, reload: load };
}
