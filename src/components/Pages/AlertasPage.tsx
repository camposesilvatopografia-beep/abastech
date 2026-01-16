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
  CheckCircle,
  Edit,
  TrendingDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  order_type: string;
  priority: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  interval_days: number | null;
}

interface InconsistencyAlert {
  id: string;
  vehicle_id: string;
  vehicle_code: string;
  vehicle_name: string | null;
  reading_id: string | null;
  reading_date: string;
  value_type: string;
  current_value: number;
  previous_value: number;
  difference: number;
  operator: string | null;
  status: string;
  created_at: string;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

export function AlertasPage() {
  const { data, loading: sheetsLoading } = useSheetData(SHEET_NAME);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [inconsistencyAlerts, setInconsistencyAlerts] = useState<InconsistencyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInconsistency, setSelectedInconsistency] = useState<InconsistencyAlert | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Fetch service orders and inconsistency alerts
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ordersResult, alertsResult] = await Promise.all([
          supabase
            .from('service_orders')
            .select('id, order_number, vehicle_code, vehicle_description, order_date, order_type, priority, status, start_date, end_date, interval_days')
            .order('order_date', { ascending: false }),
          supabase
            .from('horimeter_inconsistency_alerts')
            .select('*')
            .order('created_at', { ascending: false }),
        ]);

        if (ordersResult.error) throw ordersResult.error;
        if (alertsResult.error) throw alertsResult.error;
        
        setServiceOrders(ordersResult.data || []);
        setInconsistencyAlerts(alertsResult.data || []);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to realtime updates for inconsistency alerts
    const channel = supabase
      .channel('inconsistency-alerts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'horimeter_inconsistency_alerts',
        },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Resolve inconsistency alert
  const handleResolveInconsistency = async () => {
    if (!selectedInconsistency) return;
    
    setIsResolving(true);
    try {
      const { error } = await supabase
        .from('horimeter_inconsistency_alerts')
        .update({
          status: 'resolved',
          resolution_notes: resolutionNotes || null,
          resolved_at: new Date().toISOString(),
          resolved_by: 'admin', // Could be enhanced with actual user info
        })
        .eq('id', selectedInconsistency.id);

      if (error) throw error;

      toast.success('Alerta resolvido com sucesso');
      setSelectedInconsistency(null);
      setResolutionNotes('');
      
      // Refresh alerts
      const { data } = await supabase
        .from('horimeter_inconsistency_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      
      setInconsistencyAlerts(data || []);
    } catch (err) {
      console.error('Error resolving alert:', err);
      toast.error('Erro ao resolver alerta');
    } finally {
      setIsResolving(false);
    }
  };

  const pendingInconsistencies = inconsistencyAlerts.filter(a => a.status === 'pending');
  const resolvedInconsistencies = inconsistencyAlerts.filter(a => a.status === 'resolved');

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

    // 4. Preventive maintenance next review approaching (< 7 days)
    const preventiveOrders = serviceOrders.filter(order => {
      const status = order.status.toLowerCase();
      return status.includes('finalizada') && 
             order.order_type === 'Preventiva' && 
             order.interval_days && 
             order.end_date;
    });

    preventiveOrders.forEach(order => {
      const endDate = new Date(order.end_date!);
      const nextReviewDate = addDays(endDate, order.interval_days!);
      const daysUntilReview = differenceInDays(nextReviewDate, today);
      
      if (daysUntilReview <= 7 && daysUntilReview >= -30) { // Show if within 7 days or up to 30 days overdue
        const isOverdue = daysUntilReview < 0;
        
        alertList.push({
          id: `preventive-${order.id}`,
          title: `🔄 ${isOverdue ? 'Revisão Vencida' : 'Revisão Próxima'}: ${order.vehicle_code}`,
          description: isOverdue 
            ? `Vencida há ${Math.abs(daysUntilReview)} dias - ${order.order_number}`
            : `Vence em ${daysUntilReview} dia(s) - ${format(nextReviewDate, 'dd/MM/yyyy')}`,
          type: 'revisao',
          severity: isOverdue || daysUntilReview <= 3 ? 'error' : 'warning',
          vehicleCode: order.vehicle_code,
          date: format(nextReviewDate, 'yyyy-MM-dd'),
        });
      }
    });

    // 5. Review alerts (vehicles that might need preventive maintenance)
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
          title: `🔧 Revisão Sugerida: ${vehicleCode}`,
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
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{urgentCount}</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70">Urgentes</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{warningCount}</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Atenção</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{pendingInconsistencies.length}</p>
            <p className="text-xs text-orange-600/70 dark:text-orange-400/70">Inconsistências</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{infoCount}</p>
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Informativo</p>
          </div>
        </div>

        {/* Tabs for different alert types */}
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Alertas Gerais ({alerts.length})
            </TabsTrigger>
            <TabsTrigger value="inconsistencies" className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Inconsistências ({pendingInconsistencies.length})
            </TabsTrigger>
          </TabsList>

          {/* General Alerts Tab */}
          <TabsContent value="general">
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
          </TabsContent>

          {/* Inconsistencies Tab */}
          <TabsContent value="inconsistencies">
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="p-3 md:p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
                  <h2 className="text-sm md:text-base font-semibold">Inconsistências de Horímetro/KM</h2>
                </div>
                <span className="text-xs md:text-sm text-muted-foreground font-medium">
                  {pendingInconsistencies.length} pendente(s)
                </span>
              </div>

              <div className="divide-y divide-border">
                {isLoading ? (
                  <div className="p-6 md:p-8 text-center text-muted-foreground">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Carregando...
                  </div>
                ) : pendingInconsistencies.length === 0 ? (
                  <div className="p-6 md:p-8 text-center text-muted-foreground">
                    <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30 text-green-500" />
                    <p className="font-medium">Nenhuma inconsistência pendente</p>
                    <p className="text-sm">Todos os registros estão consistentes</p>
                  </div>
                ) : (
                  pendingInconsistencies.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-3 md:p-4 bg-orange-500/10 transition-colors hover:bg-orange-500/15"
                    >
                      <div className="flex items-start sm:items-center gap-3 flex-col sm:flex-row min-w-0 flex-1">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                            <TrendingDown className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm md:text-base text-orange-600 dark:text-orange-400">
                              {alert.vehicle_code} - {alert.value_type === 'horimeter' ? 'Horímetro' : 'KM'}
                            </p>
                            <p className="text-xs md:text-sm text-muted-foreground">
                              Anterior: <strong>{alert.previous_value.toLocaleString('pt-BR')}</strong> → 
                              Atual: <strong className="text-red-500">{alert.current_value.toLocaleString('pt-BR')}</strong>
                              {' '}({alert.difference > 0 ? '+' : ''}{alert.difference.toLocaleString('pt-BR')})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {alert.operator && `Operador: ${alert.operator} • `}
                              {format(new Date(alert.reading_date), "dd/MM/yyyy", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-11 sm:ml-0">
                          <Badge variant="outline" className="text-orange-600 dark:text-orange-400 border-orange-500/50">
                            {alert.value_type === 'horimeter' ? 'Horímetro' : 'KM'}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-2 shrink-0"
                        onClick={() => setSelectedInconsistency(alert)}
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Resolver
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Resolved section */}
              {resolvedInconsistencies.length > 0 && (
                <div className="border-t border-border">
                  <div className="p-3 md:p-4 bg-muted/30">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <h3 className="text-sm font-medium">Resolvidos Recentemente ({resolvedInconsistencies.length})</h3>
                    </div>
                    <div className="space-y-2">
                      {resolvedInconsistencies.slice(0, 5).map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between text-sm p-2 bg-green-500/10 rounded">
                          <span className="text-muted-foreground">
                            {alert.vehicle_code} - {alert.value_type === 'horimeter' ? 'Horímetro' : 'KM'}
                          </span>
                          <span className="text-xs text-green-600 dark:text-green-400">
                            Resolvido em {format(new Date(alert.resolved_at!), 'dd/MM HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

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
            <span className="w-3 h-3 rounded-full bg-orange-500" />
            <span>Inconsistência</span>
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

      {/* Resolve Inconsistency Dialog */}
      <Dialog open={!!selectedInconsistency} onOpenChange={() => setSelectedInconsistency(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-orange-500" />
              Resolver Inconsistência
            </DialogTitle>
            <DialogDescription>
              {selectedInconsistency && (
                <>
                  <strong>{selectedInconsistency.vehicle_code}</strong> - {selectedInconsistency.vehicle_name || 'Sem descrição'}
                  <br />
                  {selectedInconsistency.value_type === 'horimeter' ? 'Horímetro' : 'KM'}: {' '}
                  {selectedInconsistency.previous_value.toLocaleString('pt-BR')} → {selectedInconsistency.current_value.toLocaleString('pt-BR')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
              <p className="text-sm">
                <strong>Diferença:</strong> {selectedInconsistency?.difference.toLocaleString('pt-BR')} {selectedInconsistency?.value_type === 'horimeter' ? 'horas' : 'km'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Data: {selectedInconsistency && format(new Date(selectedInconsistency.reading_date), 'dd/MM/yyyy', { locale: ptBR })}
                {selectedInconsistency?.operator && ` • Operador: ${selectedInconsistency.operator}`}
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Notas de Resolução (opcional)</label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Descreva a correção realizada ou justificativa..."
                className="min-h-[100px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInconsistency(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleResolveInconsistency} 
              disabled={isResolving}
              className="bg-green-600 hover:bg-green-700"
            >
              {isResolving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Resolvendo...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Marcar como Resolvido
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}