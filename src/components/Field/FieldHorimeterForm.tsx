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
import { getSheetData } from '@/lib/googleSheets';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, startOfDay, isAfter, isSameDay } from 'date-fns';
import { FieldPendingHorimeters } from './FieldPendingHorimeters';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';

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
  const offlineStorage = useOfflineStorage(user.id);
  const isDark = theme === 'dark';
  const [subView, setSubView] = useState<'menu' | 'form' | 'records' | 'pendencias'>('menu');
  const [prefillVehicleId, setPrefillVehicleId] = useState('');
  const [prefillDate, setPrefillDate] = useState('');
  const [allReadings, setAllReadings] = useState<HorimeterReading[]>([]);
  const [loadingReadings, setLoadingReadings] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Form state
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const lastSavedDateRef = React.useRef<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [horimeterValue, setHorimeterValue] = useState<number | null>(null);
  const [kmValue, setKmValue] = useState<number | null>(null);
  const [operador, setOperador] = useState(user.name);
  const [observacao, setObservacao] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Previous values (auto-filled)
  const [previousHorimeter, setPreviousHorimeter] = useState(0);
  const [previousKm, setPreviousKm] = useState(0);
  const [lastRecordDate, setLastRecordDate] = useState<Date | null>(null);

  // History
  const [vehicleHistory, setVehicleHistory] = useState<HorimeterReading[]>([]);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch vehicles (with offline cache fallback)
  useEffect(() => {
    const fetchVehicles = async () => {
      setVehiclesLoading(true);
      try {
        const { data, error } = await supabase
          .from('vehicles')
          .select('id, code, name, description, category, company, unit')
          .order('code');
        if (!error && data && data.length > 0) {
          setVehicles(data);
          offlineStorage.cacheData('vehicles', data);
        } else {
          throw new Error('No data');
        }
      } catch {
        // Offline: load from cache
        try {
          const cached = await offlineStorage.getCachedData<Vehicle[]>('vehicles');
          if (cached) setVehicles(cached);
        } catch {}
      }
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
      setLastRecordDate(null);
      setVehicleHistory([]);
      setOperador(user.name);
      return;
    }

    let cancelled = false;

    const normalizeVehicleCode = (v: any) =>
      String(v ?? '').replace(/\u00A0/g, ' ').trim().toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, '');

    const normalizeKey = (k: string) =>
      k.trim().toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ');

    const getByNormalizedKey = (row: Record<string, any>, wanted: string[]) => {
      const wantedSet = new Set(wanted.map(normalizeKey));
      for (const [k, v] of Object.entries(row)) {
        if (wantedSet.has(normalizeKey(k))) return v;
      }
      return undefined;
    };

    const parseSheetDateTime = (rawDate: any, rawTime?: any): Date | null => {
      const toDateFromSerial = (serial: number): Date => {
        const utcMs = (serial - 25569) * 86400 * 1000;
        return new Date(utcMs);
      };
      let base: Date | null = null;
      if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
        base = toDateFromSerial(rawDate);
      } else {
        const dateStr = String(rawDate ?? '').trim();
        if (!dateStr) return null;
        if (/^\d+(\.\d+)?$/.test(dateStr)) {
          const serial = Number(dateStr);
          if (Number.isFinite(serial)) base = toDateFromSerial(serial);
        } else if (dateStr.includes('/')) {
          const [day, month, year] = dateStr.split('/').map(n => Number(n));
          if (!day || !month || !year) return null;
          base = new Date(year, month - 1, day, 12, 0, 0);
        } else {
          const parsed = new Date(dateStr);
          if (Number.isNaN(parsed.getTime())) return null;
          base = new Date(parsed);
        }
      }
      if (!base || Number.isNaN(base.getTime())) return null;
      base.setHours(12, 0, 0, 0);
      if (typeof rawTime === 'number' && Number.isFinite(rawTime) && rawTime >= 0 && rawTime < 1) {
        const totalMinutes = Math.round(rawTime * 24 * 60);
        base.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
      } else {
        const timeStr = String(rawTime ?? '').trim();
        if (timeStr) {
          const parts = timeStr.split(':');
          const h = Number(parts[0]);
          const m = Number(parts[1] ?? 0);
          if (!Number.isNaN(h)) base.setHours(h || 0, m || 0, 0, 0);
        }
      }
      return Number.isNaN(base.getTime()) ? null : base;
    };

    const fetchPrevious = async () => {
      interface Candidate { date: Date; hor: number; km: number; source: string; operator?: string; }
      const candidates: Candidate[] = [];
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (!vehicle) return;
      const targetCode = normalizeVehicleCode(vehicle.code);

      // Fetch operator from the "Veiculo" sheet's "Motorista" column
      let sheetMotorista = '';
      try {
        const veiculoSheet = await getSheetData('Veiculo', { noCache: false });
        const veiculoRow = (veiculoSheet.rows || []).find(row => {
          const code = normalizeVehicleCode(
            getByNormalizedKey(row as any, ['CODIGO', 'CÓDIGO', 'COD', 'VEICULO', 'VEÍCULO']) ?? ''
          );
          return code === targetCode;
        });
        if (veiculoRow) {
          sheetMotorista = String(
            getByNormalizedKey(veiculoRow as any, ['MOTORISTA', 'OPERADOR']) ?? ''
          ).trim();
        }
      } catch (e) { console.error('Error fetching Veiculo sheet for Motorista:', e); }

      // 1) horimeter_readings (DB)
      const { data: horData } = await supabase
        .from('horimeter_readings')
        .select('id, vehicle_id, reading_date, current_value, previous_value, current_km, previous_km, operator, observations')
        .eq('vehicle_id', selectedVehicleId)
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(5);

      if (horData && horData.length > 0) {
        const r = horData[0];
        candidates.push({
          date: new Date(r.reading_date + 'T12:00:00'),
          hor: r.current_value > 0 ? r.current_value : 0,
          km: (r.current_km ?? 0) > 0 ? r.current_km! : 0,
          source: 'db_horimeter',
          operator: r.operator || '',
        });
      }

      // 2) field_fuel_records (DB)
      try {
        const { data: fuelData } = await supabase
          .from('field_fuel_records')
          .select('record_date, record_time, horimeter_current, km_current, operator_name')
          .eq('vehicle_code', vehicle.code)
          .order('record_date', { ascending: false })
          .order('record_time', { ascending: false })
          .limit(1);
        if (fuelData?.[0]) {
          const fr = fuelData[0];
          candidates.push({
            date: new Date(fr.record_date + 'T' + (fr.record_time || '12:00') + ':00'),
            hor: fr.horimeter_current ?? 0,
            km: fr.km_current ?? 0,
            source: 'db_fuel',
            operator: fr.operator_name || '',
          });
        }
      } catch (e) { console.error('Error fetching fuel records:', e); }

      // 3) Google Sheets "AbastecimentoCanteiro01"
      try {
        const sheetData = await getSheetData('AbastecimentoCanteiro01', { noCache: true });
        const vehicleRecords = (sheetData.rows || [])
          .filter(row => normalizeVehicleCode(getByNormalizedKey(row as any, ['VEICULO', 'VEÍCULO', 'CODIGO', 'CÓDIGO', 'COD'])) === targetCode)
          .map(row => {
            const dateTime = parseSheetDateTime(
              getByNormalizedKey(row as any, ['DATA', 'DATE']),
              getByNormalizedKey(row as any, ['HORA', 'TIME'])
            );
            return {
              dateTime,
              hor: parsePtBRNumber(String(getByNormalizedKey(row as any, ['HORIMETRO ATUAL', 'HORIMETRO ATUA', 'HOR_ATUAL', 'HORIMETRO']) || '0')),
              km: parsePtBRNumber(String(getByNormalizedKey(row as any, ['KM ATUAL', 'KM_ATUAL', 'KM']) || '0')),
            };
          })
          .filter(r => !!r.dateTime && (r.hor > 0 || r.km > 0))
          .sort((a, b) => (b.dateTime!.getTime()) - (a.dateTime!.getTime()));
        if (vehicleRecords.length > 0) {
          candidates.push({ date: vehicleRecords[0].dateTime!, hor: vehicleRecords[0].hor, km: vehicleRecords[0].km, source: 'sheet_abastecimento' });
        }
      } catch (e) { console.error('Error fetching AbastecimentoCanteiro01:', e); }

      // 4) Google Sheets "Horimetros"
      try {
        const sheetData = await getSheetData('Horimetros', { noCache: true });
        const vehicleRows = (sheetData.rows || [])
          .filter(row => normalizeVehicleCode(getByNormalizedKey(row as any, ['VEICULO', 'VEÍCULO', 'CODIGO', 'CÓDIGO']) ?? '') === targetCode)
          .map(row => {
            const dateTime = parseSheetDateTime(getByNormalizedKey(row as any, ['DATA', 'DATE']));
            return {
              dateTime,
              hor: parsePtBRNumber(String(getByNormalizedKey(row as any, ['HORIMETRO ATUAL']) || '0')),
              km: parsePtBRNumber(String(getByNormalizedKey(row as any, ['KM ATUAL']) || '0')),
            };
          })
          .filter(r => !!r.dateTime && (r.hor > 0 || r.km > 0))
          .sort((a, b) => (b.dateTime!.getTime()) - (a.dateTime!.getTime()));
        if (vehicleRows.length > 0) {
          candidates.push({ date: vehicleRows[0].dateTime!, hor: vehicleRows[0].hor, km: vehicleRows[0].km, source: 'sheet_horimetros' });
        }
      } catch (e) { console.error('Error fetching Horimetros sheet:', e); }

      // Pick most recent candidate (sheets win ties)
      if (!cancelled && candidates.length > 0) {
        const sheetPriority: Record<string, number> = {
          'sheet_abastecimento': 2, 'sheet_horimetros': 2, 'db_fuel': 1, 'db_horimeter': 0,
        };
        candidates.sort((a, b) => {
          const timeDiff = b.date.getTime() - a.date.getTime();
          if (timeDiff !== 0) return timeDiff;
          return (sheetPriority[b.source] ?? 0) - (sheetPriority[a.source] ?? 0);
        });

        const winner = candidates[0];
        let finalHor = winner.hor;
        let finalKm = winner.km;
        if (finalHor <= 0) finalHor = candidates.find(c => c.hor > 0)?.hor || 0;
        if (finalKm <= 0) finalKm = candidates.find(c => c.km > 0)?.km || 0;

        setPreviousHorimeter(finalHor);
        setPreviousKm(finalKm);
        setLastRecordDate(winner.date);
        // Priority: Motorista from Veiculo sheet > operator from last record > user name
        setOperador(sheetMotorista || winner.operator || user.name);
      } else if (sheetMotorista) {
        // No previous records, but we have a driver from the Veiculo sheet
        setOperador(sheetMotorista);
      }

      setVehicleHistory(horData || []);
    };

    fetchPrevious();
    return () => { cancelled = true; };
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

    const vehicleCategory = selectedVehicle?.category?.toLowerCase() || '';
    const isVeiculo = vehicleCategory.includes('veiculo') || vehicleCategory.includes('veículo');
    const isEquipamento = vehicleCategory.includes('equipamento');

    if (isVeiculo && kmNum <= 0) {
      toast.error('Para veículos, o campo KM Atual é obrigatório');
      return;
    }

    if (isEquipamento && horNum <= 0) {
      toast.error('Para equipamentos, o campo Horímetro Atual é obrigatório');
      return;
    }

    if (!isVeiculo && !isEquipamento && horNum <= 0 && kmNum <= 0) {
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
        .select('id')
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

      // Sync to Google Sheets - use selectedVehicle from state (more reliable than join)
      try {
        if (selectedVehicle) {
          const [year, month, day] = readingDate.split('-');
          const formattedDate = `${day}/${month}/${year}`;
          
          // Format numbers in pt-BR (e.g., 1.150,27) for the spreadsheet
          const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';
          
          const semanticData: Record<string, string> = {
            'Data': formattedDate,
            'Veiculo': selectedVehicle.code || '',
            'Categoria': selectedVehicle.category || '',
            'Descricao': selectedVehicle.name || '',
            'Empresa': selectedVehicle.company || '',
            'Operador': operador || '',
            'Horimetro Anterior': previousHorimeter ? fmtNum(previousHorimeter) : '',
            'Horimetro Atual': fmtNum(horNum),
            'Intervalo H': fmtNum(intervalHor),
            'Km Anterior': previousKm ? fmtNum(previousKm) : '',
            'Km Atual': fmtNum(kmNum),
            'Total Km': fmtNum(intervalKm),
          };

          // Fetch actual sheet headers and map to exact names
          let sheetData = semanticData;
          try {
            const sheetInfo = await getSheetData('Horimetros', { noCache: false });
            const headers = sheetInfo.headers || [];
            if (headers.length > 0) {
              const normalizeH = (h: string) => h.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[\s_.]/g, '');
              const normalizedMap = new Map(headers.map(h => [normalizeH(h), h]));
              const mapped: Record<string, string> = {};
              for (const [key, value] of Object.entries(semanticData)) {
                const actual = normalizedMap.get(normalizeH(key));
                mapped[actual || key] = value;
              }
              sheetData = mapped;
            }
          } catch (e) {
            console.warn('Could not fetch sheet headers for mapping:', e);
          }

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
            toast.warning('⚠️ Registro salvo no banco, mas falhou ao sincronizar com a planilha Horimetros.', { duration: 5000 });
          } else {
            console.log('Horimeter synced to sheet successfully:', syncResult);
            // Mark as synced
            if (data?.id) {
              await supabase.from('horimeter_readings')
                .update({ synced_from_sheet: true })
                .eq('id', data.id);
            }
          }
        } else {
          console.warn('Vehicle data not available for sheet sync');
          toast.warning('⚠️ Dados do veículo indisponíveis para sincronizar com a planilha.', { duration: 5000 });
        }
      } catch (syncErr: any) {
        console.error('Erro ao sincronizar com planilha:', syncErr);
        toast.warning(`⚠️ Registro salvo no banco, mas erro na planilha: ${syncErr?.message || 'Verifique se a aba "Horimetros" existe.'}`, { duration: 5000 });
      }

      // Success feedback
      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      toast.success('✅ Horímetro registrado e sincronizado com sucesso!', { duration: 4000 });

      // Reset ALL form fields for new entry
      setSelectedVehicleId('');
      setVehicleSearch('');
      lastSavedDateRef.current = selectedDate;
      setSelectedDate(selectedDate);
      setHorimeterValue(null);
      setKmValue(null);
      setObservacao('');
      setOperador(user.name);
      setPreviousHorimeter(0);
      setPreviousKm(0);
      setVehicleHistory([]);

    } catch (err: any) {
      console.error('Erro ao salvar horímetro:', err);
      
      // Offline fallback: save to IndexedDB
      if (offlineStorage.isSupported) {
        try {
          await offlineStorage.saveOfflineRecord({
            vehicle_id: selectedVehicleId,
            vehicle_code: selectedVehicle?.code || '',
            vehicle_name: selectedVehicle?.name || '',
            vehicle_category: selectedVehicle?.category || '',
            vehicle_company: selectedVehicle?.company || '',
            reading_date: format(selectedDate, 'yyyy-MM-dd'),
            current_value: horimeterValue ?? 0,
            previous_value: previousHorimeter > 0 ? previousHorimeter : null,
            current_km: kmValue ?? null,
            previous_km: previousKm > 0 ? previousKm : null,
            operator: operador || null,
            observations: observacao || null,
          }, 'horimeter_reading');

          if (settings.soundEnabled) playSuccessSound();
          if (settings.vibrationEnabled) vibrateDevice();
          toast.success('📱 Salvo offline! Será sincronizado quando houver conexão.', {
            duration: 4000,
          });
          
          // Reset ALL form fields
          setSelectedVehicleId('');
          setVehicleSearch('');
          lastSavedDateRef.current = selectedDate;
          setSelectedDate(selectedDate);
          setHorimeterValue(null);
          setKmValue(null);
          setObservacao('');
          setOperador(user.name);
          setPreviousHorimeter(0);
          setPreviousKm(0);
          setVehicleHistory([]);
          return;
        } catch (offlineErr) {
          console.error('Offline save also failed:', offlineErr);
        }
      }
      
      const errorMsg = err?.message || err?.details || 'Erro desconhecido ao salvar';
      const errorHint = err?.hint ? ` (${err.hint})` : '';
      toast.error(`❌ Erro ao salvar: ${errorMsg}${errorHint}`, { duration: 6000 });
    } finally {
      setIsSaving(false);
    }
  };

  // Fetch all recent readings for Records view
  const fetchAllReadings = useCallback(async () => {
    setLoadingReadings(true);
    try {
      // Fetch all readings without limit to show all dates
      let allData: HorimeterReading[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from('horimeter_readings')
          .select('id, vehicle_id, reading_date, current_value, previous_value, current_km, previous_km, operator, observations')
          .order('reading_date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        if (data && data.length > 0) {
          allData = allData.concat(data as HorimeterReading[]);
          from += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
      
      setAllReadings(allData);
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
    // Apply prefill when switching to form from pendencias
    if (subView === 'form' && prefillVehicleId) {
      setSelectedVehicleId(prefillVehicleId);
      if (prefillDate) {
        setSelectedDate(new Date(prefillDate + 'T12:00:00'));
      }
      setPrefillVehicleId('');
      setPrefillDate('');
    }
  }, [subView, fetchAllReadings, prefillVehicleId, prefillDate]);

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

          <button
            onClick={() => setSubView('pendencias')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 text-white shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-transform text-left"
          >
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-base font-bold block">Pendências</span>
              <span className="text-xs opacity-80">Veículos sem lançamento por data</span>
            </div>
            <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  // PENDENCIAS VIEW
  if (subView === 'pendencias') {
    return (
      <FieldPendingHorimeters
        onBack={() => setSubView('menu')}
        onRegister={(vehicleId, date) => {
          setPrefillVehicleId(vehicleId);
          setPrefillDate(date);
          setSubView('form');
        }}
      />
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
                "w-full h-auto min-h-[3.5rem] justify-between text-left font-medium text-base py-2",
                isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-300",
                !selectedVehicleId && "text-muted-foreground"
              )}
            >
              {selectedVehicle ? (
                <div className="flex flex-col gap-0.5 min-w-0 overflow-hidden">
                  <span className="font-bold text-base truncate">{selectedVehicle.code}</span>
                  <span className="text-xs text-muted-foreground truncate">{selectedVehicle.name}</span>
                </div>
              ) : (
                "Selecione o veículo"
              )}
              <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className={cn(
              "w-[calc(100vw-2rem)] p-0 z-50",
              isDark ? "bg-slate-800 border-slate-700" : "bg-white"
            )} 
            align="start"
            side="bottom"
            sideOffset={4}
            avoidCollisions={false}
          >
            <Command className={isDark ? "bg-slate-800" : ""}>
              <CommandInput
                placeholder="Buscar por código ou nome..."
                value={vehicleSearch}
                onValueChange={setVehicleSearch}
                autoFocus
                className="h-12 text-base"
              />
              <CommandList className="max-h-[50vh]">
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
                    <Search className="w-5 h-5" />
                    <span className="text-sm">Nenhum veículo encontrado</span>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {filteredVehicles.slice(0, 50).map(v => (
                    <CommandItem
                      key={v.id}
                      value={`${v.code} ${v.name} ${v.category || ''}`}
                      onSelect={() => {
                        setSelectedVehicleId(v.id);
                        setVehicleOpen(false);
                        setVehicleSearch('');
                      }}
                      className={cn(
                        "py-3 px-3 cursor-pointer",
                        selectedVehicleId === v.id && (isDark ? "bg-green-900/30 border-l-2 border-green-500" : "bg-green-50 border-l-2 border-green-500")
                      )}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedVehicleId === v.id ? "opacity-100 text-green-500" : "opacity-0")} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{v.code}</span>
                          {v.category && (
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              v.category?.toLowerCase().includes('equip') 
                                ? (isDark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700")
                                : (isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700")
                            )}>
                              {v.category}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{v.name}</span>
                        {v.company && <span className="text-[10px] text-muted-foreground/70 truncate">{v.company}</span>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Vehicle info card */}
        {selectedVehicle && (
          <div className={cn(
            "rounded-xl p-3 border space-y-2",
            isDark ? "bg-slate-700/40 border-slate-600" : "bg-gradient-to-br from-blue-50 to-slate-50 border-blue-200"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-semibold",
                  selectedVehicle.category?.toLowerCase().includes('equip')
                    ? (isDark ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700")
                    : (isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700")
                )}>
                  {selectedVehicle.category || 'Equipamento'}
                </span>
                {selectedVehicle.company && (
                  <span className="text-xs text-muted-foreground">{selectedVehicle.company}</span>
                )}
              </div>
            </div>
            {selectedVehicle.description && selectedVehicle.description !== selectedVehicle.name && (
              <p className="text-xs text-muted-foreground">{selectedVehicle.description}</p>
            )}

            {/* Previous readings */}
            {(previousHorimeter > 0 || previousKm > 0) && (
              <div className={cn(
                "rounded-lg p-2.5 border mt-1",
                isDark ? "bg-slate-800/60 border-slate-600" : "bg-white/80 border-slate-200"
              )}>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                  <History className="w-3 h-3" />
                  Último Registro
                  {lastRecordDate && (
                    <span className={cn("ml-1 font-bold", isDark ? "text-green-400" : "text-green-700")}>
                      — {format(lastRecordDate, 'dd/MM/yyyy')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {previousHorimeter > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className={cn("font-bold text-sm", isDark ? "text-amber-400" : "text-amber-700")}>
                        {previousHorimeter.toLocaleString('pt-BR')}h
                      </span>
                    </div>
                  )}
                  {previousKm > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-blue-500" />
                      <span className={cn("font-bold text-sm", isDark ? "text-blue-400" : "text-blue-700")}>
                        {previousKm.toLocaleString('pt-BR')} km
                      </span>
                    </div>
                  )}
                </div>
                {vehicleHistory.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    em {format(new Date(vehicleHistory[0].reading_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    {vehicleHistory[0].operator && ` • ${vehicleHistory[0].operator}`}
                  </div>
                )}
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
