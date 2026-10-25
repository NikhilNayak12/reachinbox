import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    window.history.replaceState(null, '', '/');
  }, []);

  return { user, loading, logout };
}
