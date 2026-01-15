import { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Wrench,
  RefreshCw,
  Check,
  Ban,
  Phone,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { ResponsiveCard, ResponsiveCardGrid, ViewModeToggle, EmptyCardState } from '@/components/ui/responsive-card-view';
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

interface Mechanic {
  id: string;
  name: string;
  phone: string | null;
  specialty: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export default function MechanicsPage() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMechanic, setEditingMechanic] = useState<Mechanic | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    phone: '',
    specialty: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Auto-switch to cards on mobile
  useEffect(() => {
    if (isMobile) setViewMode('cards');
  }, [isMobile]);

  // Fetch mechanics
  const fetchMechanics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mechanics')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setMechanics(data || []);
    } catch (err) {
      console.error('Error fetching mechanics:', err);
      toast.error('Erro ao carregar mecânicos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMechanics();
  }, []);

  // Open modal for new mechanic
  const handleNew = () => {
    setEditingMechanic(null);
    setFormData({ name: '', phone: '', specialty: '' });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (mechanic: Mechanic) => {
    setEditingMechanic(mechanic);
    setFormData({ 
      name: mechanic.name, 
      phone: mechanic.phone || '',
      specialty: mechanic.specialty || '',
    });
    setIsModalOpen(true);
  };

  // Save mechanic
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      if (editingMechanic) {
        // Update
        const { error } = await supabase
          .from('mechanics')
          .update({
            name: formData.name.trim(),
            phone: formData.phone.trim() || null,
            specialty: formData.specialty.trim() || null,
          })
          .eq('id', editingMechanic.id);

        if (error) throw error;
        toast.success('Mecânico atualizado!');
      } else {
        // Create
        const { error } = await supabase
          .from('mechanics')
          .insert({
            name: formData.name.trim(),
            phone: formData.phone.trim() || null,
            specialty: formData.specialty.trim() || null,
          });

        if (error) throw error;
        toast.success('Mecânico cadastrado!');
      }

      setIsModalOpen(false);
      fetchMechanics();
    } catch (err: any) {
      console.error('Error saving mechanic:', err);
      toast.error('Erro ao salvar mecânico');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (mechanic: Mechanic) => {
    try {
      const { error } = await supabase
        .from('mechanics')
        .update({ active: !mechanic.active })
        .eq('id', mechanic.id);

      if (error) throw error;
      toast.success(mechanic.active ? 'Mecânico desativado' : 'Mecânico ativado');
      fetchMechanics();
    } catch (err) {
      console.error('Error toggling mechanic:', err);
      toast.error('Erro ao alterar status');
    }
  };

  // Delete mechanic
  const handleDelete = async (mechanic: Mechanic) => {
    if (!confirm(`Deseja excluir "${mechanic.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('mechanics')
        .delete()
        .eq('id', mechanic.id);

      if (error) throw error;
      toast.success('Mecânico excluído!');
      fetchMechanics();
    } catch (err) {
      console.error('Error deleting mechanic:', err);
      toast.error('Erro ao excluir mecânico');
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-500" />
            Mecânicos
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie os mecânicos para ordens de serviço
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchMechanics} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Mecânico
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingMechanic ? 'Editar Mecânico' : 'Novo Mecânico'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Nome do mecânico"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Telefone
                  </Label>
                  <Input
                    placeholder="(99) 99999-9999"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Especialidade</Label>
                  <Input
                    placeholder="Ex: Motor, Elétrica, Hidráulica"
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
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
              <p className="text-3xl font-bold text-blue-500">{mechanics.length}</p>
              <p className="text-sm text-muted-foreground">Total de Mecânicos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">
                {mechanics.filter(m => m.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-500">
                {mechanics.filter(m => !m.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table or Cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Lista de Mecânicos</CardTitle>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : mechanics.length === 0 ? (
            <EmptyCardState
              icon={<Wrench className="w-12 h-12" />}
              title="Nenhum mecânico cadastrado"
              description="Cadastre o primeiro mecânico para começar"
            />
          ) : viewMode === 'cards' ? (
            <ResponsiveCardGrid>
              {mechanics.map((mechanic) => (
                <ResponsiveCard
                  key={mechanic.id}
                  title={mechanic.name}
                  isActive={mechanic.active}
                  onToggleActive={() => handleToggleActive(mechanic)}
                  fields={[
                    { label: 'Telefone', value: mechanic.phone || '-', icon: <Phone className="w-3 h-3" /> },
                    { label: 'Especialidade', value: mechanic.specialty || '-', icon: <Tag className="w-3 h-3" /> },
                  ]}
                  actions={[
                    { icon: <Edit className="w-4 h-4" />, onClick: () => handleEdit(mechanic) },
                    { icon: <Trash2 className="w-4 h-4 text-destructive" />, onClick: () => handleDelete(mechanic) },
                  ]}
                />
              ))}
            </ResponsiveCardGrid>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">Telefone</TableHead>
                    <TableHead className="hidden lg:table-cell">Especialidade</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mechanics.map((mechanic) => (
                    <TableRow key={mechanic.id} className={!mechanic.active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{mechanic.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {mechanic.phone || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {mechanic.specialty || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={mechanic.active}
                            onCheckedChange={() => handleToggleActive(mechanic)}
                          />
                          <span className="text-xs hidden sm:inline">
                            {mechanic.active ? (
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
                            onClick={() => handleEdit(mechanic)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(mechanic)}
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
