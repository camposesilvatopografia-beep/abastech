import { useState, useMemo, useEffect } from 'react';
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, Plus, Trash2, Check, AlertTriangle } from 'lucide-react';
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
import { useVehicles, useHorimeterReadings } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface BatchEntry {
  id: string;
  date: Date;
  horimeterValue: string;
  kmValue: string;
  saved: boolean;
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

  // Get previous values for the selected vehicle
  const previousValues = useMemo(() => {
    if (!selectedVehicleId || readings.length === 0) return { horimeter: 0, km: 0 };
    
    const vehicleReadings = readings
      .filter(r => r.vehicle_id === selectedVehicleId)
      .sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime());
    
    if (vehicleReadings.length === 0) return { horimeter: 0, km: 0 };
    
    const latest = vehicleReadings[0];
    return {
      horimeter: latest.current_value || 0,
      km: (latest as any).current_km || 0
    };
  }, [selectedVehicleId, readings]);

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
      try {
        const horimeterNum = entry.horimeterValue 
          ? parseFloat(entry.horimeterValue.replace(/\./g, '').replace(',', '.')) 
          : null;
        const kmNum = entry.kmValue 
          ? parseFloat(entry.kmValue.replace(/\./g, '').replace(',', '.')) 
          : null;

        if (!horimeterNum && !kmNum) continue;

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
          e.id === entry.id ? { ...e, saved: true, error: undefined } : e
        ));
      } catch (err: any) {
        errors++;
        setEntries(prev => prev.map(e => 
          e.id === entry.id ? { ...e, error: err.message || 'Erro ao salvar' } : e
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Cadastro em Lote - Horímetros
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Vehicle Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Veículo *</Label>
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
                placeholder="Selecione o veículo..."
              />
            </div>
            <div className="space-y-2">
              <Label>Operador</Label>
              <Input
                value={operador}
                onChange={(e) => setOperador(e.target.value)}
                placeholder="Nome do operador"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input
                type="date"
                value={format(startDate, 'yyyy-MM-dd')}
                onChange={(e) => setStartDate(new Date(e.target.value + 'T00:00:00'))}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={format(endDate, 'yyyy-MM-dd')}
                onChange={(e) => setEndDate(new Date(e.target.value + 'T00:00:00'))}
              />
            </div>
          </div>

          {/* Previous Values Info */}
          {selectedVehicle && (
            <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-sm">
                  <span className="text-muted-foreground">Último Horímetro:</span>{' '}
                  <span className="font-bold text-amber-600">
                    {previousValues.horimeter > 0 ? previousValues.horimeter.toLocaleString('pt-BR') : '-'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span className="text-sm">
                  <span className="text-muted-foreground">Último KM:</span>{' '}
                  <span className="font-bold text-blue-600">
                    {previousValues.km > 0 ? previousValues.km.toLocaleString('pt-BR') : '-'}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Status Badges */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <Check className="w-3 h-3 mr-1" />
              {savedCount} salvos
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              <Clock className="w-3 h-3 mr-1" />
              {unsavedCount} pendentes
            </Badge>
          </div>

          {/* Entries List */}
          <ScrollArea className="flex-1 border rounded-lg">
            <div className="p-2 space-y-2">
              {entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Selecione um veículo e período para gerar os registros
                </div>
              ) : (
                entries.map((entry, index) => (
                  <div 
                    key={entry.id}
                    className={cn(
                      "grid grid-cols-[120px_1fr_1fr_40px] gap-2 p-2 rounded-lg border items-center",
                      entry.saved && "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
                      entry.error && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {format(entry.date, 'dd/MM/yyyy')}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Input
                        placeholder="Horímetro"
                        value={entry.horimeterValue}
                        onChange={(e) => updateEntry(index, 'horimeterValue', e.target.value)}
                        disabled={entry.saved}
                        className={cn(
                          "h-8 text-sm",
                          entry.saved && "bg-green-100 dark:bg-green-900/50"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <Input
                        placeholder="KM"
                        value={entry.kmValue}
                        onChange={(e) => updateEntry(index, 'kmValue', e.target.value)}
                        disabled={entry.saved}
                        className={cn(
                          "h-8 text-sm",
                          entry.saved && "bg-green-100 dark:bg-green-900/50"
                        )}
                      />
                    </div>
                    <div className="flex justify-center" title={entry.error || undefined}>
                      {entry.saved ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : entry.error ? (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose}>
            Fechar
          </Button>
          <Button 
            onClick={handleSaveAll} 
            disabled={isSaving || unsavedCount === 0}
            className="gap-2"
          >
            {isSaving ? (
              <>Salvando...</>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Salvar {unsavedCount} Registro(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
