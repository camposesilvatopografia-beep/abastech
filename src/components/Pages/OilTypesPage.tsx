import { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Droplet,
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
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface OilType {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export default function OilTypesPage() {
  const [oilTypes, setOilTypes] = useState<OilType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOil, setEditingOil] = useState<OilType | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch oil types
  const fetchOilTypes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('oil_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setOilTypes(data || []);
    } catch (err) {
      console.error('Error fetching oil types:', err);
      toast.error('Erro ao carregar tipos de óleo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOilTypes();
  }, []);

  // Open modal for new oil type
  const handleNew = () => {
    setEditingOil(null);
    setFormData({ name: '', description: '' });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (oil: OilType) => {
    setEditingOil(oil);
    setFormData({ name: oil.name, description: oil.description || '' });
    setIsModalOpen(true);
  };

  // Save oil type
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      if (editingOil) {
        // Update
        const { error } = await supabase
          .from('oil_types')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
          })
          .eq('id', editingOil.id);

        if (error) throw error;
        toast.success('Tipo de óleo atualizado!');
      } else {
        // Create
        const { error } = await supabase
          .from('oil_types')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
          });

        if (error) throw error;
        toast.success('Tipo de óleo criado!');
      }

      setIsModalOpen(false);
      fetchOilTypes();
    } catch (err: any) {
      console.error('Error saving oil type:', err);
      if (err.message?.includes('duplicate')) {
        toast.error('Já existe um tipo de óleo com este nome');
      } else {
        toast.error('Erro ao salvar tipo de óleo');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (oil: OilType) => {
    try {
      const { error } = await supabase
        .from('oil_types')
        .update({ active: !oil.active })
        .eq('id', oil.id);

      if (error) throw error;
      toast.success(oil.active ? 'Tipo desativado' : 'Tipo ativado');
      fetchOilTypes();
    } catch (err) {
      console.error('Error toggling oil type:', err);
      toast.error('Erro ao alterar status');
    }
  };

  // Delete oil type
  const handleDelete = async (oil: OilType) => {
    if (!confirm(`Deseja excluir "${oil.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('oil_types')
        .delete()
        .eq('id', oil.id);

      if (error) throw error;
      toast.success('Tipo de óleo excluído!');
      fetchOilTypes();
    } catch (err) {
      console.error('Error deleting oil type:', err);
      toast.error('Erro ao excluir tipo de óleo');
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Droplet className="w-6 h-6 text-amber-500" />
            Tipos de Óleo
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie os tipos de óleo disponíveis para seleção no formulário de apontamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchOilTypes} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Tipo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingOil ? 'Editar Tipo de Óleo' : 'Novo Tipo de Óleo'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Ex: SAE 15W40"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Ex: Óleo motor diesel comum"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-500">{oilTypes.length}</p>
              <p className="text-sm text-muted-foreground">Total de Tipos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">
                {oilTypes.filter(o => o.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-500">
                {oilTypes.filter(o => !o.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lista de Tipos de Óleo</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : oilTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Droplet className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum tipo de óleo cadastrado</p>
              <Button variant="link" onClick={handleNew}>
                Cadastrar primeiro tipo
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Descrição</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oilTypes.map((oil) => (
                    <TableRow key={oil.id} className={!oil.active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{oil.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {oil.description || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={oil.active}
                            onCheckedChange={() => handleToggleActive(oil)}
                          />
                          <span className="text-xs hidden sm:inline">
                            {oil.active ? (
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
                            onClick={() => handleEdit(oil)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(oil)}
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
