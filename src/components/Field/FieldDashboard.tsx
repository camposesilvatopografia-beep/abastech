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
} from 'lucide-react';
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

    // Poll every 10 seconds to ensure data is fresh
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchTodayRecords();
      }
    }, 10000);

    return () => clearInterval(pollInterval);
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

  // Handle direct delete - also removes from Google Sheets
  const handleDirectDelete = async () => {
    if (!deleteConfirmation) return;
    
    setIsDeleting(true);
    try {
      // First, get the record to find its date/time for sheet lookup
      const recordToDelete = todayRecords.find(r => r.id === deleteConfirmation.recordId);
      
      // Delete from Supabase first
      const { error } = await supabase
        .from('field_fuel_records')
        .delete()
        .eq('id', deleteConfirmation.recordId);

      if (error) throw error;

      // Try to delete from Google Sheets (find matching row by date, time, vehicle)
      if (recordToDelete) {
        try {
          // Fetch sheet data to find matching row
          const { data: sheetResponse } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'getData',
              sheetName: 'AbastecimentoCanteiro01',
              noCache: true,
            },
          });
          
          if (sheetResponse?.rows && Array.isArray(sheetResponse.rows)) {
            // Find the row that matches this record (by date, time, vehicle code)
            const recordDate = recordToDelete.record_date;
            const recordTime = recordToDelete.record_time?.substring(0, 5);
            const vehicleCode = recordToDelete.vehicle_code;
            
            const rowIndex = sheetResponse.rows.findIndex((row: any) => {
              const rowDate = row['DATA'] || row['Data'] || '';
              const rowTime = (row['HORA'] || row['Hora'] || '').substring(0, 5);
              const rowVehicle = row['VEICULO'] || row['Veiculo'] || '';
              
              // Match by date + time + vehicle
              return rowDate === recordDate && rowTime === recordTime && rowVehicle === vehicleCode;
            });
            
            if (rowIndex >= 0) {
              // Row found - delete it (add 2: +1 for header, +1 for 0-index)
              await supabase.functions.invoke('google-sheets', {
                body: {
                  action: 'delete',
                  sheetName: 'AbastecimentoCanteiro01',
                  rowIndex: rowIndex + 2, // +1 header, +1 for 0-based index
                },
              });
              console.log('Record also deleted from Google Sheets');
            }
          }
        } catch (sheetErr) {
          console.error('Failed to delete from sheet (record already removed from DB):', sheetErr);
          // Don't fail the whole operation - DB deletion succeeded
        }
      }

      toast.success('Registro excluído com sucesso');
      setDeleteConfirmation(null);
      fetchTodayRecords();
      refreshStockCards();
    } catch (err) {
      console.error('Error deleting record:', err);
      toast.error('Erro ao excluir registro');
    } finally {
      setIsDeleting(false);
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
      {/* Direct Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmation} onOpenChange={() => setDeleteConfirmation(null)}>
        <AlertDialogContent className="bg-card border-red-600/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir o registro de <strong className="text-foreground">{deleteConfirmation?.vehicleCode}</strong> com <strong className="text-red-500">{deleteConfirmation?.quantity}L</strong>?
              <br /><br />
              <span className="text-red-400 font-medium">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDirectDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
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
