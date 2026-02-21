import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FieldLoginPage } from '@/components/Field/FieldLoginPage';
import { FieldFuelForm } from '@/components/Field/FieldFuelForm';
import { FieldDashboard } from '@/components/Field/FieldDashboard';
import { FieldHorimeterForm } from '@/components/Field/FieldHorimeterForm';
import { FieldServiceOrderForm } from '@/components/Field/FieldServiceOrderForm';
import { FieldFuelMenu } from '@/components/Field/FieldFuelMenu';
import { FieldComboioForm } from '@/components/Field/FieldComboioForm';
import { FieldFuelRecords } from '@/components/Field/FieldFuelRecords';
import { FieldStockView } from '@/components/Field/FieldStockView';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { 
  Home,
  LayoutDashboard, 
  Fuel, 
  Camera,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  Loader2,
  Sun,
  Moon,
  Plus,
  Settings,
  Volume2,
  VolumeX,
  Smartphone,
  Bell,
  BellOff,
  Database,
  Clock,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import logoAbastech from '@/assets/logo-abastech.png';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings } from '@/hooks/useFieldSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { syncAllOfflineRecords, cacheReferenceData } from '@/lib/offlineSync';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
  avatar_url?: string | null;
}

const STORAGE_KEY = 'abastech_field_user';

type FieldView = 'dashboard' | 'form' | 'fuel-menu' | 'fuel-abastecer' | 'fuel-comboio' | 'fuel-registros' | 'fuel-estoques' | 'horimeter' | 'os';

