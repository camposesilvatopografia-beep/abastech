import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { VehicleCombobox } from '@/components/ui/vehicle-combobox';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useVehicles, useHorimeterReadings, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { Clock, Save, History, AlertTriangle, RefreshCw, TrendingUp, CalendarIcon, X, ChevronUp, ChevronDown } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfDay, isSameDay, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';
import { supabase } from '@/integrations/supabase/client';
import { getSheetData } from '@/lib/googleSheets';

interface DatabaseHorimeterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialVehicleId?: string;
  initialDate?: string; // yyyy-MM-dd format
  editRecord?: HorimeterWithVehicle | null;
  externalReadings?: HorimeterWithVehicle[];
}

export function DatabaseHorimeterModal({
  open,
  onOpenChange,
  onSuccess,
  initialVehicleId,
  initialDate,
  editRecord,
  externalReadings,
}: DatabaseHorimeterModalProps) {
  const { vehicles, loading: vehiclesLoading } = useVehicles();
  const { readings: internalReadings, loading: readingsLoading, createReading, updateReading, refetch } = useHorimeterReadings();
  
  // Use external readings if provided (to stay in sync with parent), otherwise use internal
  const readings = externalReadings || internalReadings;
  const { toast } = useToast();
  
  const isEditMode = !!editRecord;
  
  const [selectedVehicleId, setSelectedVehicleId] = useState(initialVehicleId || '');
  const [horimeterValue, setHorimeterValue] = useState<number | null>(null);
  const [kmValue, setKmValue] = useState<number | null>(null);
  const [previousHorimeterValue, setPreviousHorimeterValue] = useState<number | null>(null);
  const [previousKmValue, setPreviousKmValue] = useState<number | null>(null);
  const [operador, setOperador] = useState('');
  const [observacao, setObservacao] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(initialDate ? new Date(initialDate + 'T12:00:00') : new Date());
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Selected vehicle info
  const selectedVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  // Vehicle history (last 5 readings) - show both Hor and KM
  const vehicleHistory = useMemo(() => {
    if (!selectedVehicleId) return [];
    
    return readings
      .filter(r => r.vehicle_id === selectedVehicleId)
      .sort((a, b) => b.reading_date.localeCompare(a.reading_date))
      .slice(0, 5)
      .map((r) => {
        // H.T. = current_value - previous_value from same row
        const prevHor = r.previous_value ?? 0;
        const currHor = r.current_value ?? 0;
        const intervaloHor = currHor - prevHor;
        
        // Total KM = current_km - previous_km from same row
        const prevKm = (r as any).previous_km ?? 0;
        const currKm = (r as any).current_km ?? 0;
        const intervaloKm = (currKm > 0 && prevKm >= 0) ? currKm - prevKm : 0;
        
        return {
          ...r,
          intervaloHor,
          intervaloKm,
          currentKm: currKm,
        };
      });
  }, [selectedVehicleId, readings]);

  // Get the last reading for this vehicle BEFORE the selected date
  // In create mode: most recent reading with reading_date <= selectedDate (excluding same-date if not yet saved)
  // In edit mode: most recent reading before the record being edited
  const lastReading = useMemo(() => {
    if (!selectedVehicleId) return null;
    
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    
    const relevantReadings = readings
      .filter(r => {
        if (r.vehicle_id !== selectedVehicleId) return false;
        if (isEditMode && editRecord && r.id === editRecord.id) return false;
        // Only consider readings on or before the selected date
        if (r.reading_date > selectedDateStr) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by reading_date descending, then by created_at descending for same date
        const dateCmp = b.reading_date.localeCompare(a.reading_date);
        if (dateCmp !== 0) return dateCmp;
        // Use created_at for same-date disambiguation
        const aCreated = (a as any).created_at || '';
        const bCreated = (b as any).created_at || '';
        return bCreated.localeCompare(aCreated);
      });
    
    if (relevantReadings.length === 0) return null;
    
    return relevantReadings[0];
  }, [selectedVehicleId, readings, isEditMode, editRecord, selectedDate]);

  // Multi-source previous values: DB readings + fuel records + Google Sheets
  const [multiSourcePrevHor, setMultiSourcePrevHor] = useState<number>(0);
  const [multiSourcePrevKm, setMultiSourcePrevKm] = useState<number>(0);
  const [fetchingPrevious, setFetchingPrevious] = useState(false);

  // Fetch previous values from all sources when vehicle changes
  // Same logic as Abastecimento: fetch from AbastecimentoCanteiro01, Horimetros sheet, DB tables
  useEffect(() => {
    if (!selectedVehicleId || isEditMode) return;
    
    const vehicle = vehicles.find(v => v.id === selectedVehicleId);
    if (!vehicle) return;

    let cancelled = false;
    setFetchingPrevious(true);

    const normalizeVehicleCode = (v: any) =>
      String(v ?? '')
        .replace(/\u00A0/g, ' ')
        .trim()
        .toUpperCase()
        .replace(/[–—]/g, '-')
        .replace(/\s+/g, '');

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
          const [day, month, year] = dateStr.split('/').map((n) => Number(n));
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
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        base.setHours(h, m, 0, 0);
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

    const fetchAllSources = async () => {
      // Track candidates with their dates so the MOST RECENT record wins (not highest value)
      interface Candidate { date: Date; hor: number; km: number; source: string; }
      const candidates: Candidate[] = [];
      const vehicleCode = vehicle.code;
      const targetCode = normalizeVehicleCode(vehicleCode);

      // 1) From horimeter_readings (DB)
      const dbReading = readings
        .filter(r => r.vehicle_id === selectedVehicleId)
        .sort((a, b) => {
          const d = b.reading_date.localeCompare(a.reading_date);
          if (d !== 0) return d;
          return ((b as any).created_at || '').localeCompare((a as any).created_at || '');
        })[0];

      if (dbReading) {
        candidates.push({
          date: new Date(dbReading.reading_date + 'T12:00:00'),
          hor: dbReading.current_value > 0 ? dbReading.current_value : 0,
          km: (dbReading as any).current_km > 0 ? (dbReading as any).current_km : 0,
          source: 'db_horimeter',
        });
      }

      // 2) From field_fuel_records (DB)
      try {
        const { data: fuelRecords } = await supabase
          .from('field_fuel_records')
          .select('record_date, record_time, horimeter_current, km_current')
          .eq('vehicle_code', vehicleCode)
          .order('record_date', { ascending: false })
          .order('record_time', { ascending: false })
          .limit(1);

        if (fuelRecords?.[0]) {
          const fr = fuelRecords[0];
          const frDate = new Date(fr.record_date + 'T' + (fr.record_time || '12:00') + ':00');
          candidates.push({
            date: frDate,
            hor: fr.horimeter_current ?? 0,
            km: fr.km_current ?? 0,
            source: 'db_fuel',
          });
        }
      } catch (e) {
        console.error('Error fetching fuel records for previous:', e);
      }

      // 3) From Google Sheets "AbastecimentoCanteiro01" (primary source)
      try {
        const sheetData = await getSheetData('AbastecimentoCanteiro01', { noCache: true });
        const rows = sheetData.rows || [];

        const vehicleRecords = rows
          .filter((row) => {
            const rowVehicleRaw = getByNormalizedKey(row as any, ['VEICULO', 'VEÍCULO', 'CODIGO', 'CÓDIGO', 'COD']);
            return normalizeVehicleCode(rowVehicleRaw) === targetCode;
          })
          .map((row) => {
            const dateRaw = getByNormalizedKey(row as any, ['DATA', 'DATE']);
            const timeRaw = getByNormalizedKey(row as any, ['HORA', 'TIME']);
            const dateTime = parseSheetDateTime(dateRaw, timeRaw);
            const horAtual = parsePtBRNumber(String(getByNormalizedKey(row as any, ['HORIMETRO ATUAL', 'HORIMETRO ATUA', 'HOR_ATUAL', 'HORIMETRO']) || '0'));
            const kmAtual = parsePtBRNumber(String(getByNormalizedKey(row as any, ['KM ATUAL', 'KM_ATUAL', 'KM']) || '0'));
            return { dateTime, horValue: horAtual, kmValue: kmAtual, rowIndex: (row as any)._rowIndex ?? 0 };
          })
          .filter((r) => !!r.dateTime && (r.horValue > 0 || r.kmValue > 0))
          .sort((a, b) => {
            const aTime = a.dateTime?.getTime() ?? 0;
            const bTime = b.dateTime?.getTime() ?? 0;
            if (aTime !== bTime) return bTime - aTime;
            return (b.rowIndex || 0) - (a.rowIndex || 0);
          });

        if (vehicleRecords.length > 0) {
          const mostRecent = vehicleRecords[0];
          candidates.push({
            date: mostRecent.dateTime!,
            hor: mostRecent.horValue,
            km: mostRecent.kmValue,
            source: 'sheet_abastecimento',
          });
        }
      } catch (e) {
        console.error('Error fetching AbastecimentoCanteiro01 for previous:', e);
      }

      // 4) From Google Sheets "Horimetros" - use same normalizeVehicleCode for consistent matching
      try {
        const sheetData = await getSheetData('Horimetros', { noCache: true });

        const vehicleRows = sheetData.rows
          .filter(row => {
            const rowCode = normalizeVehicleCode(
              getByNormalizedKey(row as any, ['VEICULO', 'VEÍCULO', 'CODIGO', 'CÓDIGO']) ?? ''
            );
            return rowCode === targetCode;
          })
          .map(row => {
            const dateRaw = getByNormalizedKey(row as any, ['DATA', 'DATE']);
            const dateTime = parseSheetDateTime(dateRaw);
            const horAtual = parsePtBRNumber(String(getByNormalizedKey(row as any, ['HORIMETRO ATUAL']) || '0'));
            const kmAtual = parsePtBRNumber(String(getByNormalizedKey(row as any, ['KM ATUAL']) || '0'));
            return { dateTime, horAtual, kmAtual };
          })
          .filter(r => !!r.dateTime && (r.horAtual > 0 || r.kmAtual > 0))
          .sort((a, b) => (b.dateTime?.getTime() ?? 0) - (a.dateTime?.getTime() ?? 0));

        if (vehicleRows.length > 0) {
          const latest = vehicleRows[0];
          candidates.push({
            date: latest.dateTime!,
            hor: latest.horAtual,
            km: latest.kmAtual,
            source: 'sheet_horimetros',
          });
        }
      } catch (e) {
        console.error('Error fetching Horimetros sheet for previous:', e);
      }

      // Pick the MOST RECENT candidate by date (sheets win on tie)
      if (!cancelled && candidates.length > 0) {
        const sheetPriority: Record<string, number> = {
          'sheet_abastecimento': 2,
          'sheet_horimetros': 2,
          'db_fuel': 1,
          'db_horimeter': 0,
        };
        
        candidates.sort((a, b) => {
          const timeDiff = b.date.getTime() - a.date.getTime();
          if (timeDiff !== 0) return timeDiff;
          // On same date, prefer sheet sources
          return (sheetPriority[b.source] ?? 0) - (sheetPriority[a.source] ?? 0);
        });

        const winner = candidates[0];
        // Use the winner's values, but also check if any other source has a higher value
        // for the secondary metric (e.g., winner has hor but another has km)
        let finalHor = winner.hor;
        let finalKm = winner.km;
        
        // For the metric the winner doesn't have, check other candidates
        if (finalHor <= 0) {
          const bestHorCandidate = candidates.find(c => c.hor > 0);
          if (bestHorCandidate) finalHor = bestHorCandidate.hor;
        }
        if (finalKm <= 0) {
          const bestKmCandidate = candidates.find(c => c.km > 0);
          if (bestKmCandidate) finalKm = bestKmCandidate.km;
        }

        setMultiSourcePrevHor(finalHor);
        setMultiSourcePrevKm(finalKm);
        setFetchingPrevious(false);
      } else if (!cancelled) {
        setMultiSourcePrevHor(0);
        setMultiSourcePrevKm(0);
        setFetchingPrevious(false);
      }
    };

    fetchAllSources();
    return () => { cancelled = true; };
  }, [selectedVehicleId, isEditMode, vehicles, readings]);

  // Previous Horimeter value - from DB reading or multi-source
  const previousHorimeterDerived = useMemo(() => {
    // Use the higher value between DB lastReading and multi-source
    const fromLastReading = lastReading ? (lastReading.current_value || 0) : 0;
    return Math.max(fromLastReading, multiSourcePrevHor);
  }, [lastReading, multiSourcePrevHor]);

  // Previous KM value
  const previousKmDerived = useMemo(() => {
    const fromLastReading = lastReading ? ((lastReading as any).current_km || 0) : 0;
    return Math.max(fromLastReading, multiSourcePrevKm);
  }, [lastReading, multiSourcePrevKm]);

  // Effective previous values (editable in edit mode, derived in create mode)
  const previousHorimeter = isEditMode 
    ? (previousHorimeterValue ?? 0)
    : previousHorimeterDerived;
  
  const previousKm = isEditMode 
    ? (previousKmValue ?? 0)
    : previousKmDerived;

  // Check for duplicate - improved logic for edit mode
  const hasDuplicateRecord = useMemo(() => {
    if (!selectedVehicleId || !selectedDate) return false;
    
    return readings.some(r => {
      // In edit mode, skip the record being edited
      if (isEditMode && editRecord && r.id === editRecord.id) return false;
      if (r.vehicle_id !== selectedVehicleId) return false;
      
      const readingDate = new Date(r.reading_date + 'T00:00:00');
      return isSameDay(readingDate, selectedDate);
    });
  }, [selectedVehicleId, selectedDate, readings, isEditMode, editRecord]);

  // Monthly total
  const monthlyTotal = useMemo(() => {
    if (!selectedVehicleId) return { total: 0, count: 0 };
    
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    const monthRecords = readings.filter(r => {
      if (r.vehicle_id !== selectedVehicleId) return false;
      const readingDate = new Date(r.reading_date + 'T00:00:00');
      return isWithinInterval(readingDate, { start: monthStart, end: monthEnd });
    });

    if (monthRecords.length >= 2) {
      const sorted = [...monthRecords].sort((a, b) => 
        a.reading_date.localeCompare(b.reading_date)
      );
      const firstValue = sorted[0].current_value;
      const lastValue = sorted[sorted.length - 1].current_value;
      return { total: lastValue - firstValue, count: monthRecords.length };
    }
    
    return { total: 0, count: monthRecords.length };
  }, [selectedVehicleId, readings]);

  // Reset form when vehicle changes (only in create mode)
  useEffect(() => {
    if (!isEditMode && selectedVehicleId) {
      setHorimeterValue(null);
      setKmValue(null);
      setObservacao('');
      
      // Auto-fill operator from Veiculo sheet's Motorista column
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (vehicle) {
        (async () => {
          try {
            const veiculoSheet = await getSheetData('Veiculo', { noCache: false });
            const normalizeCode = (v: any) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
            const targetCode = normalizeCode(vehicle.code);
            const veiculoRow = (veiculoSheet.rows || []).find(row => {
              const code = normalizeCode(row['Codigo'] || row['CODIGO'] || row['Código'] || '');
              return code === targetCode;
            });
            if (veiculoRow) {
              const motorista = String(veiculoRow['Motorista'] || veiculoRow['MOTORISTA'] || '').trim();
              if (motorista) {
                setOperador(motorista);
                return;
              }
            }
          } catch (e) { console.error('Error fetching Veiculo sheet for Motorista:', e); }
          
          // Fallback: operator from last reading
          const lastReading = readings
            .filter(r => r.vehicle_id === selectedVehicleId)
            .sort((a, b) => b.reading_date.localeCompare(a.reading_date))[0];
          if (lastReading?.operator) {
            setOperador(lastReading.operator);
          } else {
            setOperador('');
          }
        })();
      }
      
      // Always default to today's date (editable by user)
      setSelectedDate(new Date());
    } else if (!isEditMode && !selectedVehicleId) {
      setHorimeterValue(null);
      setKmValue(null);
      setOperador('');
      setObservacao('');
      setSelectedDate(new Date());
    }
  }, [selectedVehicleId, isEditMode, readings, vehicles]);

  // Populate form when editing
  useEffect(() => {
    if (open) {
      if (editRecord) {
        setSelectedVehicleId(editRecord.vehicle_id);

        // In edit mode we MUST respect the correct columns:
        // - Horímetro (horas) => current_value
        // - KM => current_km
        const km = (editRecord as any).current_km as number | null | undefined;
        const hor = editRecord.current_value;
        const prevHor = editRecord.previous_value;
        const prevKm = (editRecord as any).previous_km as number | null | undefined;

        setHorimeterValue(hor && hor > 0 ? hor : null);
        setKmValue(km && km > 0 ? km : null);
        setPreviousHorimeterValue(prevHor && prevHor > 0 ? prevHor : null);
        setPreviousKmValue(prevKm && prevKm > 0 ? prevKm : null);

        setOperador(editRecord.operator || '');
        setObservacao(editRecord.observations || '');
        setSelectedDate(new Date(editRecord.reading_date + 'T00:00:00'));
      } else {
        if (!initialVehicleId) {
          setSelectedVehicleId('');
          setSelectedDate(initialDate ? new Date(initialDate + 'T12:00:00') : new Date());
        } else {
          setSelectedVehicleId(initialVehicleId);
          setSelectedDate(initialDate ? new Date(initialDate + 'T12:00:00') : new Date());
        }
        setHorimeterValue(null);
        setKmValue(null);
        setPreviousHorimeterValue(null);
        setPreviousKmValue(null);
        setOperador('');
        setObservacao('');
      }
    }
  }, [open, editRecord, initialVehicleId, initialDate, vehicles]);

  const validateForm = (): boolean => {
    if (!selectedVehicleId) {
      toast({
        title: 'Erro',
        description: 'Selecione um veículo',
        variant: 'destructive',
      });
      return false;
    }

    const today = startOfDay(new Date());
    if (isAfter(startOfDay(selectedDate), today)) {
      toast({
        title: 'Erro',
        description: 'Não é permitido registrar datas futuras',
        variant: 'destructive',
      });
      return false;
    }

    if (hasDuplicateRecord) {
      toast({
        title: 'Erro',
        description: 'Já existe um registro para este veículo nesta data',
        variant: 'destructive',
      });
      return false;
    }

    const horimeterNum = horimeterValue ?? 0;
    const kmNum = kmValue ?? 0;
    
    // At least one value must be provided
    if (horimeterNum <= 0 && kmNum <= 0) {
      toast({
        title: 'Erro',
        description: 'Informe pelo menos um valor (Horímetro ou KM)',
        variant: 'destructive',
      });
      return false;
    }

    // Show warning but allow saving if horimeter is <= previous
    if (horimeterNum > 0 && previousHorimeter > 0 && horimeterNum <= previousHorimeter) {
      toast({
        title: '⚠️ Atenção: Possível inconsistência',
        description: `O horímetro atual (${horimeterNum.toLocaleString('pt-BR')}h) é menor ou igual ao anterior (${previousHorimeter.toLocaleString('pt-BR')}h). O registro será salvo e um alerta será enviado.`,
        variant: 'default',
      });
    }

    // Show warning but allow saving if KM is <= previous
    if (kmNum > 0 && previousKm > 0 && kmNum <= previousKm) {
      toast({
        title: '⚠️ Atenção: Possível inconsistência',
        description: `A quilometragem atual (${kmNum.toLocaleString('pt-BR')} km) é menor ou igual à anterior (${previousKm.toLocaleString('pt-BR')} km). O registro será salvo e um alerta será enviado.`,
        variant: 'default',
      });
    }

    return true;
  };

  const handleButtonClick = () => {
    if (!validateForm()) return;
    
    if (isEditMode) {
      setShowConfirmDialog(true);
    } else {
      handleSave();
    }
  };

  const handleSave = async () => {
    setShowConfirmDialog(false);
    setIsSaving(true);

    try {
      const readingDate = format(selectedDate, 'yyyy-MM-dd');
      const horimeterNum = horimeterValue ?? 0;
      const kmNum = kmValue ?? 0;
      
      // Horimeter is stored in current_value/previous_value
      // KM is stored in current_km/previous_km
      const mainValue = horimeterNum > 0 ? horimeterNum : 0;

      const data = {
        vehicle_id: selectedVehicleId,
        reading_date: readingDate,
        current_value: mainValue,
        previous_value: previousHorimeter || null,
        current_km: kmNum > 0 ? kmNum : null,
        previous_km: previousKm > 0 ? previousKm : null,
        operator: operador || null,
        observations: observacao || null,
        // Store both values for sheet sync
        _horimeterValue: horimeterNum,
        _kmValue: kmNum,
      };

      let savedReadingId: string | null = null;

      if (isEditMode && editRecord) {
        await updateReading(editRecord.id, data);
        savedReadingId = editRecord.id;
      } else {
        const result = await createReading(data);
        savedReadingId = result?.id || null;
      }

      // Check for inconsistencies and create alerts
      const hasHorimeterInconsistency = horimeterNum > 0 && previousHorimeter > 0 && horimeterNum <= previousHorimeter;
      const hasKmInconsistency = kmNum > 0 && previousKm > 0 && kmNum <= previousKm;

      if (hasHorimeterInconsistency || hasKmInconsistency) {
        // Create inconsistency alerts
        const { supabase } = await import('@/integrations/supabase/client');
        
        if (hasHorimeterInconsistency) {
          await supabase.from('horimeter_inconsistency_alerts').insert({
            vehicle_id: selectedVehicleId,
            vehicle_code: selectedVehicle?.code || '',
            vehicle_name: selectedVehicle?.name || selectedVehicle?.description || '',
            reading_id: savedReadingId,
            reading_date: readingDate,
            value_type: 'horimeter',
            current_value: horimeterNum,
            previous_value: previousHorimeter,
            difference: horimeterNum - previousHorimeter,
            operator: operador || null,
          });
        }

        if (hasKmInconsistency) {
          await supabase.from('horimeter_inconsistency_alerts').insert({
            vehicle_id: selectedVehicleId,
            vehicle_code: selectedVehicle?.code || '',
            vehicle_name: selectedVehicle?.name || selectedVehicle?.description || '',
            reading_id: savedReadingId,
            reading_date: readingDate,
            value_type: 'km',
            current_value: kmNum,
            previous_value: previousKm,
            difference: kmNum - previousKm,
            operator: operador || null,
          });
        }

        toast({
          title: '⚠️ Alerta de Inconsistência Criado',
          description: 'O administrador foi notificado sobre esta possível inconsistência.',
        });
      }

      // Refetch to ensure data is in sync - refetch internal AND notify parent
      await refetch();
      // Call onSuccess BEFORE resetting form so parent table updates immediately
      onSuccess?.();

      if (isEditMode) {
        // Close modal after editing
        onOpenChange(false);
      } else {
        // Keep form open for new entries - reset fields
        toast({
          title: 'Registro salvo!',
          description: 'Formulário pronto para novo apontamento.',
        });
        setHorimeterValue(null);
        setKmValue(null);
        setObservacao('');
        // Keep the same date for batch entry convenience
        setSelectedDate(selectedDate);
      }
    } catch (error) {
      // Error handled in hook
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = vehiclesLoading || readingsLoading;
  const [showHistory, setShowHistory] = useState(false);

  // Auto-focus horimeter input after vehicle selection
  const horimeterInputRef = React.useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectedVehicleId && !isEditMode) {
      setTimeout(() => horimeterInputRef.current?.focus(), 200);
    }
  }, [selectedVehicleId, isEditMode]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[95vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Clock className="w-5 h-5 text-primary" />
              {isEditMode ? 'Editar Registro' : 'Lançamento de Horímetro'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isEditMode ? 'Editar registro de horímetro' : 'Novo registro de horímetro'}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2">Carregando...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Row 1: Vehicle + Date side by side */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Veículo *</Label>
                  <VehicleCombobox
                    vehicles={vehicles.map(v => ({
                      id: v.id,
                      code: v.code,
                      name: v.name || '',
                      description: v.description || '',
                      category: v.category || '',
                    }))}
                    value={selectedVehicleId}
                    onValueChange={setSelectedVehicleId}
                    useIdAsValue={true}
                    placeholder="Pesquisar veículo..."
                    emptyMessage="Nenhum veículo encontrado."
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Data *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal h-10',
                          !selectedDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-1.5 h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium">{format(selectedDate, 'dd/MM/yy', { locale: ptBR })}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 pointer-events-auto bg-background" align="end" sideOffset={4}>
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        disabled={(date) => date > new Date()}
                        initialFocus
                        locale={ptBR}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {hasDuplicateRecord && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Já existe registro nesta data
                </p>
              )}

              {/* Compact vehicle info + previous values */}
              {selectedVehicle && (
                <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate">{selectedVehicle.name || selectedVehicle.category}</span>
                    <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0">
                      {selectedVehicle.company || '—'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="p-1.5 bg-amber-500/10 rounded text-xs">
                      <div className="text-[10px] text-muted-foreground">Hor. Ant.</div>
                      {isEditMode ? (
                        <CurrencyInput
                          value={previousHorimeterValue}
                          onChange={setPreviousHorimeterValue}
                          decimals={2}
                          placeholder="0,00"
                          className="h-6 text-center text-xs font-semibold text-amber-600 bg-transparent border-amber-300 p-0"
                        />
                      ) : (
                        <div className="font-semibold text-amber-600">{previousHorimeterDerived.toLocaleString('pt-BR')}h</div>
                      )}
                    </div>
                    <div className="p-1.5 bg-blue-500/10 rounded text-xs">
                      <div className="text-[10px] text-muted-foreground">KM Ant.</div>
                      {isEditMode ? (
                        <CurrencyInput
                          value={previousKmValue}
                          onChange={setPreviousKmValue}
                          decimals={0}
                          placeholder="0"
                          className="h-6 text-center text-xs font-semibold text-blue-600 bg-transparent border-blue-300 p-0"
                        />
                      ) : (
                        <div className="font-semibold text-blue-600">{previousKmDerived.toLocaleString('pt-BR')} km</div>
                      )}
                    </div>
                    <div className="p-1.5 bg-green-500/10 rounded text-xs">
                      <div className="text-[10px] text-muted-foreground">Mês</div>
                      <div className="font-semibold text-green-600">
                        {monthlyTotal.total.toLocaleString('pt-BR')} {selectedVehicle.unit}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Main inputs: Horimeter + KM side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="horimeter" className="text-xs flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                    <Clock className="w-3.5 h-3.5" />
                    Horímetro (h)
                  </Label>
                  <CurrencyInput
                    ref={horimeterInputRef}
                    id="horimeter"
                    value={horimeterValue}
                    onChange={setHorimeterValue}
                    decimals={2}
                    placeholder="0,00"
                    className="font-mono text-lg h-12 border-amber-200 dark:border-amber-800 focus-visible:ring-amber-500"
                  />
                  {(horimeterValue ?? 0) > 0 && previousHorimeter > 0 && (
                    <p className={cn(
                      'text-[11px] font-medium',
                      (horimeterValue ?? 0) > previousHorimeter ? 'text-green-600' : 'text-destructive'
                    )}>
                      Δ {((horimeterValue ?? 0) - previousHorimeter).toLocaleString('pt-BR')}h
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="km" className="text-xs flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-400">
                    <TrendingUp className="w-3.5 h-3.5" />
                    KM
                  </Label>
                  <CurrencyInput
                    id="km"
                    value={kmValue}
                    onChange={setKmValue}
                    decimals={0}
                    placeholder="0"
                    className="font-mono text-lg h-12 border-blue-200 dark:border-blue-800 focus-visible:ring-blue-500"
                  />
                  {(kmValue ?? 0) > 0 && previousKm > 0 && (
                    <p className={cn(
                      'text-[11px] font-medium',
                      (kmValue ?? 0) > previousKm ? 'text-green-600' : 'text-destructive'
                    )}>
                      Δ {((kmValue ?? 0) - previousKm).toLocaleString('pt-BR')} km
                    </p>
                  )}
                </div>
              </div>

              {/* Operator + Observations in one row */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="operador" className="text-xs text-muted-foreground">Operador</Label>
                  <Input
                    id="operador"
                    value={operador}
                    onChange={(e) => setOperador(e.target.value)}
                    placeholder="Operador"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="observacao" className="text-xs text-muted-foreground">Observações</Label>
                  <Input
                    id="observacao"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Observações"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              {/* Collapsible History */}
              {vehicleHistory.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <History className="w-3.5 h-3.5" />
                    Últimos {vehicleHistory.length} registros
                    {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {showHistory && (
                    <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1">
                      {vehicleHistory.map((h) => (
                        <div key={h.id} className="flex items-center justify-between text-xs p-1.5 bg-muted/30 rounded gap-2">
                          <span className="shrink-0 font-medium">
                            {format(new Date(h.reading_date + 'T00:00:00'), 'dd/MM/yy')}
                          </span>
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {h.current_value > 0 && (
                              <span className="text-amber-600 font-medium">
                                {h.current_value.toLocaleString('pt-BR')}h
                                {h.intervaloHor > 0 && (
                                  <span className="text-green-600 ml-0.5">(+{h.intervaloHor.toLocaleString('pt-BR')})</span>
                                )}
                              </span>
                            )}
                            {h.currentKm > 0 && (
                              <span className="text-blue-600 font-medium">
                                {h.currentKm.toLocaleString('pt-BR')} km
                                {h.intervaloKm > 0 && (
                                  <span className="text-green-600 ml-0.5">(+{h.intervaloKm.toLocaleString('pt-BR')})</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleButtonClick}
                  className="flex-1 h-11"
                  disabled={isSaving || !selectedVehicleId || (horimeterValue === null && kmValue === null)}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {isEditMode ? 'Atualizar' : 'Salvar'}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSaving}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Alteração</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja alterar este registro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
