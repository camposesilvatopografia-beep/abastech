import { useState, useMemo, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Clock, Save, Loader2, Truck, Edit3, Check, AlertTriangle, 
  ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { VehicleCombobox } from '@/components/ui/vehicle-combobox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useVehicles, useHorimeterReadings } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface EditableReading {
  id: string;
  reading_date: string;
  original_previous: number;
  original_current: number;
  original_previous_km: number | null;
  original_current_km: number | null;
  edited_previous: number | null;
  edited_current: number | null;
  edited_previous_km: number | null;
  edited_current_km: number | null;
  isDirty: boolean;
  isSaving: boolean;
  isSaved: boolean;
  error?: string;
}

interface BatchEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function BatchEditModal({ open, onOpenChange, onSuccess }: BatchEditModalProps) {
  const { vehicles } = useVehicles();
  const { readings, updateReading, refetch } = useHorimeterReadings();
  const { toast } = useToast();
  
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [editableReadings, setEditableReadings] = useState<EditableReading[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showOnlyDirty, setShowOnlyDirty] = useState(false);

  // Get readings for selected vehicle
  const vehicleReadings = useMemo(() => {
    if (!selectedVehicleId) return [];
    return readings
      .filter(r => r.vehicle_id === selectedVehicleId)
      .sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime());
  }, [selectedVehicleId, readings]);

  // Initialize editable readings when vehicle changes
  useEffect(() => {
    if (!selectedVehicleId) {
      setEditableReadings([]);
      return;
    }
    
    setEditableReadings(
      vehicleReadings.map(r => ({
        id: r.id,
        reading_date: r.reading_date,
        original_previous: r.previous_value || 0,
        original_current: r.current_value || 0,
        original_previous_km: (r as any).previous_km || null,
        original_current_km: (r as any).current_km || null,
        edited_previous: null,
        edited_current: null,
        edited_previous_km: null,
        edited_current_km: null,
        isDirty: false,
        isSaving: false,
        isSaved: false,
      }))
    );
  }, [selectedVehicleId, vehicleReadings]);

  const selectedVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedVehicleId);
  }, [vehicles, selectedVehicleId]);

  const updateEditableReading = useCallback((
    id: string, 
    field: 'edited_previous' | 'edited_current' | 'edited_previous_km' | 'edited_current_km', 
    value: number | null
  ) => {
    setEditableReadings(prev => prev.map(r => {
      if (r.id !== id) return r;
      
      const updated = { ...r, [field]: value };
      
      // Check if any field is different from original
      const prevDiff = updated.edited_previous !== null && updated.edited_previous !== r.original_previous;
      const currDiff = updated.edited_current !== null && updated.edited_current !== r.original_current;
      const prevKmDiff = updated.edited_previous_km !== null && updated.edited_previous_km !== r.original_previous_km;
      const currKmDiff = updated.edited_current_km !== null && updated.edited_current_km !== r.original_current_km;
      
      updated.isDirty = prevDiff || currDiff || prevKmDiff || currKmDiff;
      updated.isSaved = false;
      
      return updated;
    }));
  }, []);

  const dirtyCount = editableReadings.filter(r => r.isDirty).length;
  const savedCount = editableReadings.filter(r => r.isSaved).length;

  const handleSaveAll = async () => {
    const dirtyReadings = editableReadings.filter(r => r.isDirty);
    if (dirtyReadings.length === 0) {
      toast({ title: 'Nenhuma alteração para salvar' });
      return;
    }

    setIsSaving(true);
    let saved = 0;
    let errors = 0;

    for (const reading of dirtyReadings) {
      // Mark as saving
      setEditableReadings(prev => prev.map(r => 
        r.id === reading.id ? { ...r, isSaving: true } : r
      ));

      try {
        const updates: any = {};
        
        if (reading.edited_previous !== null) {
          updates.previous_value = reading.edited_previous;
        }
        if (reading.edited_current !== null) {
          updates.current_value = reading.edited_current;
          updates._horimeterValue = reading.edited_current;
        }
        if (reading.edited_previous_km !== null) {
          updates.previous_km = reading.edited_previous_km;
        }
        if (reading.edited_current_km !== null) {
          updates.current_km = reading.edited_current_km;
          updates._kmValue = reading.edited_current_km;
        }

        await updateReading(reading.id, updates);
        saved++;
        
        // Mark as saved
        setEditableReadings(prev => prev.map(r => 
          r.id === reading.id ? { 
            ...r, 
            isSaving: false, 
            isSaved: true, 
            isDirty: false,
            original_previous: reading.edited_previous ?? r.original_previous,
            original_current: reading.edited_current ?? r.original_current,
            original_previous_km: reading.edited_previous_km ?? r.original_previous_km,
            original_current_km: reading.edited_current_km ?? r.original_current_km,
            edited_previous: null,
            edited_current: null,
            edited_previous_km: null,
            edited_current_km: null,
          } : r
        ));
      } catch (err: any) {
        errors++;
        setEditableReadings(prev => prev.map(r => 
          r.id === reading.id ? { ...r, isSaving: false, error: err.message || 'Erro ao salvar' } : r
        ));
      }
    }

    setIsSaving(false);
    
    if (saved > 0) {
      toast({ 
        title: 'Alterações salvas!', 
        description: `${saved} registro(s) atualizado(s)${errors > 0 ? `, ${errors} erro(s)` : ''}`
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
    if (dirtyCount > 0) {
      if (!confirm(`Você tem ${dirtyCount} alteração(ões) não salvas. Deseja sair mesmo assim?`)) {
        return;
      }
    }
    setSelectedVehicleId('');
    setEditableReadings([]);
    onOpenChange(false);
  };

  const displayedReadings = showOnlyDirty 
    ? editableReadings.filter(r => r.isDirty || r.isSaved)
    : editableReadings;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[95vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3 text-lg">
              <div className="p-2 rounded-lg bg-blue-500 text-white">
                <Edit3 className="w-4 h-4" />
              </div>
              Edição em Lote
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Edite valores de horímetro anterior e atual para múltiplos registros
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-4 gap-4">
          {/* Vehicle Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/50 rounded-xl border-2 border-border">
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
                placeholder="Selecionar veículo para editar..."
                useIdAsValue
              />
            </div>
            
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </Button>
              
              {editableReadings.length > 0 && (
                <Button
                  variant={showOnlyDirty ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyDirty(!showOnlyDirty)}
                  className="gap-2"
                >
                  {showOnlyDirty ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showOnlyDirty ? 'Mostrar Todos' : 'Só Alterados'}
                </Button>
              )}
            </div>
          </div>

          {/* Vehicle Info */}
          {selectedVehicle && (
            <div className="flex items-center justify-between gap-4 p-2 px-4 bg-muted/50 rounded-lg border text-sm">
              <div className="flex items-center gap-3">
                <span className="font-bold">{selectedVehicle.code}</span>
                <span className="text-muted-foreground">{selectedVehicle.name}</span>
                <Badge variant="outline" className="text-xs">
                  {selectedVehicle.category || 'Sem categoria'}
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400">
                  <Edit3 className="w-3 h-3" />
                  {dirtyCount} alterado(s)
                </Badge>
                {savedCount > 0 && (
                  <Badge variant="outline" className="gap-1 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400">
                    <Check className="w-3 h-3" />
                    {savedCount} salvo(s)
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {editableReadings.length} registros
                </Badge>
              </div>
            </div>
          )}

          {/* Table Header */}
          <Card className="flex-1 overflow-hidden border-0 shadow-none">
            <div className="grid grid-cols-[100px_1fr_1fr_1fr_1fr_60px] gap-2 py-2 px-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Data</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                Hor. Anterior
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                Hor. Atual
              </span>
              <span className="flex items-center gap-1 text-blue-600">
                KM Anterior
              </span>
              <span className="flex items-center gap-1 text-blue-600">
                KM Atual
              </span>
              <span className="text-center">Status</span>
            </div>
            
            <ScrollArea className="h-[400px]">
              <div className="divide-y">
                {displayedReadings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Edit3 className="w-10 h-10 mb-2 opacity-30" />
                    <p className="text-sm">
                      {selectedVehicleId 
                        ? 'Nenhum registro encontrado para este veículo' 
                        : 'Selecione um veículo para editar'}
                    </p>
                  </div>
                ) : (
                  displayedReadings.map((reading) => (
                    <div 
                      key={reading.id}
                      className={cn(
                        "grid grid-cols-[100px_1fr_1fr_1fr_1fr_60px] gap-2 items-center py-2 px-3 transition-colors",
                        reading.isDirty && "bg-amber-50/50 dark:bg-amber-950/20",
                        reading.isSaved && "bg-green-50/50 dark:bg-green-950/20",
                        reading.error && "bg-red-50/50 dark:bg-red-950/20",
                        reading.isSaving && "bg-blue-50/50 dark:bg-blue-950/20"
                      )}
                    >
                      {/* Date */}
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {format(new Date(reading.reading_date + 'T00:00:00'), 'dd/MM/yy')}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {format(new Date(reading.reading_date + 'T00:00:00'), 'EEE', { locale: ptBR })}
                        </span>
                      </div>

                      {/* Hor. Anterior */}
                      <div className="relative">
                        <CurrencyInput
                          value={reading.edited_previous ?? reading.original_previous}
                          onChange={(val) => updateEditableReading(reading.id, 'edited_previous', val)}
                          disabled={reading.isSaving}
                          className={cn(
                            "h-9 text-sm font-mono",
                            reading.edited_previous !== null && reading.edited_previous !== reading.original_previous 
                              && "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                          )}
                        />
                        {reading.edited_previous !== null && reading.edited_previous !== reading.original_previous && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-amber-500 text-white px-1 rounded">
                            era {reading.original_previous.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>

                      {/* Hor. Atual */}
                      <div className="relative">
                        <CurrencyInput
                          value={reading.edited_current ?? reading.original_current}
                          onChange={(val) => updateEditableReading(reading.id, 'edited_current', val)}
                          disabled={reading.isSaving}
                          className={cn(
                            "h-9 text-sm font-mono",
                            reading.edited_current !== null && reading.edited_current !== reading.original_current 
                              && "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                          )}
                        />
                        {reading.edited_current !== null && reading.edited_current !== reading.original_current && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-amber-500 text-white px-1 rounded">
                            era {reading.original_current.toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>

                      {/* KM Anterior */}
                      <div className="relative">
                        <CurrencyInput
                          value={reading.edited_previous_km ?? reading.original_previous_km ?? 0}
                          onChange={(val) => updateEditableReading(reading.id, 'edited_previous_km', val)}
                          disabled={reading.isSaving}
                          className={cn(
                            "h-9 text-sm font-mono",
                            reading.edited_previous_km !== null && reading.edited_previous_km !== reading.original_previous_km 
                              && "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                          )}
                        />
                        {reading.edited_previous_km !== null && reading.edited_previous_km !== reading.original_previous_km && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 text-white px-1 rounded">
                            era {(reading.original_previous_km || 0).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>

                      {/* KM Atual */}
                      <div className="relative">
                        <CurrencyInput
                          value={reading.edited_current_km ?? reading.original_current_km ?? 0}
                          onChange={(val) => updateEditableReading(reading.id, 'edited_current_km', val)}
                          disabled={reading.isSaving}
                          className={cn(
                            "h-9 text-sm font-mono",
                            reading.edited_current_km !== null && reading.edited_current_km !== reading.original_current_km 
                              && "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                          )}
                        />
                        {reading.edited_current_km !== null && reading.edited_current_km !== reading.original_current_km && (
                          <span className="absolute -top-1 -right-1 text-[8px] bg-blue-500 text-white px-1 rounded">
                            era {(reading.original_current_km || 0).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>

                      {/* Status */}
                      <div className="flex justify-center">
                        {reading.isSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : reading.isSaved ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : reading.error ? (
                          <AlertTriangle className="w-4 h-4 text-destructive" />
                        ) : reading.isDirty ? (
                          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Alterado" />
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
        <DialogFooter className="p-4 pt-3 border-t bg-muted/20 gap-3">
          <Button variant="outline" onClick={handleClose} className="min-w-[100px]">
            Fechar
          </Button>
          <Button 
            onClick={handleSaveAll} 
            disabled={isSaving || dirtyCount === 0}
            className="min-w-[180px] gap-2 bg-blue-500 hover:bg-blue-600 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Salvar {dirtyCount} Alteração(ões)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
