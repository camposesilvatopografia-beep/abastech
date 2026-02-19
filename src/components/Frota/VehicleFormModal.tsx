import { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Truck, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface VehicleFormData {
  codigo: string;
  motorista: string;
  potencia: string;
  categoria: string;
  descricao: string;
  empresa: string;
  obra: string;
  status: string;
}

interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  vehicle?: Partial<VehicleFormData> | null;
  empresas: string[];
  categorias: string[];
}

const STATUS_OPTIONS = [
  { value: 'Mobilizado', label: 'Mobilizado' },
  { value: 'Desmobilizado', label: 'Desmobilizado' },
  { value: 'Ativo', label: 'Ativo' },
  { value: 'Inativo', label: 'Inativo' },
  { value: 'Manutenção', label: 'Manutenção' },
  { value: 'Em Trânsito', label: 'Em Trânsito' },
  { value: 'Reserva', label: 'Reserva' },
];

const CATEGORIA_OPTIONS = [
  'Equipamento',
  'Veiculo',
  'Veículo Leve',
  'Veículo Pesado',
  'Caminhão',
  'Máquina',
];

export function VehicleFormModal({
  open,
  onClose,
  onSuccess,
  mode,
  vehicle,
  empresas,
  categorias,
}: VehicleFormModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<VehicleFormData>({
    codigo: '',
    motorista: '',
    potencia: '',
    categoria: '',
    descricao: '',
    empresa: '',
    obra: '',
    status: 'Mobilizado',
  });

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && vehicle) {
        setFormData({
          codigo: vehicle.codigo || '',
          motorista: vehicle.motorista || '',
          potencia: vehicle.potencia || '',
          categoria: vehicle.categoria || '',
          descricao: vehicle.descricao || '',
          empresa: vehicle.empresa || '',
          obra: vehicle.obra || '',
          status: vehicle.status || 'Mobilizado',
        });
      } else {
        setFormData({
          codigo: '',
          motorista: '',
          potencia: '',
          categoria: '',
          descricao: '',
          empresa: '',
          obra: '',
          status: 'Mobilizado',
        });
      }
    }
  }, [open, mode, vehicle]);

  const handleSave = async () => {
    if (!formData.codigo.trim()) {
      toast.error('Código é obrigatório');
      return;
    }

    setSaving(true);

    try {
      // Match exact column names from the spreadsheet
      const rowData: Record<string, string> = {
        Codigo: formData.codigo.trim(),
        Motorista: formData.motorista.trim(),
        Potencia: formData.potencia.trim(),
        Categoria: formData.categoria.trim(),
        Descricao: formData.descricao.trim(),
        Empresa: formData.empresa.trim(),
        Obra: formData.obra.trim(),
        Status: formData.status,
      };

      if (mode === 'create') {
        const { error } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'create',
            sheetName: 'Veiculo',
            data: rowData,
          },
        });

        if (error) throw error;

        // Sync to Supabase vehicles table
        await supabase.from('vehicles').upsert({
          code: formData.codigo.trim(),
          name: formData.descricao.trim(),
          description: formData.descricao.trim(),
          category: formData.categoria.trim(),
          company: formData.empresa.trim(),
          status: formData.status.toLowerCase(),
        }, { onConflict: 'code' });

        toast.success('Veículo cadastrado com sucesso!');
      } else {
        // Find the row index
        const { data: sheetData, error: fetchError } = await supabase.functions.invoke('google-sheets', {
          body: { action: 'getData', sheetName: 'Veiculo', noCache: true },
        });

        if (fetchError) throw fetchError;

        const rows = sheetData?.rows || [];
        const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s/g, '');
        const targetCode = normalize(vehicle?.codigo || '');
        const matchedRow = rows.find((r: any) => {
          const code = normalize(String(r.Codigo || r.CODIGO || r['CÓDIGO'] || ''));
          return code === targetCode;
        });

        if (!matchedRow || !matchedRow._rowIndex) {
          throw new Error('Veículo não encontrado na planilha');
        }

        // Preserve all existing columns, only override the ones we manage
        const fullRowData: Record<string, string> = {};
        for (const [key, val] of Object.entries(matchedRow)) {
          if (key === '_rowIndex') continue;
          fullRowData[key] = String(val ?? '');
        }
        // Override with form values using the exact header names from the sheet
        const headerMap: Record<string, string> = {};
        for (const key of Object.keys(fullRowData)) {
          headerMap[normalize(key)] = key;
        }
        const setField = (normalized: string, value: string) => {
          const realKey = headerMap[normalized];
          if (realKey) fullRowData[realKey] = value;
        };
        setField('CODIGO', formData.codigo.trim());
        setField('MOTORISTA', formData.motorista.trim());
        setField('POTENCIA', formData.potencia.trim());
        setField('CATEGORIA', formData.categoria.trim());
        setField('DESCRICAO', formData.descricao.trim());
        setField('EMPRESA', formData.empresa.trim());
        setField('OBRA', formData.obra.trim());
        setField('STATUS', formData.status);

        const { error } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'update',
            sheetName: 'Veiculo',
            rowIndex: matchedRow._rowIndex,
            data: fullRowData,
          },
        });

        if (error) throw error;

        // Sync to Supabase
        await supabase.from('vehicles')
          .update({
            name: formData.descricao.trim(),
            description: formData.descricao.trim(),
            category: formData.categoria.trim(),
            company: formData.empresa.trim(),
            status: formData.status.toLowerCase(),
          })
          .eq('code', vehicle?.codigo || '');

        toast.success('Veículo atualizado com sucesso!');
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving vehicle:', error);
      toast.error('Erro ao salvar veículo');
    } finally {
      setSaving(false);
    }
  };

  const allCategorias = [...new Set([...categorias, ...CATEGORIA_OPTIONS])].sort();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle>
                {mode === 'create' ? 'Novo Veículo' : 'Editar Veículo'}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {mode === 'create'
                  ? 'Cadastrar novo equipamento ou veículo'
                  : `Editando: ${vehicle?.codigo}`}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Código */}
          <div className="space-y-2">
            <Label htmlFor="codigo">
              Código <span className="text-destructive">*</span>
            </Label>
            <Input
              id="codigo"
              value={formData.codigo}
              onChange={(e) =>
                setFormData({ ...formData, codigo: e.target.value.toUpperCase() })
              }
              placeholder="Ex: EC-21.4"
              disabled={mode === 'edit'}
              className={mode === 'edit' ? 'bg-muted' : ''}
            />
          </div>

          {/* Motorista */}
          <div className="space-y-2">
            <Label htmlFor="motorista">Motorista / Operador</Label>
            <Input
              id="motorista"
              value={formData.motorista}
              onChange={(e) =>
                setFormData({ ...formData, motorista: e.target.value })
              }
              placeholder="Ex: José da Silva"
            />
          </div>

          {/* Potência */}
          <div className="space-y-2">
            <Label htmlFor="potencia">Potência / Modelo</Label>
            <Input
              id="potencia"
              value={formData.potencia}
              onChange={(e) =>
                setFormData({ ...formData, potencia: e.target.value })
              }
              placeholder="Ex: VM330, 323, VOLVO L60F"
            />
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label htmlFor="categoria">Categoria</Label>
            <Select
              value={formData.categoria}
              onValueChange={(v) => setFormData({ ...formData, categoria: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {allCategorias.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Input
              id="descricao"
              value={formData.descricao}
              onChange={(e) =>
                setFormData({ ...formData, descricao: e.target.value })
              }
              placeholder="Ex: Caminhão Basculante"
            />
          </div>

          {/* Empresa */}
          <div className="space-y-2">
            <Label htmlFor="empresa">Empresa</Label>
            <Select
              value={formData.empresa}
              onValueChange={(v) => setFormData({ ...formData, empresa: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {empresas.map((emp) => (
                  <SelectItem key={emp} value={emp}>
                    {emp}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Obra */}
          <div className="space-y-2">
            <Label htmlFor="obra">Obra</Label>
            <Input
              id="obra"
              value={formData.obra}
              onChange={(e) =>
                setFormData({ ...formData, obra: e.target.value })
              }
              placeholder="Ex: Aeroporto"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(v) => setFormData({ ...formData, status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
