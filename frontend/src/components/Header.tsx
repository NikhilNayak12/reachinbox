import type { User } from '../types';
import { Button } from './ui/Button';
import { SlackButton } from './SlackButton';

export function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold text-brand">ReachInbox</h1>
        <div className="flex items-center gap-4">
          <SlackButton />
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft font-semibold text-brand">{user.name[0]}</div>
            )}
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={onLogout}>Logout</Button>
        </div>
      </div>
    </header>
  );
}
