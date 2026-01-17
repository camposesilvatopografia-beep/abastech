import { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
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

export function FieldDashboard({ user, onNavigateToForm }: FieldDashboardProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();
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
  
  // Refs
  const isDeletingRef = useRef(false);
  const deletingRecordIdsRef = useRef<Set<string>>(new Set());
  const stockCardRefs = useRef<Map<string, LocationStockCardRef>>(new Map());
  
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
      const currentlyDeleting = Array.from(deletingRecordIdsRef.current);
      const filteredRecords = records?.filter(r => 
        !approvedDeletions.includes(r.id) && !currentlyDeleting.includes(r.id)
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
    deletingRecordIdsRef.current.add(recordId);
    
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

          if (sheetResponse?.rows && Array.isArray(sheetResponse.rows)) {
            const normalize = (v: any) => String(v ?? '').trim();
            const normalizeTime = (v: any) => normalize(v).substring(0, 5);

            const rowIndex = sheetResponse.rows.findIndex((row: any, idx: number) => {
              const rowDate = normalize(row['DATA'] ?? row['Data']);
              const rowTime = normalizeTime(row['HORA'] ?? row['Hora']);
              const rowVehicle = normalize(row['VEICULO'] ?? row['Veiculo'] ?? row['VEÍCULO'] ?? row['Veículo']);

              // Some sheets may store date as yyyy-mm-dd; normalize to pt-BR when needed
              const rowDateComparable = /^\d{4}-\d{2}-\d{2}$/.test(rowDate)
                ? new Date(`${rowDate}T00:00:00`).toLocaleDateString('pt-BR')
                : rowDate;

              const match = rowDateComparable === recordDateBR && rowTime === recordTime && rowVehicle === vehicleCode;
              
              if (match) {
                console.log(`[DELETE] Linha encontrada no índice ${idx}:`, {
                  rowDate,
                  rowDateComparable,
                  rowTime,
                  rowVehicle,
                });
              }
              
              return match;
            });

            if (rowIndex >= 0) {
              const sheetRowNumber = rowIndex + 2; // +1 header row, +1 because rows[] is 0-based
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
      
      // Remove from deleting set
      deletingRecordIdsRef.current.delete(recordId);
      
      setDeleteConfirmation(null);

      // Broadcast to all clients that a record was deleted
      broadcast('fuel_record_deleted', { recordId, vehicleCode: deleteConfirmation.vehicleCode });

      // Hard refresh to ensure absolute consistency
      fetchTodayRecords();
      refreshStockCards();
    } catch (err) {
      console.error('[DELETE] ERRO GERAL na exclusão:', err);

      // Remove from deleting set on failure
      deletingRecordIdsRef.current.delete(recordId);

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
      {/* Visual Update Indicator - Blinking Banner */}
      {showUpdatePulse && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-pulse">
          <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white py-3 px-4 shadow-lg">
            <div className="flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">{updateMessage}</span>
              <div className="absolute left-0 right-0 bottom-0 h-1 bg-white/30 animate-pulse" />
            </div>
          </div>
        </div>
      )}
      {/* Direct Delete Confirmation Dialog with Step-by-Step Feedback */}
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
                  {/* Step 1: Database */}
                  <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    deletionStep === 'db' 
                      ? 'bg-amber-500/10 border-amber-500/50' 
                      : deletionStep === 'sheet' || deletionStep === 'done'
                        ? 'bg-green-500/10 border-green-500/50'
                        : 'bg-muted/30 border-border'
                  }`}>
                    {deletionStep === 'db' ? (
                      <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                    ) : deletionStep === 'sheet' || deletionStep === 'done' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/50" />
                    )}
                    <span className={`font-medium ${
                      deletionStep === 'db' ? 'text-amber-500' : 
                      deletionStep === 'sheet' || deletionStep === 'done' ? 'text-green-500' : 
                      'text-muted-foreground'
                    }`}>
                      {deletionStep === 'db' ? 'Excluindo do banco de dados...' : 
                       deletionStep === 'sheet' || deletionStep === 'done' ? '✅ Excluído do banco de dados' : 
                       'Excluir do banco de dados'}
                    </span>
                  </div>

                  {/* Step 2: Google Sheets */}
                  <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                    deletionStep === 'sheet'
                      ? 'bg-amber-500/10 border-amber-500/50'
                      : deletionStep === 'done'
                        ? 'bg-green-500/10 border-green-500/50'
                        : 'bg-muted/30 border-border'
                  }`}>
                    {deletionStep === 'sheet' ? (
                      <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                    ) : deletionStep === 'done' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/50" />
                    )}
                    <span className={`font-medium ${
                      deletionStep === 'sheet' ? 'text-amber-500' : 
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

      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Olá, {user.name}!</h2>
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
            <div className="flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded">
              <Calendar className="w-4 h-4" />
              {todayStr}
            </div>
          </div>
        </div>
        <p className="text-sm opacity-90">
          {hasMultipleLocations 
            ? `${user.assigned_locations?.length} locais atribuídos`
            : user.assigned_locations?.[0] || 'Nenhum local atribuído'
          }
        </p>
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
            <MapPin className="w-4 h-4 text-amber-500" />
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
                    ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
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
              ref={(el) => {
                if (el) stockCardRefs.current.set(selectedLocation, el);
              }}
            />
          ) : (
            user.assigned_locations.map((location) => (
              <LocationStockCard 
                key={location} 
                location={location}
                ref={(el) => {
                  if (el) stockCardRefs.current.set(location, el);
                }}
              />
            ))
          )}
        </div>
      )}

      {/* Today Stats */}
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
            <FileText className="w-4 h-4 text-amber-500" />
            Meus Apontamentos de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div className={cn(
              "rounded-lg p-3 text-center border",
              theme === 'dark' 
                ? "bg-amber-900/30 border-amber-700/50" 
                : "bg-amber-50 border-amber-200"
            )}>
              <FileText className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="text-2xl font-bold text-amber-500">{todayStats.totalRecords}</p>
              <p className={cn(
                "text-xs",
                theme === 'dark' ? "text-amber-300/70" : "text-amber-600/70"
              )}>Registros</p>
            </div>
            <div className={cn(
              "rounded-lg p-3 text-center border",
              theme === 'dark' 
                ? "bg-green-900/30 border-green-700/50" 
                : "bg-green-50 border-green-200"
            )}>
              <Fuel className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold text-green-500">{todayStats.totalLiters.toLocaleString('pt-BR')}</p>
              <p className={cn(
                "text-xs",
                theme === 'dark' ? "text-green-300/70" : "text-green-600/70"
              )}>Litros</p>
            </div>
            <div className={cn(
              "rounded-lg p-3 text-center border",
              theme === 'dark' 
                ? "bg-slate-700/50 border-slate-600/50" 
                : "bg-slate-100 border-slate-200"
            )}>
              <Package className={cn(
                "w-5 h-5 mx-auto mb-1",
                theme === 'dark' ? "text-slate-400" : "text-slate-500"
              )} />
              <p className={cn(
                "text-2xl font-bold",
                theme === 'dark' ? "text-slate-300" : "text-slate-600"
              )}>{todayStats.totalArla.toLocaleString('pt-BR')}</p>
              <p className={cn(
                "text-xs",
                theme === 'dark' ? "text-slate-400" : "text-slate-500"
              )}>ARLA</p>
            </div>
          </div>
        </CardContent>
      </Card>

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
            <Clock className="w-4 h-4 text-amber-500" />
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
              <p className="text-xs mt-1">Clique em "Novo Apontamento" para começar</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todayRecords.map((record) => (
                <div 
                  key={record.id} 
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border transition-all",
                    record.record_type === 'entrada' 
                      ? theme === 'dark' 
                        ? "bg-green-900/30 border-green-700/50"
                        : "bg-green-50 border-green-200"
                      : theme === 'dark'
                        ? "bg-red-900/20 border-red-800/40"
                        : "bg-red-50 border-red-200"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    {record.record_type === 'entrada' ? (
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    )}
                    <div>
                      <p className={cn(
                        "text-sm font-medium",
                        theme === 'dark' ? "text-slate-200" : "text-slate-700"
                      )}>{record.vehicle_code}</p>
                      <p className={cn(
                        "text-xs",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>
                        {formatTime(record.record_time)} • {record.location}
                      </p>
                    </div>
                  </div>
                  <div className="text-right mr-3">
                    <p className={cn(
                      "text-sm font-bold",
                      record.record_type === 'entrada' ? "text-green-500" : "text-red-500"
                    )}>
                      {record.record_type === 'entrada' ? '+' : '-'}{record.fuel_quantity}L
                    </p>
                    {record.arla_quantity && record.arla_quantity > 0 && (
                      <p className={cn(
                        "text-xs",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                      )}>ARLA: {record.arla_quantity}L</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {/* Edit button - requires admin approval */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-8 w-8",
                        theme === 'dark' 
                          ? "text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                          : "text-slate-500 hover:text-blue-500 hover:bg-blue-50"
                      )}
                      onClick={() => setEditRecord(record)}
                      title="Solicitar edição"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {/* Delete button - direct deletion */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className={cn(
                        "h-8 w-8",
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
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
