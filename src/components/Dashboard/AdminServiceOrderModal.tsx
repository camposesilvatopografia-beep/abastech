import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Wrench,
  Save,
  Truck,
  Loader2,
  Clock,
  CalendarIcon,
  AlertTriangle,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/components/ui/dialog';
import { VehicleCombobox } from '@/components/ui/vehicle-combobox';
import { CurrencyInput } from '@/components/ui/currency-input';
import { parsePtBRNumber } from '@/lib/ptBRNumber';
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AdminServiceOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AdminServiceOrderModal({ open, onOpenChange, onSuccess }: AdminServiceOrderModalProps) {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [orderType, setOrderType] = useState('Corretiva');
  const [priority, setPriority] = useState('Média');
  const [problemDescription, setProblemDescription] = useState('');
  const [solutionDescription, setSolutionDescription] = useState('');
  const [mechanicId, setMechanicId] = useState('');
  const [mechanicName, setMechanicName] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [notes, setNotes] = useState('');
  const [horimeterCurrent, setHorimeterCurrent] = useState('');
  const [kmCurrent, setKmCurrent] = useState('');
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [entryTime, setEntryTime] = useState('');

  // Mechanics
  const [mechanics, setMechanics] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      resetForm();
      fetchMechanics();
    }
  }, [open]);

  const resetForm = () => {
    setVehicleCode('');
    setVehicleDescription('');
    setOrderType('Corretiva');
    setPriority('Média');
    setProblemDescription('');
    setSolutionDescription('');
    setMechanicId('');
    setMechanicName('');
    setEstimatedHours('');
    setNotes('');
    setHorimeterCurrent('');
    setKmCurrent('');
    setEntryDate(new Date());
    setEntryTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  };

  const fetchMechanics = async () => {
    const { data } = await supabase
      .from('mechanics')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setMechanics(data);
  };

  const vehicleOptions = useMemo(() => {
    return vehiclesData.rows.map((v, idx) => ({
      id: String(idx),
      code: String(v['Codigo'] || v['CODIGO'] || v['Frota'] || v['FROTA'] || ''),
      name: String(v['Descricao'] || v['DESCRICAO'] || v['DESCRIÇÃO'] || v['Nome'] || ''),
      description: String(v['Descricao'] || v['DESCRICAO'] || v['DESCRIÇÃO'] || ''),
      category: String(v['Categoria'] || v['CATEGORIA'] || ''),
    }));
  }, [vehiclesData.rows]);

  const handleVehicleSelect = (code: string) => {
    setVehicleCode(code);
    const vehicle = vehiclesData.rows.find(v => String(v['Codigo']) === code);
    if (vehicle) {
      setVehicleDescription(String(vehicle['Descricao'] || ''));
    }
  };

  const generateOrderNumber = async (): Promise<string> => {
    const today = new Date();
    const prefix = `OS-${format(today, 'yyyyMMdd')}`;
    const { count } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .like('order_number', `${prefix}%`);
    const seq = (count || 0) + 1;
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  };

  const handleSave = async () => {
    if (!vehicleCode || !problemDescription) {
      toast.error('Preencha veículo e descrição do problema');
      return;
    }

    setIsSaving(true);
    try {
      const orderNumber = await generateOrderNumber();
      const mechanic = mechanics.find(m => m.id === mechanicId);
      const orderDate = format(entryDate, 'yyyy-MM-dd');

      const orderData = {
        order_number: orderNumber,
        order_date: orderDate,
        vehicle_code: vehicleCode,
        vehicle_description: vehicleDescription || null,
        order_type: orderType,
        priority,
        status: 'Aberta',
        problem_description: problemDescription,
        solution_description: solutionDescription || null,
        mechanic_id: mechanicId || null,
        mechanic_name: mechanic?.name || mechanicName || null,
        estimated_hours: parseFloat(estimatedHours) || null,
        notes: notes || null,
        horimeter_current: parsePtBRNumber(horimeterCurrent) || null,
        km_current: parsePtBRNumber(kmCurrent) || null,
        entry_date: orderDate,
        entry_time: entryTime || null,
      };

      const { error } = await supabase.from('service_orders').insert(orderData);
      if (error) throw error;

      toast.success(`Ordem de Serviço ${orderNumber} criada!`);
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Error saving OS:', err);
      toast.error('Erro ao criar ordem de serviço');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2.5 rounded-lg bg-amber-600 text-white">
              <Wrench className="h-5 w-5" />
            </div>
            Nova Ordem de Serviço (Admin)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Data de Entrada
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !entryDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entryDate ? format(entryDate, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entryDate}
                    onSelect={(date) => date && setEntryDate(date)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Hora de Entrada
              </Label>
              <Input
                type="time"
                value={entryTime}
                onChange={(e) => setEntryTime(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {/* Vehicle */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Veículo *
            </Label>
            <VehicleCombobox
              vehicles={vehicleOptions}
              value={vehicleCode}
              onValueChange={handleVehicleSelect}
              placeholder="Selecione o veículo..."
            />
          </div>

          {/* Type and Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Corretiva">Corretiva</SelectItem>
                  <SelectItem value="Preventiva">Preventiva</SelectItem>
                  <SelectItem value="Preditiva">Preditiva</SelectItem>
                  <SelectItem value="Emergencial">Emergencial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                  <SelectItem value="Urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Problem Description */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Descrição do Problema *
            </Label>
            <Textarea
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="Descreva o problema..."
              rows={3}
            />
          </div>

          {/* Solution Description */}
          <div className="space-y-2">
            <Label>Descrição da Solução</Label>
            <Textarea
              value={solutionDescription}
              onChange={(e) => setSolutionDescription(e.target.value)}
              placeholder="Descreva a solução (opcional)..."
              rows={2}
            />
          </div>

          {/* Mechanic */}
          <div className="space-y-2">
            <Label>Mecânico</Label>
            <Select value={mechanicId} onValueChange={(val) => {
              setMechanicId(val);
              const mech = mechanics.find(m => m.id === val);
              if (mech) setMechanicName(mech.name);
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione o mecânico..." /></SelectTrigger>
              <SelectContent>
                {mechanics.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Horimeter / KM / Hours */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Horímetro Atual</Label>
              <CurrencyInput
                value={parsePtBRNumber(horimeterCurrent) * 100 || 0}
                onChange={(val) => setHorimeterCurrent(String(val / 100))}
                decimals={1}
                placeholder="0,0"
              />
            </div>
            <div className="space-y-2">
              <Label>KM Atual</Label>
              <CurrencyInput
                value={parsePtBRNumber(kmCurrent) * 100 || 0}
                onChange={(val) => setKmCurrent(String(val / 100))}
                decimals={0}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Horas Estimadas</Label>
              <Input
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações adicionais..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-amber-600 hover:bg-amber-700">
              {isSaving ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
              ) : (
                <><Save className="h-4 w-4 mr-2" />Criar OS</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
