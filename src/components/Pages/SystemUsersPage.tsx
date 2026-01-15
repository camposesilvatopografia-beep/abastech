import { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  User,
  RefreshCw,
  Check,
  Ban,
  Shield,
  ShieldCheck,
  Key,
  Eye,
  EyeOff,
  Users,
  UserCheck,
  UserX,
  Clock,
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
  CardDescription,
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
import type { Database } from '@/integrations/supabase/types';

type SystemUserRole = Database['public']['Enums']['system_user_role'];

interface SystemUser {
  id: string;
  name: string;
  username: string;
  password_hash: string;
  email: string | null;
  role: SystemUserRole | null;
  active: boolean | null;
  last_login: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const ROLES: { value: SystemUserRole; label: string; color: string }[] = [
  { value: 'admin', label: 'Administrador', color: 'bg-red-500' },
  { value: 'supervisor', label: 'Supervisor', color: 'bg-blue-500' },
  { value: 'operador', label: 'Operador', color: 'bg-green-500' },
];

export default function SystemUsersPage() {
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'operador' as SystemUserRole,
  });

  // Auto-switch to cards on mobile
  useEffect(() => {
    if (isMobile) setViewMode('cards');
  }, [isMobile]);
  // Fetch users from system_users table
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('system_users')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Open modal for new user
  const handleNew = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      username: '',
      email: '',
      password: '',
      role: 'operador',
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEdit = (user: SystemUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      username: user.username,
      email: user.email || '',
      password: '', // Don't show existing password
      role: user.role || 'operador',
    });
    setShowPassword(false);
    setIsModalOpen(true);
  };

  // Save user
  const handleSave = async () => {
    if (!formData.name.trim() || !formData.username.trim()) {
      toast.error('Nome e usuário são obrigatórios');
      return;
    }

    if (!editingUser && !formData.password) {
      toast.error('Senha é obrigatória para novos usuários');
      return;
    }

    setIsSaving(true);
    try {
      if (editingUser) {
        // Update
        const updateData: Partial<SystemUser> = {
          name: formData.name.trim(),
          username: formData.username.trim().toLowerCase(),
          email: formData.email.trim() || null,
          role: formData.role,
        };
        
        // Only update password if provided
        if (formData.password) {
          updateData.password_hash = formData.password;
        }

        const { error } = await supabase
          .from('system_users')
          .update(updateData)
          .eq('id', editingUser.id);

        if (error) throw error;
        toast.success('Usuário atualizado!');
      } else {
        // Create
        const { error } = await supabase
          .from('system_users')
          .insert({
            name: formData.name.trim(),
            username: formData.username.trim().toLowerCase(),
            email: formData.email.trim() || null,
            password_hash: formData.password,
            role: formData.role,
            active: true,
          });

        if (error) throw error;
        toast.success('Usuário criado!');
      }

      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      if (err.message?.includes('duplicate') || err.code === '23505') {
        toast.error('Já existe um usuário com este nome de usuário');
      } else {
        toast.error('Erro ao salvar usuário');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (user: SystemUser) => {
    try {
      const { error } = await supabase
        .from('system_users')
        .update({ active: !user.active })
        .eq('id', user.id);

      if (error) throw error;
      toast.success(user.active ? 'Usuário desativado' : 'Usuário ativado');
      fetchUsers();
    } catch (err) {
      console.error('Error toggling user:', err);
      toast.error('Erro ao alterar status');
    }
  };

  // Delete user
  const handleDelete = async (user: SystemUser) => {
    if (!confirm(`Deseja excluir o usuário "${user.name}"? Esta ação não pode ser desfeita.`)) return;

    try {
      const { error } = await supabase
        .from('system_users')
        .delete()
        .eq('id', user.id);

      if (error) throw error;
      toast.success('Usuário excluído!');
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error('Erro ao excluir usuário');
    }
  };

  const getRoleBadge = (role: SystemUserRole | null) => {
    const roleConfig = ROLES.find(r => r.value === role) || ROLES[2];
    return (
      <Badge className={`${roleConfig.color} text-white`}>
        {roleConfig.label}
      </Badge>
    );
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.active).length,
    admins: users.filter(u => u.role === 'admin').length,
    inactive: users.filter(u => !u.active).length,
  };

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="w-6 h-6 text-primary" />
            Usuários do Sistema
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie os usuários com acesso ao sistema de apontamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew} className="gap-2">
                <Plus className="w-4 h-4" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome Completo *</Label>
                  <Input
                    placeholder="Ex: João Silva"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Nome de Usuário *</Label>
                  <Input
                    placeholder="Ex: joao.silva"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>{editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={editingUser ? '••••••••' : 'Digite a senha'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    placeholder="Ex: joao.silva@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Função</Label>
                  <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v as SystemUserRole })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          <div className="flex items-center gap-2">
                            {role.value === 'admin' ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                            {role.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <p className="text-3xl font-bold text-primary">{users.length}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">
                {users.filter(u => u.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-500">
                {users.filter(u => u.role === 'admin').length}
              </p>
              <p className="text-sm text-muted-foreground">Admins</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-500">
                {users.filter(u => !u.active).length}
              </p>
              <p className="text-sm text-muted-foreground">Inativos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table or Cards */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Lista de Usuários</CardTitle>
          <ViewModeToggle viewMode={viewMode} onViewModeChange={setViewMode} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <EmptyCardState
              icon={<User className="w-12 h-12" />}
              title="Nenhum usuário cadastrado"
              description="Cadastre o primeiro usuário para começar"
            />
          ) : viewMode === 'cards' ? (
            <ResponsiveCardGrid>
              {users.map((user) => (
                <ResponsiveCard
                  key={user.id}
                  title={user.name}
                  subtitle={`@${user.username}`}
                  badge={user.role ? {
                    label: ROLES.find(r => r.value === user.role)?.label || user.role,
                    className: `text-white ${ROLES.find(r => r.value === user.role)?.color || ''}`
                  } : undefined}
                  isActive={user.active ?? false}
                  onToggleActive={() => handleToggleActive(user)}
                  fields={[
                    { label: 'Email', value: user.email || '-' },
                    { 
                      label: 'Último Acesso', 
                      value: user.last_login 
                        ? new Date(user.last_login).toLocaleString('pt-BR')
                        : 'Nunca acessou',
                      icon: <Clock className="w-3 h-3" />
                    },
                  ]}
                  actions={[
                    { icon: <Edit className="w-4 h-4" />, onClick: () => handleEdit(user) },
                    { icon: <Trash2 className="w-4 h-4 text-destructive" />, onClick: () => handleDelete(user) },
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
                    <TableHead className="hidden md:table-cell">Usuário</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead className="hidden lg:table-cell">Último Acesso</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} className={!user.active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <User className="w-4 h-4" />
                          </div>
                          <div>
                            <p>{user.name}</p>
                            <p className="text-xs text-muted-foreground md:hidden">@{user.username}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        @{user.username}
                      </TableCell>
                      <TableCell>
                        {getRoleBadge(user.role)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                        {user.last_login 
                          ? new Date(user.last_login).toLocaleString('pt-BR')
                          : 'Nunca acessou'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={user.active ?? false}
                            onCheckedChange={() => handleToggleActive(user)}
                          />
                          <span className="text-xs hidden sm:inline">
                            {user.active ? (
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
                            onClick={() => handleEdit(user)}
                            title="Editar"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(user)}
                            className="text-destructive hover:text-destructive"
                            title="Excluir"
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
