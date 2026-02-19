import { useMemo, useState } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  Wrench, 
  TrendingUp,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { differenceInHours, differenceInDays, parseISO } from 'date-fns';

interface ServiceOrder {
  id: string;
  order_number: string;
  vehicle_code: string;
  vehicle_description: string | null;
  order_date: string;
  order_type: string;
  priority: string;
  status: string;
  problem_description: string | null;
  start_date: string | null;
  end_date: string | null;
  entry_date?: string | null;
  entry_time?: string | null;
  actual_hours: number | null;
}

interface MaintenanceRankingTabProps {
  orders: ServiceOrder[];
}

interface VehicleRanking {
  vehicleCode: string;
  vehicleDescription: string;
  totalOrders: number;
  correctiveOrders: number;
  preventiveOrders: number;
  totalDowntimeHours: number;
  totalDowntimeDays: number;
  avgDowntimeHours: number;
  urgentOrders: number;
  lastMaintenanceDate: string | null;
}

export function MaintenanceRankingTab({ orders }: MaintenanceRankingTabProps) {
  const [sortBy, setSortBy] = useState<'breakdowns' | 'hours' | 'urgent'>('breakdowns');
  const [filterType, setFilterType] = useState<'all' | 'corretiva' | 'preventiva'>('all');

  // Calculate downtime for an order
  // entry_time from DB can be "HH:MM:SS" or "HH:MM" — normalize to HH:MM only
  const calculateDowntime = (order: ServiceOrder): { hours: number; days: number } => {
    const entryDate = order.entry_date || order.start_date;
    if (!entryDate) return { hours: 0, days: 0 };

    // Normalize time: take only HH:MM portion
    const rawEntryTime = order.entry_time || '00:00';
    const entryTime = rawEntryTime.toString().slice(0, 5);
    
    // Use only the date part of entryDate in case it has a timestamp
    const entryDateOnly = entryDate.toString().split('T')[0];
    const startDateTime = new Date(`${entryDateOnly}T${entryTime}:00`);
    
    if (isNaN(startDateTime.getTime())) return { hours: 0, days: 0 };

    const isFinalized = order.status?.toLowerCase().includes('finalizada');
    
    // For finalized orders use end_date; for open orders use now
    const endDateTime = (isFinalized && order.end_date)
      ? new Date(order.end_date)
      : (!isFinalized ? new Date() : null);

    if (!endDateTime || isNaN(endDateTime.getTime())) return { hours: 0, days: 0 };

    const hours = differenceInHours(endDateTime, startDateTime);
    const days = differenceInDays(endDateTime, startDateTime);

    return { hours: Math.max(0, hours), days: Math.max(0, days) };
  };

  // Build ranking data
  const rankingData = useMemo(() => {
    const vehicleMap = new Map<string, VehicleRanking>();

    orders.forEach(order => {
      const key = order.vehicle_code;
      const existing = vehicleMap.get(key);
      const downtime = calculateDowntime(order);
      const isUrgent = order.priority?.toLowerCase().includes('alta') || order.priority?.toLowerCase().includes('urgent');
      const isCorrective = order.order_type?.toLowerCase().includes('corretiva');
      const isPreventive = order.order_type?.toLowerCase().includes('preventiva');

      if (existing) {
        existing.totalOrders++;
        if (isCorrective) existing.correctiveOrders++;
        if (isPreventive) existing.preventiveOrders++;
        existing.totalDowntimeHours += downtime.hours;
        existing.totalDowntimeDays += downtime.days;
        if (isUrgent) existing.urgentOrders++;
        
        // Track latest maintenance
        if (!existing.lastMaintenanceDate || order.order_date > existing.lastMaintenanceDate) {
          existing.lastMaintenanceDate = order.order_date;
        }
      } else {
        vehicleMap.set(key, {
          vehicleCode: order.vehicle_code,
          vehicleDescription: order.vehicle_description || '-',
          totalOrders: 1,
          correctiveOrders: isCorrective ? 1 : 0,
          preventiveOrders: isPreventive ? 1 : 0,
          totalDowntimeHours: downtime.hours,
          totalDowntimeDays: downtime.days,
          avgDowntimeHours: 0,
          urgentOrders: isUrgent ? 1 : 0,
          lastMaintenanceDate: order.order_date,
        });
      }
    });

    // Calculate averages
    vehicleMap.forEach(vehicle => {
      vehicle.avgDowntimeHours = vehicle.totalOrders > 0 
        ? Math.round(vehicle.totalDowntimeHours / vehicle.totalOrders) 
        : 0;
    });

    let result = Array.from(vehicleMap.values());

    // Filter by type
    if (filterType === 'corretiva') {
      result = result.filter(v => v.correctiveOrders > 0);
    } else if (filterType === 'preventiva') {
      result = result.filter(v => v.preventiveOrders > 0);
    }

    // Sort based on selected criteria
    switch (sortBy) {
      case 'breakdowns':
        result.sort((a, b) => b.correctiveOrders - a.correctiveOrders);
        break;
      case 'hours':
        result.sort((a, b) => b.totalDowntimeHours - a.totalDowntimeHours);
        break;
      case 'urgent':
        result.sort((a, b) => b.urgentOrders - a.urgentOrders);
        break;
    }

    return result.slice(0, 20); // Top 20
  }, [orders, sortBy, filterType]);

  // Calculate totals
  const totals = useMemo(() => {
    return {
      totalOrders: orders.length,
      totalCorrective: orders.filter(o => o.order_type?.toLowerCase().includes('corretiva')).length,
      totalPreventive: orders.filter(o => o.order_type?.toLowerCase().includes('preventiva')).length,
      totalUrgent: orders.filter(o => o.priority?.toLowerCase().includes('alta') || o.priority?.toLowerCase().includes('urgent')).length,
      vehiclesWithMaintenance: new Set(orders.map(o => o.vehicle_code)).size,
    };
  }, [orders]);

  const formatHours = (hours: number): string => {
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    return `${hours}h`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
          <AlertTriangle className="w-5 h-5 mx-auto text-red-600 mb-1" />
          <p className="text-xl font-bold text-red-700 dark:text-red-300">{totals.totalCorrective}</p>
          <p className="text-xs text-red-600">Corretivas</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
          <Wrench className="w-5 h-5 mx-auto text-blue-600 mb-1" />
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{totals.totalPreventive}</p>
          <p className="text-xs text-blue-600">Preventivas</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
          <Clock className="w-5 h-5 mx-auto text-amber-600 mb-1" />
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{totals.totalOrders}</p>
          <p className="text-xs text-amber-600">Total OS</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-purple-600 mb-1" />
          <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{totals.vehiclesWithMaintenance}</p>
          <p className="text-xs text-purple-600">Veículos</p>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-center">
          <AlertTriangle className="w-5 h-5 mx-auto text-rose-600 mb-1" />
          <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{totals.totalUrgent}</p>
          <p className="text-xs text-rose-600">Urgentes</p>
        </div>
      </div>

      {/* Filters and Sort */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Ordenar por:</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant={sortBy === 'breakdowns' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('breakdowns')}
            className="text-xs"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Mais Quebras
          </Button>
          <Button
            variant={sortBy === 'hours' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('hours')}
            className="text-xs"
          >
            <Clock className="w-3 h-3 mr-1" />
            Mais Horas Parado
          </Button>
          <Button
            variant={sortBy === 'urgent' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('urgent')}
            className="text-xs"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Mais Urgentes
          </Button>
        </div>

        <div className="ml-auto flex gap-1">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
            className="text-xs"
          >
            Todas
          </Button>
          <Button
            variant={filterType === 'corretiva' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('corretiva')}
            className="text-xs"
          >
            Corretivas
          </Button>
          <Button
            variant={filterType === 'preventiva' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('preventiva')}
            className="text-xs"
          >
            Preventivas
          </Button>
        </div>
      </div>

      {/* Ranking Table */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="py-2 px-2 w-10 text-center">#</TableHead>
              <TableHead className="py-2 px-2">Veículo</TableHead>
              <TableHead className="py-2 px-2 hidden md:table-cell">Descrição</TableHead>
              <TableHead className="py-2 px-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  Corretivas
                </div>
              </TableHead>
              <TableHead className="py-2 px-2 text-center hidden sm:table-cell">
                <div className="flex items-center justify-center gap-1">
                  <Wrench className="w-3 h-3 text-blue-500" />
                  Preventivas
                </div>
              </TableHead>
              <TableHead className="py-2 px-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3 text-amber-500" />
                  Tempo Parado
                </div>
              </TableHead>
              <TableHead className="py-2 px-2 text-center hidden lg:table-cell">Média/OS</TableHead>
              <TableHead className="py-2 px-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-500" />
                  Urgentes
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rankingData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum dado de manutenção encontrado
                </TableCell>
              </TableRow>
            ) : (
              rankingData.map((vehicle, index) => (
                <TableRow key={vehicle.vehicleCode} className="hover:bg-muted/30">
                  <TableCell className="py-2 px-2 text-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "font-bold",
                        index === 0 && "bg-yellow-100 text-yellow-700 border-yellow-300",
                        index === 1 && "bg-slate-100 text-slate-600 border-slate-300",
                        index === 2 && "bg-amber-100 text-amber-700 border-amber-300"
                      )}
                    >
                      {index + 1}º
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2 font-mono font-medium">{vehicle.vehicleCode}</TableCell>
                  <TableCell className="py-2 px-2 hidden md:table-cell max-w-[150px] truncate">
                    {vehicle.vehicleDescription}
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "font-bold",
                        vehicle.correctiveOrders >= 5 ? "bg-red-100 text-red-700 border-red-300" :
                        vehicle.correctiveOrders >= 3 ? "bg-amber-100 text-amber-700 border-amber-300" :
                        "bg-green-100 text-green-700 border-green-300"
                      )}
                    >
                      {vehicle.correctiveOrders}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center hidden sm:table-cell">
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                      {vehicle.preventiveOrders}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "font-mono",
                        vehicle.totalDowntimeHours >= 168 ? "bg-red-100 text-red-700 border-red-300" :
                        vehicle.totalDowntimeHours >= 72 ? "bg-amber-100 text-amber-700 border-amber-300" :
                        "bg-green-100 text-green-700 border-green-300"
                      )}
                    >
                      {formatHours(vehicle.totalDowntimeHours)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center hidden lg:table-cell">
                    <span className="text-muted-foreground">{formatHours(vehicle.avgDowntimeHours)}</span>
                  </TableCell>
                  <TableCell className="py-2 px-2 text-center">
                    {vehicle.urgentOrders > 0 ? (
                      <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-300 font-bold">
                        {vehicle.urgentOrders}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Legenda:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-200 border border-red-300"></div>
          <span>Crítico (≥5 corretivas ou ≥7 dias parado)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-200 border border-amber-300"></div>
          <span>Atenção (≥3 corretivas ou ≥3 dias parado)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-200 border border-green-300"></div>
          <span>Normal</span>
        </div>
      </div>
    </div>
  );
}
