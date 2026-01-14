import { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Droplets,
  RefreshCw,
  Check,
  Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Lubricant {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
  unit: string | null;
  active: boolean | null;
  created_at: string;
  updated_at: string;
}

const TYPES = [
  { value: 'graxa', label: 'Graxa', color: 'bg-amber-500' },
  { value: 'spray', label: 'Spray', color: 'bg-blue-500' },
  { value: 'fluido', label: 'Fluido', color: 'bg-purple-500' },
  { value: 'aditivo', label: 'Aditivo', color: 'bg-green-500' },
  { value: 'geral', label: 'Geral', color: 'bg-gray-500' },
];

const UNITS = [
  { value: 'L', label: 'Litros (L)' },
  { value: 'kg', label: 'Quilogramas (kg)' },
  { value: 'un', label: 'Unidade (un)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'g', label: 'Gramas (g)' },
];

export default function LubricantsPage() {
  const [lubricants, setLubricants] = useState<Lubricant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLubricant, setEditingLubricant] = useState<Lubricant | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'geral',
    unit: 'L',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch lubricants
  const fetchLubricants = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lubricants')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setLubricants(data || []);
    } catch (err) {
      console.error('Error fetching lubricants:', err);
      toast.error('Erro ao carregar lubrificantes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLubricants();
  }, []);

  // Open modal for new lubricant
  const handleNew = () => {
    setEditingLubricant(null);
    setFormData({ name: '', description: '', type: 'geral', unit: 'L' });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (lubricant: Lubricant) => {
    setEditingLubricant(lubricant);
    setFormData({
      name: lubricant.name,
      description: lubricant.description || '',
      type: lubricant.type || 'geral',
      unit: lubricant.unit || 'L',
    });
    setIsModalOpen(true);
  };

  // Save lubricant
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      if (editingLubricant) {
        // Update
        const { error } = await supabase
          .from('lubricants')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            type: formData.type,
            unit: formData.unit,
          })
          .eq('id', editingLubricant.id);

        if (error) throw error;
        toast.success('Lubrificante atualizado!');
      } else {
        // Create
        const { error } = await supabase
          .from('lubricants')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            type: formData.type,
            unit: formData.unit,
          });

        if (error) throw error;
        toast.success('Lubrificante criado!');
      }

      setIsModalOpen(false);
      fetchLubricants();
    } catch (err: any) {
      console.error('Error saving lubricant:', err);
      if (err.message?.includes('duplicate') || err.code === '23505') {
        toast.error('Já existe um lubrificante com este nome');
      } else {
        toast.error('Erro ao salvar lubrificante');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (lubricant: Lubricant) => {
    try {
      const { error } = await supabase
        .from('lubricants')
        .update({ active: !lubricant.active })
        .eq('id', lubricant.id);

      if (error) throw error;
      toast.success(lubricant.active ? 'Lubrificante desativado' : 'Lubrificante ativado');
      fetchLubricants();
    } catch (err) {
      console.error('Error toggling lubricant:', err);
      toast.error('Erro ao alterar status');
    }
  };

  // Delete lubricant
  const handleDelete = async (lubricant: Lubricant) => {
    if (!confirm(`Deseja excluir "${lubricant.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('lubricants')
        .delete()
        .eq('id', lubricant.id);

      if (error) throw error;
      toast.success('Lubrificante excluído!');
      fetchLubricants();
    } catch (err) {
      console.error('Error deleting lubricant:', err);
      toast.error('Erro ao excluir lubrificante');
    }
  };

  const getTypeBadge = (type: string | null) => {
    const typeConfig = TYPES.find(t => t.value === type) || TYPES[4];
    return (
      <Badge className={`${typeConfig.color} text-white`}>
        {typeConfig.label}
      </Badge>
    );
  };

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Droplets className="w-6 h-6 text-amber-500" />
            Lubrificantes
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie os lubrificantes disponíveis para uso nos equipamentos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchLubricants} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Lubrificante
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingLubricant ? 'Editar Lubrificante' : 'Novo Lubrificante'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Ex: Graxa EP-2"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Ex: Graxa multiuso para rolamentos"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(unit => (
                          <SelectItem key={unit.value} value={unit.value}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-500">{lubricants.length}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">
                {lubricants.filter(l => l.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-600">
                {lubricants.filter(l => l.type === 'graxa').length}
              </p>
              <p className="text-sm text-muted-foreground">Graxas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-500">
                {lubricants.filter(l => l.type === 'spray').length}
              </p>
              <p className="text-sm text-muted-foreground">Sprays</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lista de Lubrificantes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : lubricants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Droplets className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum lubrificante cadastrado</p>
              <Button variant="link" onClick={handleNew}>
                Cadastrar primeiro lubrificante
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="hidden sm:table-cell">Unidade</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lubricants.map((lubricant) => (
                    <TableRow key={lubricant.id} className={!lubricant.active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{lubricant.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {lubricant.description || '-'}
                      </TableCell>
                      <TableCell>
                        {getTypeBadge(lubricant.type)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {lubricant.unit || 'L'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={lubricant.active ?? false}
                            onCheckedChange={() => handleToggleActive(lubricant)}
                          />
                          <span className="text-xs hidden sm:inline">
                            {lubricant.active ? (
                              <span className="text-green-500 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Ativo
                              </span>
                            ) : (
                              <span className="text-gray-500 flex items-center gap-1">
                                <Ban className="w-3 h-3" /> Inativo
                              </span>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(lubricant)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(lubricant)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
