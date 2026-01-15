import { useState, useEffect, useCallback } from 'react';
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
import { toast } from 'sonner';
import logoAbastech from '@/assets/logo-abastech.png';

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

  // Function to fetch and update user data from database
  const refreshUserData = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('field_users')
        .select('id, name, username, role, assigned_locations')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        const updatedUser: FieldUser = {
          id: data.id,
          name: data.name,
          username: data.username,
          role: data.role || 'operador',
          assigned_locations: data.assigned_locations || [],
        };
        
        setUser(updatedUser);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        return updatedUser;
      }
    } catch (err) {
      console.error('Error refreshing user data:', err);
    }
    return null;
  }, []);

  // Load user from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsedUser = JSON.parse(stored);
        setUser(parsedUser);
        // Immediately refresh from database to get latest data
        refreshUserData(parsedUser.id);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [refreshUserData]);

  // Real-time subscription for user profile changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`field-user-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'field_users',
          filter: `id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('User data changed:', payload);
          const newData = payload.new as Record<string, any>;
          
          // Check what changed
          const oldLocations = user.assigned_locations || [];
          const newLocations = newData.assigned_locations || [];
          const locationsChanged = JSON.stringify(oldLocations) !== JSON.stringify(newLocations);
          
          // Update user state immediately
          const updatedUser: FieldUser = {
            id: newData.id,
            name: newData.name,
            username: newData.username,
            role: newData.role || 'operador',
            assigned_locations: newData.assigned_locations || [],
          };
          
          setUser(updatedUser);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
          
          // Notify user of specific changes
          if (locationsChanged) {
            const locationNames = newLocations.length > 0 ? newLocations.join(', ') : 'Nenhum';
            toast.success(`Seus locais foram atualizados: ${locationNames}`, {
              duration: 5000,
            });
          } else if (newData.name !== user.name) {
            toast.info('Suas informações foram atualizadas');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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

  const handleLogin = async (loggedUser: FieldUser) => {
    setUser(loggedUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
    // Refresh immediately after login to ensure latest data
    await refreshUserData(loggedUser.id);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header with brand colors */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-amber-600 to-orange-600 text-white p-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoAbastech} alt="Abastech" className="h-8 w-auto" />
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
                <span className="text-xs bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full font-medium">
                  {pendingCount}
                </span>
              )}
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleLogout}
              className="text-white hover:bg-white/20"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs - Right below header */}
      <nav className="bg-slate-800/90 backdrop-blur-sm border-b border-slate-700 px-4 py-2 flex gap-2">
        <Button
          variant={currentView === 'dashboard' ? 'default' : 'ghost'}
          className={cn(
            "flex-1 h-11 gap-2",
            currentView === 'dashboard' 
              ? "bg-amber-500 hover:bg-amber-600 text-white" 
              : "text-slate-400 hover:text-white hover:bg-slate-700"
          )}
          onClick={() => setCurrentView('dashboard')}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span className="text-sm font-medium">Dashboard</span>
        </Button>
        <Button
          variant={currentView === 'form' ? 'default' : 'ghost'}
          className={cn(
            "flex-1 h-11 gap-2",
            currentView === 'form' 
              ? "bg-sky-500 hover:bg-sky-600 text-white" 
              : "text-slate-400 hover:text-white hover:bg-slate-700"
          )}
          onClick={() => setCurrentView('form')}
        >
          <Fuel className="w-4 h-4" />
          <span className="text-sm font-medium">Novo Apontamento</span>
        </Button>
      </nav>

      {/* Connection Banner */}
      {!isOnline && (
        <div className="bg-amber-500 text-amber-900 p-2 text-center text-sm font-medium">
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
    </div>
  );
}
