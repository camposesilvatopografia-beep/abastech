import { useState, useMemo, useCallback } from 'react';
import { format, subDays, startOfDay, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Check, Calendar, Filter, ListChecks, Eye, Copy, FileEdit, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Vehicle, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DatabaseHorimeterModal } from '@/components/Horimetros/DatabaseHorimeterModal';
import { VehicleCombobox, VehicleOption } from '@/components/ui/vehicle-combobox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatPtBRNumber } from '@/lib/ptBRNumber';
import { getSheetData } from '@/lib/googleSheets';

interface MissingReadingsTabProps {
  vehicles: Vehicle[];
  readings: HorimeterWithVehicle[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function MissingReadingsTab({ vehicles, readings, loading, refetch }: MissingReadingsTabProps) {
  const [daysBack, setDaysBack] = useState(7);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('ativo');
  const [searchFilter, setSearchFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'pendentes' | 'lancados' | 'todos'>('pendentes');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVehicleId, setModalVehicleId] = useState<string | undefined>(undefined);
  const [modalDate, setModalDate] = useState<string | undefined>(undefined);
  const [repeating, setRepeating] = useState(false);
  const [activePopover, setActivePopover] = useState<string | null>(null);

  // Date range
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    const start = startDate || subDays(today, daysBack - 1);
    const end = endDate || today;
    return eachDayOfInterval({ start, end }).sort((a, b) => b.getTime() - a.getTime());
  }, [daysBack, startDate, endDate]);

