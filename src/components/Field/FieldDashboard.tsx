import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Fuel, 
  TrendingUp, 
  TrendingDown, 
  Package,
  Calendar,
  Clock,
  FileText,
  ArrowRight,
  Edit2,
  Trash2,
  AlertCircle,
  Loader2,
  MapPin,
  ChevronDown,
  RefreshCw,
  Download,
  CheckCircle,
  Bell,
  BellOff,
  Truck,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EditRequestModal } from './EditRequestModal';
import { LocationStockCard, LocationStockCardRef } from './LocationStockCard';
import logoAbastech from '@/assets/logo-abastech.png';
import { useTheme } from '@/hooks/useTheme';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface FieldDashboardProps {
  user: FieldUser;
  onNavigateToForm: () => void;
  onNavigateToFuelMenu?: () => void;
  onNavigateToHorimeter?: () => void;
  onNavigateToOS?: () => void;
}

interface RecentRecord {
  id: string;
  record_date: string;
  record_time: string;
  vehicle_code: string;
  fuel_quantity: number;
  location: string;
  record_type: string;
  operator_name?: string;
  horimeter_current?: number;
  km_current?: number;
  arla_quantity?: number;
  observations?: string;
}

interface DeleteConfirmation {
  recordId: string;
  vehicleCode: string;
  quantity: number;
  reason: string;
}

