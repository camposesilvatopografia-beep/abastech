import { useState, useMemo, useEffect } from 'react';
import { 
  Bell,
  ChevronRight,
  Clock,
  AlertTriangle,
  Wrench,
  Calendar,
  Timer,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SHEET_NAME = 'Horimetros';

interface Alert {
  id: string;
  title: string;
  description: string;
  type: 'horimetro' | 'manutencao' | 'revisao';
  severity: 'warning' | 'error' | 'info';
  count?: number;
  date?: string;
  vehicleCode?: string;
}

interface ServiceOrder {
  id: string;
  order_number: string;
  vehicle_code: string;
  vehicle_description: string | null;
  order_date: string;
  priority: string;
  status: string;
  start_date: string | null;
}

export function AlertasPage() {
  const { data, loading: sheetsLoading } = useSheetData(SHEET_NAME);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch service orders
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const { data, error } = await supabase
          .from('service_orders')
          .select('id, order_number, vehicle_code, vehicle_description, order_date, priority, status, start_date')
          .order('order_date', { ascending: false });

        if (error) throw error;
        setServiceOrders(data || []);
      } catch (err) {
        console.error('Error fetching orders:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const alerts = useMemo(() => {
    const alertList: Alert[] = [];
    const today = new Date();
    
    // 1. Urgent service orders (priority = Alta or Urgente)
    const urgentOrders = serviceOrders.filter(order => {
      const priority = order.priority.toLowerCase();
      const status = order.status.toLowerCase();
      return (priority.includes('alta') || priority.includes('urgente')) && 
             !status.includes('finalizada');
    });

    urgentOrders.forEach(order => {
      alertList.push({
        id: `urgent-${order.id}`,
        title: `🚨 OS Urgente: ${order.order_number}`,
        description: `${order.vehicle_code} - ${order.vehicle_description || 'Sem descrição'}`,
        type: 'manutencao',
        severity: 'error',
        vehicleCode: order.vehicle_code,
        date: order.order_date,
      });
    });

    // 2. Delayed orders (started more than 7 days ago and not finished)
    const delayedOrders = serviceOrders.filter(order => {
      const status = order.status.toLowerCase();
      if (status.includes('finalizada')) return false;
      
      if (order.start_date) {
        const startDate = new Date(order.start_date);
        const daysInProgress = differenceInDays(today, startDate);
        return daysInProgress > 7;
      }
      return false;
    });

    delayedOrders.forEach(order => {
      const startDate = new Date(order.start_date!);
      const daysInProgress = differenceInDays(today, startDate);
      
      alertList.push({
        id: `delayed-${order.id}`,
        title: `⏰ OS Atrasada: ${order.order_number}`,
        description: `${daysInProgress} dias em manutenção - ${order.vehicle_code}`,
        type: 'manutencao',
        severity: 'warning',
        vehicleCode: order.vehicle_code,
        date: order.start_date || order.order_date,
      });
    });

    // 3. Orders waiting for parts for too long (>3 days)
    const waitingOrders = serviceOrders.filter(order => {
      const status = order.status.toLowerCase();
      if (!status.includes('aguardando')) return false;
      
      const orderDate = new Date(order.order_date);
      const daysWaiting = differenceInDays(today, orderDate);
      return daysWaiting > 3;
    });

    waitingOrders.forEach(order => {
      const orderDate = new Date(order.order_date);
      const daysWaiting = differenceInDays(today, orderDate);
      
      alertList.push({
        id: `waiting-${order.id}`,
        title: `📦 Aguardando Peças: ${order.order_number}`,
        description: `${daysWaiting} dias aguardando - ${order.vehicle_code}`,
        type: 'manutencao',
        severity: 'warning',
        vehicleCode: order.vehicle_code,
        date: order.order_date,
      });
    });

    // 4. Review alerts (vehicles that might need preventive maintenance)
    // Check for vehicles with completed orders that haven't had maintenance in 30+ days
    const completedVehicles = new Map<string, { lastDate: Date; description: string }>();
    
    serviceOrders
      .filter(o => o.status.toLowerCase().includes('finalizada'))
      .forEach(order => {
        const orderDate = new Date(order.order_date);
        const existing = completedVehicles.get(order.vehicle_code);
        if (!existing || orderDate > existing.lastDate) {
          completedVehicles.set(order.vehicle_code, {
            lastDate: orderDate,
            description: order.vehicle_description || '',
          });
        }
      });

    completedVehicles.forEach((info, vehicleCode) => {
      const daysSinceMaintenance = differenceInDays(today, info.lastDate);
      
      // Alert for vehicles with no maintenance in 60+ days
      if (daysSinceMaintenance >= 60) {
        const nextReviewDate = addDays(info.lastDate, 90); // Suggest review at 90 days
        
        alertList.push({
          id: `review-${vehicleCode}`,
          title: `🔧 Revisão Próxima: ${vehicleCode}`,
          description: `${daysSinceMaintenance} dias sem manutenção. Revisar até ${format(nextReviewDate, 'dd/MM/yyyy')}`,
          type: 'revisao',
          severity: 'info',
          vehicleCode,
          date: format(info.lastDate, 'yyyy-MM-dd'),
        });
      }
    });

    // 5. Horimeter alerts (low utilization from sheets)
    const lowUtilization = data.rows.filter(row => {
      const horas = parseFloat(String(row['HORAS'] || '0').replace(',', '.')) || 0;
      return horas < 2;
    });

    if (lowUtilization.length > 0) {
      const vehicleAlerts = new Map<string, number>();
      lowUtilization.forEach(row => {
        const veiculo = String(row['VEICULO'] || row['CODIGO'] || 'Desconhecido');
        vehicleAlerts.set(veiculo, (vehicleAlerts.get(veiculo) || 0) + 1);
      });

      vehicleAlerts.forEach((count, veiculo) => {
        alertList.push({
          id: `horimeter-${veiculo}`,
          title: `📊 Horímetro com alerta: ${veiculo}`,
          description: `${count} registro(s) com baixa utilização`,
          type: 'horimetro',
          severity: 'warning',
          count,
          vehicleCode: veiculo,
        });
      });
    }

    // Sort by severity (error first, then warning, then info)
    return alertList.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }, [data.rows, serviceOrders]);

  const urgentCount = alerts.filter(a => a.severity === 'error').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'manutencao':
        return <Wrench className="w-4 h-4" />;
      case 'revisao':
        return <Calendar className="w-4 h-4" />;
      default:
        return <Timer className="w-4 h-4" />;
    }
  };

  const getSeverityStyles = (severity: Alert['severity']) => {
    switch (severity) {
      case 'error':
        return {
          bg: 'bg-red-500/10',
          text: 'text-red-600 dark:text-red-400',
          icon: 'bg-red-500/20',
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10',
          text: 'text-amber-600 dark:text-amber-400',
          icon: 'bg-amber-500/20',
        };
      default:
        return {
          bg: 'bg-blue-500/10',
          text: 'text-blue-600 dark:text-blue-400',
          icon: 'bg-blue-500/20',
        };
    }
  };

  const isLoading = loading || sheetsLoading;

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Central de Alertas</h1>
              <p className="text-sm text-muted-foreground">Monitoramento automático do sistema</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.location.reload()}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{urgentCount}</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70">Urgentes</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{warningCount}</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Atenção</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{infoCount}</p>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Informativo</p>
          </div>
        </div>

        {/* Alerts List */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-3 md:p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-warning" />
              <h2 className="text-sm md:text-base font-semibold">Alertas Ativos</h2>
            </div>
            <span className="text-xs md:text-sm text-muted-foreground font-medium">
              {alerts.length} alerta(s)
            </span>
          </div>

          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-6 md:p-8 text-center text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                Carregando alertas...
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-6 md:p-8 text-center text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum alerta encontrado</p>
                <p className="text-sm">Todos os sistemas estão operando normalmente</p>
              </div>
            ) : (
              alerts.map((alert) => {
                const styles = getSeverityStyles(alert.severity);
                return (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between p-3 md:p-4 ${styles.bg} transition-colors`}
                  >
                    <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row min-w-0 flex-1">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-full ${styles.icon} flex items-center justify-center shrink-0`}>
                          <span className={styles.text}>
                            {getAlertIcon(alert.type)}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-sm md:text-base ${styles.text}`}>
                            {alert.title}
                          </p>
                          <p className="text-xs md:text-sm text-muted-foreground truncate">
                            {alert.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-11 sm:ml-0">
                        <Badge 
                          variant="outline" 
                          className={`shrink-0 ${styles.text} border-current`}
                        >
                          <Clock className="w-3 h-3 mr-1" />
                          {alert.type === 'manutencao' ? 'Manutenção' : 
                           alert.type === 'revisao' ? 'Revisão' : 'Horímetro'}
                        </Badge>
                        {alert.date && (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {format(new Date(alert.date), 'dd/MM', { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 hidden sm:block ml-2" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs md:text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span>Urgente</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500" />
            <span>Atenção</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Informativo</span>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs md:text-sm text-muted-foreground pt-6 md:pt-8">
          Desenvolvido por <span className="font-medium">Jean Campos</span> • Abastech © 2026
        </div>
      </div>
    </div>
  );
}