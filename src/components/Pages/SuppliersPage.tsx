import { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Building2,
  RefreshCw,
  Check,
  Ban,
  Phone,
  Mail,
  MapPin,
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

interface Supplier {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    cnpj: '',
    phone: '',
    email: '',
    address: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch suppliers
  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setSuppliers(data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      toast.error('Erro ao carregar fornecedores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Open modal for new supplier
  const handleNew = () => {
    setEditingSupplier(null);
    setFormData({ name: '', cnpj: '', phone: '', email: '', address: '' });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({ 
      name: supplier.name, 
      cnpj: supplier.cnpj || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
    });
    setIsModalOpen(true);
  };

  // Save supplier
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      if (editingSupplier) {
        // Update
        const { error } = await supabase
          .from('suppliers')
          .update({
            name: formData.name.trim(),
            cnpj: formData.cnpj.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            address: formData.address.trim() || null,
          })
          .eq('id', editingSupplier.id);

        if (error) throw error;
        toast.success('Fornecedor atualizado!');
      } else {
        // Create
        const { error } = await supabase
          .from('suppliers')
          .insert({
            name: formData.name.trim(),
            cnpj: formData.cnpj.trim() || null,
            phone: formData.phone.trim() || null,
            email: formData.email.trim() || null,
            address: formData.address.trim() || null,
          });

        if (error) throw error;
        toast.success('Fornecedor criado!');
      }

      setIsModalOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      console.error('Error saving supplier:', err);
      if (err.message?.includes('duplicate')) {
        toast.error('Já existe um fornecedor com este nome');
      } else {
        toast.error('Erro ao salvar fornecedor');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (supplier: Supplier) => {
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ active: !supplier.active })
        .eq('id', supplier.id);

      if (error) throw error;
      toast.success(supplier.active ? 'Fornecedor desativado' : 'Fornecedor ativado');
      fetchSuppliers();
    } catch (err) {
      console.error('Error toggling supplier:', err);
      toast.error('Erro ao alterar status');
    }
  };

  // Delete supplier
  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Deseja excluir "${supplier.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', supplier.id);

      if (error) throw error;
      toast.success('Fornecedor excluído!');
      fetchSuppliers();
    } catch (err) {
      console.error('Error deleting supplier:', err);
      toast.error('Erro ao excluir fornecedor');
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-500" />
            Fornecedores
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie os fornecedores para registros de entrada de combustível
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchSuppliers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Fornecedor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Ex: Distribuidora XYZ"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input
                    placeholder="Ex: 12.345.678/0001-90"
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                    <Label className="flex items-center gap-1">
                      <Mail className="w-3 h-3" /> Email
                    </Label>
                    <Input
                      type="email"
                      placeholder="email@fornecedor.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Endereço
                  </Label>
                  <Input
                    placeholder="Endereço do fornecedor"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
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
              <p className="text-3xl font-bold text-blue-500">{suppliers.length}</p>
              <p className="text-sm text-muted-foreground">Total de Fornecedores</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">
                {suppliers.filter(s => s.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-500">
                {suppliers.filter(s => !s.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Lista de Fornecedores</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum fornecedor cadastrado</p>
              <Button variant="link" onClick={handleNew}>
                Cadastrar primeiro fornecedor
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                    <TableHead className="hidden lg:table-cell">Telefone</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id} className={!supplier.active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {supplier.cnpj || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {supplier.phone || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={supplier.active}
                            onCheckedChange={() => handleToggleActive(supplier)}
                          />
                          <span className="text-xs hidden sm:inline">
                            {supplier.active ? (
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
                            onClick={() => handleEdit(supplier)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(supplier)}
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
