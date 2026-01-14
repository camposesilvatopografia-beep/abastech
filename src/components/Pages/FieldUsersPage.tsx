import { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  Search,
  Save,
  Loader2,
  Shield,
  User,
  Eye,
  EyeOff,
  ArrowLeft,
  History,
  Fuel,
  Calendar,
  X,
  ChevronDown,
  ChevronUp,
  MapPin,
  Truck,
  MessageCircle,
} from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  assigned_locations?: string[];
}

interface FuelRecord {
  id: string;
  record_date: string;
  record_time: string;
  vehicle_code: string;
  vehicle_description: string | null;
  fuel_quantity: number;
  arla_quantity: number | null;
  location: string | null;
  synced_to_sheet: boolean;
  created_at: string;
}

interface UserFormData {
  name: string;
  username: string;
  password: string;
  role: string;
  active: boolean;
  assigned_locations: string[];
}

const LOCATION_OPTIONS = [
  'Tanque Canteiro 01',
  'Tanque Canteiro 02',
  'Comboio 01',
  'Comboio 02',
  'Comboio 03',
];

const initialFormData: UserFormData = {
  name: '',
  username: '',
  password: '',
  role: 'operador',
  active: true,
  assigned_locations: ['Tanque Canteiro 01'],
};

export function FieldUsersPage() {
  const [users, setUsers] = useState<FieldUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<FieldUser | null>(null);
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // History state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyUser, setHistoryUser] = useState<FieldUser | null>(null);
  const [historyRecords, setHistoryRecords] = useState<FuelRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userRecordCounts, setUserRecordCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (users.length > 0) {
      fetchAllRecordCounts();
    }
  }, [users]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('field_users')
        .select('*')
        .order('name');

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRecordCounts = async () => {
    try {
      const counts: Record<string, number> = {};
      
      for (const user of users) {
        const { count } = await supabase
          .from('field_fuel_records')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        
        counts[user.id] = count || 0;
      }
      
      setUserRecordCounts(counts);
    } catch (err) {
      console.error('Error fetching record counts:', err);
    }
  };

  const fetchUserHistory = async (user: FieldUser) => {
    setHistoryUser(user);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    
    try {
      const { data, error } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('user_id', user.id)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(50);

      if (error) throw error;
      setHistoryRecords(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
      toast.error('Erro ao carregar histórico');
    } finally {
      setLoadingHistory(false);
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData(initialFormData);
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (user: FieldUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      username: user.username,
      password: '',
      role: user.role || 'operador',
      active: user.active,
      assigned_locations: user.assigned_locations || ['Tanque Canteiro 01'],
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.username.trim()) {
      toast.error('Nome e usuário são obrigatórios');
      return;
    }

    if (!editingUser && !formData.password.trim()) {
      toast.error('Senha é obrigatória para novos usuários');
      return;
    }

    setSaving(true);

    try {
      if (editingUser) {
        const updateData: Record<string, unknown> = {
          name: formData.name.trim(),
          username: formData.username.trim().toLowerCase(),
          role: formData.role,
          active: formData.active,
          assigned_locations: formData.assigned_locations,
          updated_at: new Date().toISOString(),
        };

        if (formData.password.trim()) {
          updateData.password_hash = formData.password;
        }

        const { error } = await supabase
          .from('field_users')
          .update(updateData)
          .eq('id', editingUser.id);

        if (error) throw error;
        toast.success('Usuário atualizado com sucesso!');
      } else {
        // Check if username exists using maybeSingle() instead of single()
        const { data: existingUsers, error: checkError } = await supabase
          .from('field_users')
          .select('id')
          .eq('username', formData.username.trim().toLowerCase());

        if (checkError) throw checkError;

        if (existingUsers && existingUsers.length > 0) {
          toast.error('Este nome de usuário já está em uso');
          setSaving(false);
          return;
        }

        const { error } = await supabase.from('field_users').insert({
          name: formData.name.trim(),
          username: formData.username.trim().toLowerCase(),
          password_hash: formData.password,
          role: formData.role,
          active: formData.active,
          assigned_locations: formData.assigned_locations,
        } as any);

        if (error) throw error;
        toast.success('Usuário criado com sucesso!');
      }

      setShowModal(false);
      fetchUsers();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar usuário');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserStatus = async (user: FieldUser) => {
    try {
      const { error } = await supabase
        .from('field_users')
        .update({
          active: !user.active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      toast.success(user.active ? 'Usuário desativado' : 'Usuário ativado');
      fetchUsers();
    } catch (err) {
      console.error('Toggle error:', err);
      toast.error('Erro ao alterar status');
    }
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.username.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = users.filter((u) => u.active).length;
  const inactiveCount = users.filter((u) => !u.active).length;
  const totalRecords = Object.values(userRecordCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 shadow-lg">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/20">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5" />
                Usuários de Campo
              </h1>
              <p className="text-xs opacity-90">Gerenciamento de acessos</p>
            </div>
          </div>
          <Button 
            onClick={openCreateModal} 
            variant="secondary"
            size="sm"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Novo
          </Button>
        </div>
      </div>

      <main className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Usuários
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Inativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{inactiveCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Apontamentos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{totalRecords}</div>
            </CardContent>
          </Card>
        </div>

        {/* Direct Access Link */}
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <Fuel className="w-5 h-5" />
                  Link de Acesso Direto
                </h3>
                <p className="text-sm opacity-90 mt-1">
                  Compartilhe este link com os apontadores para acesso rápido:
                </p>
                <code className="text-xs bg-white/20 px-2 py-1 rounded mt-2 inline-block">
                  {window.location.origin}/apontamento
                </code>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/apontamento`);
                    toast.success('Link copiado!');
                  }}
                >
                  Copiar Link
                </Button>
                <Button
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white gap-2"
                  onClick={() => {
                    const message = `📱 *Acesso ao Sistema de Apontamento*\n\nUse o link abaixo para acessar o sistema de apontamento de abastecimento:\n\n${window.location.origin}/apontamento`;
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                    window.open(whatsappUrl, '_blank');
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum usuário encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead className="text-center">Apontamentos</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.username}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={user.role === 'admin' ? 'default' : 'secondary'}
                            className="gap-1"
                          >
                            {user.role === 'admin' ? (
                              <Shield className="w-3 h-3" />
                            ) : (
                              <User className="w-3 h-3" />
                            )}
                            {user.role === 'admin' ? 'Admin' : 'Operador'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="gap-1">
                            <Fuel className="w-3 h-3" />
                            {userRecordCounts[user.id] || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={user.active ? 'default' : 'destructive'}
                            className={user.active ? 'bg-green-500 hover:bg-green-600' : ''}
                          >
                            {user.active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => fetchUserHistory(user)}
                              title="Histórico"
                            >
                              <History className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditModal(user)}
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleUserStatus(user)}
                              title={user.active ? 'Desativar' : 'Ativar'}
                            >
                              {user.active ? (
                                <UserX className="w-4 h-4 text-red-500" />
                              ) : (
                                <UserCheck className="w-4 h-4 text-green-500" />
                              )}
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
      </main>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? (
                <>
                  <Edit2 className="w-5 h-5" />
                  Editar Usuário
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Novo Usuário
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Atualize as informações do usuário'
                : 'Preencha os dados para criar um novo usuário'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Completo *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: João da Silva"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Nome de Usuário *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) =>
                  setFormData({ ...formData, username: e.target.value.toLowerCase() })
                }
                placeholder="Ex: joao.silva"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                {editingUser ? 'Nova Senha (deixe vazio para manter)' : 'Senha *'}
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? '••••••••' : 'Digite a senha'}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Perfil</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operador">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Operador
                    </div>
                  </SelectItem>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Administrador
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locations" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Locais de Trabalho
              </Label>
              <div className="grid grid-cols-1 gap-2 p-3 bg-muted/50 rounded-lg">
                {LOCATION_OPTIONS.map((loc) => (
                  <label key={loc} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.assigned_locations.includes(loc)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({
                            ...formData,
                            assigned_locations: [...formData.assigned_locations, loc],
                          });
                        } else {
                          setFormData({
                            ...formData,
                            assigned_locations: formData.assigned_locations.filter((l) => l !== loc),
                          });
                        }
                      }}
                      className="w-4 h-4 rounded"
                    />
                    <span className="text-sm">{loc}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecione os locais que o usuário pode abastecer. O primeiro será o padrão.
              </p>
            </div>

            {editingUser && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  {formData.active ? (
                    <UserCheck className="w-4 h-4 text-green-500" />
                  ) : (
                    <UserX className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm">
                    Usuário {formData.active ? 'ativo' : 'inativo'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant={formData.active ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => setFormData({ ...formData, active: !formData.active })}
                >
                  {formData.active ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Modal */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico de Apontamentos
            </DialogTitle>
            <DialogDescription>
              {historyUser?.name} - Últimos 50 registros
            </DialogDescription>
          </DialogHeader>

          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : historyRecords.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Fuel className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum apontamento encontrado</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {historyRecords.map((record) => (
                  <Card key={record.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(record.record_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </Badge>
                          <Badge variant="outline">
                            {record.record_time}
                          </Badge>
                          {record.synced_to_sheet ? (
                            <Badge className="bg-green-500 gap-1">
                              Sincronizado
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              Pendente
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm">
                          <Truck className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{record.vehicle_code}</span>
                          {record.vehicle_description && (
                            <span className="text-muted-foreground">- {record.vehicle_description}</span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <Fuel className="w-4 h-4 text-blue-500" />
                            <span className="font-medium">{record.fuel_quantity}L</span>
                          </div>
                          {record.arla_quantity && record.arla_quantity > 0 && (
                            <div className="flex items-center gap-1 text-yellow-600">
                              <span>ARLA: {record.arla_quantity}L</span>
                            </div>
                          )}
                          {record.location && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <MapPin className="w-3 h-3" />
                              <span>{record.location}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
