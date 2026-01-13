import { useState, useEffect } from 'react';
import { FieldLoginPage } from '@/components/Field/FieldLoginPage';
import { FieldFuelForm } from '@/components/Field/FieldFuelForm';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

const STORAGE_KEY = 'abastech_field_user';

export function FieldPage() {
  const [user, setUser] = useState<FieldUser | null>(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const handleLogin = (loggedUser: FieldUser) => {
    setUser(loggedUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  if (!user) {
    return <FieldLoginPage onLogin={handleLogin} />;
  }

  return <FieldFuelForm user={user} onLogout={handleLogout} />;
}
