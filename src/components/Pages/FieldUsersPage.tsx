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
  CheckCircle,
  Settings2,
  Copy,
  Trash2,
  Zap,
  Smartphone,
  Monitor,
  Share2,
  ExternalLink,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface RequiredFields {
  horimeter_current: boolean;
  km_current: boolean;
  fuel_quantity: boolean;
  arla_quantity: boolean;
  oil_type: boolean;
  oil_quantity: boolean;
  lubricant: boolean;
  filter_blow: boolean;
  observations: boolean;
  photo_horimeter: boolean;
  photo_pump: boolean;
  skip_all_validation?: boolean; // Admin option to skip all mandatory fields
}

interface RequiredFieldsPreset {
  id: string;
  name: string;
  fields: RequiredFields;
}

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  assigned_locations?: string[];
  required_fields?: RequiredFields;
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
  required_fields: RequiredFields;
}

const LOCATION_OPTIONS = [
  'Tanque Canteiro 01',
  'Tanque Canteiro 02',
  'Comboio 01',
  'Comboio 02',
  'Comboio 03',
];

const DEFAULT_REQUIRED_FIELDS: RequiredFields = {
  horimeter_current: true,
  km_current: false,
  fuel_quantity: true,
  arla_quantity: false,
  oil_type: false,
  oil_quantity: false,
  lubricant: false,
  filter_blow: false,
  observations: false,
  photo_horimeter: false,
  photo_pump: false,
  skip_all_validation: false,
};

const FIELD_LABELS: Record<keyof Omit<RequiredFields, 'skip_all_validation'>, string> = {
  horimeter_current: 'Horímetro Atual',
  km_current: 'KM Atual',
  fuel_quantity: 'Quantidade de Combustível',
  arla_quantity: 'Quantidade de ARLA',
  oil_type: 'Tipo de Óleo',
  oil_quantity: 'Quantidade de Óleo',
  lubricant: 'Lubrificante',
  filter_blow: 'Sopra Filtro',
  observations: 'Observações',
  photo_horimeter: 'Foto do Horímetro',
  photo_pump: 'Foto da Bomba',
};

const DEFAULT_PRESETS: RequiredFieldsPreset[] = [
  {
    id: 'basic',
    name: 'Básico (Horímetro + Combustível)',
    fields: {
      horimeter_current: true,
      km_current: false,
      fuel_quantity: true,
      arla_quantity: false,
      oil_type: false,
      oil_quantity: false,
      lubricant: false,
      filter_blow: false,
      observations: false,
      photo_horimeter: false,
      photo_pump: false,
      skip_all_validation: false,
    },
  },
  {
    id: 'complete',
    name: 'Completo (Todos os Campos)',
    fields: {
      horimeter_current: true,
      km_current: true,
      fuel_quantity: true,
      arla_quantity: true,
      oil_type: true,
      oil_quantity: true,
      lubricant: true,
      filter_blow: true,
      observations: true,
      photo_horimeter: true,
      photo_pump: true,
      skip_all_validation: false,
    },
  },
  {
    id: 'fuel_only',
    name: 'Apenas Combustível',
    fields: {
      horimeter_current: false,
      km_current: false,
      fuel_quantity: true,
      arla_quantity: false,
      oil_type: false,
      oil_quantity: false,
      lubricant: false,
      filter_blow: false,
      observations: false,
      photo_horimeter: false,
      photo_pump: false,
      skip_all_validation: false,
    },
  },
  {
    id: 'fuel_arla',
    name: 'Combustível + ARLA',
    fields: {
      horimeter_current: true,
      km_current: false,
      fuel_quantity: true,
      arla_quantity: true,
      oil_type: false,
      oil_quantity: false,
      lubricant: false,
      filter_blow: false,
      observations: false,
      photo_horimeter: false,
      photo_pump: false,
      skip_all_validation: false,
    },
  },
  {
    id: 'with_photos',
    name: 'Com Fotos Obrigatórias',
    fields: {
      horimeter_current: true,
      km_current: false,
      fuel_quantity: true,
      arla_quantity: false,
      oil_type: false,
      oil_quantity: false,
      lubricant: false,
      filter_blow: false,
      observations: false,
      photo_horimeter: true,
      photo_pump: true,
      skip_all_validation: false,
    },
  },
  {
    id: 'admin_no_required',
    name: 'Admin (Sem Obrigatórios)',
    fields: {
      horimeter_current: false,
      km_current: false,
      fuel_quantity: false,
      arla_quantity: false,
      oil_type: false,
      oil_quantity: false,
      lubricant: false,
      filter_blow: false,
      observations: false,
      photo_horimeter: false,
      photo_pump: false,
      skip_all_validation: true,
    },
  },
];

