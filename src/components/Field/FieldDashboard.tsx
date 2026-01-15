import { useState, useEffect } from 'react';
import { 
  Fuel, 
  TrendingUp, 
  TrendingDown, 
  Package,
  Calendar,
  MapPin,
  Truck,
  Clock,
  BarChart3,
  FileText,
  ArrowRight,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
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

interface StockData {
  location: string;
  estoqueAnterior: number;
  entradas: number;
  saidas: number;
  estoqueAtual: number;
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
  const { data: abastecimentoData } = useSheetData('AbastecimentoCanteiro01');
  const [userRecords, setUserRecords] = useState<RecentRecord[]>([]);
  const [stockByLocation, setStockByLocation] = useState<StockData[]>([]);
  const [todayStats, setTodayStats] = useState({
    totalRecords: 0,
    totalLiters: 0,
    totalArla: 0,
  });
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [editRecord, setEditRecord] = useState<RecentRecord | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [monthStats, setMonthStats] = useState({
    totalRecords: 0,
    totalLiters: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user's records from database
  useEffect(() => {
    const fetchUserRecords = async () => {
      setIsLoading(true);
      try {
        const today = new Date();
        const startOfToday = startOfDay(today).toISOString();
        const endOfToday = endOfDay(today).toISOString();
        const startOfCurrentMonth = startOfMonth(today).toISOString();
        const endOfCurrentMonth = endOfMonth(today).toISOString();

        // Fetch recent records
        const { data: records, error } = await supabase
          .from('field_fuel_records')
          .select('*')
          .eq('user_id', user.id)
          .order('record_date', { ascending: false })
          .order('record_time', { ascending: false })
          .limit(10);

        if (error) throw error;

        setUserRecords(records?.map(r => ({
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
        })) || []);

        // Calculate today stats
        const todayRecords = records?.filter(r => {
          const recordDate = new Date(r.record_date);
          return recordDate >= new Date(startOfToday) && recordDate <= new Date(endOfToday);
        }) || [];

        setTodayStats({
          totalRecords: todayRecords.length,
          totalLiters: todayRecords.reduce((sum, r) => sum + (r.fuel_quantity || 0), 0),
          totalArla: todayRecords.reduce((sum, r) => sum + (r.arla_quantity || 0), 0),
        });

        // Fetch month stats
        const { data: monthRecords } = await supabase
          .from('field_fuel_records')
          .select('fuel_quantity')
          .eq('user_id', user.id)
          .gte('record_date', startOfCurrentMonth.split('T')[0])
          .lte('record_date', endOfCurrentMonth.split('T')[0]);

        setMonthStats({
          totalRecords: monthRecords?.length || 0,
          totalLiters: monthRecords?.reduce((sum, r) => sum + (r.fuel_quantity || 0), 0) || 0,
        });

      } catch (err) {
        console.error('Error fetching user records:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserRecords();
  }, [user.id]);

  // Calculate stock by location from sheet data
  useEffect(() => {
    if (!abastecimentoData.rows.length || !user.assigned_locations?.length) return;

    const userLocations = user.assigned_locations || [];
    const stockData: StockData[] = [];

    userLocations.forEach(location => {
      // Filter records for this location
      const locationRecords = abastecimentoData.rows.filter(row => {
        const rowLocation = String(row['LOCAL'] || row['Local'] || '');
        return rowLocation.toLowerCase().includes(location.toLowerCase()) ||
               location.toLowerCase().includes(rowLocation.toLowerCase());
      });

      // Calculate entries (Entrada) and exits (Saída)
      let entradas = 0;
      let saidas = 0;

      locationRecords.forEach(row => {
        const tipo = String(row['TIPO'] || row['Tipo'] || '').toLowerCase();
        const quantidade = parseFloat(String(row['QUANTIDADE'] || row['Quantidade'] || row['QTD'] || 0)) || 0;

        if (tipo.includes('entrada')) {
          entradas += quantidade;
        } else {
          saidas += quantidade;
        }
      });

      // Simple stock calculation (this would need actual initial stock from somewhere)
      const estoqueAnterior = 0; // Would need to be fetched from a stock table
      const estoqueAtual = estoqueAnterior + entradas - saidas;

      stockData.push({
        location,
        estoqueAnterior,
        entradas,
        saidas,
        estoqueAtual: Math.max(0, estoqueAtual),
      });
    });

    setStockByLocation(stockData);
  }, [abastecimentoData.rows, user.assigned_locations]);

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM', { locale: ptBR });
    } catch {
      return dateStr;
    }
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
    const { data: records } = await supabase
      .from('field_fuel_records')
      .select('*')
      .eq('user_id', user.id)
      .order('record_date', { ascending: false })
      .order('record_time', { ascending: false })
      .limit(10);

    if (records) {
      setUserRecords(records.map(r => ({
        id: r.id,
        record_date: r.record_date,
        record_time: r.record_time,
        vehicle_code: r.vehicle_code,
        fuel_quantity: r.fuel_quantity,
        location: r.location || '',
        record_type: (r as any).record_type || 'saida',
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
        <p className="text-sm opacity-90">
          {user.assigned_locations?.length === 1 
            ? `Local: ${user.assigned_locations[0]}`
            : `${user.assigned_locations?.length || 0} locais atribuídos`
          }
        </p>
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

      {/* Today Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-amber-500 to-orange-500 text-white border-0 shadow-lg">
          <CardContent className="p-3 text-center">
            <FileText className="w-5 h-5 mx-auto mb-1 opacity-80" />
            <p className="text-2xl font-bold">{todayStats.totalRecords}</p>
            <p className="text-xs opacity-80">Hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0 shadow-lg">
          <CardContent className="p-3 text-center">
            <Fuel className="w-5 h-5 mx-auto mb-1 opacity-80" />
            <p className="text-2xl font-bold">{todayStats.totalLiters.toLocaleString('pt-BR')}</p>
            <p className="text-xs opacity-80">Litros</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-slate-600 to-slate-700 text-white border-0 shadow-lg">
          <CardContent className="p-3 text-center">
            <Package className="w-5 h-5 mx-auto mb-1 opacity-80" />
            <p className="text-2xl font-bold">{todayStats.totalArla.toLocaleString('pt-BR')}</p>
            <p className="text-xs opacity-80">ARLA</p>
          </CardContent>
        </Card>
      </div>

      {/* Month Summary */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <Calendar className="w-4 h-4 text-amber-400" />
            Resumo do Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-2xl font-bold text-amber-400">{monthStats.totalRecords}</p>
              <p className="text-xs text-slate-400">Apontamentos</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-400">{monthStats.totalLiters.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-slate-400">Litros totais</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock by Location */}
      {stockByLocation.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              Movimentação por Local
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {stockByLocation.map((stock) => (
              <div key={stock.location} className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <span className="font-medium text-sm text-slate-200">{stock.location}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between bg-green-900/30 rounded p-2">
                    <span className="text-green-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Entradas
                    </span>
                    <span className="font-bold text-green-400">
                      {stock.entradas.toLocaleString('pt-BR')}L
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-red-900/30 rounded p-2">
                    <span className="text-red-400 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      Saídas
                    </span>
                    <span className="font-bold text-red-400">
                      {stock.saidas.toLocaleString('pt-BR')}L
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Records with Edit/Delete options */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
            <Clock className="w-4 h-4 text-amber-400" />
            Últimos Registros
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="text-center py-4 text-slate-400">
              Carregando...
            </div>
          ) : userRecords.length === 0 ? (
            <div className="text-center py-4 text-slate-400">
              Nenhum registro encontrado
            </div>
          ) : (
            <div className="space-y-2">
              {userRecords.slice(0, 5).map((record) => (
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
                        {formatDate(record.record_date)} {record.record_time}
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
                    <p className="text-xs text-slate-400">{record.location}</p>
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
