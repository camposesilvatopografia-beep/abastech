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

export function FieldHorimeterForm({ user, onBack }: FieldHorimeterFormProps) {
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const isDark = theme === 'dark';

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

  // Fetch previous reading when vehicle changes
  useEffect(() => {
    if (!selectedVehicleId) {
      setPreviousHorimeter(0);
      setPreviousKm(0);
      setVehicleHistory([]);
      return;
    }

    const fetchPrevious = async () => {
      const { data } = await supabase
        .from('horimeter_readings')
        .select('id, vehicle_id, reading_date, current_value, previous_value, current_km, previous_km, operator, observations')
        .eq('vehicle_id', selectedVehicleId)
        .order('reading_date', { ascending: false })
        .limit(5);

      if (data && data.length > 0) {
        setPreviousHorimeter(data[0].current_value || 0);
        setPreviousKm(data[0].current_km || 0);
        setVehicleHistory(data);
      } else {
        setPreviousHorimeter(0);
        setPreviousKm(0);
        setVehicleHistory([]);
      }
    };
    fetchPrevious();
  }, [selectedVehicleId]);

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
          await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'create',
              sheetName: 'Horimetros',
              data: {
                'Data': formattedDate,
                'Veiculo': vehicle.code,
                'Categoria': vehicle.category || '',
                'Descricao': vehicle.name || '',
                'Empresa': vehicle.company || '',
                'Operador': operador || '',
                'Hor_Anterior': previousHorimeter ? previousHorimeter.toString().replace('.', ',') : '',
                'Hor_Atual': horNum > 0 ? horNum.toString().replace('.', ',') : '',
                'Km_Anterior': previousKm ? previousKm.toString().replace('.', ',') : '',
                'Km_Atual': kmNum > 0 ? kmNum.toString().replace('.', ',') : '',
                'Observacao': observacao || '',
              },
            },
          });
        }
      } catch (syncErr) {
        console.error('Erro ao sincronizar com planilha:', syncErr);
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

  const sectionClass = (color: string) => cn(
    "rounded-xl p-4 space-y-3 shadow-md",
    isDark ? `bg-slate-800/80 border border-slate-700` : `bg-white border border-slate-200`
  );

  return (
    <div className={cn("p-4 pb-24 space-y-4", isDark ? "text-white" : "text-slate-900")}>
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
