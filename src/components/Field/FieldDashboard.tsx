import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfDay, endOfDay } from 'date-fns';
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
import { EditRequestModal } from './EditRequestModal';
import { LocationStockCard } from './LocationStockCard';
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

  // Get today's date for display
  const todayStr = format(new Date(), "dd 'de' MMMM", { locale: ptBR });
  const todayDateStr = format(new Date(), 'yyyy-MM-dd');

  // Fetch only today's records from database
  useEffect(() => {
    const fetchTodayRecords = async () => {
      setIsLoading(true);
      try {
        const today = new Date();
        const todayDateOnly = format(today, 'yyyy-MM-dd');

        // Fetch only today's records for this user
        const { data: records, error } = await supabase
          .from('field_fuel_records')
          .select('*')
          .eq('user_id', user.id)
          .eq('record_date', todayDateOnly)
          .order('record_time', { ascending: false });

        if (error) throw error;

        const mappedRecords = records?.map(r => ({
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
        })) || [];

        setTodayRecords(mappedRecords);

        // Calculate today stats
        setTodayStats({
          totalRecords: mappedRecords.length,
          totalLiters: mappedRecords.reduce((sum, r) => sum + (r.fuel_quantity || 0), 0),
          totalArla: mappedRecords.reduce((sum, r) => sum + (r.arla_quantity || 0), 0),
        });

      } catch (err) {
        console.error('Error fetching today records:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTodayRecords();
  }, [user.id]);

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

  // Refresh records after request
  const refreshRecords = async () => {
    const todayDateOnly = format(new Date(), 'yyyy-MM-dd');
    const { data: records } = await supabase
      .from('field_fuel_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('record_date', todayDateOnly)
      .order('record_time', { ascending: false });

    if (records) {
      setTodayRecords(records.map(r => ({
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
      })));
    }
  };

  return (
    <div className="space-y-4 p-4 pb-24">
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

      {/* Welcome Section with Logo */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 rounded-xl p-4 text-white">
        <div className="flex items-center gap-3 mb-2">
          <img src={logoAbastech} alt="Abastech" className="h-10 w-auto" />
        </div>
        <h2 className="text-lg font-bold">Olá, {user.name}!</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm opacity-90">
            {user.assigned_locations?.length === 1 
              ? `Local: ${user.assigned_locations[0]}`
              : `${user.assigned_locations?.length || 0} locais atribuídos`
            }
          </p>
          <div className="flex items-center gap-1 text-sm opacity-90 bg-white/20 px-2 py-1 rounded">
            <Calendar className="w-4 h-4" />
            {todayStr}
          </div>
        </div>
      </div>

      {/* Quick Action Button */}
      <Button 
        onClick={onNavigateToForm}
        className="w-full h-16 text-lg gap-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg"
      >
        <Fuel className="w-6 h-6" />
        Novo Apontamento
        <ArrowRight className="w-5 h-5" />
      </Button>

      {/* Stock KPIs per Location */}
      {user.assigned_locations && user.assigned_locations.length > 0 && (
        <div className="space-y-3">
          {user.assigned_locations.map((location) => (
            <LocationStockCard key={location} location={location} />
          ))}
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