export function FieldDashboard({ user, onNavigateToForm, onNavigateToFuelMenu, onNavigateToHorimeter, onNavigateToOS }: FieldDashboardProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [dashboardTab, setDashboardTab] = useState<'inicio' | 'resumo'>('inicio');
  const [todayRecords, setTodayRecords] = useState<RecentRecord[]>([]);
  const [todayStats, setTodayStats] = useState({
    totalRecords: 0,
    totalLiters: 0,
    totalArla: 0,
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [editRecord, setEditRecord] = useState<RecentRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // PWA Install state
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  
  // Visual indicator for admin updates
  const [showUpdatePulse, setShowUpdatePulse] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  
  // Push notifications for updates
  const [notifyOnUpdate, setNotifyOnUpdate] = useState(() => {
    const stored = localStorage.getItem('field_notify_on_update');
    return stored === 'true';
  });
  const { isSupported, permission, requestPermission, showNotification } = usePushNotifications();
  
  // Refs - Use localStorage to persist deleting IDs across component remounts (PWA)
  const isDeletingRef = useRef(false);
  const deletingRecordIdsRef = useRef<Set<string>>(new Set<string>());
  const stockCardRefs = useRef<Map<string, LocationStockCardRef>>(new Map());
  
  // Initialize deleting IDs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('field_deleting_record_ids');
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, number>;
        const now = Date.now();
        // Clean up entries older than 5 minutes
        Object.entries(parsed).forEach(([id, timestamp]) => {
          if (now - timestamp < 5 * 60 * 1000) {
            deletingRecordIdsRef.current.add(id);
          }
        });
      }
    } catch {}
  }, []);

  // Helper to add a deleting ID to both ref and localStorage
  const addDeletingId = useCallback((id: string) => {
    deletingRecordIdsRef.current.add(id);
    try {
      const stored = localStorage.getItem('field_deleting_record_ids');
      const parsed = stored ? JSON.parse(stored) : {};
      parsed[id] = Date.now();
      localStorage.setItem('field_deleting_record_ids', JSON.stringify(parsed));
    } catch {}
  }, []);

  // Helper to remove a deleting ID from both ref and localStorage
  const removeDeletingId = useCallback((id: string) => {
    deletingRecordIdsRef.current.delete(id);
    try {
      const stored = localStorage.getItem('field_deleting_record_ids');
      if (stored) {
        const parsed = JSON.parse(stored);
        delete parsed[id];
        localStorage.setItem('field_deleting_record_ids', JSON.stringify(parsed));
      }
    } catch {}
  }, []);
  
  // Pending realtime refresh flag
  const pendingRealtimeRefreshRef = useRef(false);
  
  // Location selection for users with multiple locations
  const hasMultipleLocations = (user.assigned_locations?.length || 0) > 1;
  const [selectedLocation, setSelectedLocation] = useState<string>(
    user.assigned_locations?.[0] || 'all'
  );

  // Get today's date for display
  const todayStr = format(new Date(), "dd 'de' MMMM", { locale: ptBR });
  const todayDateOnly = format(new Date(), 'yyyy-MM-dd');

  // Check PWA install state
  useEffect(() => {
    // Check if running as standalone (already installed)
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    setIsStandalone(standalone);
    
    // Show install button if not installed and on mobile
    if (!standalone && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      setShowInstallButton(true);
    }
  }, []);

  // Fetch records function (reusable) - excludes records being deleted
  const fetchTodayRecords = useCallback(async () => {
    try {
      // Fetch only today's records for this user
      const { data: records, error } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('user_id', user.id)
        .eq('record_date', todayDateOnly)
        .order('record_time', { ascending: false });

      if (error) throw error;

      // Fetch approved deletion requests to filter them out
      const recordIds = records?.map(r => r.id) || [];
      let approvedDeletions: string[] = [];
      
      if (recordIds.length > 0) {
        const { data: deletionRequests } = await supabase
          .from('field_record_requests')
          .select('record_id')
          .in('record_id', recordIds)
          .eq('request_type', 'delete')
          .eq('status', 'approved');
        
        approvedDeletions = deletionRequests?.map(d => d.record_id) || [];
      }

      // Filter out records with approved deletions AND records currently being deleted
      // Also check localStorage for IDs that might have been added before a page refresh
      const currentlyDeleting = Array.from(deletingRecordIdsRef.current);
      let persistedDeletingIds: string[] = [];
      try {
        const stored = localStorage.getItem('field_deleting_record_ids');
        if (stored) {
          const parsed = JSON.parse(stored) as Record<string, number>;
          const now = Date.now();
          persistedDeletingIds = Object.entries(parsed)
            .filter(([_, timestamp]) => now - timestamp < 5 * 60 * 1000)
            .map(([id]) => id);
        }
      } catch {}
      
      const allDeletingIds = [...new Set([...currentlyDeleting, ...persistedDeletingIds])];
      
      const filteredRecords = records?.filter(r => 
        !approvedDeletions.includes(r.id) && !allDeletingIds.includes(r.id)
      ) || [];

      const mappedRecords = filteredRecords.map(r => ({
        id: r.id,
        record_date: r.record_date,
        record_time: r.record_time,
        vehicle_code: r.vehicle_code,
        fuel_quantity: r.fuel_quantity,
        location: r.location || '',
        record_type: (r as any).record_type || 'saida',
        operator_name: r.operator_name || undefined,
        horimeter_current: r.horimeter_current || undefined,
        km_current: r.km_current || undefined,
        arla_quantity: r.arla_quantity || undefined,
        observations: r.observations || undefined,
      }));

      setTodayRecords(mappedRecords);

      // Calculate today stats
      setTodayStats({
        totalRecords: mappedRecords.length,
        totalLiters: mappedRecords.reduce((sum, r) => sum + (r.fuel_quantity || 0), 0),
        totalArla: mappedRecords.reduce((sum, r) => sum + (r.arla_quantity || 0), 0),
      });

    } catch (err) {
      console.error('Error fetching today records:', err);
    }
  }, [user.id, todayDateOnly]);

  // Keep deleting state in a ref to avoid polling re-adding a record mid-delete
  useEffect(() => {
    isDeletingRef.current = isDeleting;
  }, [isDeleting]);

  // Initial fetch
  useEffect(() => {
    const loadRecords = async () => {
      setIsLoading(true);
      await fetchTodayRecords();
      setIsLoading(false);
    };
    loadRecords();

    // Poll every 10 seconds to ensure data is fresh
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isDeletingRef.current) {
        fetchTodayRecords();
      }
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [fetchTodayRecords]);

  // Function to trigger visual pulse indicator and optional push notification
  const triggerUpdatePulse = useCallback((message: string, shouldNotify: boolean = true) => {
    setUpdateMessage(message);
    setShowUpdatePulse(true);
    
    // Send push notification if enabled
    if (shouldNotify && notifyOnUpdate && permission === 'granted') {
      showNotification({
        title: 'Apontamento Campo',
        body: message,
        icon: '/pwa-192x192.png',
        tag: 'field-update',
      });
    }
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
      setShowUpdatePulse(false);
      setUpdateMessage('');
    }, 4000);
  }, [notifyOnUpdate, permission, showNotification]);
  
  // Toggle notification preference
  const toggleNotifications = useCallback(async () => {
    if (!notifyOnUpdate) {
      // Trying to enable - check/request permission first
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) return;
      }
      setNotifyOnUpdate(true);
      localStorage.setItem('field_notify_on_update', 'true');
      toast.success('Notificações de atualização ativadas!');
    } else {
      setNotifyOnUpdate(false);
      localStorage.setItem('field_notify_on_update', 'false');
      toast.info('Notificações de atualização desativadas');
    }
  }, [notifyOnUpdate, permission, requestPermission]);

  // Function to refresh all stock cards
  const refreshStockCards = useCallback(() => {
    stockCardRefs.current.forEach((ref) => {
      ref?.refetch();
    });
  }, []);

  // Calculate local KPIs by location from Supabase records (instant updates)
  const localKPIsByLocation = useMemo(() => {
    const kpis: Record<string, { entradas: number; saidas: number }> = {};
    
    for (const record of todayRecords) {
      const loc = record.location || '';
      if (!loc) continue;
      
      if (!kpis[loc]) {
        kpis[loc] = { entradas: 0, saidas: 0 };
      }
      
      const qty = record.fuel_quantity || 0;
      const type = (record.record_type || 'saida').toLowerCase();
      
      if (type === 'entrada') {
        kpis[loc].entradas += qty;
      } else {
        kpis[loc].saidas += qty;
      }
    }
    
    return kpis;
  }, [todayRecords]);

  // Helper to match location names flexibly
  const getLocalKPIsForLocation = useCallback((location: string) => {
    const normalized = location.toLowerCase().trim();
    
    // Direct match first
    if (localKPIsByLocation[location]) {
      return localKPIsByLocation[location];
    }
    
    // Fuzzy match
    for (const [key, value] of Object.entries(localKPIsByLocation)) {
      const keyNorm = key.toLowerCase().trim();
      if (keyNorm.includes(normalized) || normalized.includes(keyNorm)) {
        return value;
      }
    }
    
    return undefined;
  }, [localKPIsByLocation]);

  // Realtime sync for cross-device updates (broadcast channel)
  const { broadcast } = useRealtimeSync({
    onSyncEvent: (event) => {
      // Refresh when receiving sync events from other clients
      if (['fuel_record_created', 'fuel_record_updated', 'fuel_record_deleted', 'stock_updated', 'manual_refresh'].includes(event.type)) {
        console.log('[FieldDashboard] Received broadcast sync event:', event.type);
        triggerUpdatePulse('Atualização recebida de outro dispositivo');
        fetchTodayRecords();
        refreshStockCards();
      }
    },
  });

  // Real-time subscription for request status changes and admin actions on records
  useEffect(() => {
    const channel = supabase
      .channel('field-dashboard-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_record_requests',
        },
        (payload) => {
          const newData = payload.new as Record<string, any> | null;
          const oldData = payload.old as Record<string, any> | null;
          const newStatus = newData?.status;
          const requestedBy = newData?.requested_by || oldData?.requested_by;
          
          // Refresh when this user's request is updated by admin
          if (requestedBy === user.id) {
            if (newStatus === 'approved') {
              toast.success('Sua solicitação foi aprovada!');
              triggerUpdatePulse('Solicitação aprovada pelo administrador');
            } else if (newStatus === 'rejected') {
              toast.info('Sua solicitação foi rejeitada');
              triggerUpdatePulse('Solicitação rejeitada pelo administrador');
            }
            fetchTodayRecords();
            refreshStockCards();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_fuel_records',
        },
        (payload) => {
          // Refresh on any changes to fuel records (including admin edits)
          const newRecord = payload.new as Record<string, any> | null;
          const oldRecord = payload.old as Record<string, any> | null;
          const eventType = payload.eventType;
          
          // Check if this affects current user
          const affectsUser = newRecord?.user_id === user.id || oldRecord?.user_id === user.id;
          
          // Check if this affects any of user's assigned locations
          const affectsLocation = user.assigned_locations?.some(loc => {
            const normalizedLoc = loc.toLowerCase();
            const recordLoc = (newRecord?.location || oldRecord?.location || '').toLowerCase();
            return recordLoc.includes(normalizedLoc) || normalizedLoc.includes(recordLoc);
          });
          
          if (affectsUser || affectsLocation) {
            // Show visual indicator for admin updates
            if (eventType === 'INSERT') {
              triggerUpdatePulse('Novo registro adicionado');
            } else if (eventType === 'UPDATE') {
              triggerUpdatePulse('Registro atualizado');
            } else if (eventType === 'DELETE') {
              triggerUpdatePulse('Registro excluído');
            }
            
            fetchTodayRecords();
            refreshStockCards();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id, user.assigned_locations, fetchTodayRecords, triggerUpdatePulse, refreshStockCards]);

  const formatTime = (timeStr: string) => {
    return timeStr?.substring(0, 5) || timeStr;
  };

  // Deletion step states for visual feedback
  const [deletionStep, setDeletionStep] = useState<'idle' | 'db' | 'sheet' | 'done'>('idle');

  // Handle direct delete - also removes from Google Sheets with step-by-step feedback
  const handleDirectDelete = async () => {
    if (!deleteConfirmation) return;

    const recordId = deleteConfirmation.recordId;
    
    // Add to deleting set immediately to prevent re-adding via polling/realtime
    addDeletingId(recordId);
    
    setIsDeleting(true);
    setDeletionStep('db');

    const recordToDelete = todayRecords.find(r => r.id === recordId);
    
    console.log('[DELETE] Iniciando exclusão do registro:', {
      recordId,
      vehicleCode: deleteConfirmation.vehicleCode,
      quantity: deleteConfirmation.quantity,
      record: recordToDelete,
    });

    // Optimistic UI: remove immediately so it disappears from the user's dashboard right away
    setTodayRecords(prev => prev.filter(r => r.id !== recordId));
    if (recordToDelete) {
      setTodayStats(prev => {
        const liters = recordToDelete.fuel_quantity || 0;
        const arla = recordToDelete.arla_quantity || 0;
        return {
          totalRecords: Math.max(0, prev.totalRecords - 1),
          totalLiters: Math.max(0, prev.totalLiters - liters),
          totalArla: Math.max(0, prev.totalArla - arla),
        };
      });
    }

    try {
      // STEP 1: Delete from database IMMEDIATELY
      console.log('[DELETE] Passo 1: Excluindo do banco de dados...');
      const { error } = await supabase
        .from('field_fuel_records')
        .delete()
        .eq('id', recordId);

      if (error) {
        console.error('[DELETE] ERRO ao excluir do banco:', error);
        throw error;
      }
      
      console.log('[DELETE] ✅ Excluído do banco de dados com sucesso');
      toast.success('✅ Excluído do banco de dados', { duration: 2000 });

      // STEP 2: Delete from Google Sheets
      setDeletionStep('sheet');
      
      if (recordToDelete) {
        console.log('[DELETE] Passo 2: Excluindo da planilha Google Sheets...');
        
        try {
          const recordDateBR = new Date(`${recordToDelete.record_date}T00:00:00`).toLocaleDateString('pt-BR');
          const recordTime = (recordToDelete.record_time || '').substring(0, 5);
          const vehicleCode = String(recordToDelete.vehicle_code || '').trim();

          console.log('[DELETE] Buscando linha na planilha com:', {
            data: recordDateBR,
            hora: recordTime,
            veiculo: vehicleCode,
          });

          const { data: sheetResponse, error: sheetGetError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'getData',
              sheetName: 'AbastecimentoCanteiro01',
              noCache: true,
            },
          });

          if (sheetGetError) {
            console.error('[DELETE] ERRO ao buscar dados da planilha:', sheetGetError);
            throw sheetGetError;
          }

          console.log('[DELETE] Planilha carregada, total de linhas:', sheetResponse?.rows?.length || 0);

          // Log first few rows for debugging
          if (sheetResponse?.rows?.length > 0) {
            console.log('[DELETE] Primeiras 3 linhas da planilha:', sheetResponse.rows.slice(0, 3).map((r: any, i: number) => ({
              idx: i,
              _rowIndex: r._rowIndex,
              DATA: r['DATA'] ?? r['Data'],
              HORA: r['HORA'] ?? r['Hora'],
              VEICULO: r['VEICULO'] ?? r['Veiculo'] ?? r['VEÍCULO'],
            })));
          }

          if (sheetResponse?.rows && Array.isArray(sheetResponse.rows)) {
            const normalize = (v: any) => String(v ?? '').trim().toUpperCase();
            const normalizeTime = (v: any) => String(v ?? '').trim().substring(0, 5);
            const normalizeVehicle = (v: any) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

            console.log('[DELETE] Procurando registro:', {
              recordDateBR,
              recordTime,
              vehicleCode: normalizeVehicle(vehicleCode),
            });

            let matchedRow: any = null;
            let matchedRowIndex = -1;

            for (let idx = 0; idx < sheetResponse.rows.length; idx++) {
              const row = sheetResponse.rows[idx];
              const rowDate = normalize(row['DATA'] ?? row['Data'] ?? row['data'] ?? '');
              const rowTime = normalizeTime(row['HORA'] ?? row['Hora'] ?? row['hora'] ?? '');
              const rowVehicle = normalizeVehicle(row['VEICULO'] ?? row['Veiculo'] ?? row['VEÍCULO'] ?? row['Veículo'] ?? row['veiculo'] ?? '');

              // Some sheets may store date as yyyy-mm-dd; normalize to pt-BR when needed
              let rowDateComparable = rowDate;
              if (/^\d{4}-\d{2}-\d{2}$/.test(rowDate.toLowerCase())) {
                rowDateComparable = new Date(`${rowDate}T00:00:00`).toLocaleDateString('pt-BR').toUpperCase();
              }

              const dateMatch = rowDateComparable === recordDateBR.toUpperCase();
              const timeMatch = rowTime === recordTime;
              const vehicleMatch = rowVehicle === normalizeVehicle(vehicleCode);

              if (dateMatch && timeMatch && vehicleMatch) {
                console.log(`[DELETE] ✅ Linha encontrada no índice ${idx}:`, {
                  rowDate,
                  rowDateComparable,
                  rowTime,
                  rowVehicle,
                  _rowIndex: row._rowIndex,
                });
                matchedRow = row;
                matchedRowIndex = idx;
                break;
              }
            }

            if (matchedRow && matchedRowIndex >= 0) {
              // Use the _rowIndex from the backend if available, otherwise calculate
              const sheetRowNumber = matchedRow._rowIndex || (matchedRowIndex + 2);
              console.log(`[DELETE] Excluindo linha ${sheetRowNumber} da planilha...`);
              
              const { error: sheetDeleteError } = await supabase.functions.invoke('google-sheets', {
                body: {
                  action: 'delete',
                  sheetName: 'AbastecimentoCanteiro01',
                  rowIndex: sheetRowNumber,
                },
              });

              if (sheetDeleteError) {
                console.error('[DELETE] ERRO ao excluir da planilha:', sheetDeleteError);
                throw sheetDeleteError;
              }
              
              console.log('[DELETE] ✅ Excluído da planilha com sucesso');
              toast.success('✅ Excluído da planilha', { duration: 2000 });
            } else {
              console.warn('[DELETE] ⚠️ Linha não encontrada na planilha para exclusão:', {
                recordDateBR,
                recordTime,
                vehicleCode,
                totalRows: sheetResponse.rows.length,
              });
              toast.warning('⚠️ Registro não encontrado na planilha (pode já ter sido removido)', { duration: 3000 });
            }
          } else {
            console.warn('[DELETE] ⚠️ Planilha vazia ou formato inválido');
            toast.warning('⚠️ Planilha vazia ou inacessível', { duration: 3000 });
          }
        } catch (sheetErr) {
          console.error('[DELETE] ERRO na exclusão da planilha (banco já excluído):', sheetErr);
          toast.error('❌ Erro ao excluir da planilha (verifique os logs)', { duration: 4000 });
        }
      }

      setDeletionStep('done');
      
      // Small delay to show completion before closing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setDeleteConfirmation(null);

      // Broadcast to all clients that a record was deleted
      broadcast('fuel_record_deleted', { recordId, vehicleCode: deleteConfirmation.vehicleCode });

      // Hard refresh to ensure absolute consistency
      // IMPORTANT: Keep the ID in deletingRecordIdsRef UNTIL after the fetch completes
      // to prevent the record from briefly reappearing
      await fetchTodayRecords();
      refreshStockCards();
      
      // Only NOW remove from deleting set, after UI is fully updated
      removeDeletingId(recordId);
    } catch (err) {
      console.error('[DELETE] ERRO GERAL na exclusão:', err);

      // Remove from deleting set on failure
      removeDeletingId(recordId);

      // Revert optimistic UI on failure
      await fetchTodayRecords();

      toast.error('❌ Erro ao excluir registro do banco de dados');
    } finally {
      setIsDeleting(false);
      setDeletionStep('idle');
    }
  };

  // Use the reusable fetchTodayRecords for refresh
  const refreshRecords = fetchTodayRecords;

  return (
    <div className="space-y-4 p-4 relative">
      {/* User Header - Always on top */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold">Olá, {user.name}!</h2>
              <p className="text-xs opacity-80">
                {hasMultipleLocations 
                  ? `${user.assigned_locations?.length} locais atribuídos`
                  : user.assigned_locations?.[0] || 'Nenhum local atribuído'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={cn(
                "h-8 border-0",
                notifyOnUpdate 
                  ? "bg-green-500/30 text-white hover:bg-green-500/40" 
                  : "bg-white/20 text-white hover:bg-white/30"
              )}
              onClick={toggleNotifications}
              title={notifyOnUpdate ? "Desativar notificações" : "Ativar notificações de atualização"}
            >
              {notifyOnUpdate ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 bg-white/20 text-white hover:bg-white/30 border-0"
              onClick={async () => {
                triggerUpdatePulse('Atualizando...', false);
                await fetchTodayRecords();
                refreshStockCards();
                toast.success('Atualizado!');
              }}
              title="Atualizar agora"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-lg w-fit">
          <Calendar className="w-4 h-4" />
          {todayStr}
        </div>
      </div>

      {/* Dashboard Tabs: Início / Resumo */}
      <div className={cn(
        "flex rounded-xl overflow-hidden border",
        theme === 'dark' ? "border-slate-700" : "border-slate-200"
      )}>
        <button
          onClick={() => setDashboardTab('inicio')}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold transition-colors",
            dashboardTab === 'inicio'
              ? "bg-blue-800 text-white"
              : theme === 'dark'
                ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          Início
        </button>
        <button
          onClick={() => setDashboardTab('resumo')}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold transition-colors",
            dashboardTab === 'resumo'
              ? "bg-blue-800 text-white"
              : theme === 'dark'
                ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          )}
        >
          Resumo
        </button>
      </div>

      {dashboardTab === 'inicio' ? (
        <>
          {/* Menu Cards */}
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={onNavigateToForm}
              className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-transform text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Fuel className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold block">Abastecimento</span>
                <span className="text-xs opacity-80">Registrar abastecimento de combustível</span>
              </div>
              <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
            </button>

            <button
              onClick={onNavigateToHorimeter}
              className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg shadow-amber-500/30 active:scale-[0.98] transition-transform text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Clock className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold block">Horímetro</span>
                <span className="text-xs opacity-80">Lançar leituras de horímetro e KM</span>
              </div>
              <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
            </button>

            <button
              onClick={onNavigateToOS}
              className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/30 active:scale-[0.98] transition-transform text-left"
            >
              <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Wrench className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold block">Ordem de Serviço</span>
                <span className="text-xs opacity-80">Abrir ou gerenciar manutenções</span>
              </div>
              <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
            </button>
          </div>

          {/* PWA Install Banner for Mobile */}
          {showInstallButton && !isStandalone && (
            <div 
              className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-3 text-white cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => navigate('/apontamento/instalar')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Instalar App</p>
                    <p className="text-xs opacity-80">Acesso rápido e offline</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Today's Stats Summary */}
          <div className={cn(
            "rounded-xl p-4 border",
            theme === 'dark' 
              ? "bg-slate-800/80 border-slate-700" 
              : "bg-white border-slate-200 shadow-sm"
          )}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className={cn("text-2xl font-bold", theme === 'dark' ? "text-white" : "text-slate-800")}>{todayStats.totalRecords}</p>
                <p className="text-xs text-muted-foreground">Registros</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-500">{todayStats.totalLiters.toLocaleString('pt-BR')}L</p>
                <p className="text-xs text-muted-foreground">Combustível</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-500">{todayStats.totalArla.toLocaleString('pt-BR')}L</p>
                <p className="text-xs text-muted-foreground">ARLA</p>
              </div>
            </div>
          </div>

          {/* Location Selector for Multiple Locations */}
          {hasMultipleLocations && (
            <div className={cn(
              "rounded-xl p-4 border",
              theme === 'dark' 
                ? "bg-slate-800/80 border-slate-700" 
                : "bg-white border-slate-200 shadow-sm"
            )}>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className={cn(
                  "text-sm font-medium",
                  theme === 'dark' ? "text-slate-200" : "text-slate-700"
                )}>Visualizar Estoque por Local</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {user.assigned_locations?.map((loc) => (
                  <Button
                    key={loc}
                    variant={selectedLocation === loc ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedLocation(loc)}
                    className={cn(
                      "text-xs",
                      selectedLocation === loc 
                        ? "bg-blue-800 hover:bg-blue-900 text-white border-blue-800"
                        : theme === 'dark'
                          ? "border-slate-600 text-slate-300 hover:bg-slate-700"
                          : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {loc}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Stock KPIs - Show only selected location or all */}
          {user.assigned_locations && user.assigned_locations.length > 0 && (
            <div className="space-y-3">
              {hasMultipleLocations ? (
                <LocationStockCard 
                  key={selectedLocation} 
                  location={selectedLocation}
                  localRecordKPIs={getLocalKPIsForLocation(selectedLocation)}
                  ref={(el) => {
                    if (el) stockCardRefs.current.set(selectedLocation, el);
                  }}
                />
              ) : (
                user.assigned_locations.map((location) => (
                  <LocationStockCard 
                    key={location} 
                    location={location}
                    localRecordKPIs={getLocalKPIsForLocation(location)}
                    ref={(el) => {
                      if (el) stockCardRefs.current.set(location, el);
                    }}
                  />
                ))
              )}
            </div>
          )}

          {/* Today's Records List */}
          <Card className={cn(
            theme === 'dark' 
              ? "bg-slate-800/50 border-slate-700" 
              : "bg-white border-slate-200 shadow-sm"
          )}>
            <CardHeader className="pb-2">
              <CardTitle className={cn(
                "text-sm flex items-center gap-2",
                theme === 'dark' ? "text-slate-200" : "text-slate-700"
              )}>
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Registros do Dia
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className={cn(
                  "flex items-center justify-center py-6",
                  theme === 'dark' ? "text-slate-400" : "text-slate-500"
                )}>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Carregando...
                </div>
              ) : todayRecords.length === 0 ? (
                <div className={cn(
                  "text-center py-6",
                  theme === 'dark' ? "text-slate-400" : "text-slate-500"
                )}>
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>Nenhum registro hoje</p>
                  <p className="text-xs mt-1">Clique em "Abastecimento" para começar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todayRecords.map((record) => (
                    <div 
                      key={record.id} 
                      className={cn(
                        "p-3 rounded-lg border transition-all",
                        record.record_type === 'entrada' 
                          ? theme === 'dark' 
                            ? "bg-green-900/30 border-green-700/50"
                            : "bg-green-50 border-green-200"
                          : theme === 'dark'
                            ? "bg-red-900/20 border-red-800/40"
                            : "bg-red-50 border-red-200"
                      )}
                    >
                      {/* Header Row: Vehicle, Quantity, Actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          {record.record_type === 'entrada' ? (
                            <TrendingUp className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className={cn(
                              "text-sm font-bold",
                              theme === 'dark' ? "text-slate-200" : "text-slate-700"
                            )}>{record.vehicle_code}</p>
                            {record.vehicle_code.toUpperCase().startsWith('CC') && record.record_type !== 'entrada' && (
                              record.observations?.includes('[ABAST. TANQUE COMBOIO]') ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-orange-500/20 text-orange-500 border-orange-500/50">
                                  <Fuel className="w-2.5 h-2.5 mr-0.5" />
                                  Tanque
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/20 text-blue-500 border-blue-500/50">
                                  <Truck className="w-2.5 h-2.5 mr-0.5" />
                                  Próprio
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className={cn(
                              "text-sm font-bold",
                              record.record_type === 'entrada' ? "text-green-500" : "text-red-500"
                            )}>
                              {record.record_type === 'entrada' ? '+' : '-'}{record.fuel_quantity}L
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className={cn(
                                "h-7 w-7",
                                theme === 'dark' 
                                  ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                                  : "text-slate-500 hover:text-blue-500 hover:bg-blue-50"
                              )}
                              onClick={() => setEditRecord(record)}
                              title="Solicitar edição"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className={cn(
                                "h-7 w-7",
                                theme === 'dark' 
                                  ? "text-slate-400 hover:text-red-400 hover:bg-red-900/30"
                                  : "text-slate-500 hover:text-red-500 hover:bg-red-50"
                              )}
                              onClick={() => setDeleteConfirmation({
                                recordId: record.id,
                                vehicleCode: record.vehicle_code,
                                quantity: record.fuel_quantity,
                                reason: '',
                              })}
                              title="Excluir registro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Detail Rows */}
                      <div className={cn(
                        "mt-2 pt-2 border-t grid grid-cols-2 gap-x-4 gap-y-1 text-xs",
                        theme === 'dark' ? "border-slate-600/50" : "border-slate-300/50"
                      )}>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground">{formatTime(record.record_time)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          <span className="text-muted-foreground truncate">{record.location || '-'}</span>
                        </div>
                        {(record.horimeter_current || record.km_current) && (
                          <>
                            {record.horimeter_current ? (
                              <div className="flex items-center gap-1">
                                <span className="text-amber-600 dark:text-amber-400 font-medium">Hor:</span>
                                <span className={theme === 'dark' ? "text-slate-300" : "text-slate-600"}>
                                  {record.horimeter_current.toLocaleString('pt-BR')}h
                                </span>
                              </div>
                            ) : <div />}
                            {record.km_current ? (
                              <div className="flex items-center gap-1">
                                <span className="text-blue-600 dark:text-blue-400 font-medium">Km:</span>
                                <span className={theme === 'dark' ? "text-slate-300" : "text-slate-600"}>
                                  {record.km_current.toLocaleString('pt-BR')}
                                </span>
                              </div>
                            ) : <div />}
                          </>
                        )}
                        {record.operator_name && (
                          <div className="flex items-center gap-1 col-span-2">
                            <span className="text-muted-foreground">Operador:</span>
                            <span className={cn(
                              "font-medium truncate",
                              theme === 'dark' ? "text-slate-300" : "text-slate-600"
                            )}>{record.operator_name}</span>
                          </div>
                        )}
                        {record.arla_quantity && record.arla_quantity > 0 && (
                          <div className="flex items-center gap-1">
                            <Package className="w-3 h-3 text-cyan-500 flex-shrink-0" />
                            <span className="text-cyan-600 dark:text-cyan-400 font-medium">ARLA: {record.arla_quantity}L</span>
                          </div>
                        )}
                        {record.observations && !record.observations.startsWith('[ABAST.') && !record.observations.startsWith('[CARREGAR') && (
                          <div className="col-span-2 mt-1">
                            <span className="text-muted-foreground italic truncate block">
                              "{record.observations}"
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Visual Update Indicator - Blinking Banner */}
      {showUpdatePulse && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-pulse">
          <div className="bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800 text-white py-3 px-4 shadow-lg">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">{updateMessage}</span>
              <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/30 animate-pulse" />
            </div>
          </div>
        </div>
      )}

      {/* Direct Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmation} onOpenChange={() => !isDeleting && setDeleteConfirmation(null)}>
        <AlertDialogContent className="bg-card border-red-600/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              {isDeleting ? 'Excluindo Registro...' : 'Confirmar Exclusão'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {!isDeleting ? (
                <>
                  Tem certeza que deseja excluir o registro de <strong className="text-foreground">{deleteConfirmation?.vehicleCode}</strong> com <strong className="text-red-500">{deleteConfirmation?.quantity}L</strong>?
                  <br /><br />
                  <span className="text-red-400 font-medium">Esta ação não pode ser desfeita.</span>
                </>
              ) : (
                <div className="space-y-3 mt-2">
                  <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    deletionStep === 'db' 
                      ? 'bg-blue-500/10 border-blue-500/50' 
                      : deletionStep === 'sheet' || deletionStep === 'done'
                        ? 'bg-green-500/10 border-green-500/50'
                        : 'bg-muted/30 border-border'
                  }`}>
                    {deletionStep === 'db' ? (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    ) : deletionStep === 'sheet' || deletionStep === 'done' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/50" />
                    )}
                    <span className={`font-medium ${
                      deletionStep === 'db' ? 'text-blue-500' : 
                      deletionStep === 'sheet' || deletionStep === 'done' ? 'text-green-500' : 
                      'text-muted-foreground'
                    }`}>
                      {deletionStep === 'db' ? 'Excluindo do banco de dados...' : 
                       deletionStep === 'sheet' || deletionStep === 'done' ? '✅ Excluído do banco de dados' : 
                       'Excluir do banco de dados'}
                    </span>
                  </div>
                  <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    deletionStep === 'sheet'
                      ? 'bg-blue-500/10 border-blue-500/50'
                      : deletionStep === 'done'
                        ? 'bg-green-500/10 border-green-500/50'
                        : 'bg-muted/30 border-border'
                  }`}>
                    {deletionStep === 'sheet' ? (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    ) : deletionStep === 'done' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/50" />
                    )}
                    <span className={`font-medium ${
                      deletionStep === 'sheet' ? 'text-blue-500' : 
                      deletionStep === 'done' ? 'text-green-500' : 
                      'text-muted-foreground'
                    }`}>
                      {deletionStep === 'sheet' ? 'Excluindo da planilha...' : 
                       deletionStep === 'done' ? '✅ Excluído da planilha' : 
                       'Excluir da planilha'}
                    </span>
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            {!isDeleting && (
              <>
                <AlertDialogCancel className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0">
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDirectDelete}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Request Modal */}
      <EditRequestModal
        record={editRecord}
        userId={user.id}
        onClose={() => setEditRecord(null)}
        onSuccess={refreshRecords}
      />
    </div>
  );
}
