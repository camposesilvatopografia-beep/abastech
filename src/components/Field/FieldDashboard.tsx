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
} from 'lucide-react';
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

interface DeleteRequest {
  recordId: string;
  vehicleCode: string;
  quantity: number;
  reason: string;
}

export function FieldDashboard({ user, onNavigateToForm }: FieldDashboardProps) {
  const [todayRecords, setTodayRecords] = useState<RecentRecord[]>([]);
  const [todayStats, setTodayStats] = useState({
    totalRecords: 0,
    totalLiters: 0,
    totalArla: 0,
  });
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [editRecord, setEditRecord] = useState<RecentRecord | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Visual indicator for admin updates
  const [showUpdatePulse, setShowUpdatePulse] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  
  // Refs for LocationStockCards to trigger refresh
  const stockCardRefs = useRef<Map<string, LocationStockCardRef>>(new Map());
  
  // Location selection for users with multiple locations
  const hasMultipleLocations = (user.assigned_locations?.length || 0) > 1;
  const [selectedLocation, setSelectedLocation] = useState<string>(
    user.assigned_locations?.[0] || 'all'
  );

  // Get today's date for display
  const todayStr = format(new Date(), "dd 'de' MMMM", { locale: ptBR });
  const todayDateOnly = format(new Date(), 'yyyy-MM-dd');

  // Fetch records function (reusable)
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

      // Filter out records with approved deletions
      const filteredRecords = records?.filter(r => !approvedDeletions.includes(r.id)) || [];

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

  // Initial fetch
  useEffect(() => {
    const loadRecords = async () => {
      setIsLoading(true);
      await fetchTodayRecords();
      setIsLoading(false);
    };
    loadRecords();
  }, [fetchTodayRecords]);

  // Function to trigger visual pulse indicator
  const triggerUpdatePulse = useCallback((message: string) => {
    setUpdateMessage(message);
    setShowUpdatePulse(true);
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
      setShowUpdatePulse(false);
      setUpdateMessage('');
    }, 4000);
  }, []);

  // Function to refresh all stock cards
  const refreshStockCards = useCallback(() => {
    stockCardRefs.current.forEach((ref) => {
      ref?.refetch();
    });
  }, []);

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

  // Handle delete request submission
  const handleDeleteRequest = async () => {
    if (!deleteRequest || !deleteReason.trim()) {
      toast.error('Por favor, informe o motivo da solicitação');
      return;
    }
    
    setIsSubmittingRequest(true);
    try {
      const { error } = await supabase
        .from('field_record_requests')
        .insert({
          record_id: deleteRequest.recordId,
          request_type: 'delete',
          requested_by: user.id,
          request_reason: deleteReason.trim(),
        });

      if (error) throw error;

      toast.success('Solicitação de exclusão enviada para aprovação do administrador');
      setDeleteRequest(null);
      setDeleteReason('');
    } catch (err) {
      console.error('Error submitting delete request:', err);
      toast.error('Erro ao enviar solicitação');
    } finally {
      setIsSubmittingRequest(false);
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
      {/* Delete Request Dialog */}
      <AlertDialog open={!!deleteRequest} onOpenChange={() => {
        setDeleteRequest(null);
        setDeleteReason('');
      }}>
        <AlertDialogContent className="bg-slate-900 border-amber-600/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Solicitar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Esta ação requer aprovação de um administrador. O registro de <strong className="text-white">{deleteRequest?.vehicleCode}</strong> com <strong className="text-amber-400">{deleteRequest?.quantity}L</strong> será enviado para revisão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {/* Reason field - required */}
          <div className="py-2">
            <label className="text-sm font-medium text-slate-200 mb-2 block">
              Motivo da solicitação <span className="text-red-400">*</span>
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Informe o motivo pelo qual deseja excluir este registro..."
              className="w-full min-h-[80px] rounded-lg bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500 p-3 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white hover:bg-slate-600 border-0">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteRequest}
              disabled={isSubmittingRequest || !deleteReason.trim()}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isSubmittingRequest ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Solicitar Exclusão
                </>
              )}
            </AlertDialogAction>
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

      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold">Olá, {user.name}!</h2>
          <div className="flex items-center gap-1 text-sm bg-white/20 px-2 py-1 rounded">
            <Calendar className="w-4 h-4" />
            {todayStr}
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
        <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-slate-200">Visualizar Estoque por Local</span>
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
                    : "border-slate-600 text-slate-300 hover:bg-slate-700"
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
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <FileText className="w-4 h-4 text-amber-400" />
            Meus Apontamentos de Hoje
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 text-center">
              <FileText className="w-5 h-5 mx-auto mb-1 text-amber-400" />
              <p className="text-2xl font-bold text-amber-400">{todayStats.totalRecords}</p>
              <p className="text-xs text-amber-300/70">Registros</p>
            </div>
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 text-center">
              <Fuel className="w-5 h-5 mx-auto mb-1 text-green-400" />
              <p className="text-2xl font-bold text-green-400">{todayStats.totalLiters.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-green-300/70">Litros</p>
            </div>
            <div className="bg-slate-700/50 border border-slate-600/50 rounded-lg p-3 text-center">
              <Package className="w-5 h-5 mx-auto mb-1 text-slate-400" />
              <p className="text-2xl font-bold text-slate-300">{todayStats.totalArla.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-slate-400">ARLA</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Records List */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <Clock className="w-4 h-4 text-amber-400" />
            Registros do Dia
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Carregando...
            </div>
          ) : todayRecords.length === 0 ? (
            <div className="text-center py-6 text-slate-400">
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
                      ? "bg-green-900/30 border-green-700/50"
                      : "bg-red-900/20 border-red-800/40"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1">
                    {record.record_type === 'entrada' ? (
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-200">{record.vehicle_code}</p>
                      <p className="text-xs text-slate-400">
                        {formatTime(record.record_time)} • {record.location}
                      </p>
                    </div>
                  </div>
                  <div className="text-right mr-3">
                    <p className={cn(
                      "text-sm font-bold",
                      record.record_type === 'entrada' ? "text-green-400" : "text-red-400"
                    )}>
                      {record.record_type === 'entrada' ? '+' : '-'}{record.fuel_quantity}L
                    </p>
                    {record.arla_quantity && record.arla_quantity > 0 && (
                      <p className="text-xs text-slate-400">ARLA: {record.arla_quantity}L</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {/* Edit button - requires admin approval */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-blue-400 hover:bg-blue-900/30"
                      onClick={() => setEditRecord(record)}
                      title="Solicitar edição"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {/* Delete button - requires admin approval */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-900/30"
                      onClick={() => setDeleteRequest({
                        recordId: record.id,
                        vehicleCode: record.vehicle_code,
                        quantity: record.fuel_quantity,
                        reason: '',
                      })}
                      title="Solicitar exclusão"
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
