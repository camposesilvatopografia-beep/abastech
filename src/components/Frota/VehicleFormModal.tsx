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
  descricao: string;
  categoria: string;
  empresa: string;
  status: string;
}

interface VehicleFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  mode: 'create' | 'edit';
  vehicle?: VehicleFormData | null;
  empresas: string[];
  categorias: string[];
}

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'manutencao', label: 'Manutenção' },
];

const DEFAULT_CATEGORIAS = [
  'Equipamento',
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
    descricao: '',
    categoria: '',
    empresa: '',
    status: 'ativo',
  });

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && vehicle) {
        setFormData({
          codigo: vehicle.codigo || '',
          descricao: vehicle.descricao || '',
          categoria: vehicle.categoria || '',
          empresa: vehicle.empresa || '',
          status: vehicle.status?.toLowerCase() || 'ativo',
        });
      } else {
        setFormData({
          codigo: '',
          descricao: '',
          categoria: '',
          empresa: '',
          status: 'ativo',
        });
      }
    }
  }, [open, mode, vehicle]);

  const handleSave = async () => {
    if (!formData.codigo.trim()) {
      toast.error('Código é obrigatório');
      return;
    }
    if (!formData.descricao.trim()) {
      toast.error('Descrição é obrigatória');
      return;
    }
    if (!formData.categoria.trim()) {
      toast.error('Categoria é obrigatória');
      return;
    }
    if (!formData.empresa.trim()) {
      toast.error('Empresa é obrigatória');
      return;
    }

    setSaving(true);

    try {
      // Prepare data for Google Sheets
      const rowData = {
        CODIGO: formData.codigo.trim(),
        DESCRICAO: formData.descricao.trim(),
        CATEGORIA: formData.categoria.trim(),
        EMPRESA: formData.empresa.trim(),
        STATUS: formData.status,
      };

      if (mode === 'create') {
        // Create in Google Sheets
        const { error } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'create',
            sheetName: 'Veiculo',
            data: rowData,
          },
        });

        if (error) throw error;
        toast.success('Veículo cadastrado com sucesso!');
      } else {
        // Update in Google Sheets
        const { error } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'update',
            sheetName: 'Veiculo',
            searchColumn: 'CODIGO',
            searchValue: vehicle?.codigo,
            data: rowData,
          },
        });

        if (error) throw error;
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

  const allCategorias = [...new Set([...categorias, ...DEFAULT_CATEGORIAS])].sort();

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
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

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="descricao">
              Descrição <span className="text-destructive">*</span>
            </Label>
            <Input
              id="descricao"
              value={formData.descricao}
              onChange={(e) =>
                setFormData({ ...formData, descricao: e.target.value })
              }
              placeholder="Ex: Escavadeira CAT 320D"
            />
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label htmlFor="categoria">
              Categoria <span className="text-destructive">*</span>
            </Label>
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

          {/* Empresa */}
          <div className="space-y-2">
            <Label htmlFor="empresa">
              Empresa <span className="text-destructive">*</span>
            </Label>
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
