import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertCircle,
  CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Copy,
  Gauge,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { getSheetData } from '@/lib/googleSheets';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';
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
  lastReading?: { date: string; value: number; km: number | null; operator?: string | null };
}

interface FieldPendingHorimetersProps {
  onBack: () => void;
  onRegister: (vehicleId: string, date: string) => void;
}

function parseSheetDate(raw: any): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const num = Number(str);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

function findCol(row: Record<string, any>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const cl = c.toLowerCase().trim();
    const found = keys.find(k => k.toLowerCase().trim() === cl);
    if (found) return found;
  }
  for (const c of candidates) {
    const cl = c.toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cl);
    if (found) return found;
  }
  return null;
}

export function FieldPendingHorimeters({ onBack, onRegister }: FieldPendingHorimetersProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [readingsMap, setReadingsMap] = useState<Record<string, Set<string>>>({});
  const [lastReadingMap, setLastReadingMap] = useState<Record<string, { date: string; value: number; km: number | null; operator?: string | null }>>({});
  const [daysBack, setDaysBack] = useState(3);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [searchFilter, setSearchFilter] = useState('');
  const [specificDate, setSpecificDate] = useState<Date | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [repeatingKey, setRepeatingKey] = useState<string | null>(null); // "vehicleId|date"

  const dateRange = useMemo(() => {
    if (specificDate) {
      return [format(specificDate, 'yyyy-MM-dd')];
    }
    const today = startOfDay(new Date());
    const start = subDays(today, daysBack - 1);
    return eachDayOfInterval({ start, end: today }).map(d => format(d, 'yyyy-MM-dd')).reverse();
  }, [daysBack, specificDate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id, code, name, description, category, company, unit, status')
        .or('status.eq.ativo,status.is.null')
        .order('code');

      if (vehicleData) setVehicles(vehicleData);

      const codeToId: Record<string, string> = {};
      if (vehicleData) {
        for (const v of vehicleData) {
          codeToId[v.code.toLowerCase().trim()] = v.id;
        }
      }

      const oldestDate = dateRange[dateRange.length - 1];

      const [readingsRes, fuelRes, sheetData] = await Promise.all([
        supabase
          .from('horimeter_readings')
          .select('vehicle_id, reading_date, current_value, current_km, operator')
          .gte('reading_date', oldestDate)
          .order('reading_date', { ascending: false }),
        supabase
          .from('field_fuel_records')
          .select('vehicle_code, record_date, horimeter_current, km_current')
          .gte('record_date', oldestDate)
          .gt('horimeter_current', 0),
        getSheetData('Horimetros').catch(() => ({ headers: [], rows: [] })),
      ]);

      const sheetRows = sheetData?.rows || [];
      const rMap: Record<string, Set<string>> = {};
      const lrMap: Record<string, { date: string; value: number; km: number | null; operator?: string | null }> = {};

      if (readingsRes.data) {
        for (const r of readingsRes.data) {
          if (!rMap[r.vehicle_id]) rMap[r.vehicle_id] = new Set();
          rMap[r.vehicle_id].add(r.reading_date);
          if (!lrMap[r.vehicle_id]) {
            lrMap[r.vehicle_id] = { date: r.reading_date, value: r.current_value, km: r.current_km, operator: r.operator };
          }
        }
      }

      if (fuelRes.data && vehicleData) {
        for (const fr of fuelRes.data) {
          const vid = codeToId[fr.vehicle_code?.toLowerCase().trim()];
          if (!vid) continue;
          if (!rMap[vid]) rMap[vid] = new Set();
          rMap[vid].add(fr.record_date);
          if (!lrMap[vid]) {
            lrMap[vid] = { date: fr.record_date, value: fr.horimeter_current ?? 0, km: fr.km_current ?? null };
          }
        }
      }

      if (sheetRows.length > 0) {
        const sample = sheetRows[0];
        const dateCol = findCol(sample, ['Data', 'DATE', 'data']);
        const codeCol = findCol(sample, ['Código', 'Codigo', 'Cod', 'codigo', 'código', 'COD']);
        const horCol = findCol(sample, ['Horímetro Atual', 'Horimetro Atual', 'Hor. Atual', 'Hor Atual', 'Horímetro atual', 'H. Atual']);
        const kmCol = findCol(sample, ['KM Atual', 'Km Atual', 'km atual', 'KM atual']);

        if (dateCol && codeCol) {
          for (const row of sheetRows) {
            const dateStr = parseSheetDate(row[dateCol]);
            if (!dateStr) continue;
            if (dateStr < oldestDate) continue;

            const code = String(row[codeCol] || '').trim().toLowerCase();
            const vid = codeToId[code];
            if (!vid) continue;

            if (!rMap[vid]) rMap[vid] = new Set();
            rMap[vid].add(dateStr);

            if (!lrMap[vid] && horCol) {
              const horVal = parsePtBRNumber(row[horCol]);
              const kmVal = kmCol ? parsePtBRNumber(row[kmCol]) : null;
              if (horVal > 0) {
                lrMap[vid] = { date: dateStr, value: horVal, km: kmVal };
              }
            }
          }
        }
      }

      if (vehicleData) {
        const missingVehicleIds = vehicleData
          .filter(v => !lrMap[v.id])
          .map(v => v.id);

        if (missingVehicleIds.length > 0) {
          const { data: lastReadings } = await supabase
            .from('horimeter_readings')
            .select('vehicle_id, reading_date, current_value, current_km, operator')
            .in('vehicle_id', missingVehicleIds)
            .order('reading_date', { ascending: false })
            .limit(missingVehicleIds.length * 2);

          if (lastReadings) {
            for (const r of lastReadings) {
              if (!lrMap[r.vehicle_id]) {
                lrMap[r.vehicle_id] = { date: r.reading_date, value: r.current_value, km: r.current_km, operator: r.operator };
              }
            }
          }
        }
      }

      setReadingsMap(rMap);
      setLastReadingMap(lrMap);

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

  // "Repetir anterior" - clone last reading values for this vehicle on the given date
  const handleRepeatPrevious = useCallback(async (vehicle: Vehicle, dateStr: string) => {
    const last = lastReadingMap[vehicle.id];
    if (!last || (last.value <= 0 && (last.km ?? 0) <= 0)) {
      toast.error('Sem leitura anterior para repetir');
      return;
    }

    const key = `${vehicle.id}|${dateStr}`;
    setRepeatingKey(key);

    try {
      // 1) Insert into horimeter_readings
      const { error: dbError } = await supabase
        .from('horimeter_readings')
        .insert({
          vehicle_id: vehicle.id,
          reading_date: dateStr,
          current_value: last.value,
          previous_value: last.value,
          current_km: last.km ?? null,
          previous_km: last.km ?? null,
          operator: last.operator || null,
          observations: 'Equipamento não trabalhou',
          source: 'field',
        });

      if (dbError) throw dbError;

      // 2) Sync to Google Sheets
      try {
        const [year, month, day] = dateStr.split('-');
        const formattedDate = `${day}/${month}/${year}`;
        const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';
        const interval = 0;

        const sheetPayload: Record<string, string> = {
          'Data': formattedDate,
          'Código': vehicle.code,
          'Descrição': vehicle.name,
          'Horímetro Anterior': fmtNum(last.value),
          'Horímetro Atual': fmtNum(last.value),
          'H.T': '0',
          'KM Anterior': fmtNum(last.km ?? 0),
          'KM Atual': fmtNum(last.km ?? 0),
          'Total KM': '0',
          'Operador/Motorista': last.operator || '',
          'Observação': 'Equipamento não trabalhou',
        };

        await supabase.functions.invoke('google-sheets', {
          body: { action: 'create', sheetName: 'Horimetros', data: sheetPayload },
        });
      } catch (sheetErr) {
        console.warn('Sheet sync failed (non-critical):', sheetErr);
      }

      // Update local state to remove from pending
      setReadingsMap(prev => {
        const next = { ...prev };
        if (!next[vehicle.id]) next[vehicle.id] = new Set();
        else next[vehicle.id] = new Set(next[vehicle.id]);
        next[vehicle.id].add(dateStr);
        return next;
      });

      const [year, month, day] = dateStr.split('-');
      toast.success(`${vehicle.code} - Leitura repetida para ${day}/${month}`);
    } catch (err: any) {
      console.error('Error repeating reading:', err);
      toast.error('Erro ao repetir leitura: ' + (err.message || ''));
    } finally {
      setRepeatingKey(null);
    }
  }, [lastReadingMap]);

  const pendingByDate = useMemo(() => {
    const search = searchFilter.toLowerCase().trim();
    const result: Record<string, PendingVehicle[]> = {};
    for (const dateStr of dateRange) {
      const pending: PendingVehicle[] = [];
      for (const v of vehicles) {
        const hasReading = readingsMap[v.id]?.has(dateStr);
        if (!hasReading) {
          if (search) {
            const matchName = v.name.toLowerCase().includes(search);
            const matchCode = v.code.toLowerCase().includes(search);
            const matchCategory = v.category?.toLowerCase().includes(search);
            const matchDesc = v.description?.toLowerCase().includes(search);
            if (!matchName && !matchCode && !matchCategory && !matchDesc) continue;
          }
          pending.push({
            vehicle: v,
            lastReading: lastReadingMap[v.id],
          });
        }
      }
      pending.sort((a, b) => {
        const nameCompare = a.vehicle.name.localeCompare(b.vehicle.name, 'pt-BR');
        if (nameCompare !== 0) return nameCompare;
        return a.vehicle.code.localeCompare(b.vehicle.code);
      });
      result[dateStr] = pending;
    }
    return result;
  }, [dateRange, vehicles, readingsMap, lastReadingMap, searchFilter]);

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

      {/* Search filter */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filtrar por descrição, código..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          className={cn("pl-9 h-10 text-sm", isDark ? "bg-slate-800 border-slate-700" : "")}
        />
        {searchFilter && (
          <button
            onClick={() => setSearchFilter('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Days filter + specific date */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Período:</span>
        {[3, 5, 7].map(d => (
          <Button
            key={d}
            size="sm"
            variant={!specificDate && daysBack === d ? 'default' : 'outline'}
            className="h-8 text-xs px-3"
            onClick={() => { setSpecificDate(undefined); setDaysBack(d); }}
          >
            {d} dias
          </Button>
        ))}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={specificDate ? 'default' : 'outline'}
              className="h-8 text-xs px-3 gap-1"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              {specificDate ? format(specificDate, 'dd/MM/yyyy') : 'Data'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={specificDate}
              onSelect={(date) => {
                setSpecificDate(date);
                setDatePickerOpen(false);
              }}
              disabled={(date) => date > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
        {specificDate && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs px-2"
            onClick={() => setSpecificDate(undefined)}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
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
                      pending.map(({ vehicle, lastReading }) => {
                        const isRepeating = repeatingKey === `${vehicle.id}|${dateStr}`;
                        const canRepeat = lastReading && (lastReading.value > 0 || (lastReading.km ?? 0) > 0);

                        return (
                          <div
                            key={vehicle.id}
                            className={cn(
                              "rounded-xl p-3 shadow-sm border",
                              isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200"
                            )}
                          >
                            <div className="flex items-center gap-3">
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
                              <div className="flex flex-col gap-1.5 shrink-0">
                                <Button
                                  size="sm"
                                  className="h-9 w-9 p-0 bg-amber-600 hover:bg-amber-700 text-white rounded-lg"
                                  onClick={() => onRegister(vehicle.id, dateStr)}
                                  title="Lançar manualmente"
                                >
                                  <Plus className="w-5 h-5" />
                                </Button>
                                {canRepeat && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className={cn(
                                      "h-9 w-9 p-0 rounded-lg text-blue-500 border-blue-300 hover:bg-blue-50",
                                      isDark && "border-blue-700 hover:bg-blue-900/30"
                                    )}
                                    onClick={() => handleRepeatPrevious(vehicle, dateStr)}
                                    disabled={isRepeating}
                                    title="Repetir anterior"
                                  >
                                    {isRepeating
                                      ? <Loader2 className="w-4 h-4 animate-spin" />
                                      : <Copy className="w-4 h-4" />
                                    }
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
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
