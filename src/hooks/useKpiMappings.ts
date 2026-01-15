import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface KpiMapping {
  id: string;
  sheet_name: string;
  kpi_id: string;
  column_name: string;
  user_identifier: string;
}

export function useKpiMappings(sheetName: string, userIdentifier: string = 'default') {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load mappings from database
  const loadMappings = useCallback(async () => {
    if (!sheetName) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('kpi_mappings')
        .select('*')
        .eq('sheet_name', sheetName)
        .eq('user_identifier', userIdentifier);

      if (error) throw error;

      const mappingRecord: Record<string, string> = {};
      (data || []).forEach((item: KpiMapping) => {
        mappingRecord[item.kpi_id] = item.column_name;
      });
      
      setMappings(mappingRecord);
    } catch (error) {
      console.error('Error loading KPI mappings:', error);
    } finally {
      setLoading(false);
    }
  }, [sheetName, userIdentifier]);

  // Save or update a single mapping
  const updateMapping = useCallback(async (kpiId: string, columnName: string) => {
    if (!sheetName) return;
    
    try {
      setSaving(true);
      
      // Upsert the mapping
      const { error } = await supabase
        .from('kpi_mappings')
        .upsert(
          {
            sheet_name: sheetName,
            kpi_id: kpiId,
            column_name: columnName,
            user_identifier: userIdentifier,
          },
          {
            onConflict: 'sheet_name,kpi_id,user_identifier',
          }
        );

      if (error) throw error;

      // Update local state
      setMappings(prev => ({ ...prev, [kpiId]: columnName }));
      
      toast.success('Mapeamento salvo com sucesso!');
    } catch (error) {
      console.error('Error saving KPI mapping:', error);
      toast.error('Erro ao salvar mapeamento');
    } finally {
      setSaving(false);
    }
  }, [sheetName, userIdentifier]);

  // Save all mappings at once
  const saveAllMappings = useCallback(async (allMappings: Record<string, string>) => {
    if (!sheetName) return;
    
    try {
      setSaving(true);
      
      // Build array of mappings to upsert
      const mappingsToSave = Object.entries(allMappings).map(([kpiId, columnName]) => ({
        sheet_name: sheetName,
        kpi_id: kpiId,
        column_name: columnName,
        user_identifier: userIdentifier,
      }));

      if (mappingsToSave.length === 0) return;

      const { error } = await supabase
        .from('kpi_mappings')
        .upsert(mappingsToSave, {
          onConflict: 'sheet_name,kpi_id,user_identifier',
        });

      if (error) throw error;

      setMappings(allMappings);
      toast.success(`${mappingsToSave.length} mapeamentos salvos!`);
    } catch (error) {
      console.error('Error saving KPI mappings:', error);
      toast.error('Erro ao salvar mapeamentos');
    } finally {
      setSaving(false);
    }
  }, [sheetName, userIdentifier]);

  // Delete a mapping
  const deleteMapping = useCallback(async (kpiId: string) => {
    if (!sheetName) return;
    
    try {
      const { error } = await supabase
        .from('kpi_mappings')
        .delete()
        .eq('sheet_name', sheetName)
        .eq('kpi_id', kpiId)
        .eq('user_identifier', userIdentifier);

      if (error) throw error;

      setMappings(prev => {
        const newMappings = { ...prev };
        delete newMappings[kpiId];
        return newMappings;
      });
      
      toast.success('Mapeamento removido');
    } catch (error) {
      console.error('Error deleting KPI mapping:', error);
      toast.error('Erro ao remover mapeamento');
    }
  }, [sheetName, userIdentifier]);

  // Load mappings on mount and when sheetName changes
  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  return {
    mappings,
    loading,
    saving,
    updateMapping,
    saveAllMappings,
    deleteMapping,
    refreshMappings: loadMappings,
  };
}
