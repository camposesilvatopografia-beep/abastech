import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Repeat, Loader2, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatPtBRNumber } from '@/lib/ptBRNumber';
import { generateHorimeterId } from '@/lib/sheetIdGenerator';
import { getSheetData } from '@/lib/googleSheets';

interface Vehicle {
  id: string;
  code: string;
  name: string;
  category: string | null;
  company: string | null;
  unit?: string;
  status?: string | null;
}

interface LastReading {
  vehicleId: string;
  vehicleCode: string;
  vehicleName: string;
  currentValue: number;
  currentKm: number | null;
  readingDate: string;
  operator: string | null;
  category: string | null;
  company: string | null;
}

interface RepeatHorimeterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: Vehicle[];
  onSuccess?: () => void;
  /** If provided, only this vehicle is shown (individual repeat) */
  singleVehicleId?: string;
  operator?: string;
}

export function RepeatHorimeterModal({ 
  open, onOpenChange, vehicles, onSuccess, singleVehicleId, operator 
}: RepeatHorimeterModalProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [dateOpen, setDateOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastReadings, setLastReadings] = useState<LastReading[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<{ success: number; failed: number } | null>(null);

  // Load last readings for vehicles missing on selected date
  const loadMissingVehicles = useCallback(async () => {
    setIsLoading(true);
    setResults(null);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      // Get vehicles that already have readings on this date
      const { data: existingReadings } = await supabase
        .from('horimeter_readings')
        .select('vehicle_id')
        .eq('reading_date', dateStr);
      
      const existingVehicleIds = new Set((existingReadings || []).map(r => r.vehicle_id));
      
      // Filter to active vehicles without readings, excluding "outros" category
      let targetVehicles = vehicles.filter(v => 
        !existingVehicleIds.has(v.id) && 
        v.status?.toLowerCase() === 'ativo' &&
        v.category?.toLowerCase() !== 'outros'
      );
      
      if (singleVehicleId) {
        targetVehicles = targetVehicles.filter(v => v.id === singleVehicleId);
      }

      // Get last readings for these vehicles
      const readings: LastReading[] = [];
      
      for (const vehicle of targetVehicles) {
        const { data: lastReading } = await supabase
          .from('horimeter_readings')
          .select('current_value, current_km, reading_date, operator')
          .eq('vehicle_id', vehicle.id)
          .lt('reading_date', dateStr)
          .order('reading_date', { ascending: false })
          .limit(1)
          .single();
        
        if (lastReading && lastReading.current_value > 0) {
          readings.push({
            vehicleId: vehicle.id,
            vehicleCode: vehicle.code,
            vehicleName: vehicle.name,
            currentValue: lastReading.current_value,
            currentKm: lastReading.current_km,
            readingDate: lastReading.reading_date,
            operator: lastReading.operator,
            category: vehicle.category,
            company: vehicle.company,
          });
        }
      }
      
      readings.sort((a, b) => a.vehicleCode.localeCompare(b.vehicleCode));
      setLastReadings(readings);
      setSelectedVehicles(new Set(readings.map(r => r.vehicleId)));
    } catch (err) {
      console.error('Error loading missing vehicles:', err);
      toast({ title: 'Erro', description: 'Falha ao carregar veículos', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, vehicles, singleVehicleId, toast]);

  // Load when modal opens or date changes
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      loadMissingVehicles();
    } else {
      setResults(null);
      setLastReadings([]);
      setSelectedVehicles(new Set());
    }
    onOpenChange(isOpen);
  };

  // Toggle vehicle selection
  const toggleVehicle = (id: string) => {
    setSelectedVehicles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedVehicles.size === lastReadings.length) {
      setSelectedVehicles(new Set());
    } else {
      setSelectedVehicles(new Set(lastReadings.map(r => r.vehicleId)));
    }
  };

  // Build sheet row data with header normalization
  const buildSheetRow = async (reading: LastReading, dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';

    const semanticData: Record<string, string> = {
      'Id': generateHorimeterId(),
      'Data': formattedDate,
      'Veiculo': reading.vehicleCode,
      'Categoria': reading.category || '',
      'Descricao': reading.vehicleName,
      'Empresa': reading.company || '',
      'Operador': operator || reading.operator || '',
      'Horimetro Anterior': fmtNum(reading.currentValue),
      'Horimetro Atual': fmtNum(reading.currentValue),
      'Intervalo H': '0',
      'Km Anterior': reading.currentKm ? fmtNum(reading.currentKm) : '',
      'Km Atual': reading.currentKm ? fmtNum(reading.currentKm) : '',
      'Total Km': '0',
    };

    // Map to actual sheet headers
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
        return mapped;
      }
    } catch {}
    return semanticData;
  };

  // Save repeated readings
  const handleSave = async () => {
    const toRepeat = lastReadings.filter(r => selectedVehicles.has(r.vehicleId));
    if (toRepeat.length === 0) return;
    
    setIsSaving(true);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    let success = 0;
    let failed = 0;

    for (const reading of toRepeat) {
      try {
        // Insert into DB
        const { data: inserted, error } = await supabase
          .from('horimeter_readings')
          .insert({
            vehicle_id: reading.vehicleId,
            reading_date: dateStr,
            current_value: reading.currentValue,
            previous_value: reading.currentValue,
            current_km: reading.currentKm || null,
            previous_km: reading.currentKm || null,
            operator: operator || reading.operator || null,
            observations: 'DIA SEM TRABALHO - REPETIDO',
            source: 'system',
          })
          .select('id')
          .single();

        if (error) throw error;

        // Sync to Google Sheets
        try {
          const sheetRow = await buildSheetRow(reading, dateStr);
          await supabase.functions.invoke('google-sheets', {
            body: { action: 'create', sheetName: 'Horimetros', data: sheetRow },
          });
          // Mark as synced
          if (inserted?.id) {
            await supabase.from('horimeter_readings')
              .update({ synced_from_sheet: true })
              .eq('id', inserted.id);
          }
        } catch (syncErr) {
          console.warn(`Sheet sync failed for ${reading.vehicleCode}:`, syncErr);
        }

        success++;
      } catch (err) {
        console.error(`Failed to repeat ${reading.vehicleCode}:`, err);
        failed++;
      }
    }

    setResults({ success, failed });
    setIsSaving(false);
    
    if (success > 0) {
      toast({
        title: 'Horímetros repetidos',
        description: `${success} registro(s) criado(s)${failed > 0 ? `, ${failed} falha(s)` : ''}`,
      });
      onSuccess?.();
    }
  };

  const formatNumBR = (val: number | null) => {
    if (!val) return '-';
    const hasDecimals = val % 1 !== 0;
    return val.toLocaleString('pt-BR', { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-primary" />
            Repetir Horímetro — Dia Sem Trabalho
          </DialogTitle>
          <DialogDescription>
            Repete o último valor de horímetro/KM para veículos que não trabalharam nesta data. 
            Os intervalos serão zero.
          </DialogDescription>
        </DialogHeader>

        {/* Date Picker */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Data:</span>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Calendar className="w-4 h-4" />
                {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { if (d) { setSelectedDate(d); setDateOpen(false); loadMissingVehicles(); } }}
                locale={ptBR}
                disabled={(d) => d > new Date()}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={loadMissingVehicles} disabled={isLoading}>
            Atualizar
          </Button>
        </div>

        {/* Results Banner */}
        {results && (
          <div className={cn(
            "p-3 rounded-lg flex items-center gap-2 text-sm",
            results.failed === 0 ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300"
          )}>
            <CheckCircle2 className="w-4 h-4" />
            {results.success} registro(s) criado(s){results.failed > 0 && `, ${results.failed} falha(s)`}
          </div>
        )}

        {/* Vehicle List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando veículos...</span>
          </div>
        ) : lastReadings.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-500" />
            <p className="text-sm font-medium">Todos os veículos já possuem leitura nesta data</p>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="flex items-center justify-between border-b pb-2">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <Checkbox
                  checked={selectedVehicles.size === lastReadings.length}
                  onCheckedChange={toggleAll}
                />
                Selecionar Todos ({lastReadings.length})
              </label>
              <span className="text-xs text-muted-foreground">
                {selectedVehicles.size} selecionado(s)
              </span>
            </div>

            {/* Vehicle rows */}
            <div className="space-y-1 max-h-[40vh] overflow-y-auto">
              {lastReadings.map(r => (
                <label
                  key={r.vehicleId}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                    selectedVehicles.has(r.vehicleId) 
                      ? "bg-primary/5 border border-primary/20" 
                      : "hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={selectedVehicles.has(r.vehicleId)}
                    onCheckedChange={() => toggleVehicle(r.vehicleId)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{r.vehicleCode}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.vehicleName}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>Hor: {formatNumBR(r.currentValue)}</span>
                      {r.currentKm && r.currentKm > 0 && <span>KM: {formatNumBR(r.currentKm)}</span>}
                      <span>Últ: {format(new Date(r.readingDate + 'T12:00:00'), 'dd/MM')}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Save */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={isSaving || selectedVehicles.size === 0}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Repeat className="w-4 h-4" />
                    Repetir {selectedVehicles.size} veículo(s)
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
