import { useState, useMemo, useEffect } from 'react';
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Plus, Trash2, Check, AlertTriangle, Save, Loader2 } from 'lucide-react';
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
import { useVehicles, useHorimeterReadings } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BatchEntry {
  id: string;
  date: Date;
  horimeterValue: string;
  kmValue: string;
  saved: boolean;
  saving?: boolean;
  error?: string;
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
        const horimeterNum = entry.horimeterValue 
          ? parseFloat(entry.horimeterValue.replace(/\./g, '').replace(',', '.')) 
          : null;
        const kmNum = entry.kmValue 
          ? parseFloat(entry.kmValue.replace(/\./g, '').replace(',', '.')) 
          : null;

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
          {/* Compact Configuration Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg border">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Veículo *</Label>
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
                placeholder="Selecionar..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Operador</Label>
              <Input
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                placeholder="Nome"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Data Início</Label>
              <Input
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => setStartDate(new Date(e.target.value + 'T00:00:00'))}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Data Fim</Label>
              <Input
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => setEndDate(new Date(e.target.value + 'T00:00:00'))}
                className="h-9"
              />
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

          {/* Entries Table */}
          <Card className="flex-1 overflow-hidden border-0 shadow-none">
            <div className="grid grid-cols-[140px_1fr_1fr_60px] gap-3 py-2 px-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
              isExpanded ? "h-[calc(100vh-380px)]" : "h-[280px]"
            )}>
              <div className="divide-y">
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
                        "grid grid-cols-[140px_1fr_1fr_60px] gap-3 py-2 px-3 items-center transition-colors",
                        entry.saved && "bg-green-50/50 dark:bg-green-950/20",
                        entry.error && "bg-red-50/50 dark:bg-red-950/20",
                        entry.saving && "bg-blue-50/50 dark:bg-blue-950/20",
                        !entry.saved && !entry.error && !entry.saving && "hover:bg-muted/20"
                      )}
                    >
                      {/* Date Column */}
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {format(entry.date, 'dd/MM')}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {format(entry.date, 'EEE', { locale: ptBR })}
                        </span>
                      </div>

                      {/* Horimeter Input */}
                      <div>
                        <Input
                          placeholder="4.520"
                          value={entry.horimeterValue}
                          onChange={(e) => updateEntry(index, 'horimeterValue', e.target.value)}
                          disabled={entry.saved || entry.saving}
                          className={cn(
                            "h-9 font-mono",
                            isExpanded && "h-10 text-lg",
                            entry.saved && "bg-green-100 dark:bg-green-900/50 border-green-300",
                            entry.saving && "bg-blue-50 dark:bg-blue-900/30"
                          )}
                        />
                      </div>

                      {/* KM Input */}
                      <div>
                        <Input
                          placeholder="125.000"
                          value={entry.kmValue}
                          onChange={(e) => updateEntry(index, 'kmValue', e.target.value)}
                          disabled={entry.saved || entry.saving}
                          className={cn(
                            "h-9 font-mono",
                            isExpanded && "h-10 text-lg",
                            entry.saved && "bg-green-100 dark:bg-green-900/50 border-green-300",
                            entry.saving && "bg-blue-50 dark:bg-blue-900/30"
                          )}
                        />
                      </div>

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