export function FieldPage() {
  const [user, setUser] = useState<FieldUser | null>(null);
  const [currentView, setCurrentView] = useState<FieldView>('dashboard');
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { settings, toggleSound, toggleVibration } = useFieldSettings();
  const { canView: canViewModule, loading: permLoading } = useRolePermissions();
  const { 
    permission: notificationPermission, 
    requestPermission: requestNotificationPermission,
    notifySyncComplete,
    notifyPendingSync,
    notifySyncError,
    notifyOffline,
    notifyOnline,
    notifyRecordSaved,
  } = usePushNotifications();
  
  // Offline storage hook - will be null until user is loaded
  const offlineStorage = useOfflineStorage(user?.id);
  
  // Derive user role for permission checks
  const userRole = user?.role || 'operador';

  // Auto-redirect to first allowed view when permissions load
  useEffect(() => {
    if (permLoading || !user) return;
    const viewModuleMap: { view: FieldView; module: string }[] = [
      { view: 'dashboard', module: 'field_dashboard' },
      { view: 'fuel-menu', module: 'field_abastecimento' },
      { view: 'horimeter', module: 'field_horimetros' },
      { view: 'os', module: 'field_os' },
    ];
    const canSeeCurrentView = viewModuleMap.find(v => v.view === currentView);
    if (canSeeCurrentView && !canViewModule(userRole, canSeeCurrentView.module, user.id)) {
      const firstAllowed = viewModuleMap.find(v => canViewModule(userRole, v.module, user.id));
      if (firstAllowed) {
        setCurrentView(firstAllowed.view);
      }
    }
  }, [permLoading, user, userRole, canViewModule]);

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

  // Cache reference data when online and user is logged in
  useEffect(() => {
    if (!user || !isOnline) return;
    cacheReferenceData();
  }, [user, isOnline]);

  // Sync pending records - both from Supabase and IndexedDB (all types)
  const syncPendingRecords = useCallback(async () => {
    if (!user || isSyncing) return;
    
    setIsSyncing(true);
    let totalSynced = 0;
    
    try {
      // Sync all offline records (fuel, horimeter, OS) using universal sync
      if (offlineStorage.isSupported) {
        const result = await syncAllOfflineRecords(user.id);
        totalSynced += result.synced;
        if (result.failed > 0) {
          console.warn(`${result.failed} records failed to sync`);
        }
      }
      
      // Then, sync fuel records in Supabase that aren't synced to sheet
      const { data: pendingRecords, error } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('synced_to_sheet', false)
        .eq('user_id', user.id);

      if (error) throw error;

      if (pendingRecords && pendingRecords.length > 0) {
        let sheetSynced = 0;
        for (const record of pendingRecords) {
          try {
            
            
            const { buildFuelSheetData, dbRecordToSheetRecord } = await import('@/lib/fuelSheetMapping');
            const sheetRecord = dbRecordToSheetRecord(record);
            const sheetData = buildFuelSheetData(sheetRecord);

            const response = await supabase.functions.invoke('google-sheets', {
              body: { action: 'create', sheetName: 'AbastecimentoCanteiro01', data: sheetData },
            });

            if (!response.error) {
              await supabase
                .from('field_fuel_records')
                .update({ synced_to_sheet: true })
                .eq('id', record.id);
              sheetSynced++;
            }
          } catch (syncErr) {
            console.warn(`[FieldPage] Failed to sync record ${record.id} to sheet:`, syncErr);
          }
        }
        totalSynced += sheetSynced;
      }
      
      if (totalSynced > 0) {
        toast.success(`${totalSynced} registro(s) sincronizado(s) com sucesso!`, {
          duration: 4000,
        });
        notifySyncComplete(totalSynced);
      }
      
      setPendingCount(0);
      await offlineStorage.refreshCount();
      
    } catch (err) {
      console.error('Error syncing pending records:', err);
      toast.error('Erro ao sincronizar registros pendentes');
      notifySyncError();
    } finally {
      setIsSyncing(false);
    }
  }, [user, isSyncing, notifySyncComplete, notifySyncError, offlineStorage]);

  // Monitor online status and auto-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida! Sincronizando...', {
        duration: 3000,
      });
      notifyOnline();
      // Auto-sync when back online
      setTimeout(() => {
        syncPendingRecords();
      }, 1000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Você está offline. Registros serão salvos localmente.', {
        duration: 5000,
      });
      notifyOffline();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingRecords, notifyOnline, notifyOffline]);

  // Check pending records (both Supabase and IndexedDB) and notify
  useEffect(() => {
    if (!user) return;
    
    let previousPending = 0;
    let notifiedAt: number | null = null;

    const checkPending = async () => {
      let totalPending = 0;
      
      // Check Supabase pending
      const { count } = await supabase
        .from('field_fuel_records')
        .select('*', { count: 'exact', head: true })
        .eq('synced_to_sheet', false)
        .eq('user_id', user.id);
      
      totalPending += count || 0;
      
      // Add offline pending count
      totalPending += offlineStorage.pendingCount;
      
      setPendingCount(totalPending);
      
      // Notify if pending count increased and we're online but haven't synced
      // Only notify once per session or every 5 minutes
      const now = Date.now();
      const shouldNotify = 
        totalPending > 0 && 
        isOnline && 
        (totalPending > previousPending || (notifiedAt && now - notifiedAt > 5 * 60 * 1000));
      
      if (shouldNotify && (!notifiedAt || now - notifiedAt > 60 * 1000)) {
        notifyPendingSync(totalPending);
        notifiedAt = now;
      }
      
      previousPending = totalPending;
    };

    checkPending();
    const interval = setInterval(checkPending, 15000);
    return () => clearInterval(interval);
  }, [user, offlineStorage.pendingCount, isOnline, notifyPendingSync]);

  const handleLogin = async (loggedUser: FieldUser) => {
    setUser(loggedUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedUser));
    // Refresh immediately after login to ensure latest data
    await refreshUserData(loggedUser.id);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const fileName = `avatars/${user.id}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('field-photos').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('field-photos').getPublicUrl(fileName);
      const avatarUrl = data.publicUrl;
      await supabase.from('field_users').update({ avatar_url: avatarUrl }).eq('id', user.id);
      setUser({ ...user, avatar_url: avatarUrl });
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.avatar_url = avatarUrl;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
      toast.success('Foto de perfil atualizada!');
    } catch (err) {
      console.error('Avatar upload error:', err);
      toast.error('Erro ao enviar foto');
    }
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
    <div className={cn(
      "min-h-screen flex flex-col transition-colors duration-300",
      theme === 'dark' 
        ? "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" 
        : "bg-slate-50"
    )}>
      {/* Header with brand colors */}
      <header className="sticky top-0 z-10 bg-gradient-to-r from-blue-800 to-blue-900 text-white p-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="relative h-10 w-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border-2 border-white/40 hover:border-white/70 transition-colors shrink-0"
            >
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                <Camera className="w-5 h-5 text-white/70" />
              )}
            </button>
            <div>
              <h1 className="text-base font-bold">Olá, {user.name.split(' ')[0]}</h1>
              <p className="text-xs opacity-90">Apontamento Campo</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Sync status */}
            <div className="flex items-center gap-1">
              {isSyncing ? (
                <Loader2 className="w-4 h-4 text-blue-300 animate-spin" />
              ) : isOnline ? (
                <Cloud className="w-4 h-4 text-green-300" />
              ) : (
                <CloudOff className="w-4 h-4 text-yellow-300 animate-pulse" />
              )}
              {pendingCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={syncPendingRecords}
                  disabled={!isOnline || isSyncing}
                  className="h-6 px-1.5 py-0 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-full font-medium text-xs gap-1"
                >
                  {isSyncing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {pendingCount}
                </Button>
              )}
            </div>
            {/* Settings Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-white hover:bg-white/20"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Configurações</h4>
                  
                  {/* Theme Toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="theme-toggle" className="text-sm flex items-center gap-2">
                      {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      Tema {theme === 'dark' ? 'Escuro' : 'Claro'}
                    </Label>
                    <Switch
                      id="theme-toggle"
                      checked={theme === 'dark'}
                      onCheckedChange={toggleTheme}
                    />
                  </div>
                  
                  {/* Sound Toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sound-toggle" className="text-sm flex items-center gap-2">
                      {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      Som
                    </Label>
                    <Switch
                      id="sound-toggle"
                      checked={settings.soundEnabled}
                      onCheckedChange={toggleSound}
                    />
                  </div>
                  
                  {/* Vibration Toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="vibration-toggle" className="text-sm flex items-center gap-2">
                      <Smartphone className="w-4 h-4" />
                      Vibração
                    </Label>
                    <Switch
                      id="vibration-toggle"
                      checked={settings.vibrationEnabled}
                      onCheckedChange={toggleVibration}
                    />
                  </div>
                  
                  {/* Notifications Toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notification-toggle" className="text-sm flex items-center gap-2">
                      {notificationPermission === 'granted' ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                      Notificações
                    </Label>
                    {notificationPermission === 'granted' ? (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        Ativas
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={requestNotificationPermission}
                      >
                        Ativar
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleLogout}
              className="h-10 px-4 gap-2 bg-red-600 hover:bg-red-700 border-red-700 text-white font-bold shadow-lg"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs - Icons only, filtered by permissions */}
      <nav className={cn(
        "backdrop-blur-sm border-b px-3 py-2 flex gap-2 justify-around",
        theme === 'dark' 
          ? "bg-slate-800/90 border-slate-700" 
          : "bg-white/90 border-slate-200"
      )}>
        {currentView !== 'dashboard' && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-11 w-11 rounded-xl",
              theme === 'dark'
                ? "text-white bg-slate-600 hover:bg-slate-500"
                : "text-slate-700 bg-slate-200 hover:bg-slate-300"
            )}
            onClick={() => setCurrentView('dashboard')}
            title="Voltar ao Menu"
          >
            <Home className="w-5 h-5" />
          </Button>
        )}
        {canViewModule(userRole, 'field_dashboard', user?.id) && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-11 w-11 rounded-xl",
              currentView === 'dashboard' 
                ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/30" 
                : theme === 'dark'
                  ? "text-slate-400 hover:text-white hover:bg-slate-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
            onClick={() => setCurrentView('dashboard')}
          >
            <LayoutDashboard className="w-5 h-5" />
          </Button>
        )}
        {canViewModule(userRole, 'field_abastecimento', user?.id) && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-11 w-11 rounded-xl",
              (currentView === 'fuel-menu' || currentView === 'fuel-abastecer' || currentView === 'fuel-comboio' || currentView === 'fuel-registros' || currentView === 'form')
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30" 
                : theme === 'dark'
                  ? "text-slate-400 hover:text-white hover:bg-slate-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
            onClick={() => setCurrentView('fuel-menu')}
          >
            <Fuel className="w-5 h-5" />
          </Button>
        )}
        {canViewModule(userRole, 'field_horimetros', user?.id) && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-11 w-11 rounded-xl",
              currentView === 'horimeter' 
                ? "bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/30" 
                : theme === 'dark'
                  ? "text-slate-400 hover:text-white hover:bg-slate-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
            onClick={() => setCurrentView('horimeter')}
          >
            <Clock className="w-5 h-5" />
          </Button>
        )}
        {canViewModule(userRole, 'field_os', user?.id) && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-11 w-11 rounded-xl",
              currentView === 'os' 
                ? "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/30" 
                : theme === 'dark'
                  ? "text-slate-400 hover:text-white hover:bg-slate-700"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            )}
            onClick={() => setCurrentView('os')}
          >
            <Wrench className="w-5 h-5" />
          </Button>
        )}
      </nav>

      {/* Connection Banner - Offline or Pending Sync */}
      {(!isOnline || pendingCount > 0) && (
        <div className={cn(
          "p-2 text-center text-sm font-medium flex items-center justify-center gap-2",
          !isOnline 
            ? theme === 'dark' 
              ? "bg-red-500/90 text-white animate-pulse" 
              : "bg-red-100 text-red-800 border-b border-red-200"
            : theme === 'dark'
              ? "bg-amber-500 text-amber-900"
              : "bg-amber-100 text-amber-800 border-b border-amber-200"
        )}>
          {!isOnline ? (
            <>
              <CloudOff className="w-4 h-4" />
              <span>Sem conexão - {pendingCount} registro(s) aguardando sincronização</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              <span>{pendingCount} registro(s) pendente(s)</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={syncPendingRecords}
                disabled={isSyncing}
                className="h-6 px-2 py-0 ml-2 bg-amber-600 hover:bg-amber-700 text-white text-xs rounded"
              >
                {isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-auto">
        {currentView === 'dashboard' ? (
          <FieldDashboard 
            user={user} 
            onNavigateToForm={() => setCurrentView('fuel-menu')}
            onNavigateToHorimeter={() => setCurrentView('horimeter')}
            onNavigateToOS={() => setCurrentView('os')}
            pendingSyncCount={pendingCount + offlineStorage.pendingCount}
            isSyncing={isSyncing}
            onSync={syncPendingRecords}
            canViewModule={canViewModule}
          />
        ) : currentView === 'fuel-menu' ? (
          <FieldFuelMenu
            onNavigate={(view) => setCurrentView(view)}
            user={user}
            onBack={() => setCurrentView('dashboard')}
          />
        ) : currentView === 'fuel-abastecer' || currentView === 'form' ? (
          <FieldFuelForm 
            user={user} 
            onLogout={handleLogout}
            onBack={() => setCurrentView('fuel-menu')}
          />
        ) : currentView === 'fuel-comboio' ? (
          <FieldComboioForm
            user={user}
            onBack={() => setCurrentView('fuel-menu')}
          />
        ) : currentView === 'fuel-registros' ? (
          <FieldFuelRecords
            user={user}
            onBack={() => setCurrentView('fuel-menu')}
          />
        ) : currentView === 'fuel-estoques' ? (
          <FieldStockView
            onBack={() => setCurrentView('fuel-menu')}
            assignedLocations={user.assigned_locations}
          />
        ) : currentView === 'horimeter' ? (
          <FieldHorimeterForm
            user={user}
            onBack={() => setCurrentView('dashboard')}
          />
        ) : currentView === 'os' ? (
          <FieldServiceOrderForm
            user={user}
            onBack={() => setCurrentView('dashboard')}
          />
        ) : null}
      </main>
    </div>
  );
}
