import { useState, useMemo, useEffect, forwardRef } from 'react';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { useToast } from '@/hooks/use-toast';
import { Clock, Save, History, AlertTriangle, RefreshCw, TrendingUp, CalendarIcon } from 'lucide-react';
import { format, parse, isValid, startOfMonth, endOfMonth, isWithinInterval, startOfDay, isSameDay, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface HorimeterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialVehicle?: string;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

export const HorimeterModal = forwardRef<HTMLDivElement, HorimeterModalProps>(
  function HorimeterModal({ open, onOpenChange, onSuccess, initialVehicle }, ref) {
    const { data: vehicleData, loading: vehicleLoading, refetch: refetchVehicles } = useSheetData('Veiculo');
    const { data: horimeterData, create, refetch: refetchHorimeters, loading: horimeterLoading } = useSheetData('Horimetros');
    const { toast } = useToast();
    
    const [selectedVehicle, setSelectedVehicle] = useState(initialVehicle || '');
    const [currentValue, setCurrentValue] = useState('');
    const [operador, setOperador] = useState('');
    const [observacao, setObservacao] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [isSaving, setIsSaving] = useState(false);

    // Get unique vehicles from vehicle sheet
    const vehicles = useMemo(() => {
      const unique = new Map<string, { codigo: string; descricao: string; tipo: string; empresa: string; usaKm: boolean }>();
      
      vehicleData.rows.forEach(row => {
        const codigo = getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']);
        const descricao = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']);
        const tipo = getRowValue(row as any, ['TIPO', 'Tipo', 'tipo', 'CATEGORIA', 'Categoria', 'categoria']);
        const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']);
        
        // Determine if vehicle uses KM instead of hours (typically cars, trucks)
        const tipoLower = tipo.toLowerCase();
        const usaKm = tipoLower.includes('caminhão') || 
                     tipoLower.includes('caminhao') ||
                     tipoLower.includes('carro') ||
                     tipoLower.includes('utilitário') ||
                     tipoLower.includes('pickup') ||
                     tipoLower.includes('veiculo') ||
                     tipoLower.includes('veículo');
        
        if (codigo && !unique.has(codigo)) {
          unique.set(codigo, { codigo, descricao, tipo, empresa, usaKm });
        }
      });
      
      return Array.from(unique.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    }, [vehicleData.rows]);

    // Get vehicle info based on selection
    const vehicleInfo = useMemo(() => {
      return vehicles.find(v => v.codigo === selectedVehicle);
    }, [vehicles, selectedVehicle]);

    // Get last 5 horimeter/km records for selected vehicle
    const vehicleHistory = useMemo(() => {
      if (!selectedVehicle) return [];
      
      const vehicleRecords = horimeterData.rows.filter(row => {
        const veiculo = getRowValue(row as any, ['VEICULO', 'Veiculo', 'veiculo', 'EQUIPAMENTO', 'Equipamento']);
        return veiculo === selectedVehicle;
      });
      
      // Sort by date descending and get last 5
      const sorted = vehicleRecords.sort((a, b) => {
        const dateA = getRowValue(a as any, ['DATA', 'Data', 'data']);
        const dateB = getRowValue(b as any, ['DATA', 'Data', 'data']);
        return dateB.localeCompare(dateA);
      });
      
      return sorted.slice(0, 5).map((row, index, arr) => {
        const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
        const data = getRowValue(row as any, ['DATA', 'Data', 'data']);
        const operador = getRowValue(row as any, ['OPERADOR', 'Operador', 'operador', 'MOTORISTA', 'Motorista']);
        
        // Calculate interval with previous record
        const prevHoras = index < arr.length - 1 
          ? parseNumber(getRowValue(arr[index + 1] as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']))
          : 0;
        const intervalo = prevHoras > 0 ? horas - prevHoras : 0;
        
        return { horas, data, operador, intervalo };
      });
    }, [selectedVehicle, horimeterData.rows]);

    // Get previous horimeter/km value
    const previousValue = useMemo(() => {
      if (vehicleHistory.length === 0) return 0;
      return vehicleHistory[0].horas;
    }, [vehicleHistory]);

    // Check if there's already a record for the selected vehicle on the selected date
    const hasDuplicateRecord = useMemo(() => {
      if (!selectedVehicle || !selectedDate) return false;
      
      return horimeterData.rows.some(row => {
        const veiculo = getRowValue(row as any, ['VEICULO', 'Veiculo', 'veiculo', 'EQUIPAMENTO', 'Equipamento']);
        if (veiculo !== selectedVehicle) return false;
        
        const dataStr = getRowValue(row as any, ['DATA', 'Data', 'data']);
        const rowDate = parseDate(dataStr);
        
        return rowDate && isSameDay(rowDate, selectedDate);
      });
    }, [selectedVehicle, selectedDate, horimeterData.rows]);

    // Calculate total hours/km for the current month
    const monthlyTotal = useMemo(() => {
      if (!selectedVehicle) return { total: 0, count: 0 };
      
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      
      let total = 0;
      let count = 0;
      
      horimeterData.rows.forEach(row => {
        const veiculo = getRowValue(row as any, ['VEICULO', 'Veiculo', 'veiculo', 'EQUIPAMENTO', 'Equipamento']);
        if (veiculo !== selectedVehicle) return;
        
        const dataStr = getRowValue(row as any, ['DATA', 'Data', 'data']);
        const rowDate = parseDate(dataStr);
        
        if (rowDate && isWithinInterval(rowDate, { start: monthStart, end: monthEnd })) {
          const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
          if (horas > 0) {
            total += horas;
            count++;
          }
        }
      });
      
      // Calculate the interval (difference) for the month
      const monthRecords = horimeterData.rows.filter(row => {
        const veiculo = getRowValue(row as any, ['VEICULO', 'Veiculo', 'veiculo', 'EQUIPAMENTO', 'Equipamento']);
        if (veiculo !== selectedVehicle) return false;
        
        const dataStr = getRowValue(row as any, ['DATA', 'Data', 'data']);
        const rowDate = parseDate(dataStr);
        return rowDate && isWithinInterval(rowDate, { start: monthStart, end: monthEnd });
      });
      
      if (monthRecords.length >= 2) {
        const sorted = monthRecords.sort((a, b) => {
          const dateA = getRowValue(a as any, ['DATA', 'Data', 'data']);
          const dateB = getRowValue(b as any, ['DATA', 'Data', 'data']);
          return dateA.localeCompare(dateB);
        });
        
        const firstValue = parseNumber(getRowValue(sorted[0] as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
        const lastValue = parseNumber(getRowValue(sorted[sorted.length - 1] as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
        
        return { total: lastValue - firstValue, count };
      }
      
      return { total: 0, count };
    }, [selectedVehicle, horimeterData.rows]);

    // Reset form when vehicle changes
    useEffect(() => {
      setCurrentValue('');
      setOperador('');
      setObservacao('');
      setSelectedDate(new Date());
    }, [selectedVehicle]);

    // Refresh data when modal opens and set initial vehicle
    useEffect(() => {
      if (open) {
        refetchVehicles();
        refetchHorimeters();
        if (initialVehicle) {
          setSelectedVehicle(initialVehicle);
        }
      }
    }, [open, refetchVehicles, refetchHorimeters, initialVehicle]);

    const handleSave = async () => {
      if (!selectedVehicle) {
        toast({
          title: 'Erro',
          description: 'Selecione um veículo',
          variant: 'destructive',
        });
        return;
      }

      // Validate future date
      const today = startOfDay(new Date());
      if (isAfter(startOfDay(selectedDate), today)) {
        toast({
          title: 'Erro',
          description: 'Não é permitido registrar datas futuras',
          variant: 'destructive',
        });
        return;
      }

      // Validate duplicate record
      if (hasDuplicateRecord) {
        toast({
          title: 'Erro',
          description: 'Já existe um registro para este veículo nesta data',
          variant: 'destructive',
        });
        return;
      }

      const currentValueNum = parseNumber(currentValue);
      if (currentValueNum <= 0) {
        toast({
          title: 'Erro',
          description: 'Informe um valor válido',
          variant: 'destructive',
        });
        return;
      }

      if (currentValueNum < previousValue && previousValue > 0) {
        toast({
          title: 'Atenção',
          description: `O valor atual (${currentValueNum}) é menor que o anterior (${previousValue}). Verifique!`,
          variant: 'destructive',
        });
        return;
      }

      setIsSaving(true);

      try {
        const formattedDate = format(selectedDate, 'dd/MM/yyyy');
        const hora = format(new Date(), 'HH:mm');
        const tipo = vehicleInfo?.usaKm ? 'KM' : 'HORIMETRO';
        
        await create({
          DATA: formattedDate,
          HORA: hora,
          VEICULO: selectedVehicle,
          HORAS: currentValueNum.toString().replace('.', ','),
          HORIMETRO_ANTERIOR: previousValue.toString().replace('.', ','),
          OPERADOR: operador,
          TIPO: tipo,
          OBSERVACAO: observacao,
          EMPRESA: vehicleInfo?.empresa || '',
          DESCRICAO: vehicleInfo?.descricao || '',
        });

        toast({
          title: 'Sucesso!',
          description: 'Horímetro registrado com sucesso',
        });

        // Reset form
        setSelectedVehicle('');
        setCurrentValue('');
        setOperador('');
        setObservacao('');
        setSelectedDate(new Date());
        
        onOpenChange(false);
        onSuccess?.();
      } catch (error) {
        console.error('Error saving horimeter:', error);
        toast({
          title: 'Erro',
          description: 'Falha ao salvar o horímetro. Tente novamente.',
          variant: 'destructive',
        });
      } finally {
        setIsSaving(false);
      }
    };

    const isLoading = vehicleLoading || horimeterLoading;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" ref={ref}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Novo Registro de Horímetro/KM
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para registrar o horímetro ou quilometragem do veículo
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2">Carregando dados...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <Label htmlFor="vehicle">Veículo/Equipamento *</Label>
                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o veículo" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {vehicles.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        Nenhum veículo encontrado
                      </div>
                    ) : (
                      vehicles.map(vehicle => (
                        <SelectItem key={vehicle.codigo} value={vehicle.codigo}>
                          {vehicle.codigo} - {vehicle.descricao || vehicle.tipo}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Vehicle Info */}
              {vehicleInfo && (
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium">Informações do Veículo</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Descrição:</span>{' '}
                      <span className="font-medium">{vehicleInfo.descricao || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tipo:</span>{' '}
                      <span className="font-medium">{vehicleInfo.tipo || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Empresa:</span>{' '}
                      <span className="font-medium">{vehicleInfo.empresa || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Tipo de Registro:</span>{' '}
                      <span className="font-medium">{vehicleInfo.usaKm ? 'Quilometragem (KM)' : 'Horímetro (Horas)'}</span>
                    </div>
                  </div>
                  
                  {/* Last Reading - Prominent */}
                  <div className="mt-3 p-3 bg-primary/10 rounded-lg">
                    <span className="text-muted-foreground">Último Registro:</span>{' '}
                    <span className="text-xl font-bold text-primary">
                      {previousValue > 0 ? previousValue.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '0'} {vehicleInfo.usaKm ? 'km' : 'h'}
                    </span>
                  </div>

                  {/* Monthly Total - Very Prominent */}
                  <div className="p-4 bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 rounded-lg border border-emerald-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-500" />
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">
                          Total no Mês ({format(new Date(), 'MMMM', { locale: ptBR })})
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          {monthlyTotal.total.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} {vehicleInfo.usaKm ? 'km' : 'h'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {monthlyTotal.count} registros no mês
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* History Table */}
              {vehicleHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-muted-foreground" />
                    <h4 className="font-medium text-sm">Histórico (últimos 5 registros)</h4>
                  </div>
                  <div className="bg-muted/20 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">Data</th>
                          <th className="px-3 py-2 text-right">{vehicleInfo?.usaKm ? 'KM' : 'Horas'}</th>
                          <th className="px-3 py-2 text-right">Intervalo</th>
                          <th className="px-3 py-2 text-left">Operador</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vehicleHistory.map((record, idx) => (
                          <tr key={idx} className="border-t border-border/50">
                            <td className="px-3 py-2">{record.data}</td>
                            <td className="px-3 py-2 text-right font-medium">
                              {record.horas.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {record.intervalo > 0 && (
                                <span className="text-emerald-500">
                                  +{record.intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{record.operador || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Date Selection */}
              <div className="space-y-2">
                <Label>Data do Registro *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !selectedDate && "text-muted-foreground",
                        hasDuplicateRecord && "border-destructive"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione a data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => date && setSelectedDate(date)}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                {hasDuplicateRecord ? (
                  <div className="flex items-center gap-1 text-destructive text-xs">
                    <AlertTriangle className="w-3 h-3" />
                    Já existe um registro para este veículo nesta data
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Padrão: data atual. Altere para registros retroativos.
                  </p>
                )}
              </div>

              {/* Current Value Input */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentValue">
                    {vehicleInfo?.usaKm ? 'KM Atual *' : 'Horímetro Atual *'}
                  </Label>
                  <Input
                    id="currentValue"
                    type="text"
                    placeholder={vehicleInfo?.usaKm ? 'Ex: 125000' : 'Ex: 4500.5'}
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    className="text-lg font-semibold"
                  />
                  {previousValue > 0 && currentValue && parseNumber(currentValue) < previousValue && (
                    <div className="flex items-center gap-1 text-amber-500 text-xs">
                      <AlertTriangle className="w-3 h-3" />
                      Valor menor que o anterior
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operador">Operador/Motorista</Label>
                  <Input
                    id="operador"
                    type="text"
                    placeholder="Nome do operador"
                    value={operador}
                    onChange={(e) => setOperador(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacao">Observação</Label>
                <Input
                  id="observacao"
                  type="text"
                  placeholder="Observações adicionais (opcional)"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !selectedVehicle || !currentValue || hasDuplicateRecord}>
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }
);