const PRESETS_STORAGE_KEY = 'field_users_required_fields_presets';

const loadCustomPresets = (): RequiredFieldsPreset[] => {
  try {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const saveCustomPresets = (presets: RequiredFieldsPreset[]) => {
  localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
};

const initialFormData: UserFormData = {
  name: '',
  username: '',
  password: '',
  role: 'operador',
  active: true,
  assigned_locations: ['Tanque Canteiro 01'],
  required_fields: DEFAULT_REQUIRED_FIELDS,
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

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<FieldUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Presets state
  const [customPresets, setCustomPresets] = useState<RequiredFieldsPreset[]>(loadCustomPresets());
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showBulkApplyModal, setShowBulkApplyModal] = useState(false);
  const [selectedUsersForBulk, setSelectedUsersForBulk] = useState<string[]>([]);
  const [selectedPresetForBulk, setSelectedPresetForBulk] = useState<string>('');
  const [applyingBulk, setApplyingBulk] = useState(false);

  const allPresets = [...DEFAULT_PRESETS, ...customPresets];

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
      
      // Map data to ensure required_fields has correct type
      const mappedUsers: FieldUser[] = (data || []).map(user => ({
        ...user,
        required_fields: (user.required_fields as unknown as RequiredFields) || DEFAULT_REQUIRED_FIELDS,
      }));
      
      setUsers(mappedUsers);
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
      
      // First, get all approved deletions
      const { data: approvedDeletions } = await supabase
        .from('field_record_requests')
        .select('record_id')
        .eq('request_type', 'delete')
        .eq('status', 'approved');
      
      const approvedDeletionIds = new Set(approvedDeletions?.map(d => d.record_id) || []);
      
      for (const user of users) {
        const { data: records } = await supabase
          .from('field_fuel_records')
          .select('id')
          .eq('user_id', user.id);
        
        // Filter out approved deletions
        const validRecords = records?.filter(r => !approvedDeletionIds.has(r.id)) || [];
        counts[user.id] = validRecords.length;
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
      // Fetch user's records
      const { data: records, error } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('user_id', user.id)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Fetch approved deletions
      const recordIds = records?.map(r => r.id) || [];
      let approvedDeletionIds: string[] = [];
      
      if (recordIds.length > 0) {
        const { data: approvedDeletions } = await supabase
          .from('field_record_requests')
          .select('record_id')
          .in('record_id', recordIds)
          .eq('request_type', 'delete')
          .eq('status', 'approved');
        
        approvedDeletionIds = approvedDeletions?.map(d => d.record_id) || [];
      }

      // Filter out records with approved deletions
      const filteredRecords = records?.filter(r => !approvedDeletionIds.includes(r.id)) || [];
      
      setHistoryRecords(filteredRecords.slice(0, 50));
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
      required_fields: user.required_fields || DEFAULT_REQUIRED_FIELDS,
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const applyPreset = (presetId: string) => {
    const preset = allPresets.find(p => p.id === presetId);
    if (preset) {
      setFormData({
        ...formData,
        required_fields: { ...preset.fields },
      });
      toast.success(`Preset "${preset.name}" aplicado!`);
    }
  };

  const saveAsPreset = () => {
    if (!newPresetName.trim()) {
      toast.error('Digite um nome para o preset');
      return;
    }
    
    const newPreset: RequiredFieldsPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      fields: { ...formData.required_fields },
    };
    
    const updatedPresets = [...customPresets, newPreset];
    setCustomPresets(updatedPresets);
    saveCustomPresets(updatedPresets);
    setNewPresetName('');
    setShowPresetModal(false);
    toast.success('Preset salvo com sucesso!');
  };

  const deleteCustomPreset = (presetId: string) => {
    const updatedPresets = customPresets.filter(p => p.id !== presetId);
    setCustomPresets(updatedPresets);
    saveCustomPresets(updatedPresets);
    toast.success('Preset excluído!');
  };

  const openBulkApplyModal = () => {
    setSelectedUsersForBulk([]);
    setSelectedPresetForBulk('');
    setShowBulkApplyModal(true);
  };

  const toggleUserForBulk = (userId: string) => {
    setSelectedUsersForBulk(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const selectAllUsersForBulk = () => {
    if (selectedUsersForBulk.length === users.length) {
      setSelectedUsersForBulk([]);
    } else {
      setSelectedUsersForBulk(users.map(u => u.id));
    }
  };

  const applyPresetToMultipleUsers = async () => {
    if (selectedUsersForBulk.length === 0) {
      toast.error('Selecione pelo menos um usuário');
      return;
    }
    
    if (!selectedPresetForBulk) {
      toast.error('Selecione um preset');
      return;
    }
    
    const preset = allPresets.find(p => p.id === selectedPresetForBulk);
    if (!preset) {
      toast.error('Preset não encontrado');
      return;
    }
    
    setApplyingBulk(true);
    
    try {
      const { error } = await supabase
        .from('field_users')
        .update({
          required_fields: JSON.parse(JSON.stringify(preset.fields)),
          updated_at: new Date().toISOString(),
        } as any)
        .in('id', selectedUsersForBulk);
      
      if (error) throw error;
      
      toast.success(`Preset aplicado a ${selectedUsersForBulk.length} usuário(s)!`);
      setShowBulkApplyModal(false);
      fetchUsers();
    } catch (err) {
      console.error('Bulk apply error:', err);
      toast.error('Erro ao aplicar preset');
    } finally {
      setApplyingBulk(false);
    }
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
          required_fields: formData.required_fields,
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
          required_fields: formData.required_fields,
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

  const openDeleteModal = (user: FieldUser) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setDeleting(true);
    const deletedUserId = userToDelete.id;
    
    try {
      // First check if user has any records
      const recordCount = userRecordCounts[deletedUserId] || 0;
      
      if (recordCount > 0) {
        toast.error(`Este usuário possui ${recordCount} apontamento(s). Desative-o em vez de excluir.`);
        setShowDeleteModal(false);
        setUserToDelete(null);
        setDeleting(false);
        return;
      }
      
      const { error } = await supabase
        .from('field_users')
        .delete()
        .eq('id', deletedUserId);

      if (error) throw error;
      
      // Optimistic update - remove user from list immediately
      setUsers(prev => prev.filter(u => u.id !== deletedUserId));
      
      // Also remove from record counts
      setUserRecordCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[deletedUserId];
        return newCounts;
      });
      
      toast.success('Usuário excluído com sucesso!');
      setShowDeleteModal(false);
      setUserToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Erro ao excluir usuário');
      // Refresh on error to sync state
      fetchUsers();
    } finally {
      setDeleting(false);
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
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-primary-foreground hover:bg-primary-foreground/20"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Links de Instalação</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm">Links de Instalação do App</h4>
                  
                  {/* Mobile PWA */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      App Mobile (Campo)
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input 
                        readOnly 
                        value="https://abastech.lovable.app/apontamento/instalar" 
                        className="text-xs h-8 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText('https://abastech.lovable.app/apontamento/instalar');
                          toast.success('Link mobile copiado!');
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Link to="/apontamento/instalar" target="_blank">
                        <Button variant="outline" size="sm" className="h-8 px-2 shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  
                  {/* Desktop PWA */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5" />
                      App Desktop (Admin)
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <Input 
                        readOnly 
                        value="https://abastech.lovable.app/instalar" 
                        className="text-xs h-8 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-2 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText('https://abastech.lovable.app/instalar');
                          toast.success('Link desktop copiado!');
                        }}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Link to="/instalar" target="_blank">
                        <Button variant="outline" size="sm" className="h-8 px-2 shrink-0">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* WhatsApp share */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={() => {
                      const msg = encodeURIComponent(
                        '📱 Instale o app Abastech no celular:\nhttps://abastech.lovable.app/apontamento/instalar\n\n🖥️ Instale no computador:\nhttps://abastech.lovable.app/instalar'
                      );
                      window.open(`https://wa.me/?text=${msg}`, '_blank');
                    }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Compartilhar via WhatsApp
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button 
              onClick={openBulkApplyModal} 
              variant="ghost"
              size="sm"
              className="gap-2 text-primary-foreground hover:bg-primary-foreground/20"
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Aplicar Preset</span>
            </Button>
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
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDeleteModal(user)}
                              title="Excluir"
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
      </main>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
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

          <ScrollArea className="flex-1 pr-4 -mr-4">
            <div className="space-y-3 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">Nome Completo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: João da Silva"
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs">Nome de Usuário *</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value.toLowerCase() })
                    }
                    placeholder="Ex: joao.silva"
                    className="h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs">
                    {editingUser ? 'Nova Senha' : 'Senha *'}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder={editingUser ? '••••••••' : 'Senha'}
                      className="h-9 pr-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-9 w-9"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-xs">Perfil</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operador">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5" />
                          Operador
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5" />
                          Administrador
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Locais de Trabalho
                </Label>
                <div className="grid grid-cols-2 gap-1.5 p-2 bg-muted/50 rounded-lg">
                  {LOCATION_OPTIONS.map((loc) => (
                    <label key={loc} className="flex items-center gap-1.5 cursor-pointer">
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
                        className="w-3.5 h-3.5 rounded"
                      />
                      <span className="text-xs">{loc}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  O primeiro local selecionado será o padrão.
                </p>
              </div>

              {/* Required Fields Configuration */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    Campos Obrigatórios
                  </Label>
                  {!formData.required_fields.skip_all_validation && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPresetModal(true)}
                      className="h-6 text-[10px] gap-1 px-2"
                    >
                      <Save className="w-3 h-3" />
                      Salvar Preset
                    </Button>
                  )}
                </div>
                
                {/* Admin Skip Validation Option */}
                <label className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.required_fields.skip_all_validation || false}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        required_fields: {
                          ...formData.required_fields,
                          skip_all_validation: e.target.checked,
                        },
                      });
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <div className="flex-1">
                    <span className="text-xs font-medium flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5 text-amber-500" />
                      Sem Campos Obrigatórios (Admin)
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      Usuário pode preencher apenas o que desejar
                    </p>
                  </div>
                </label>

                {!formData.required_fields.skip_all_validation && (
                  <>
                    {/* Preset Selection */}
                    <Select onValueChange={applyPreset}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Aplicar preset..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                          Presets Padrão
                        </div>
                        {DEFAULT_PRESETS.map((preset) => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.name}
                          </SelectItem>
                        ))}
                        {customPresets.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground border-t mt-1 pt-1">
                              Presets Personalizados
                            </div>
                            {customPresets.map((preset) => (
                              <div key={preset.id} className="flex items-center justify-between pr-2">
                                <SelectItem value={preset.id} className="flex-1">
                                  {preset.name}
                                </SelectItem>
                              </div>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    
                    {/* Fields Checkboxes */}
                    <div className="grid grid-cols-2 gap-1.5 p-2 bg-muted/50 rounded-lg">
                      {(Object.keys(FIELD_LABELS) as Array<keyof Omit<RequiredFields, 'skip_all_validation'>>).map((field) => (
                        <label key={field} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.required_fields[field] as boolean}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                required_fields: {
                                  ...formData.required_fields,
                                  [field]: e.target.checked,
                                },
                              });
                            }}
                            className="w-3.5 h-3.5 rounded"
                          />
                          <span className="text-[10px]">{FIELD_LABELS[field]}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Campos marcados serão obrigatórios no formulário.
                    </p>
                  </>
                )}
              </div>

              {editingUser && (
                <div className="flex items-center justify-between p-2 bg-muted rounded-lg">
                  <div className="flex items-center gap-1.5">
                    {formData.active ? (
                      <UserCheck className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <UserX className="w-3.5 h-3.5 text-red-500" />
                    )}
                    <span className="text-xs">
                      Usuário {formData.active ? 'ativo' : 'inativo'}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant={formData.active ? 'destructive' : 'default'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                  >
                    {formData.active ? 'Desativar' : 'Ativar'}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 flex gap-2 sm:gap-0 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
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

      {/* Save Preset Modal */}
      <Dialog open={showPresetModal} onOpenChange={setShowPresetModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5" />
              Salvar Preset de Campos
            </DialogTitle>
            <DialogDescription>
              Salve a configuração atual como um preset reutilizável
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Nome do Preset</Label>
              <Input
                id="preset-name"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Ex: Comboio Padrão"
              />
            </div>
            
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">Campos que serão salvos:</p>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(FIELD_LABELS) as Array<keyof RequiredFields>)
                  .filter(field => formData.required_fields[field])
                  .map(field => (
                    <Badge key={field} variant="secondary" className="text-xs">
                      {FIELD_LABELS[field]}
                    </Badge>
                  ))}
                {Object.values(formData.required_fields).every(v => !v) && (
                  <span className="text-xs text-muted-foreground">Nenhum campo obrigatório</span>
                )}
              </div>
            </div>

            {customPresets.length > 0 && (
              <div className="space-y-2">
                <Label>Presets Personalizados Existentes</Label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {customPresets.map(preset => (
                    <div key={preset.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span className="text-sm">{preset.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => deleteCustomPreset(preset.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPresetModal(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAsPreset} className="gap-2">
              <Save className="w-4 h-4" />
              Salvar Preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Excluir Usuário
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Tem certeza que deseja excluir este usuário?
            </DialogDescription>
          </DialogHeader>

          {userToDelete && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="font-medium">{userToDelete.name}</p>
                  <p className="text-sm text-muted-foreground">@{userToDelete.username}</p>
                </div>
              </div>
              {(userRecordCounts[userToDelete.id] || 0) > 0 && (
                <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-600">
                  ⚠️ Este usuário possui {userRecordCounts[userToDelete.id]} apontamento(s). 
                  Considere desativar em vez de excluir.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteUser} 
              disabled={deleting}
              className="gap-2"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Excluir Usuário
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Apply Preset Modal */}
      <Dialog open={showBulkApplyModal} onOpenChange={setShowBulkApplyModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Aplicar Preset em Múltiplos Usuários
            </DialogTitle>
            <DialogDescription>
              Selecione um preset e os usuários para aplicar a configuração
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecione o Preset</Label>
              <Select value={selectedPresetForBulk} onValueChange={setSelectedPresetForBulk}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um preset..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                    Presets Padrão
                  </div>
                  {DEFAULT_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                  {customPresets.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                        Presets Personalizados
                      </div>
                      {customPresets.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              
              {selectedPresetForBulk && (
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium mb-1">Campos obrigatórios:</p>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(FIELD_LABELS) as Array<keyof RequiredFields>)
                      .filter(field => allPresets.find(p => p.id === selectedPresetForBulk)?.fields[field])
                      .map(field => (
                        <Badge key={field} variant="outline" className="text-xs">
                          {FIELD_LABELS[field]}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Selecione os Usuários</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={selectAllUsersForBulk}
                  className="h-7 text-xs"
                >
                  {selectedUsersForBulk.length === users.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                </Button>
              </div>
              <ScrollArea className="h-48 border rounded-lg p-2">
                <div className="space-y-1">
                  {users.map(user => (
                    <label
                      key={user.id}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                        selectedUsersForBulk.includes(user.id) 
                          ? 'bg-primary/10 border border-primary/20' 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={selectedUsersForBulk.includes(user.id)}
                        onCheckedChange={() => toggleUserForBulk(user.id)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.username}</p>
                      </div>
                      <Badge variant={user.active ? 'default' : 'secondary'} className="text-xs">
                        {user.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </label>
                  ))}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                {selectedUsersForBulk.length} usuário(s) selecionado(s)
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowBulkApplyModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={applyPresetToMultipleUsers} 
              disabled={applyingBulk || !selectedPresetForBulk || selectedUsersForBulk.length === 0}
              className="gap-2"
            >
              {applyingBulk ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Aplicar Preset
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
