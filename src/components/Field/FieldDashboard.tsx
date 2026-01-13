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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-4 text-primary-foreground">
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
        className="w-full h-16 text-lg gap-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"
      >
        <Fuel className="w-6 h-6" />
        Novo Apontamento
        <ArrowRight className="w-5 h-5" />
      </Button>

      {/* Today Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-3 text-center">
            <FileText className="w-5 h-5 mx-auto mb-1 opacity-80" />
            <p className="text-2xl font-bold">{todayStats.totalRecords}</p>
            <p className="text-xs opacity-80">Hoje</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
          <CardContent className="p-3 text-center">
            <Fuel className="w-5 h-5 mx-auto mb-1 opacity-80" />
            <p className="text-2xl font-bold">{todayStats.totalLiters.toLocaleString('pt-BR')}</p>
            <p className="text-xs opacity-80">Litros</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-yellow-500 to-yellow-600 text-white border-0">
          <CardContent className="p-3 text-center">
            <Package className="w-5 h-5 mx-auto mb-1 opacity-80" />
            <p className="text-2xl font-bold">{todayStats.totalArla.toLocaleString('pt-BR')}</p>
            <p className="text-xs opacity-80">ARLA</p>
          </CardContent>
        </Card>
      </div>

      {/* Month Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Resumo do Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-2xl font-bold text-primary">{monthStats.totalRecords}</p>
              <p className="text-xs text-muted-foreground">Apontamentos</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-primary">{monthStats.totalLiters.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-muted-foreground">Litros totais</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock by Location */}
      {stockByLocation.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Movimentação por Local
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {stockByLocation.map((stock) => (
              <div key={stock.location} className="bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{stock.location}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center justify-between bg-green-100 dark:bg-green-900/30 rounded p-2">
                    <span className="text-green-700 dark:text-green-400 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Entradas
                    </span>
                    <span className="font-bold text-green-700 dark:text-green-400">
                      {stock.entradas.toLocaleString('pt-BR')}L
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-red-100 dark:bg-red-900/30 rounded p-2">
                    <span className="text-red-700 dark:text-red-400 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      Saídas
                    </span>
                    <span className="font-bold text-red-700 dark:text-red-400">
                      {stock.saidas.toLocaleString('pt-BR')}L
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Records */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Últimos Registros
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">
              Carregando...
            </div>
          ) : userRecords.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              Nenhum registro encontrado
            </div>
          ) : (
            <div className="space-y-2">
              {userRecords.slice(0, 5).map((record) => (
                <div 
                  key={record.id} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border",
                    record.record_type === 'entrada' 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-muted/50 border-border"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {record.record_type === 'entrada' ? (
                      <TrendingUp className="w-4 h-4 text-green-600" />
                    ) : (
                      <Truck className="w-4 h-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{record.vehicle_code}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(record.record_date)} {record.record_time}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{record.fuel_quantity}L</p>
                    <p className="text-xs text-muted-foreground">{record.location}</p>
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
