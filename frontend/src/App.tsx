import { useAuth } from './hooks/useAuth';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Spinner } from './components/ui/Spinner';

export default function App() {
  const { user, loading, logout } = useAuth();
  if (loading) return <Spinner />;
  return user ? <Dashboard user={user} onLogout={logout} /> : <Login />;
}
