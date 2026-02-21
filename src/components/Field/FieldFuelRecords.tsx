import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Fuel,
  Loader2,
  MapPin,
  TrendingUp,
  TrendingDown,
  FileText,
  Truck,
  Package,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { EditRequestModal } from './EditRequestModal';
import { toast } from 'sonner';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface FuelRecord {
  id: string;
  record_date: string;
  record_time: string;
  vehicle_code: string;
  vehicle_description: string | null;
  fuel_quantity: number;
  location: string | null;
  record_type: string | null;
  operator_name: string | null;
  horimeter_current: number | null;
  km_current: number | null;
  arla_quantity: number | null;
  observations: string | null;
  category: string | null;
}

interface FieldFuelRecordsProps {
  user: FieldUser;
  onBack: () => void;
}

export function FieldFuelRecords({ user, onBack }: FieldFuelRecordsProps) {
  const { theme } = useTheme();
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editingRecord, setEditingRecord] = useState<FuelRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<FuelRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRecords = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch records by user OR by assigned locations so all saida/entrada records show
      const userLocations = user.assigned_locations || [];
      
      let query = supabase
        .from('field_fuel_records')
        .select('id, record_date, record_time, vehicle_code, vehicle_description, fuel_quantity, location, record_type, operator_name, horimeter_current, km_current, arla_quantity, observations, category')
        .gte('record_date', startDate)
        .lte('record_date', endDate)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false });

      if (userLocations.length > 0) {
        // Show records from this user OR from their assigned locations
        query = query.or(`user_id.eq.${user.id},location.in.(${userLocations.map(l => `"${l}"`).join(',')})`);
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Error fetching records:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user.id, user.assigned_locations, startDate, endDate]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('field_fuel_records_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_fuel_records',
        },
        () => {
          fetchRecords();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRecords]);

  const handleDelete = async () => {
    if (!deletingRecord) return;
    setIsDeleting(true);
    try {
      // First try to delete from the Google Sheet
      try {
        const recordDate = new Date(`${deletingRecord.record_date}T00:00:00`);
        const dateBR = recordDate.toLocaleDateString('pt-BR');
        const timeShort = deletingRecord.record_time?.substring(0, 5) || '';
        const recordVehicle = deletingRecord.vehicle_code.toUpperCase().replace(/\s/g, '');
        
        // Try all possible sheet names where records could exist
        const sheetsToSearch = ['AbastecimentoCanteiro01'];
        
        let deleted = false;
        for (const sheetName of sheetsToSearch) {
          if (deleted) break;
          try {
            const { data: sheetData } = await supabase.functions.invoke('google-sheets', {
              body: { action: 'getData', sheetName, noCache: true },
            });
            
            if (sheetData?.rows) {
              const matchIdx = sheetData.rows.findIndex((row: any) => {
                const rowDate = String(row['DATA'] || row['Data'] || '').trim();
                const rowTime = String(row['HORA'] || row['Hora'] || '').trim();
                const rowVehicle = String(row['CODIGO'] || row['Codigo'] || row['Código'] || row['VEICULO'] || row['Veiculo'] || row['Veículo'] || '').toUpperCase().replace(/\s/g, '');
                
                // Match by date + time + vehicle code
                const dateMatch = rowDate === dateBR;
                const timeMatch = rowTime === timeShort;
                const vehicleMatch = rowVehicle === recordVehicle || rowVehicle.includes(recordVehicle) || recordVehicle.includes(rowVehicle);
                
                return dateMatch && timeMatch && vehicleMatch;
              });
              
              if (matchIdx >= 0) {
                const rowIndex = (sheetData.rows[matchIdx] as any)._rowIndex ?? matchIdx + 2;
                await supabase.functions.invoke('google-sheets', {
                  body: { action: 'delete', sheetName, rowIndex },
                });
                deleted = true;
                console.log(`Deleted row ${rowIndex} from sheet ${sheetName}`);
              }
            }
          } catch (innerErr) {
            console.error(`Error searching sheet ${sheetName}:`, innerErr);
          }
        }
        
        if (!deleted) {
          console.warn('Record not found in any sheet for deletion');
        }
      } catch (sheetErr) {
        console.error('Sheet delete error (continuing with DB delete):', sheetErr);
      }

      const { error } = await supabase
        .from('field_fuel_records')
        .delete()
        .eq('id', deletingRecord.id);

      if (error) throw error;
      toast.success('Registro excluído com sucesso');
      setDeletingRecord(null);
      fetchRecords();
    } catch (err) {
      console.error('Error deleting record:', err);
      toast.error('Erro ao excluir registro');
    } finally {
      setIsDeleting(false);
    }
  };

  // Group records by date
  const groupedRecords = records.reduce<Record<string, FuelRecord[]>>((acc, record) => {
    const date = record.record_date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(record);
    return acc;
  }, {});

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    const today = format(new Date(), 'yyyy-MM-dd');
    if (dateStr === today) return 'Hoje';
    return format(date, "dd 'de' MMMM", { locale: ptBR });
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-slate-800")}>
            Registros
          </h2>
          <p className="text-xs text-muted-foreground">Histórico de abastecimentos</p>
        </div>
      </div>

      {/* Date Filters */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium">Filtrar por período</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">De</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Até</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {records.length} registro(s) encontrado(s)
        </p>
      </div>

      {/* Records List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className={cn("font-medium", theme === 'dark' ? "text-slate-300" : "text-slate-600")}>
            Nenhum registro encontrado
          </p>
          <p className="text-xs text-muted-foreground mt-1">Ajuste o período de busca</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedRecords).map(([date, dateRecords]) => (
            <div key={date}>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span className={cn(
                  "text-sm font-semibold",
                  theme === 'dark' ? "text-slate-200" : "text-slate-700"
                )}>
                  {formatDateLabel(date)}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {dateRecords.length}
                </Badge>
              </div>

              <div className="space-y-2">
                {dateRecords.map((record) => (
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        {record.record_type === 'entrada' ? (
                          <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <span className={cn(
                          "text-sm font-bold",
                          theme === 'dark' ? "text-slate-200" : "text-slate-700"
                        )}>
                          {record.vehicle_code}
                        </span>
                        {record.category?.toLowerCase().includes('comboio') && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-orange-500/20 text-orange-500 border-orange-500/50">
                            <Truck className="w-2.5 h-2.5 mr-0.5" />
                            Comboio
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <p className={cn(
                          "text-sm font-bold mr-1",
                          record.record_type === 'entrada' ? "text-green-500" : "text-red-500"
                        )}>
                          {record.record_type === 'entrada' ? '+' : ''}{record.fuel_quantity}L
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                          onClick={() => setEditingRecord(record)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => setDeletingRecord(record)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className={cn(
                      "mt-2 pt-2 border-t grid grid-cols-2 gap-x-4 gap-y-1 text-xs",
                      theme === 'dark' ? "border-slate-600/50" : "border-slate-300/50"
                    )}>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">{record.record_time?.substring(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground truncate">{record.location || '-'}</span>
                      </div>
                      {record.horimeter_current && (
                        <div className="flex items-center gap-1">
                          <span className="text-amber-600 dark:text-amber-400 font-medium">Hor:</span>
                          <span className={theme === 'dark' ? "text-slate-300" : "text-slate-600"}>
                            {record.horimeter_current.toLocaleString('pt-BR')}h
                          </span>
                        </div>
                      )}
                      {record.km_current && (
                        <div className="flex items-center gap-1">
                          <span className="text-blue-600 dark:text-blue-400 font-medium">Km:</span>
                          <span className={theme === 'dark' ? "text-slate-300" : "text-slate-600"}>
                            {record.km_current.toLocaleString('pt-BR')}
                          </span>
                        </div>
                      )}
                      {record.arla_quantity && record.arla_quantity > 0 && (
                        <div className="flex items-center gap-1">
                          <Package className="w-3 h-3 text-cyan-500 shrink-0" />
                          <span className="text-cyan-600 dark:text-cyan-400 font-medium">ARLA: {record.arla_quantity}L</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      <EditRequestModal
        record={editingRecord ? {
          id: editingRecord.id,
          vehicle_code: editingRecord.vehicle_code,
          fuel_quantity: editingRecord.fuel_quantity,
          record_date: editingRecord.record_date,
          record_time: editingRecord.record_time,
          location: editingRecord.location || '',
          operator_name: editingRecord.operator_name || undefined,
          horimeter_current: editingRecord.horimeter_current || undefined,
          km_current: editingRecord.km_current || undefined,
          arla_quantity: editingRecord.arla_quantity || undefined,
          observations: editingRecord.observations || undefined,
        } : null}
        userId={user.id}
        onClose={() => setEditingRecord(null)}
        onSuccess={() => {
          setEditingRecord(null);
          fetchRecords();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingRecord} onOpenChange={() => setDeletingRecord(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Tem certeza que deseja excluir o registro de{' '}
              <strong className="text-foreground">{deletingRecord?.vehicle_code}</strong> do dia{' '}
              <strong className="text-foreground">{deletingRecord?.record_date}</strong> com{' '}
              <strong className="text-foreground">{deletingRecord?.fuel_quantity}L</strong>?
              <br /><br />
              <span className="text-red-500 font-medium">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
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
    </div>
  );
}
