import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Save,
  Truck,
  User,
  Gauge,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Search,
  ChevronsUpDown,
  Check,
  CalendarIcon,
  TrendingUp,
  History,
  Plus,
  List,
  ArrowRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { CurrencyInput } from '@/components/ui/currency-input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, startOfDay, isAfter, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface Vehicle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  company: string | null;
  unit: string;
}

interface HorimeterReading {
  id: string;
  vehicle_id: string;
  reading_date: string;
  current_value: number;
  previous_value: number | null;
  current_km: number | null;
  previous_km: number | null;
  operator: string | null;
  observations: string | null;
}

interface FieldHorimeterFormProps {
  user: FieldUser;
  onBack: () => void;
}
// Expandable date group for records view
function DateGroup({ dateKey, readings, isDark, getVehicleCode, getVehicleName }: {
  dateKey: string;
  readings: HorimeterReading[];
  isDark: boolean;
  getVehicleCode: (id: string) => string;
  getVehicleName: (id: string) => string;
}) {
  const [expanded, setExpanded] = useState(true);
  const dateLabel = format(new Date(dateKey + 'T12:00:00'), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold",
          isDark ? "bg-slate-700/60 text-slate-200" : "bg-slate-100 text-slate-700"
        )}
      >
        <span className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4" />
          {dateLabel}
          <span className="text-xs font-normal opacity-60">({readings.length})</span>
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <div className="space-y-2 mt-2 ml-1">
          {readings.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-xl p-3 space-y-1 shadow-sm border",
                isDark ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-amber-500">{getVehicleCode(r.vehicle_id)}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{getVehicleName(r.vehicle_id)}</div>
              <div className="flex items-center gap-4 text-sm">
                {r.current_value > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <strong>{r.current_value.toLocaleString('pt-BR')}h</strong>
                  </span>
                )}
                {(r.current_km ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-blue-500" />
                    <strong>{(r.current_km ?? 0).toLocaleString('pt-BR')} km</strong>
                  </span>
                )}
              </div>
              {r.operator && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <User className="w-3 h-3" /> {r.operator}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldHorimeterForm({ user, onBack }: FieldHorimeterFormProps) {
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const isDark = theme === 'dark';
  const [subView, setSubView] = useState<'menu' | 'form' | 'records'>('menu');
  const [allReadings, setAllReadings] = useState<HorimeterReading[]>([]);
  const [loadingReadings, setLoadingReadings] = useState(false);

  // Form state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [horimeterValue, setHorimeterValue] = useState<number | null>(null);
  const [kmValue, setKmValue] = useState<number | null>(null);
  const [operador, setOperador] = useState(user.name);
  const [observacao, setObservacao] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Previous values (auto-filled)
  const [previousHorimeter, setPreviousHorimeter] = useState(0);
  const [previousKm, setPreviousKm] = useState(0);

  // History
  const [vehicleHistory, setVehicleHistory] = useState<HorimeterReading[]>([]);

  // Fetch vehicles
  useEffect(() => {
    const fetchVehicles = async () => {
      setVehiclesLoading(true);
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, code, name, description, category, company, unit')
        .order('code');
      if (!error && data) setVehicles(data);
      setVehiclesLoading(false);
    };
    fetchVehicles();
  }, []);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedVehicleId), [vehicles, selectedVehicleId]);

  // Fetch previous reading from multiple sources when vehicle changes
  useEffect(() => {
    if (!selectedVehicleId) {
      setPreviousHorimeter(0);
      setPreviousKm(0);
      setVehicleHistory([]);
      setOperador(user.name);
      return;
    }

    const fetchPrevious = async () => {
      // 1. Horimeter readings table
      const { data: horData } = await supabase
        .from('horimeter_readings')
        .select('id, vehicle_id, reading_date, current_value, previous_value, current_km, previous_km, operator, observations')
        .eq('vehicle_id', selectedVehicleId)
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      // 2. Also check field_fuel_records for the same vehicle code
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      let fuelHorimeter = 0;
      let fuelKm = 0;
      let fuelDate = '';
      let fuelOperator = '';

      if (vehicle) {
        const { data: fuelData } = await supabase
          .from('field_fuel_records')
          .select('horimeter_current, km_current, record_date, record_time, operator_name')
          .eq('vehicle_code', vehicle.code)
          .order('record_date', { ascending: false })
          .order('record_time', { ascending: false })
          .limit(1);

        if (fuelData && fuelData.length > 0) {
          fuelHorimeter = fuelData[0].horimeter_current || 0;
          fuelKm = fuelData[0].km_current || 0;
          fuelDate = fuelData[0].record_date || '';
          fuelOperator = fuelData[0].operator_name || '';
        }
      }

      // Determine the latest values and operator across sources
      let bestHor = 0;
      let bestKm = 0;
      let bestOperator = '';

      if (horData && horData.length > 0) {
        bestHor = horData[0].current_value || 0;
        bestKm = horData[0].current_km || 0;
        bestOperator = horData[0].operator || '';
        const horDate = horData[0].reading_date || '';

        // If fuel record is more recent, use its values
        if (fuelDate > horDate) {
          if (fuelHorimeter > 0) bestHor = Math.max(bestHor, fuelHorimeter);
          if (fuelKm > 0) bestKm = Math.max(bestKm, fuelKm);
          if (fuelOperator) bestOperator = fuelOperator;
        }
      } else {
        bestHor = fuelHorimeter;
        bestKm = fuelKm;
        bestOperator = fuelOperator;
      }

      setPreviousHorimeter(bestHor);
      setPreviousKm(bestKm);
      setVehicleHistory(horData || []);

      // Auto-fill operator from the most recent record, fallback to logged-in user
      setOperador(bestOperator || user.name);
    };
    fetchPrevious();
  }, [selectedVehicleId, vehicles, user.name]);

  // Filtered vehicles for search
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return vehicles;
    const search = vehicleSearch.toLowerCase();
    return vehicles
      .filter(v =>
        v.code.toLowerCase().includes(search) ||
        v.name.toLowerCase().includes(search) ||
        (v.description || '').toLowerCase().includes(search) ||
        (v.category || '').toLowerCase().includes(search)
      )
      .sort((a, b) => {
        const aStarts = a.code.toLowerCase().startsWith(search) ? -1 : 0;
        const bStarts = b.code.toLowerCase().startsWith(search) ? -1 : 0;
        return aStarts - bStarts;
      });
  }, [vehicles, vehicleSearch]);

  // Check duplicate
  const hasDuplicate = useMemo(() => {
    if (!selectedVehicleId || !selectedDate) return false;
    return vehicleHistory.some(r => {
      const rDate = new Date(r.reading_date + 'T00:00:00');
      return isSameDay(rDate, selectedDate);
    });
  }, [selectedVehicleId, selectedDate, vehicleHistory]);

  // Intervals
  const intervalHor = (horimeterValue ?? 0) > 0 && previousHorimeter > 0 ? (horimeterValue ?? 0) - previousHorimeter : 0;
  const intervalKm = (kmValue ?? 0) > 0 && previousKm > 0 ? (kmValue ?? 0) - previousKm : 0;

  const handleSave = async () => {
    if (!selectedVehicleId) {
      toast.error('Selecione um veículo');
      return;
    }

    const today = startOfDay(new Date());
    if (isAfter(startOfDay(selectedDate), today)) {
      toast.error('Não é permitido registrar datas futuras');
      return;
    }

    if (hasDuplicate) {
      toast.error('Já existe um registro para este veículo nesta data');
      return;
    }

    const horNum = horimeterValue ?? 0;
    const kmNum = kmValue ?? 0;

    if (horNum <= 0 && kmNum <= 0) {
      toast.error('Informe pelo menos um valor (Horímetro ou KM)');
      return;
    }

    setIsSaving(true);
    try {
      const readingDate = format(selectedDate, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('horimeter_readings')
        .insert({
          vehicle_id: selectedVehicleId,
          reading_date: readingDate,
          current_value: horNum > 0 ? horNum : 0,
          previous_value: previousHorimeter > 0 ? previousHorimeter : null,
          current_km: kmNum > 0 ? kmNum : null,
          previous_km: previousKm > 0 ? previousKm : null,
          operator: operador || null,
          observations: observacao || null,
          source: 'field',
        })
        .select('*, vehicle:vehicles(*)')
        .single();

      if (error) throw error;

      // Create inconsistency alerts if needed
      if (horNum > 0 && previousHorimeter > 0 && horNum <= previousHorimeter) {
        await supabase.from('horimeter_inconsistency_alerts').insert({
          vehicle_id: selectedVehicleId,
          vehicle_code: selectedVehicle?.code || '',
          vehicle_name: selectedVehicle?.name || '',
          reading_id: data.id,
          reading_date: readingDate,
          value_type: 'horimeter',
          current_value: horNum,
          previous_value: previousHorimeter,
          difference: horNum - previousHorimeter,
          operator: operador || null,
        });
      }
      if (kmNum > 0 && previousKm > 0 && kmNum <= previousKm) {
        await supabase.from('horimeter_inconsistency_alerts').insert({
          vehicle_id: selectedVehicleId,
          vehicle_code: selectedVehicle?.code || '',
          vehicle_name: selectedVehicle?.name || '',
          reading_id: data.id,
          reading_date: readingDate,
          value_type: 'km',
          current_value: kmNum,
          previous_value: previousKm,
          difference: kmNum - previousKm,
          operator: operador || null,
        });
      }

      // Sync to Google Sheets
      try {
        const vehicle = (data as any).vehicle;
        if (vehicle) {
          const [year, month, day] = readingDate.split('-');
          const formattedDate = `${day}/${month}/${year}`;
          
          // Map to exact sheet headers (B1:ZZ1 in the Horimetros sheet)
          // Headers must match exactly what's in the sheet
          const sheetData: Record<string, string> = {
            'Data': formattedDate,
            'Codigo': vehicle.code || '',
            'Veiculo': vehicle.code || '',
            'Categoria': vehicle.category || '',
            'Descricao': vehicle.name || '',
            'Empresa': vehicle.company || '',
            'Operador': operador || '',
            'Hor_Anterior': previousHorimeter ? previousHorimeter.toString().replace('.', ',') : '',
            'Hor_Atual': horNum > 0 ? horNum.toString().replace('.', ',') : '',
            'H.T': intervalHor > 0 ? intervalHor.toString().replace('.', ',') : '',
            'Km_Anterior': previousKm ? previousKm.toString().replace('.', ',') : '',
            'Km_Atual': kmNum > 0 ? kmNum.toString().replace('.', ',') : '',
            'Total KM': intervalKm > 0 ? intervalKm.toString().replace('.', ',') : '',
            'Observacao': observacao || '',
          };

          console.log('Syncing horimeter to sheet with data:', JSON.stringify(sheetData));
          
          const { data: syncResult, error: syncError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'create',
              sheetName: 'Horimetros',
              data: sheetData,
            },
          });

          if (syncError) {
            console.error('Erro ao sincronizar com planilha:', syncError);
            toast.error('Registro salvo, mas falhou ao sincronizar com a planilha Horimetros.');
          } else {
            console.log('Horimeter synced to sheet successfully:', syncResult);
          }
        }
      } catch (syncErr) {
        console.error('Erro ao sincronizar com planilha:', syncErr);
        toast.error('Registro salvo, mas falhou ao sincronizar com a planilha. Verifique se a aba "Horimetros" existe.');
      }

      // Success feedback
      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      toast.success('Horímetro registrado com sucesso!');

      // Reset for next entry
      setHorimeterValue(null);
      setKmValue(null);
      setObservacao('');
      // Refresh previous values
      setPreviousHorimeter(horNum > 0 ? horNum : previousHorimeter);
      setPreviousKm(kmNum > 0 ? kmNum : previousKm);

    } catch (err: any) {
      console.error('Erro ao salvar horímetro:', err);
      toast.error(err.message || 'Erro ao salvar registro');
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch all recent readings for Records view
  const fetchAllReadings = useCallback(async () => {
    setLoadingReadings(true);
    try {
      const { data, error } = await supabase
        .from('horimeter_readings')
        .select('id, vehicle_id, reading_date, current_value, previous_value, current_km, previous_km, operator, observations')
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        setAllReadings(data as HorimeterReading[]);
      }
    } catch (err) {
      console.error('Error fetching readings:', err);
    } finally {
      setLoadingReadings(false);
    }
  }, []);

  useEffect(() => {
    if (subView === 'records') {
      fetchAllReadings();
    }
  }, [subView, fetchAllReadings]);

  const sectionClass = (color: string) => cn(
    "rounded-xl p-4 space-y-3 shadow-md",
    isDark ? `bg-slate-800/80 border border-slate-700` : `bg-white border border-slate-200`
  );

  const getVehicleCode = (vehicleId: string) => {
    const v = vehicles.find(veh => veh.id === vehicleId);
    return v ? v.code : vehicleId.slice(0, 8);
  };

  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find(veh => veh.id === vehicleId);
    return v ? v.name : '';
  };

  // Group readings by date for records view (must be before conditional returns)
  const groupedByDate = useMemo(() => {
    const groups: Record<string, typeof allReadings> = {};
    for (const r of allReadings) {
      const dateKey = r.reading_date;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(r);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [allReadings]);

  // MENU VIEW
  if (subView === 'menu') {
    return (
      <div className={cn("p-4 space-y-4", isDark ? "text-white" : "text-slate-900")}>
        <div className="space-y-3">
          <button
            onClick={() => setSubView('form')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-700 text-white shadow-lg shadow-amber-500/30 active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Plus className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-base font-bold block">Lançar Horímetro</span>
              <span className="text-xs opacity-80">Registrar nova leitura de horímetro/KM</span>
            </div>
            <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
          </button>

          <button
            onClick={() => setSubView('records')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <List className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-base font-bold block">Registros</span>
              <span className="text-xs opacity-80">Consultar lançamentos de horímetro</span>
            </div>
            <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  // RECORDS VIEW - grouped by date, expandable
  if (subView === 'records') {
    return (
      <div className={cn("p-4 space-y-4 pb-8", isDark ? "text-white" : "text-slate-900")}>
        <button
          onClick={() => setSubView('menu')}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Voltar
        </button>

        <h2 className="text-lg font-bold flex items-center gap-2">
          <List className="w-5 h-5 text-blue-500" />
          Registros de Horímetro
        </h2>

        {loadingReadings ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : groupedByDate.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum registro encontrado
          </div>
        ) : (
          <div className="space-y-3">
            {groupedByDate.map(([dateKey, readings]) => (
              <DateGroup
                key={dateKey}
                dateKey={dateKey}
                readings={readings}
                isDark={isDark}
                getVehicleCode={getVehicleCode}
                getVehicleName={getVehicleName}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // FORM VIEW
  return (
    <div className={cn("p-4 pb-24 space-y-4", isDark ? "text-white" : "text-slate-900")}>
      <button
        onClick={() => setSubView('menu')}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Voltar
      </button>
      {/* Vehicle Selection */}
      <div className={sectionClass('blue')}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Veículo / Equipamento</h3>
        </div>

        <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                "w-full h-14 justify-between text-left font-medium text-base",
                isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-300",
                !selectedVehicleId && "text-muted-foreground"
              )}
            >
              {selectedVehicle ? (
                <span className="truncate">
                  <span className="font-bold">{selectedVehicle.code}</span> - {selectedVehicle.name}
                </span>
              ) : (
                "Selecione o veículo"
              )}
              <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Buscar veículo..."
                value={vehicleSearch}
                onValueChange={setVehicleSearch}
                autoFocus
              />
              <CommandList className="max-h-60">
                <CommandEmpty>Nenhum veículo encontrado</CommandEmpty>
                <CommandGroup>
                  {filteredVehicles.slice(0, 50).map(v => (
                    <CommandItem
                      key={v.id}
                      value={v.code}
                      onSelect={() => {
                        setSelectedVehicleId(v.id);
                        setVehicleOpen(false);
                        setVehicleSearch('');
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selectedVehicleId === v.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="font-bold">{v.code}</span>
                        <span className="text-xs text-muted-foreground">{v.name} {v.category ? `• ${v.category}` : ''}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selectedVehicle && (
          <div className={cn("text-sm rounded-lg p-2", isDark ? "bg-slate-700/50" : "bg-blue-50")}>
            <span className="font-medium">{selectedVehicle.category || 'Equipamento'}</span>
            {selectedVehicle.company && <span className="ml-2 opacity-70">• {selectedVehicle.company}</span>}
          </div>
        )}

        {/* Previous readings summary */}
        {selectedVehicle && (previousHorimeter > 0 || previousKm > 0) && (
          <div className={cn(
            "rounded-lg p-3 border",
            isDark ? "bg-slate-700/30 border-slate-600" : "bg-slate-50 border-slate-200"
          )}>
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <History className="w-3.5 h-3.5" />
              Último registro
            </div>
            <div className="flex items-center gap-4">
              {previousHorimeter > 0 && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span className={cn("font-bold text-base", isDark ? "text-amber-400" : "text-amber-700")}>
                    {previousHorimeter.toLocaleString('pt-BR')}h
                  </span>
                </div>
              )}
              {previousKm > 0 && (
                <div className="flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-blue-500" />
                  <span className={cn("font-bold text-base", isDark ? "text-blue-400" : "text-blue-700")}>
                    {previousKm.toLocaleString('pt-BR')} km
                  </span>
                </div>
              )}
            </div>
            {vehicleHistory.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                em {format(new Date(vehicleHistory[0].reading_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                {vehicleHistory[0].operator && ` • ${vehicleHistory[0].operator}`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date Selection */}
      <div className={sectionClass('slate')}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-slate-600 flex items-center justify-center">
            <CalendarIcon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Data da Leitura</h3>
        </div>

        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full h-12 justify-start text-left font-medium",
                isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-300"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  setSelectedDate(date);
                  setDateOpen(false);
                }
              }}
              locale={ptBR}
              disabled={(date) => isAfter(startOfDay(date), startOfDay(new Date()))}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Horimeter Values */}
      <div className={sectionClass('amber')}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Horímetro (Horas)</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs opacity-70">Anterior</Label>
            <div className={cn(
              "h-12 flex items-center rounded-lg px-3 font-bold text-lg",
              isDark ? "bg-slate-700/50 text-amber-400" : "bg-amber-50 text-amber-700"
            )}>
              {previousHorimeter > 0 ? previousHorimeter.toLocaleString('pt-BR') : '—'}
            </div>
          </div>
          <div>
            <Label className="text-xs opacity-70">Atual *</Label>
            <CurrencyInput
              value={horimeterValue}
              onChange={setHorimeterValue}
              placeholder="0,00"
              className={cn(
                "h-12 text-lg font-bold",
                isDark ? "bg-slate-700 border-slate-600 text-white" : ""
              )}
            />
          </div>
        </div>

        {intervalHor !== 0 && (
          <div className={cn(
            "flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2",
            intervalHor > 0
              ? isDark ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700"
              : isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-700"
          )}>
            <TrendingUp className="w-4 h-4" />
            H.T.: {intervalHor.toLocaleString('pt-BR')} h
            {intervalHor < 0 && <AlertCircle className="w-4 h-4 ml-1" />}
          </div>
        )}
      </div>

      {/* KM Values */}
      <div className={sectionClass('blue')}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Gauge className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Quilometragem (KM)</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs opacity-70">Anterior</Label>
            <div className={cn(
              "h-12 flex items-center rounded-lg px-3 font-bold text-lg",
              isDark ? "bg-slate-700/50 text-blue-400" : "bg-blue-50 text-blue-700"
            )}>
              {previousKm > 0 ? previousKm.toLocaleString('pt-BR') : '—'}
            </div>
          </div>
          <div>
            <Label className="text-xs opacity-70">Atual</Label>
            <CurrencyInput
              value={kmValue}
              onChange={setKmValue}
              placeholder="0,00"
              className={cn(
                "h-12 text-lg font-bold",
                isDark ? "bg-slate-700 border-slate-600 text-white" : ""
              )}
            />
          </div>
        </div>

        {intervalKm !== 0 && (
          <div className={cn(
            "flex items-center gap-2 text-sm font-medium rounded-lg px-3 py-2",
            intervalKm > 0
              ? isDark ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700"
              : isDark ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-700"
          )}>
            <TrendingUp className="w-4 h-4" />
            Total KM: {intervalKm.toLocaleString('pt-BR')} km
            {intervalKm < 0 && <AlertCircle className="w-4 h-4 ml-1" />}
          </div>
        )}
      </div>

      {/* Operator */}
      <div className={sectionClass('slate')}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-slate-500 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Operador</h3>
        </div>
        <Input
          value={operador}
          onChange={(e) => setOperador(e.target.value)}
          placeholder="Nome do operador"
          className={cn("h-12 text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "")}
        />
      </div>

      {/* Observations */}
      <div className={sectionClass('slate')}>
        <Label className="text-sm font-medium">Observações</Label>
        <Textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observações adicionais..."
          rows={3}
          className={cn("text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "")}
        />
      </div>

      {/* Vehicle History */}
      {vehicleHistory.length > 0 && (
        <div className={sectionClass('slate')}>
          <div className="flex items-center gap-2 mb-2">
            <History className="w-4 h-4 opacity-70" />
            <h3 className="font-medium text-sm">Últimas Leituras</h3>
          </div>
          <div className="space-y-2">
            {vehicleHistory.map((r) => {
              const [y, m, d] = r.reading_date.split('-');
              return (
                <div key={r.id} className={cn(
                  "flex justify-between items-center text-sm px-3 py-2 rounded-lg",
                  isDark ? "bg-slate-700/50" : "bg-slate-50"
                )}>
                  <span className="font-medium">{d}/{m}/{y}</span>
                  <div className="flex gap-3">
                    {r.current_value > 0 && (
                      <span className="text-amber-500 font-bold">{r.current_value.toLocaleString('pt-BR')}h</span>
                    )}
                    {(r.current_km ?? 0) > 0 && (
                      <span className="text-blue-500 font-bold">{(r.current_km ?? 0).toLocaleString('pt-BR')}km</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Duplicate warning */}
      {hasDuplicate && (
        <div className="flex items-center gap-2 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm font-medium">
          <AlertCircle className="w-5 h-5" />
          Já existe um registro para este veículo nesta data
        </div>
      )}

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900/95 to-slate-900/80 backdrop-blur-sm border-t border-slate-700/50">
        <Button
          onClick={handleSave}
          disabled={isSaving || !selectedVehicleId || hasDuplicate}
          className="w-full h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Salvar Horímetro
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
