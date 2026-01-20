import { useState, useMemo, useEffect, useCallback } from 'react';
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Plus, Trash2, Check, AlertTriangle, Save, Loader2, Maximize2, Minimize2, TrendingUp, TrendingDown, Minus, Truck, User } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VehicleCombobox } from '@/components/ui/vehicle-combobox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVehicles, useHorimeterReadings } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { parsePtBRNumber } from '@/lib/ptBRNumber';

interface BatchEntry {
  id: string;
  date: Date;
  horimeterValue: string;
  kmValue: string;
  saved: boolean;
  saving?: boolean;
  error?: string;
}

interface ValidationResult {
  isValid: boolean;
  previousValue: number;
  currentValue: number;
  difference: number;
  warning?: string;
}

interface BatchHorimeterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BatchHorimeterModal({ open, onOpenChange, onSuccess }: BatchHorimeterModalProps) {
  const { vehicles } = useVehicles();
  const { readings, createReading } = useHorimeterReadings();
  const { toast } = useToast();
  
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [operador, setOperador] = useState('');
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 6));
  const [endDate, setEndDate] = useState<Date>(new Date());

  // Get previous values and operator for the selected vehicle
  const previousValues = useMemo(() => {
    if (!selectedVehicleId || readings.length === 0) return { horimeter: 0, km: 0, operator: '' };
    
    const vehicleReadings = readings
      .filter(r => r.vehicle_id === selectedVehicleId)
      .sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime());
    
    if (vehicleReadings.length === 0) return { horimeter: 0, km: 0, operator: '' };
    
    const latest = vehicleReadings[0];
    return {
      horimeter: latest.current_value || 0,
      km: (latest as any).current_km || 0,
      operator: latest.operator || ''
    };
  }, [selectedVehicleId, readings]);

  // Auto-fill operator when vehicle changes
  useEffect(() => {
    if (selectedVehicleId && previousValues.operator) {
      setOperador(previousValues.operator);
    }
  }, [selectedVehicleId, previousValues.operator]);

  // Generate entries for date range when vehicle changes or dates change
  useEffect(() => {
    if (!selectedVehicleId || !startDate || !endDate) return;
    
    const newEntries: BatchEntry[] = [];
    let currentDate = startOfDay(startDate);
    const end = startOfDay(endDate);
    
    while (currentDate <= end) {
      // Check if there's already a reading for this date
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      const existingReading = readings.find(
        r => r.vehicle_id === selectedVehicleId && r.reading_date === dateStr
      );
      
      newEntries.push({
        id: `entry-${dateStr}`,
        date: new Date(currentDate),
        horimeterValue: existingReading?.current_value?.toString().replace('.', ',') || '',
        kmValue: (existingReading as any)?.current_km?.toString().replace('.', ',') || '',
        saved: !!existingReading
      });
      
      currentDate = addDays(currentDate, 1);
    }
    
    setEntries(newEntries);
  }, [selectedVehicleId, startDate, endDate, readings]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  // Parse numeric value from string
  const parseNumericValue = useCallback((value: string): number | null => {
    if (!value || value.trim() === '') return null;
    return parsePtBRNumber(value);
  }, []);

  // Get validation for a specific entry based on previous entries and readings
  const getEntryValidation = useCallback((index: number, field: 'horimeter' | 'km'): ValidationResult => {
    const entry = entries[index];
    if (!entry) return { isValid: true, previousValue: 0, currentValue: 0, difference: 0 };

    const currentValue = parseNumericValue(field === 'horimeter' ? entry.horimeterValue : entry.kmValue);
    if (currentValue === null) return { isValid: true, previousValue: 0, currentValue: 0, difference: 0 };

    // Find previous value from earlier entries in the batch or from database
    let previousValue = 0;

    // First check previous entries in the batch (going backwards)
    for (let i = index - 1; i >= 0; i--) {
      const prevEntry = entries[i];
      const prevValue = parseNumericValue(field === 'horimeter' ? prevEntry.horimeterValue : prevEntry.kmValue);
      if (prevValue !== null && prevValue > 0) {
        previousValue = prevValue;
        break;
      }
    }

    // If no previous entry in batch, use database values
    if (previousValue === 0) {
      previousValue = field === 'horimeter' ? previousValues.horimeter : previousValues.km;
    }

    const difference = currentValue - previousValue;
    
    // Validation rules
    if (previousValue > 0 && currentValue < previousValue) {
      return {
        isValid: false,
        previousValue,
        currentValue,
        difference,
        warning: `Valor menor que anterior (${previousValue.toLocaleString('pt-BR')})`
      };
    }

    // Warning for large jumps (>500h or >10000km)
    const threshold = field === 'horimeter' ? 500 : 10000;
    if (previousValue > 0 && difference > threshold) {
      return {
        isValid: true,
        previousValue,
        currentValue,
        difference,
        warning: `Diferença alta: +${difference.toLocaleString('pt-BR')} ${field === 'horimeter' ? 'h' : 'km'}`
      };
    }

    return {
      isValid: true,
      previousValue,
      currentValue,
      difference
    };
  }, [entries, previousValues, parseNumericValue]);

  const updateEntry = (index: number, field: 'horimeterValue' | 'kmValue', value: string) => {
    setEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value, saved: false };
      return updated;
    });
  };

  const handleSaveAll = async () => {
    if (!selectedVehicleId) {
      toast({ title: 'Selecione um veículo', variant: 'destructive' });
      return;
    }

    const unsavedEntries = entries.filter(e => !e.saved && (e.horimeterValue || e.kmValue));
    if (unsavedEntries.length === 0) {
      toast({ title: 'Nenhum registro para salvar' });
      return;
    }

    setIsSaving(true);
    let saved = 0;
    let errors = 0;

    for (const entry of unsavedEntries) {
      // Mark as saving
      setEntries(prev => prev.map(e => 
        e.id === entry.id ? { ...e, saving: true } : e
      ));

      try {
        const horimeterNum = entry.horimeterValue ? parsePtBRNumber(entry.horimeterValue) : null;
        const kmNum = entry.kmValue ? parsePtBRNumber(entry.kmValue) : null;

        if (!horimeterNum && !kmNum) {
          setEntries(prev => prev.map(e => 
            e.id === entry.id ? { ...e, saving: false } : e
          ));
          continue;
        }

        // Get previous values for this specific date
        const dateStr = format(entry.date, 'yyyy-MM-dd');
        const previousReadings = readings
          .filter(r => r.vehicle_id === selectedVehicleId && r.reading_date < dateStr)
          .sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime());
        
        const prevHorimeter = previousReadings.length > 0 ? previousReadings[0].current_value : null;
        const prevKm = previousReadings.length > 0 ? (previousReadings[0] as any).current_km : null;

        await createReading({
          vehicle_id: selectedVehicleId,
          reading_date: dateStr,
          current_value: horimeterNum || 0,
          previous_value: prevHorimeter,
          current_km: kmNum,
          previous_km: prevKm,
          operator: operador || null,
          observations: 'Cadastro em lote',
          source: 'batch'
        });

        saved++;
        
        // Mark as saved
        setEntries(prev => prev.map(e => 
          e.id === entry.id ? { ...e, saved: true, saving: false, error: undefined } : e
        ));
      } catch (err: any) {
        errors++;
        setEntries(prev => prev.map(e => 
          e.id === entry.id ? { ...e, saving: false, error: err.message || 'Erro ao salvar' } : e
        ));
      }
    }

    setIsSaving(false);
    
    if (saved > 0) {
      toast({ 
        title: 'Registros salvos!', 
        description: `${saved} registro(s) criado(s)${errors > 0 ? `, ${errors} erro(s)` : ''}`
      });
      onSuccess();
    }
    
    if (errors > 0 && saved === 0) {
      toast({ 
        title: 'Erro ao salvar', 
        description: `${errors} erro(s) encontrado(s)`,
        variant: 'destructive'
      });
    }
  };

  const handleClose = () => {
    setSelectedVehicleId('');
    setOperador('');
    setEntries([]);
    onOpenChange(false);
  };

  const unsavedCount = entries.filter(e => !e.saved && (e.horimeterValue || e.kmValue)).length;
  const savedCount = entries.filter(e => e.saved).length;
  const totalDays = entries.length;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isFieldsExpanded, setIsFieldsExpanded] = useState(false);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "max-h-[95vh] flex flex-col p-0 gap-0 transition-all duration-300",
        isExpanded ? "max-w-[95vw] h-[95vh]" : "max-w-4xl"
      )}>
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 rounded-lg bg-amber-500 text-white">
                <Plus className="w-4 h-4" />
              </div>
              Cadastro em Lote
            </DialogTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="shrink-0"
            >
              {isExpanded ? 'Reduzir' : 'Expandir Tela'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Registre horímetros para múltiplos dias
          </p>
        </DialogHeader>

        <div className={cn(
          "flex-1 overflow-hidden flex flex-col p-4 gap-4",
          isExpanded && "p-6 gap-6"
        )}>
          {/* Enhanced Configuration Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-xl border-2 border-border">
            {/* Vehicle Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Truck className="w-4 h-4 text-primary" />
                Veículo *
              </Label>
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
                placeholder="Selecionar veículo..."
                useIdAsValue
              />
            </div>
            
            {/* Operator */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Operador
              </Label>
              <Input
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                placeholder="Nome do operador"
                className="h-12 text-base border-2 border-input bg-background font-medium"
              />
            </div>
            
            {/* Date Range - Full Width */}
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-600" />
                  Data Início
                </Label>
                <Select 
                  value={format(startDate, 'yyyy-MM-dd')}
                  onValueChange={(val) => setStartDate(new Date(val + 'T00:00:00'))}
                >
                  <SelectTrigger className="h-14 text-base border-2 border-green-300 dark:border-green-700 bg-background font-bold">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-green-600" />
                        {format(startDate, "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-2 border-border max-h-[300px]">
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = subDays(new Date(), i);
                      const dateStr = format(date, 'yyyy-MM-dd');
                      return (
                        <SelectItem key={dateStr} value={dateStr} className="text-base py-3 font-medium">
                          {format(date, "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-red-600" />
                  Data Fim
                </Label>
                <Select 
                  value={format(endDate, 'yyyy-MM-dd')}
                  onValueChange={(val) => setEndDate(new Date(val + 'T00:00:00'))}
                >
                  <SelectTrigger className="h-14 text-base border-2 border-red-300 dark:border-red-700 bg-background font-bold">
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-red-600" />
                        {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-2 border-border max-h-[300px]">
                    {Array.from({ length: 30 }, (_, i) => {
                      const date = subDays(new Date(), i);
                      const dateStr = format(date, 'yyyy-MM-dd');
                      return (
                        <SelectItem key={dateStr} value={dateStr} className="text-base py-3 font-medium">
                          {format(date, "dd/MM/yyyy (EEEE)", { locale: ptBR })}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Vehicle Info & Previous Values - Compact */}
          {selectedVehicle && (
            <div className="flex items-center justify-between gap-4 p-2 px-4 bg-muted/50 rounded-lg border text-sm">
              <div className="flex items-center gap-3">
                <span className="font-bold">{selectedVehicle.code}</span>
                <span className="text-muted-foreground">{selectedVehicle.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  <span className="font-semibold text-amber-600">
                    {previousValues.horimeter > 0 ? previousValues.horimeter.toLocaleString('pt-BR') + 'h' : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span className="font-semibold text-blue-600">
                    {previousValues.km > 0 ? previousValues.km.toLocaleString('pt-BR') + ' km' : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Status Summary - Compact */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-6 px-2 gap-1 text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400">
                <Check className="w-3 h-3" />
                {savedCount}
              </Badge>
              <Badge variant="outline" className="h-6 px-2 gap-1 text-xs bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400">
                <Clock className="w-3 h-3" />
                {unsavedCount}
              </Badge>
              <Badge variant="outline" className="h-6 px-2 gap-1 text-xs">
                <Calendar className="w-3 h-3" />
                {totalDays} dias
              </Badge>
            </div>
            
            {/* Toggle para expandir campos */}
            <Button
              variant={isFieldsExpanded ? "default" : "outline"}
              size="sm"
              onClick={() => setIsFieldsExpanded(!isFieldsExpanded)}
              className={cn(
                "gap-2 transition-all",
                isFieldsExpanded && "bg-amber-500 hover:bg-amber-600 text-white"
              )}
            >
              {isFieldsExpanded ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  Reduzir Campos
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  Ampliar Campos
                </>
              )}
            </Button>
          </div>

          {/* Entries Table */}
          <Card className="flex-1 overflow-hidden border-0 shadow-none">
            <div className={cn(
              "grid gap-3 py-2 px-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide",
              isFieldsExpanded 
                ? "grid-cols-[120px_1fr_1fr_80px]" 
                : "grid-cols-[140px_1fr_1fr_60px]"
            )}>
              <span>Data</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                Horímetro
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-500" />
                KM
              </span>
              <span className="text-center">Status</span>
            </div>
            <ScrollArea className={cn(
              isExpanded ? "h-[calc(100vh-420px)]" : isFieldsExpanded ? "h-[350px]" : "h-[280px]"
            )}>
              <div className={cn(
                "divide-y",
                isFieldsExpanded && "space-y-2 divide-y-0 p-2"
              )}>
                {entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">Selecione veículo e período</p>
                  </div>
                ) : (
                  entries.map((entry, index) => (
                    <div 
                      key={entry.id}
                      className={cn(
                        "grid gap-3 items-center transition-colors",
                        isFieldsExpanded 
                          ? "grid-cols-[120px_1fr_1fr_80px] py-3 px-4 rounded-xl border bg-card shadow-sm"
                          : "grid-cols-[140px_1fr_1fr_60px] py-2 px-3",
                        entry.saved && "bg-green-50/50 dark:bg-green-950/20 border-green-200",
                        entry.error && "bg-red-50/50 dark:bg-red-950/20 border-red-200",
                        entry.saving && "bg-blue-50/50 dark:bg-blue-950/20 border-blue-200",
                        !entry.saved && !entry.error && !entry.saving && !isFieldsExpanded && "hover:bg-muted/20"
                      )}
                    >
                      {/* Date Column */}
                      <div className={cn(
                        "flex flex-col",
                        isFieldsExpanded && "justify-center"
                      )}>
                        <span className={cn(
                          "font-medium",
                          isFieldsExpanded ? "text-lg font-bold" : "text-sm"
                        )}>
                          {format(entry.date, 'dd/MM')}
                        </span>
                        <span className={cn(
                          "text-muted-foreground capitalize",
                          isFieldsExpanded ? "text-sm" : "text-[10px]"
                        )}>
                          {format(entry.date, 'EEE', { locale: ptBR })}
                        </span>
                      </div>

                      {/* Horimeter Input */}
                      {(() => {
                        const validation = getEntryValidation(index, 'horimeter');
                        const hasValue = entry.horimeterValue && entry.horimeterValue.trim() !== '';
                        const showValidation = hasValue && !entry.saved && !entry.saving;
                        
                        return (
                          <div className="relative">
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="4.520"
                                value={entry.horimeterValue}
                                onChange={(e) => updateEntry(index, 'horimeterValue', e.target.value)}
                                disabled={entry.saved || entry.saving}
                                className={cn(
                                  "font-mono transition-all flex-1",
                                  isFieldsExpanded 
                                    ? "h-14 text-2xl font-bold text-center border-2" 
                                    : isExpanded 
                                      ? "h-10 text-lg" 
                                      : "h-9",
                                  entry.saved && "bg-green-100 dark:bg-green-900/50 border-green-300",
                                  entry.saving && "bg-blue-50 dark:bg-blue-900/30",
                                  showValidation && !validation.isValid && "border-red-400 bg-red-50 dark:bg-red-950/30 focus:border-red-500 focus:ring-red-500/20",
                                  showValidation && validation.isValid && validation.warning && "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 focus:border-yellow-500 focus:ring-yellow-500/20",
                                  showValidation && validation.isValid && !validation.warning && "border-green-400 bg-green-50 dark:bg-green-950/30 focus:border-green-500 focus:ring-green-500/20",
                                  !showValidation && isFieldsExpanded && "border-amber-300 focus:border-amber-500 focus:ring-amber-500/20"
                                )}
                              />
                              {showValidation && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className={cn(
                                        "flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                                        !validation.isValid && "bg-red-100 text-red-600 dark:bg-red-900/50",
                                        validation.isValid && validation.warning && "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50",
                                        validation.isValid && !validation.warning && "bg-green-100 text-green-600 dark:bg-green-900/50"
                                      )}>
                                        {!validation.isValid ? (
                                          <TrendingDown className="w-3.5 h-3.5" />
                                        ) : validation.warning ? (
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                        ) : (
                                          <TrendingUp className="w-3.5 h-3.5" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      {validation.warning ? (
                                        <p className="text-xs">{validation.warning}</p>
                                      ) : validation.previousValue > 0 ? (
                                        <p className="text-xs">
                                          +{validation.difference.toLocaleString('pt-BR')}h 
                                          (anterior: {validation.previousValue.toLocaleString('pt-BR')}h)
                                        </p>
                                      ) : (
                                        <p className="text-xs">Primeiro registro</p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {isFieldsExpanded && (
                              <p className={cn(
                                "text-[10px] mt-1 text-center",
                                showValidation && !validation.isValid && "text-red-600",
                                showValidation && validation.isValid && validation.warning && "text-yellow-600",
                                showValidation && validation.isValid && !validation.warning && "text-green-600",
                                !showValidation && "text-amber-600"
                              )}>
                                Horímetro {showValidation && validation.previousValue > 0 && (
                                  <span className="font-medium">
                                    (ant: {validation.previousValue.toLocaleString('pt-BR')})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* KM Input */}
                      {(() => {
                        const validation = getEntryValidation(index, 'km');
                        const hasValue = entry.kmValue && entry.kmValue.trim() !== '';
                        const showValidation = hasValue && !entry.saved && !entry.saving;
                        
                        return (
                          <div className="relative">
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="125.000"
                                value={entry.kmValue}
                                onChange={(e) => updateEntry(index, 'kmValue', e.target.value)}
                                disabled={entry.saved || entry.saving}
                                className={cn(
                                  "font-mono transition-all flex-1",
                                  isFieldsExpanded 
                                    ? "h-14 text-2xl font-bold text-center border-2" 
                                    : isExpanded 
                                      ? "h-10 text-lg" 
                                      : "h-9",
                                  entry.saved && "bg-green-100 dark:bg-green-900/50 border-green-300",
                                  entry.saving && "bg-blue-50 dark:bg-blue-900/30",
                                  showValidation && !validation.isValid && "border-red-400 bg-red-50 dark:bg-red-950/30 focus:border-red-500 focus:ring-red-500/20",
                                  showValidation && validation.isValid && validation.warning && "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 focus:border-yellow-500 focus:ring-yellow-500/20",
                                  showValidation && validation.isValid && !validation.warning && "border-green-400 bg-green-50 dark:bg-green-950/30 focus:border-green-500 focus:ring-green-500/20",
                                  !showValidation && isFieldsExpanded && "border-blue-300 focus:border-blue-500 focus:ring-blue-500/20"
                                )}
                              />
                              {showValidation && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className={cn(
                                        "flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                                        !validation.isValid && "bg-red-100 text-red-600 dark:bg-red-900/50",
                                        validation.isValid && validation.warning && "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50",
                                        validation.isValid && !validation.warning && "bg-green-100 text-green-600 dark:bg-green-900/50"
                                      )}>
                                        {!validation.isValid ? (
                                          <TrendingDown className="w-3.5 h-3.5" />
                                        ) : validation.warning ? (
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                        ) : (
                                          <TrendingUp className="w-3.5 h-3.5" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[200px]">
                                      {validation.warning ? (
                                        <p className="text-xs">{validation.warning}</p>
                                      ) : validation.previousValue > 0 ? (
                                        <p className="text-xs">
                                          +{validation.difference.toLocaleString('pt-BR')} km 
                                          (anterior: {validation.previousValue.toLocaleString('pt-BR')} km)
                                        </p>
                                      ) : (
                                        <p className="text-xs">Primeiro registro</p>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            {isFieldsExpanded && (
                              <p className={cn(
                                "text-[10px] mt-1 text-center",
                                showValidation && !validation.isValid && "text-red-600",
                                showValidation && validation.isValid && validation.warning && "text-yellow-600",
                                showValidation && validation.isValid && !validation.warning && "text-green-600",
                                !showValidation && "text-blue-600"
                              )}>
                                Quilômetros {showValidation && validation.previousValue > 0 && (
                                  <span className="font-medium">
                                    (ant: {validation.previousValue.toLocaleString('pt-BR')})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Status Indicator */}
                      <div className="flex justify-center">
                        {entry.saving ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : entry.saved ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : entry.error ? (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        ) : (entry.horimeterValue || entry.kmValue) ? (
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Pendente" />
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 pt-4 border-t bg-muted/20 gap-3">
          <Button variant="outline" onClick={handleClose} className="min-w-[100px]">
            Fechar
          </Button>
          <Button 
            onClick={handleSaveAll} 
            disabled={isSaving || unsavedCount === 0 || !selectedVehicleId}
            className="min-w-[180px] gap-2 bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar {unsavedCount} Registro(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
