import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
}

export interface LayoutPreference {
  id: string;
  user_identifier: string;
  module_name: string;
  column_config: ColumnConfig[];
  created_at: string;
  updated_at: string;
}

const DEFAULT_USER_ID = 'default-user';

export function useLayoutPreferences(moduleName: string, defaultColumns: ColumnConfig[]) {
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(defaultColumns);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('layout_preferences')
        .select('*')
        .eq('user_identifier', DEFAULT_USER_ID)
        .eq('module_name', moduleName)
        .maybeSingle();

      if (error) throw error;

      if (data && data.column_config) {
        // Merge saved config with defaults to handle new columns
        const savedConfig = (data.column_config as unknown) as ColumnConfig[];
        if (Array.isArray(savedConfig)) {
          const mergedConfig = defaultColumns.map((defaultCol) => {
            const savedCol = savedConfig.find((c) => c.key === defaultCol.key);
            return savedCol ? { ...defaultCol, ...savedCol } : defaultCol;
          });
          
          // Sort by order
          const finalConfig = mergedConfig.sort((a, b) => a.order - b.order);
          setColumnConfig(finalConfig);
        } else {
          setColumnConfig(defaultColumns);
        }
      } else {
        setColumnConfig(defaultColumns);
      }
    } catch (error) {
      console.error('Error fetching layout preferences:', error);
      setColumnConfig(defaultColumns);
    } finally {
      setLoading(false);
    }
  }, [moduleName, defaultColumns]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const savePreferences = async (newConfig: ColumnConfig[]) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('layout_preferences')
        .upsert(
          {
            user_identifier: DEFAULT_USER_ID,
            module_name: moduleName,
            column_config: newConfig as unknown as Record<string, unknown>[],
            updated_at: new Date().toISOString(),
          } as any,
          {
            onConflict: 'user_identifier,module_name',
          }
        );

      if (error) throw error;

      setColumnConfig(newConfig);
      toast.success('Layout salvo com sucesso!');
    } catch (error) {
      console.error('Error saving layout preferences:', error);
      toast.error('Erro ao salvar layout');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('layout_preferences')
        .delete()
        .eq('user_identifier', DEFAULT_USER_ID)
        .eq('module_name', moduleName);

      if (error) throw error;

      setColumnConfig(defaultColumns);
      toast.success('Layout restaurado para o padrão!');
    } catch (error) {
      console.error('Error resetting layout:', error);
      toast.error('Erro ao restaurar layout');
    } finally {
      setSaving(false);
    }
  };

  const visibleColumns = columnConfig
    .filter((col) => col.visible)
    .sort((a, b) => a.order - b.order);

  return {
    columnConfig,
    setColumnConfig,
    visibleColumns,
    loading,
    saving,
    savePreferences,
    resetToDefaults,
    refetch: fetchPreferences,
  };
}
