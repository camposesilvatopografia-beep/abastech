import { useState, useMemo, useEffect } from 'react';
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
import { useVehicles, useHorimeterReadings, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { Clock, Save, History, AlertTriangle, RefreshCw, TrendingUp, CalendarIcon, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfDay, isSameDay, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface DatabaseHorimeterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialVehicleId?: string;
  editRecord?: HorimeterWithVehicle | null;
  externalReadings?: HorimeterWithVehicle[];
}

export function DatabaseHorimeterModal({
  open,
  onOpenChange,
  onSuccess,
  initialVehicleId,
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
  const [horimeterValue, setHorimeterValue] = useState('');
  const [kmValue, setKmValue] = useState('');
  const [operador, setOperador] = useState('');
  const [observacao, setObservacao] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Selected vehicle info
  const selectedVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  // Vehicle history (last 5 readings)
  const vehicleHistory = useMemo(() => {
    if (!selectedVehicleId) return [];
    
    return readings
      .filter(r => r.vehicle_id === selectedVehicleId)
      .slice(0, 5)
      .map((r, index, arr) => {
        const prevValue = index < arr.length - 1 ? arr[index + 1].current_value : 0;
        const intervalo = prevValue > 0 ? r.current_value - prevValue : 0;
        return {
          ...r,
          intervalo,
        };
      });
  }, [selectedVehicleId, readings]);

  // Get the last reading for this vehicle (excluding current record in edit mode)
  const lastReading = useMemo(() => {
    if (!selectedVehicleId) return null;
    
    const relevantReadings = readings
      .filter(r => {
        if (r.vehicle_id !== selectedVehicleId) return false;
        if (isEditMode && editRecord && r.id === editRecord.id) return false;
        return true;
      })
      .sort((a, b) => b.reading_date.localeCompare(a.reading_date));
    
    if (relevantReadings.length === 0) return null;
    
    return relevantReadings[0];
  }, [selectedVehicleId, readings, isEditMode, editRecord]);

  // Previous Horimeter value - ALWAYS comes from current_value column (hours)
  // This column stores horimeter readings regardless of vehicle type
  const previousHorimeter = useMemo(() => {
    if (!selectedVehicleId || !lastReading) return 0;
    
    // Horimeter (hours) is ALWAYS in current_value column
    // This is the standard horimeter reading for all vehicles
    return lastReading.current_value || 0;
  }, [selectedVehicleId, lastReading]);

  // Previous KM value - ALWAYS comes from current_km column (kilometers)
  // This is a separate tracking for odometer readings
  const previousKm = useMemo(() => {
    if (!selectedVehicleId || !lastReading) return 0;
    
    // KM is ALWAYS in the dedicated current_km column
    // After migration, all KM vehicles have their data in this column
    const reading = lastReading as any;
    return reading.current_km || 0;
  }, [selectedVehicleId, lastReading]);

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
      setHorimeterValue('');
      setKmValue('');
      setObservacao('');
      
      // Auto-fill operator and recommend date from last reading
      const lastReading = readings
        .filter(r => r.vehicle_id === selectedVehicleId)
        .sort((a, b) => b.reading_date.localeCompare(a.reading_date))[0];
      
      if (lastReading) {
        // Recommend the date of the last reading
        setSelectedDate(new Date(lastReading.reading_date + 'T00:00:00'));
        
        if (lastReading.operator) {
          setOperador(lastReading.operator);
        } else {
          setOperador('');
        }
      } else {
        setSelectedDate(new Date());
        setOperador('');
      }
    } else if (!isEditMode && !selectedVehicleId) {
      setHorimeterValue('');
      setKmValue('');
      setOperador('');
      setObservacao('');
      setSelectedDate(new Date());
    }
  }, [selectedVehicleId, isEditMode, readings]);

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

        setHorimeterValue(hor && hor > 0 ? hor.toString().replace('.', ',') : '');
        setKmValue(km && km > 0 ? km.toString().replace('.', ',') : '');

        setOperador(editRecord.operator || '');
        setObservacao(editRecord.observations || '');
        setSelectedDate(new Date(editRecord.reading_date + 'T00:00:00'));
      } else {
        if (!initialVehicleId) {
          setSelectedVehicleId('');
          setSelectedDate(new Date());
        } else {
          setSelectedVehicleId(initialVehicleId);
          // Date will be set by the vehicle change effect
        }
        setHorimeterValue('');
        setKmValue('');
        setOperador('');
        setObservacao('');
      }
    }
  }, [open, editRecord, initialVehicleId, vehicles]);

  const parseNumber = (val: string): number => {
    const str = val.replace(/\./g, '').replace(',', '.');
    return parseFloat(str) || 0;
  };

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

    const horimeterNum = parseNumber(horimeterValue);
    const kmNum = parseNumber(kmValue);
    
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
      const horimeterNum = parseNumber(horimeterValue);
      const kmNum = parseNumber(kmValue);
      
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

      // Refetch to ensure data is in sync
      await refetch();

      if (isEditMode) {
        // Close modal after editing
        onOpenChange(false);
        onSuccess?.();
      } else {
        // Keep form open for new entries - reset fields and set date to today (the new last reading date)
        toast({
          title: 'Registro salvo!',
          description: 'Formulário pronto para novo apontamento.',
        });
        setHorimeterValue('');
        setKmValue('');
        setObservacao('');
        // Set date to the date we just saved (which is now the last reading)
        setSelectedDate(selectedDate);
        onSuccess?.();
      }
    } catch (error) {
      // Error handled in hook
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = vehiclesLoading || readingsLoading;

  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(
          "max-h-[95vh] overflow-y-auto transition-all duration-300",
          isExpanded ? "max-w-4xl" : "max-w-xl"
        )}>
          <DialogHeader className="flex flex-row items-start justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                {isEditMode ? 'Editar Registro' : 'Novo Registro'}
              </DialogTitle>
              <DialogDescription>
                {isEditMode 
                  ? 'Altere os dados do registro de horímetro ou quilometragem' 
                  : 'Preencha os dados para registrar o horímetro ou quilometragem'}
              </DialogDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              {isExpanded ? 'Reduzir' : 'Expandir'}
            </Button>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2">Carregando dados...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Vehicle Selection */}
              <div className="space-y-1">
                <Label htmlFor="vehicle" className="text-sm">Veículo/Equipamento *</Label>
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
                  emptyMessage="Nenhum veículo encontrado. Importe da planilha primeiro."
                />
              </div>

              {/* Vehicle Info */}
              {selectedVehicle && (
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{selectedVehicle.name || selectedVehicle.category}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {selectedVehicle.company || 'Sem empresa'}
                    </span>
                  </div>
                  
                  {/* Previous values - both Horimeter and KM */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-amber-500/10 rounded-lg text-center">
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        Horímetro Anterior
                      </div>
                      <div className="font-semibold text-amber-600">
                        {previousHorimeter.toLocaleString('pt-BR')}h
                      </div>
                    </div>
                    <div className="p-2 bg-blue-500/10 rounded-lg text-center">
                      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        KM Anterior
                      </div>
                      <div className="font-semibold text-blue-600">
                        {previousKm.toLocaleString('pt-BR')} km
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-2 bg-green-500/10 rounded-lg text-center">
                    <div className="text-xs text-muted-foreground">Total do Mês</div>
                    <div className="font-semibold text-green-600">
                      {monthlyTotal.total.toLocaleString('pt-BR')} {selectedVehicle.unit}
                    </div>
                  </div>
                </div>
              )}

              {/* Date Selection - Expanded */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Data do Registro *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-11 text-base',
                        !selectedDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
                      <div className="flex flex-col items-start">
                        <span className="font-semibold">{format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}</span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {format(selectedDate, 'EEEE', { locale: ptBR })}
                        </span>
                      </div>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 pointer-events-auto bg-background" align="start" sideOffset={8}>
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
                {hasDuplicateRecord && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" />
                    Já existe registro nesta data
                  </p>
                )}
              </div>

              {/* Horimeter and KM Values - Expanded or Compact */}
              <div className={cn(
                "grid gap-4",
                isExpanded ? "grid-cols-2" : "grid-cols-2"
              )}>
                <div className={cn(
                  "space-y-2 p-4 rounded-lg border-2 border-dashed border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20",
                  isExpanded && "p-6"
                )}>
                  <Label htmlFor="horimeter" className={cn(
                    "flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400",
                    isExpanded && "text-base"
                  )}>
                    <Clock className={cn("w-4 h-4", isExpanded && "w-5 h-5")} />
                    Horímetro (horas)
                  </Label>
                  <Input
                    id="horimeter"
                    value={horimeterValue}
                    onChange={(e) => setHorimeterValue(e.target.value)}
                    placeholder="Ex: 1.250,5"
                    className={cn(
                      "font-mono text-lg",
                      isExpanded && "h-14 text-2xl"
                    )}
                  />
                  {previousHorimeter > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Anterior: {previousHorimeter.toLocaleString('pt-BR')}h
                    </p>
                  )}
                </div>
                <div className={cn(
                  "space-y-2 p-4 rounded-lg border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20",
                  isExpanded && "p-6"
                )}>
                  <Label htmlFor="km" className={cn(
                    "flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-400",
                    isExpanded && "text-base"
                  )}>
                    <TrendingUp className={cn("w-4 h-4", isExpanded && "w-5 h-5")} />
                    Quilometragem (km)
                  </Label>
                  <Input
                    id="km"
                    value={kmValue}
                    onChange={(e) => setKmValue(e.target.value)}
                    placeholder="Ex: 85.420"
                    className={cn(
                      "font-mono text-lg",
                      isExpanded && "h-14 text-2xl"
                    )}
                  />
                  {previousKm > 0 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Anterior: {previousKm.toLocaleString('pt-BR')} km
                    </p>
                  )}
                </div>
              </div>
              
              {/* Difference display */}
              {selectedVehicleId && (parseNumber(horimeterValue) > 0 || parseNumber(kmValue) > 0) && (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 space-y-1">
                  {parseNumber(horimeterValue) > 0 && (
                    <p className={cn(
                      'flex items-center gap-1',
                      previousHorimeter === 0 || parseNumber(horimeterValue) > previousHorimeter ? 'text-green-600' : 'text-destructive'
                    )}>
                      Diferença Horímetro: {(parseNumber(horimeterValue) - previousHorimeter).toLocaleString('pt-BR')}h
                      {previousHorimeter > 0 && ` (anterior: ${previousHorimeter.toLocaleString('pt-BR')}h)`}
                    </p>
                  )}
                  {parseNumber(kmValue) > 0 && (
                    <p className={cn(
                      'flex items-center gap-1',
                      previousKm === 0 || parseNumber(kmValue) > previousKm ? 'text-green-600' : 'text-destructive'
                    )}>
                      Diferença KM: {(parseNumber(kmValue) - previousKm).toLocaleString('pt-BR')} km
                      {previousKm > 0 && ` (anterior: ${previousKm.toLocaleString('pt-BR')} km)`}
                    </p>
                  )}
                </div>
              )}

              {/* Operator */}
              <div className="space-y-1">
                <Label htmlFor="operador" className="text-sm flex items-center gap-2">
                  Operador
                  {operador && vehicleHistory.length > 0 && vehicleHistory.some(h => h.operator === operador) && (
                    <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                      Preenchido automaticamente
                    </span>
                  )}
                </Label>
                <Input
                  id="operador"
                  value={operador}
                  onChange={(e) => setOperador(e.target.value)}
                  placeholder="Nome do operador"
                  className="h-9"
                />
              </div>

              {/* Observations */}
              <div className="space-y-1">
                <Label htmlFor="observacao" className="text-sm">Observações</Label>
                <Input
                  id="observacao"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Observações adicionais"
                  className="h-9"
                />
              </div>

              {/* History */}
              {vehicleHistory.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <History className="w-4 h-4" />
                    Últimos Registros
                  </Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {vehicleHistory.map((h, i) => (
                      <div key={h.id} className="flex justify-between text-xs p-2 bg-muted/30 rounded">
                        <span>{format(new Date(h.reading_date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                        <span className="font-medium">
                          {h.current_value.toLocaleString('pt-BR')} {selectedVehicle?.unit}
                        </span>
                        {h.intervalo > 0 && (
                          <span className="text-green-600">+{h.intervalo.toLocaleString('pt-BR')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleButtonClick}
                  className="flex-1"
                  disabled={isSaving || !selectedVehicleId || (!horimeterValue && !kmValue)}
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
                  <X className="w-4 h-4 mr-2" />
                  Fechar
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
