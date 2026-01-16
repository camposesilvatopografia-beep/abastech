import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ObraSettings {
  id: string;
  nome: string;
  subtitulo: string | null;
  cidade: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useObraSettings() {
  const [settings, setSettings] = useState<ObraSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('obra_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data as ObraSettings);
      }
    } catch (error) {
      console.error('Error fetching obra settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<ObraSettings>) => {
    if (!settings?.id) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('obra_settings')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) throw error;

      setSettings((prev) => prev ? { ...prev, ...updates } : null);
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error updating obra settings:', error);
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    loading,
    saving,
    updateSettings,
    refetch: fetchSettings,
  };
}
