import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Gauge,
  Loader2,
  Plus,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '@/hooks/useTheme';
import { Badge } from '@/components/ui/badge';

interface Vehicle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  company: string | null;
  unit: string;
  status: string | null;
}

interface PendingVehicle {
  vehicle: Vehicle;
  lastReading?: { date: string; value: number; km: number | null };
}

interface FieldPendingHorimetersProps {
  onBack: () => void;
  onRegister: (vehicleId: string, date: string) => void;
}

export function FieldPendingHorimeters({ onBack, onRegister }: FieldPendingHorimetersProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [readingsMap, setReadingsMap] = useState<Record<string, Set<string>>>({});
  const [lastReadingMap, setLastReadingMap] = useState<Record<string, { date: string; value: number; km: number | null }>>({});
  const [daysBack, setDaysBack] = useState(3);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});

  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    const start = subDays(today, daysBack - 1);
    return eachDayOfInterval({ start, end: today }).map(d => format(d, 'yyyy-MM-dd')).reverse();
  }, [daysBack]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch active vehicles
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id, code, name, description, category, company, unit, status')
        .or('status.eq.ativo,status.is.null')
        .order('code');

      // Fetch readings for the date range
      const oldestDate = dateRange[dateRange.length - 1];
      const { data: readingData } = await supabase
        .from('horimeter_readings')
        .select('vehicle_id, reading_date, current_value, current_km')
        .gte('reading_date', oldestDate)
        .order('reading_date', { ascending: false });

      if (vehicleData) setVehicles(vehicleData);

      // Build readings map: vehicleId -> Set of dates with readings
      const rMap: Record<string, Set<string>> = {};
      const lrMap: Record<string, { date: string; value: number; km: number | null }> = {};

      if (readingData) {
        for (const r of readingData) {
          if (!rMap[r.vehicle_id]) rMap[r.vehicle_id] = new Set();
          rMap[r.vehicle_id].add(r.reading_date);

          // Track last reading per vehicle
          if (!lrMap[r.vehicle_id]) {
            lrMap[r.vehicle_id] = {
              date: r.reading_date,
              value: r.current_value,
              km: r.current_km,
            };
          }
        }
      }

      // Also fetch most recent reading for vehicles not in the range
      if (vehicleData) {
        const missingVehicleIds = vehicleData
          .filter(v => !lrMap[v.id])
          .map(v => v.id);

        if (missingVehicleIds.length > 0) {
          // Fetch last reading for each missing vehicle (batch approach)
          const { data: lastReadings } = await supabase
            .from('horimeter_readings')
            .select('vehicle_id, reading_date, current_value, current_km')
            .in('vehicle_id', missingVehicleIds)
            .order('reading_date', { ascending: false })
            .limit(missingVehicleIds.length * 2);

          if (lastReadings) {
            for (const r of lastReadings) {
              if (!lrMap[r.vehicle_id]) {
                lrMap[r.vehicle_id] = {
                  date: r.reading_date,
                  value: r.current_value,
                  km: r.current_km,
                };
              }
            }
          }
        }
      }

      setReadingsMap(rMap);
      setLastReadingMap(lrMap);

      // Auto-expand first date
      if (dateRange.length > 0) {
        setExpandedDates(prev => {
          const next = { ...prev };
          if (next[dateRange[0]] === undefined) next[dateRange[0]] = true;
          return next;
        });
      }
    } catch (err) {
      console.error('Error fetching pending data:', err);
      toast.error('Erro ao carregar pendências');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build pending vehicles per date
  const pendingByDate = useMemo(() => {
    const result: Record<string, PendingVehicle[]> = {};
    for (const dateStr of dateRange) {
      const pending: PendingVehicle[] = [];
      for (const v of vehicles) {
        const hasReading = readingsMap[v.id]?.has(dateStr);
        if (!hasReading) {
          pending.push({
            vehicle: v,
            lastReading: lastReadingMap[v.id],
          });
        }
      }
      // Sort by code
      pending.sort((a, b) => a.vehicle.code.localeCompare(b.vehicle.code));
      result[dateStr] = pending;
    }
    return result;
  }, [dateRange, vehicles, readingsMap, lastReadingMap]);

  const totalPending = useMemo(() => {
    return Object.values(pendingByDate).reduce((sum, arr) => sum + arr.length, 0);
  }, [pendingByDate]);

  const toggleDate = (dateStr: string) => {
    setExpandedDates(prev => ({ ...prev, [dateStr]: !prev[dateStr] }));
  };

  const formatDateLabel = (dateStr: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const label = format(new Date(dateStr + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR });
    if (dateStr === today) return `Hoje - ${label}`;
    if (dateStr === yesterday) return `Ontem - ${label}`;
    return label;
  };

  return (
    <div className={cn("p-4 space-y-4 pb-8", isDark ? "text-white" : "text-slate-900")}>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Voltar
      </button>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Pendências
        </h2>
        <Badge variant="destructive" className="text-sm px-3 py-1">
          {totalPending} pendentes
        </Badge>
      </div>

      {/* Days filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Período:</span>
        {[3, 5, 7].map(d => (
          <Button
            key={d}
            size="sm"
            variant={daysBack === d ? 'default' : 'outline'}
            className="h-8 text-xs px-3"
            onClick={() => setDaysBack(d)}
          >
            {d} dias
          </Button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className={cn(
          "rounded-xl p-3 text-center border",
          isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200"
        )}>
          <div className="text-2xl font-bold text-orange-500">{totalPending}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Pendente</div>
        </div>
        <div className={cn(
          "rounded-xl p-3 text-center border",
          isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200"
        )}>
          <div className="text-2xl font-bold text-blue-500">{vehicles.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Veículos Ativos</div>
        </div>
        <div className={cn(
          "rounded-xl p-3 text-center border",
          isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200"
        )}>
          <div className="text-2xl font-bold text-green-500">{dateRange.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Dias Analisados</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {dateRange.map(dateStr => {
            const pending = pendingByDate[dateStr] || [];
            const isExpanded = expandedDates[dateStr] ?? false;

            return (
              <div key={dateStr}>
                <button
                  onClick={() => toggleDate(dateStr)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold",
                    isDark ? "bg-slate-700/60 text-slate-200" : "bg-slate-100 text-slate-700"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    {formatDateLabel(dateStr)}
                    <Badge
                      variant={pending.length > 0 ? "destructive" : "secondary"}
                      className="text-[10px] px-1.5"
                    >
                      {pending.length} pendente{pending.length !== 1 ? 's' : ''}
                    </Badge>
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isExpanded && (
                  <div className="space-y-2 mt-2 ml-1">
                    {pending.length === 0 ? (
                      <div className="text-center py-4 text-sm text-green-500 font-medium">
                        ✅ Todos os veículos com lançamento nesta data
                      </div>
                    ) : (
                      pending.map(({ vehicle, lastReading }) => (
                        <div
                          key={vehicle.id}
                          className={cn(
                            "rounded-xl p-3 shadow-sm border flex items-center gap-3",
                            isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-amber-500">{vehicle.code}</span>
                              {vehicle.category && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                  vehicle.category?.toLowerCase().includes('equip')
                                    ? (isDark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700")
                                    : (isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700")
                                )}>
                                  {vehicle.category}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{vehicle.name}</div>
                            {lastReading && (
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <CalendarIcon className="w-3 h-3" />
                                  {format(new Date(lastReading.date + 'T12:00:00'), 'dd/MM', { locale: ptBR })}
                                </span>
                                {lastReading.value > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-amber-500" />
                                    {lastReading.value.toLocaleString('pt-BR')}h
                                  </span>
                                )}
                                {(lastReading.km ?? 0) > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Gauge className="w-3 h-3 text-blue-500" />
                                    {(lastReading.km ?? 0).toLocaleString('pt-BR')}km
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="h-9 w-9 p-0 bg-amber-600 hover:bg-amber-700 text-white shrink-0 rounded-lg"
                            onClick={() => onRegister(vehicle.id, dateStr)}
                          >
                            <Plus className="w-5 h-5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