  // Unique companies and categories
  const companies = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => v.company && set.add(v.company));
    return Array.from(set).sort();
  }, [vehicles]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => v.category && set.add(v.category));
    return Array.from(set).sort();
  }, [vehicles]);

  // Vehicle options for combobox
  const vehicleOptions: VehicleOption[] = useMemo(() => {
    return vehicles.map(v => ({
      id: v.id,
      code: v.code,
      name: v.name,
      category: v.category || undefined,
    }));
  }, [vehicles]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      if (companyFilter !== 'all' && v.company?.toLowerCase() !== companyFilter.toLowerCase()) return false;
      if (categoryFilter !== 'all' && v.category?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
      if (statusFilter !== 'all' && v.status?.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (vehicleFilter !== 'all' && v.id !== vehicleFilter) return false;
      if (searchFilter) {
        const s = searchFilter.toLowerCase();
        if (!v.code.toLowerCase().includes(s) && !v.name.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [vehicles, companyFilter, categoryFilter, statusFilter, vehicleFilter, searchFilter]);

  // Build readings lookup: vehicleId|date -> reading
  const readingsMap = useMemo(() => {
    const map = new Map<string, HorimeterWithVehicle>();
    readings.forEach(r => {
      const key = `${r.vehicle_id}|${r.reading_date}`;
      const existing = map.get(key);
      if (!existing || r.created_at > existing.created_at) {
        map.set(key, r);
      }
    });
    return map;
  }, [readings]);

  // Per-date stats
  const dateStats = useMemo(() => {
    const stats = new Map<string, { total: number; filled: number; missing: number }>();
    dateRange.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      let filled = 0;
      let missing = 0;
      filteredVehicles.forEach(v => {
        const key = `${v.id}|${dateStr}`;
        if (readingsMap.has(key)) filled++;
        else missing++;
      });
      stats.set(dateStr, { total: filteredVehicles.length, filled, missing });
    });
    return stats;
  }, [dateRange, filteredVehicles, readingsMap]);

  // Per-vehicle stats
  const vehicleStats = useMemo(() => {
    const stats = new Map<string, { total: number; filled: number; missing: number }>();
    filteredVehicles.forEach(v => {
      let filled = 0;
      let missing = 0;
      dateRange.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const key = `${v.id}|${dateStr}`;
        if (readingsMap.has(key)) filled++;
        else missing++;
      });
      stats.set(v.id, { total: dateRange.length, filled, missing });
    });
    return stats;
  }, [filteredVehicles, dateRange, readingsMap]);

  // Vehicles to display
  const displayVehicles = useMemo(() => {
    if (viewMode === 'todos') return filteredVehicles;
    if (viewMode === 'lancados') {
      return filteredVehicles.filter(v => {
        const stats = vehicleStats.get(v.id);
        return stats && stats.filled > 0;
      });
    }
    // pendentes
    return filteredVehicles.filter(v => {
      const stats = vehicleStats.get(v.id);
      return stats && stats.missing > 0;
    });
  }, [filteredVehicles, viewMode, vehicleStats]);

  // Total missing count
  const totalMissing = useMemo(() => {
    let count = 0;
    dateStats.forEach(s => count += s.missing);
    return count;
  }, [dateStats]);

  const findPreviousReading = useCallback((vehicleId: string, dateStr: string): HorimeterWithVehicle | null => {
    // Find the most recent reading for this vehicle before dateStr
    const sorted = readings
      .filter(r => r.vehicle_id === vehicleId && r.reading_date < dateStr)
      .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
    return sorted[0] || null;
  }, [readings]);

  const handleCellClick = (vehicleId: string, dateStr: string) => {
    const key = `${vehicleId}|${dateStr}`;
    if (readingsMap.has(key)) return;
    setActivePopover(key);
  };

  const handleOpenForm = (vehicleId: string, dateStr: string) => {
    setActivePopover(null);
    setModalVehicleId(vehicleId);
    setModalDate(dateStr);
    setModalOpen(true);
  };

  const handleRepeatPrevious = async (vehicleId: string, dateStr: string) => {
    const prev = findPreviousReading(vehicleId, dateStr);
    if (!prev) {
      toast.error('Nenhum lançamento anterior encontrado para este equipamento.');
      setActivePopover(null);
      return;
    }
    setRepeating(true);
    try {
      const currHor = prev.current_value || 0;
      const currKm = (prev as any).current_km || 0;

      const { error } = await supabase.from('horimeter_readings').insert({
        vehicle_id: vehicleId,
        reading_date: dateStr,
        current_value: currHor,
        previous_value: currHor,
        current_km: currKm,
        previous_km: currKm,
        operator: 'Repetido (não trabalhou)',
        observations: `Repetido do dia ${prev.reading_date} - Equipamento não trabalhou`,
        source: 'system',
      });
      if (error) throw error;

      // Sync to Google Sheets
      try {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (vehicle) {
          const [year, month, day] = dateStr.split('-');
          const formattedDate = `${day}/${month}/${year}`;
          const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';

          // Build semantic data matching the Horimetros sheet structure
          const semanticData: Record<string, string> = {
            'Data': formattedDate,
            'Veiculo': vehicle.code,
            'Categoria': vehicle.category || '',
            'Descricao': vehicle.name || '',
            'Empresa': vehicle.company || '',
            'Operador': 'Repetido (não trabalhou)',
            'Horimetro Anterior': currHor > 0 ? fmtNum(currHor) : '',
            'Horimetro Atual': currHor > 0 ? fmtNum(currHor) : '',
            'Intervalo H': '0',
            'Km Anterior': currKm > 0 ? fmtNum(currKm) : '',
            'Km Atual': currKm > 0 ? fmtNum(currKm) : '',
            'Total Km': '0',
          };

          // Try to get actual headers for fuzzy matching
          let rowData = semanticData;
          try {
            const sheetData = await getSheetData('Horimetros', { noCache: false });
            const headers = sheetData.headers || [];
            if (headers.length > 0) {
              const normalizeHeader = (h: string) => h.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[\s_.]/g, '');
              const normalizedMap = new Map<string, string>();
              for (const h of headers) normalizedMap.set(normalizeHeader(h), h);
              const mapped: Record<string, string> = {};
              for (const [key, value] of Object.entries(semanticData)) {
                const actual = normalizedMap.get(normalizeHeader(key));
                mapped[actual || key] = value;
              }
              rowData = mapped;
            }
          } catch { /* use semantic keys as fallback */ }

          await supabase.functions.invoke('google-sheets', {
            body: { action: 'create', sheetName: 'Horimetros', data: rowData },
          });
          console.log('✓ Repetição sincronizada com planilha Horimetros');
        }
      } catch (syncErr) {
        console.error('Erro ao sincronizar repetição com planilha:', syncErr);
        // Don't block - DB save was successful
      }

      toast.success(`Lançamento repetido para ${format(new Date(dateStr + 'T12:00:00'), 'dd/MM/yyyy')}`);
      await refetch();
    } catch (err: any) {
      toast.error('Erro ao repetir lançamento: ' + (err.message || ''));
    } finally {
      setRepeating(false);
      setActivePopover(null);
    }
  };

  const handleModalSuccess = async () => {
    setModalOpen(false);
    setModalVehicleId(undefined);
    setModalDate(undefined);
    await refetch();
  };

  const formatBR = (val: number | null | undefined) => {
    if (!val) return '';
    const hasDecimals = val % 1 !== 0;
    return val.toLocaleString('pt-BR', { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">Total Pendentes</p>
            <p className="text-xl font-bold text-red-700 dark:text-red-300">{totalMissing}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-2">
          <Check className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Preenchidos</p>
            <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
              {Array.from(dateStats.values()).reduce((acc, s) => acc + s.filled, 0)}
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {displayVehicles.length} equipamentos • {dateRange.length} dias
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border p-3 flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-muted-foreground" />
        
        {/* Days back quick select */}
        <div className="flex gap-1">
          {[7, 14, 30].map(d => (
            <Button
              key={d}
              variant={daysBack === d && !startDate ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => { setDaysBack(d); setStartDate(undefined); setEndDate(undefined); }}
            >
              {d}d
            </Button>
          ))}
        </div>

        {/* Custom period */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant={startDate ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1">
              <Calendar className="w-3 h-3" />
              {startDate && endDate 
                ? `${format(startDate, 'dd/MM')} - ${format(endDate, 'dd/MM')}`
                : 'Período'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-background" align="start">
            <CalendarComponent
              mode="range"
              selected={startDate && endDate ? { from: startDate, to: endDate } : undefined}
              onSelect={(range) => {
                if (range?.from) setStartDate(range.from);
                if (range?.to) setEndDate(range.to);
              }}
              locale={ptBR}
              numberOfMonths={1}
            />
          </PopoverContent>
        </Popover>

        <div className="w-px h-6 bg-border" />

        {/* Vehicle filter combobox */}
        <div className="w-[200px]">
          <VehicleCombobox
            vehicles={vehicleOptions}
            value={vehicleFilter === 'all' ? '' : vehicleFilter}
            onValueChange={(val) => setVehicleFilter(val || 'all')}
            placeholder="Todos Veículos"
            useIdAsValue
            className="h-7 text-xs"
          />
        </div>

        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Empresas</SelectItem>
            {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-[100px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="mobilizado">Mobilizados</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar veículo..."
          value={searchFilter}
          onChange={e => setSearchFilter(e.target.value)}
          className="h-7 w-[140px] text-xs"
        />

        <div className="w-px h-6 bg-border" />

        <div className="flex gap-0.5 rounded-lg border p-0.5">
          {([
            { key: 'pendentes' as const, label: 'Pendentes', icon: AlertTriangle, color: 'text-red-500' },
            { key: 'lancados' as const, label: 'Lançados', icon: ListChecks, color: 'text-emerald-500' },
            { key: 'todos' as const, label: 'Todos', icon: Eye, color: 'text-blue-500' },
          ]).map(({ key, label, icon: Icon, color }) => (
            <Button
              key={key}
              variant={viewMode === key ? 'default' : 'ghost'}
              size="sm"
              className={cn("h-7 text-xs gap-1", viewMode !== key && color)}
              onClick={() => setViewMode(key)}
            >
              <Icon className="w-3 h-3" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Matrix table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <ScrollArea className="w-full">
          <div className="min-w-[600px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="sticky left-0 z-20 bg-muted/90 backdrop-blur-sm px-3 py-2 text-left font-semibold border-r min-w-[160px]">
                    Equipamento
                  </th>
                  <th className="px-2 py-2 text-center font-semibold border-r min-w-[40px]">
                    ⚠️
                  </th>
                  {dateRange.map(date => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const stats = dateStats.get(dateStr);
                    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
                    return (
                      <th 
                        key={dateStr}
                        className={cn(
                          "px-1 py-2 text-center font-medium border-r min-w-[65px]",
                          isToday && "bg-primary/10"
                        )}
                      >
                        <div className="text-[10px] text-muted-foreground">
                          {format(date, 'EEE', { locale: ptBR })}
                        </div>
                        <div className={cn("font-semibold", isToday && "text-primary")}>
                          {format(date, 'dd/MM')}
                        </div>
                        {stats && (
                          <div className={cn(
                            "text-[9px] mt-0.5 font-medium",
                            stats.missing > 0 ? "text-red-500" : "text-emerald-500"
                          )}>
                            {stats.missing > 0 ? `${stats.missing} faltam` : '✓'}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={dateRange.length + 2} className="text-center py-12 text-muted-foreground">
                      {viewMode === 'pendentes' 
                        ? '🎉 Nenhuma pendência encontrada! Todos os equipamentos têm lançamentos.'
                        : viewMode === 'lancados'
                        ? 'Nenhum lançamento encontrado para o período selecionado.'
                        : 'Nenhum equipamento encontrado com os filtros atuais.'}
                    </td>
                  </tr>
                ) : (
                  displayVehicles.map(vehicle => {
                    const vStats = vehicleStats.get(vehicle.id);
                    return (
                      <tr key={vehicle.id} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5 border-r">
                          <div className="font-semibold text-foreground">{vehicle.code}</div>
                          <div className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                            {vehicle.name}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center border-r">
                          {vStats && vStats.missing > 0 ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                              {vStats.missing}
                            </Badge>
                          ) : (
                            <span className="text-emerald-500 text-sm">✓</span>
                          )}
                        </td>
                        {dateRange.map(date => {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const key = `${vehicle.id}|${dateStr}`;
                          const reading = readingsMap.get(key);
                          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

                          if (reading) {
                            const val = reading.current_value;
                            const km = (reading as any).current_km;
                            return (
                              <td 
                                key={dateStr}
                                className={cn(
                                  "px-1 py-1.5 text-center border-r",
                                  isToday && "bg-primary/5"
                                )}
                                title={`Hor: ${formatBR(val)} | KM: ${formatBR(km)}\nOperador: ${reading.operator || '-'}`}
                              >
                                <div className="text-emerald-600 dark:text-emerald-400 font-medium text-[10px]">
                                  {val > 0 ? formatBR(val) : ''}
                                </div>
                                {km > 0 && (
                                  <div className="text-blue-500 text-[9px]">
                                    {formatBR(km)}
                                  </div>
                                )}
                                {!val && !km && (
                                  <span className="text-emerald-400 text-[10px]">✓</span>
                                )}
                              </td>
                            );
                          }

                          // Missing - clickable → opens popover with options
                          const popoverKey = `${vehicle.id}|${dateStr}`;
                          const prevReading = findPreviousReading(vehicle.id, dateStr);
                          return (
                            <td 
                              key={dateStr}
                              className={cn(
                                "px-1 py-1.5 text-center border-r",
                                "bg-red-50/50 dark:bg-red-950/20",
                                isToday && "bg-red-100/70 dark:bg-red-950/30"
                              )}
                            >
                              <Popover 
                                open={activePopover === popoverKey} 
                                onOpenChange={(open) => !open && setActivePopover(null)}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    className="w-full h-full cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/40 rounded transition-colors py-0.5"
                                    onClick={() => handleCellClick(vehicle.id, dateStr)}
                                    title={`Clique para lançar - ${vehicle.code} em ${format(date, 'dd/MM/yyyy')}`}
                                  >
                                    <div className="text-red-400 dark:text-red-600 text-lg leading-none">—</div>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" align="center" side="bottom">
                                  <div className="space-y-1">
                                    <p className="text-xs font-semibold text-foreground mb-2 truncate">
                                      {vehicle.code} — {format(date, 'dd/MM', { locale: ptBR })}
                                    </p>
                                    {prevReading && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start gap-2 h-8 text-xs"
                                        disabled={repeating}
                                        onClick={() => handleRepeatPrevious(vehicle.id, dateStr)}
                                      >
                                        <Copy className="w-3.5 h-3.5 text-amber-500" />
                                        <div className="text-left">
                                          <div>Repetir anterior</div>
                                          <div className="text-[10px] text-muted-foreground">
                                            Hor: {formatBR(prevReading.current_value)}
                                            {(prevReading as any).current_km > 0 && ` | KM: ${formatBR((prevReading as any).current_km)}`}
                                          </div>
                                        </div>
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-start gap-2 h-8 text-xs"
                                      onClick={() => handleOpenForm(vehicle.id, dateStr)}
                                    >
                                      <FileEdit className="w-3.5 h-3.5 text-primary" />
                                      Lançar manualmente
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-300" />
          Lançado
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-red-50 dark:bg-red-950/20 border border-red-300" />
          Pendente (clique para lançar)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-600 font-medium">123,45</span>
          Horímetro
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-blue-500 font-medium">456</span>
          KM
        </div>
      </div>

      {/* Modal for entering readings */}
      <DatabaseHorimeterModal
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setModalOpen(false);
            setModalVehicleId(undefined);
            setModalDate(undefined);
          }
        }}
        onSuccess={handleModalSuccess}
        initialVehicleId={modalVehicleId}
        initialDate={modalDate}
        externalReadings={readings}
      />
    </div>
  );
}
