import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface RolePermission {
  id: string;
  role: string;
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
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .order('role')
        .order('module_id');

      if (error) throw error;
      setPermissions((data as any[]) || []);
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
      // If disabling view, also disable edit
      const updates: Partial<RolePermission> = { [field]: value };
      if (field === 'can_view' && !value) {
        updates.can_edit = false;
      }
      // If enabling edit, also enable view
      if (field === 'can_edit' && value) {
        updates.can_view = true;
      }

      const { error } = await supabase
        .from('role_permissions')
        .update(updates)
        .eq('role', role)
        .eq('module_id', moduleId);

      if (error) throw error;

      // Optimistic update
      setPermissions(prev =>
        prev.map(p =>
          p.role === role && p.module_id === moduleId
            ? { ...p, ...updates }
            : p
        )
      );
    } catch (err) {
      console.error('Error updating permission:', err);
      throw err;
    }
  }, []);

  const getPermission = useCallback((role: string, moduleId: string): RolePermission | undefined => {
    return permissions.find(p => p.role === role && p.module_id === moduleId);
  }, [permissions]);

  const canView = useCallback((role: string, moduleId: string): boolean => {
    if (role === 'admin') return true; // Admin always has access
    const perm = permissions.find(p => p.role === role && p.module_id === moduleId);
    return perm?.can_view ?? false;
  }, [permissions]);

  const canEdit = useCallback((role: string, moduleId: string): boolean => {
    if (role === 'admin') return true;
    const perm = permissions.find(p => p.role === role && p.module_id === moduleId);
    return perm?.can_edit ?? false;
  }, [permissions]);

  return {
    permissions,
    loading,
    fetchPermissions,
    updatePermission,
    getPermission,
    canView,
    canEdit,
  };
}
