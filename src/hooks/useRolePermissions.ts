import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RolePermission {
  id: string;
  role: string;
  module_id: string;
  can_view: boolean;
  can_edit: boolean;
}

export interface UserPermission {
  id: string;
  user_id: string;
  user_type: string;
  module_id: string;
  can_view: boolean;
  can_edit: boolean;
}

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  abastecimento: 'Abastecimento',
  frota: 'Frota',
  horimetros: 'Horímetros',
  manutencao: 'Manutenção',
  calendario: 'Calendário',
  fornecedores: 'Fornecedores',
  lubrificantes: 'Lubrificantes',
  mecanicos: 'Mecânicos',
  tiposoleos: 'Tipos de Óleo',
  usuarios: 'Usuários do Sistema',
  obra: 'Dados da Obra',
  alertas: 'Alertas',
  campo: 'Apontamento Campo',
  campo_usuarios: 'Usuários de Campo',
  // Field-specific modules
  field_dashboard: 'Dashboard (Campo)',
  field_abastecimento: 'Abastecimento (Campo)',
  field_horimetros: 'Horímetros (Campo)',
  field_os: 'Ordens de Serviço (Campo)',
};

export const SYSTEM_MODULES: string[] = [
  'dashboard', 'abastecimento', 'frota', 'horimetros', 'manutencao', 'calendario', 'alertas',
  'fornecedores', 'lubrificantes', 'mecanicos', 'tiposoleos', 'usuarios', 'obra',
  'campo', 'campo_usuarios',
];

export const FIELD_MODULES: string[] = [
  'field_dashboard', 'field_abastecimento', 'field_horimetros', 'field_os',
];

export const MODULE_GROUPS: { label: string; modules: string[] }[] = [
  {
    label: 'Módulos Principais',
    modules: ['dashboard', 'abastecimento', 'frota', 'horimetros', 'manutencao', 'calendario', 'alertas'],
  },
  {
    label: 'Cadastros',
    modules: ['fornecedores', 'lubrificantes', 'mecanicos', 'tiposoleos', 'usuarios', 'obra'],
  },
  {
    label: 'Campo (Acesso Admin)',
    modules: ['campo', 'campo_usuarios'],
  },
  {
    label: 'Módulos Campo (Mobile)',
    modules: ['field_dashboard', 'field_abastecimento', 'field_horimetros', 'field_os'],
  },
];

export function useRolePermissions() {
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const [roleRes, userRes] = await Promise.all([
        supabase.from('role_permissions').select('*').order('role').order('module_id'),
        supabase.from('user_permissions').select('*').order('user_id').order('module_id'),
      ]);

      if (roleRes.error) throw roleRes.error;
      if (userRes.error) throw userRes.error;
      setPermissions((roleRes.data as any[]) || []);
      setUserPermissions((userRes.data as any[]) || []);
    } catch (err) {
      console.error('Error fetching permissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const updatePermission = useCallback(async (
    role: string,
    moduleId: string,
    field: 'can_view' | 'can_edit',
    value: boolean
  ) => {
    try {
      const updates: Partial<RolePermission> = { [field]: value };
      if (field === 'can_view' && !value) updates.can_edit = false;
      if (field === 'can_edit' && value) updates.can_view = true;

      const { error } = await supabase
        .from('role_permissions')
        .update(updates)
        .eq('role', role)
        .eq('module_id', moduleId);

      if (error) throw error;

      setPermissions(prev =>
        prev.map(p =>
          p.role === role && p.module_id === moduleId ? { ...p, ...updates } : p
        )
      );
    } catch (err) {
      console.error('Error updating permission:', err);
      throw err;
    }
  }, []);

  // User-level permission CRUD
  const updateUserPermission = useCallback(async (
    userId: string,
    userType: string,
    moduleId: string,
    field: 'can_view' | 'can_edit',
    value: boolean
  ) => {
    try {
      const updates: Record<string, any> = { [field]: value };
      if (field === 'can_view' && !value) updates.can_edit = false;
      if (field === 'can_edit' && value) updates.can_view = true;

      // Check if user permission exists
      const existing = userPermissions.find(p => p.user_id === userId && p.module_id === moduleId);
      
      if (existing) {
        const { error } = await supabase
          .from('user_permissions')
          .update(updates)
          .eq('user_id', userId)
          .eq('module_id', moduleId);
        if (error) throw error;
        setUserPermissions(prev =>
          prev.map(p => p.user_id === userId && p.module_id === moduleId ? { ...p, ...updates } : p)
        );
      } else {
        const newPerm = {
          user_id: userId,
          user_type: userType,
          module_id: moduleId,
          can_view: field === 'can_view' ? value : true,
          can_edit: field === 'can_edit' ? value : false,
          ...updates,
        };
        const { data, error } = await supabase
          .from('user_permissions')
          .insert(newPerm)
          .select()
          .single();
        if (error) throw error;
        setUserPermissions(prev => [...prev, data as any]);
      }
    } catch (err) {
      console.error('Error updating user permission:', err);
      throw err;
    }
  }, [userPermissions]);

  const deleteUserPermissions = useCallback(async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
      setUserPermissions(prev => prev.filter(p => p.user_id !== userId));
    } catch (err) {
      console.error('Error deleting user permissions:', err);
      throw err;
    }
  }, []);

  const getPermission = useCallback((role: string, moduleId: string): RolePermission | undefined => {
    return permissions.find(p => p.role === role && p.module_id === moduleId);
  }, [permissions]);

  const getUserPermission = useCallback((userId: string, moduleId: string): UserPermission | undefined => {
    return userPermissions.find(p => p.user_id === userId && p.module_id === moduleId);
  }, [userPermissions]);

  const getUserPermissions = useCallback((userId: string): UserPermission[] => {
    return userPermissions.filter(p => p.user_id === userId);
  }, [userPermissions]);

  const hasCustomPermissions = useCallback((userId: string): boolean => {
    return userPermissions.some(p => p.user_id === userId);
  }, [userPermissions]);

  // Resolved permission: user-level overrides role-level
  const canView = useCallback((role: string, moduleId: string, userId?: string): boolean => {
    if (role === 'admin') return true;
    // Check user-level first
    if (userId) {
      const userPerm = userPermissions.find(p => p.user_id === userId && p.module_id === moduleId);
      if (userPerm) return userPerm.can_view;
    }
    // Fallback to role-level
    const perm = permissions.find(p => p.role === role && p.module_id === moduleId);
    return perm?.can_view ?? false;
  }, [permissions, userPermissions]);

  const canEdit = useCallback((role: string, moduleId: string, userId?: string): boolean => {
    if (role === 'admin') return true;
    if (userId) {
      const userPerm = userPermissions.find(p => p.user_id === userId && p.module_id === moduleId);
      if (userPerm) return userPerm.can_edit;
    }
    const perm = permissions.find(p => p.role === role && p.module_id === moduleId);
    return perm?.can_edit ?? false;
  }, [permissions, userPermissions]);

  return {
    permissions,
    userPermissions,
    loading,
    fetchPermissions,
    updatePermission,
    updateUserPermission,
    deleteUserPermissions,
    getPermission,
    getUserPermission,
    getUserPermissions,
    hasCustomPermissions,
    canView,
    canEdit,
  };
}
