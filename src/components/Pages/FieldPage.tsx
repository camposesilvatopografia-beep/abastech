import { useState, useEffect } from 'react';
import { FieldLoginPage } from '@/components/Field/FieldLoginPage';
import { FieldFuelForm } from '@/components/Field/FieldFuelForm';
import { FieldDashboard } from '@/components/Field/FieldDashboard';
import { 
  LayoutDashboard, 
  Fuel, 
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

const STORAGE_KEY = 'abastech_field_user';

type FieldView = 'dashboard' | 'form';

export function FieldPage() {
  const [user, setUser] = useState<FieldUser | null>(null);
  const [currentView, setCurrentView] = useState<FieldView>('dashboard');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check pending records
  useEffect(() => {
    if (!user) return;

    const checkPending = async () => {
      const { count } = await supabase
        .from('field_fuel_records')
        .select('*', { count: 'exact', head: true })
        .eq('synced_to_sheet', false)
        .eq('user_id', user.id);
      
      setPendingCount(count || 0);
    };

    checkPending();
    const interval = setInterval(checkPending, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = (loggedUser: FieldUser) => {
    setUser(loggedUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
  };

  const handleLogout = () => {
    setUser(null);
    setCurrentView('dashboard');
    localStorage.removeItem(STORAGE_KEY);
  };

  if (!user) {
    return <FieldLoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Fuel className="w-7 h-7" />
            <div>
              <h1 className="text-base font-bold">Apontamento Campo</h1>
              <p className="text-xs opacity-90">{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sync status */}
            <div className="flex items-center gap-1">
              {isOnline ? (
                <Cloud className="w-4 h-4 text-green-300" />
              ) : (
                <CloudOff className="w-4 h-4 text-yellow-300" />
              )}
              {pendingCount > 0 && (
                <span className="text-xs bg-yellow-500 text-yellow-900 px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-primary-foreground hover:bg-primary-foreground/20"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Connection Banner */}
      {!isOnline && (
        <div className="bg-yellow-500 text-yellow-900 p-2 text-center text-sm">
          Modo offline - dados serão sincronizados quando houver conexão
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {currentView === 'dashboard' ? (
          <FieldDashboard 
            user={user} 
            onNavigateToForm={() => setCurrentView('form')} 
          />
        ) : (
          <FieldFuelForm 
            user={user} 
            onLogout={handleLogout}
            onBack={() => setCurrentView('dashboard')}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border p-2 flex justify-around z-20">
        <Button
          variant="ghost"
          className={cn(
            "flex-1 flex flex-col items-center gap-1 h-14",
            currentView === 'dashboard' && "text-primary bg-primary/10"
          )}
          onClick={() => setCurrentView('dashboard')}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-xs">Dashboard</span>
        </Button>
        <Button
          variant="ghost"
          className={cn(
            "flex-1 flex flex-col items-center gap-1 h-14",
            currentView === 'form' && "text-primary bg-primary/10"
          )}
          onClick={() => setCurrentView('form')}
        >
          <Fuel className="w-5 h-5" />
          <span className="text-xs">Apontamento</span>
        </Button>
      </nav>
    </div>
  );
}
