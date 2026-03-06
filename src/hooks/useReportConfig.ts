import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ReportColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
  // Per-column style overrides
  fontColor?: string;
  bgColor?: string;
  fontSize?: number;
  bold?: boolean;
  halign?: 'left' | 'center' | 'right';
}

export interface ReportStyleConfig {
  headerBgColor: string;
  headerTextColor: string;
  headerFontSize: number;
  bodyFontSize: number;
  bodyBold: boolean;
  alternateRowColor1: string;
  alternateRowColor2: string;
  totalRowColor: string;
  titleText: string;
  showLogo: boolean;
}

export interface ReportConfig {
  columns: ReportColumnConfig[];
  style: ReportStyleConfig;
}

// Default styles shared across reports
const DEFAULT_STYLE: ReportStyleConfig = {
  headerBgColor: '#1E1E1E',
  headerTextColor: '#FFFFFF',
  headerFontSize: 9,
  bodyFontSize: 8,
  bodyBold: false,
  alternateRowColor1: '#FFFFFF',
  alternateRowColor2: '#EBF0FA',
  totalRowColor: '#DCC8C8',
  titleText: '',
  showLogo: true,
};

// Default column configs per report type
const DEFAULT_COLUMNS: Record<string, ReportColumnConfig[]> = {
  lancamentos_tanques: [
    { key: 'data', label: 'Data', visible: true, order: 0, width: 20 },
    { key: 'hora', label: 'Hora', visible: true, order: 1, width: 12 },
    { key: 'veiculo', label: 'Veículo', visible: true, order: 2, width: 22 },
    { key: 'potencia', label: 'Potência', visible: true, order: 3, width: 22 },
    { key: 'descricao', label: 'Descrição', visible: true, order: 4, width: 34 },
    { key: 'motorista', label: 'Motorista', visible: true, order: 5 },
    { key: 'empresa', label: 'Empresa', visible: true, order: 6, width: 26 },
    { key: 'quantidade', label: 'Qtd (L)', visible: true, order: 7, width: 18 },
    { key: 'consumo', label: 'Consumo', visible: true, order: 8, width: 24 },
    { key: 'hor_ant', label: 'Hor/Km Ant.', visible: true, order: 9, width: 22 },
    { key: 'hor_atual', label: 'Hor/Km Atual', visible: true, order: 10, width: 22 },
    { key: 'intervalo', label: 'Intervalo', visible: true, order: 11, width: 22 },
  ],
  lancamentos_comboios: [
    { key: 'data', label: 'Data', visible: true, order: 0, width: 20 },
    { key: 'hora', label: 'Hora', visible: true, order: 1, width: 12 },
    { key: 'veiculo', label: 'Veículo', visible: true, order: 2, width: 22 },
    { key: 'potencia', label: 'Potência', visible: true, order: 3, width: 22 },
    { key: 'descricao', label: 'Descrição', visible: true, order: 4, width: 34 },
    { key: 'motorista', label: 'Motorista', visible: true, order: 5 },
    { key: 'empresa', label: 'Empresa', visible: true, order: 6, width: 26 },
    { key: 'quantidade', label: 'Qtd (L)', visible: true, order: 7, width: 18 },
    { key: 'consumo', label: 'Consumo', visible: true, order: 8, width: 24 },
    { key: 'hor_ant', label: 'Hor/Km Ant.', visible: true, order: 9, width: 22 },
    { key: 'hor_atual', label: 'Hor/Km Atual', visible: true, order: 10, width: 22 },
    { key: 'intervalo', label: 'Intervalo', visible: true, order: 11, width: 22 },
  ],
  horimetros_resumo: [
    { key: 'index', label: '#', visible: true, order: 0, width: 10 },
    { key: 'veiculo', label: 'Veículo', visible: true, order: 1, width: 25 },
    { key: 'descricao', label: 'Descrição', visible: true, order: 2, width: 50 },
    { key: 'empresa', label: 'Empresa', visible: true, order: 3, width: 30 },
    { key: 'hor_inicial', label: 'Hor. Inicial', visible: true, order: 4, width: 25 },
    { key: 'hor_final', label: 'Hor. Final', visible: true, order: 5, width: 25 },
    { key: 'total_ht', label: 'Total H.T.', visible: true, order: 6, width: 22 },
    { key: 'total_km', label: 'Total KM', visible: true, order: 7, width: 22 },
    { key: 'lancamentos', label: 'Lanç.', visible: true, order: 8, width: 18 },
  ],
  frota_mobilizacao: [
    { key: 'descricao', label: 'Descrição', visible: true, order: 0 },
    { key: 'empresa', label: 'Empresa', visible: true, order: 1 },
    { key: 'quantidade', label: 'Quantidade', visible: true, order: 2 },
  ],
  tanques_report: [
    { key: 'index', label: '#', visible: true, order: 0, width: 12 },
    { key: 'codigo', label: 'Código', visible: true, order: 1, width: 28 },
    { key: 'descricao', label: 'Descrição', visible: true, order: 2, width: 58 },
    { key: 'motorista', label: 'Motorista/Operador', visible: true, order: 3, width: 52 },
    { key: 'hor_ant', label: 'Hor/Km Ant.', visible: true, order: 4, width: 28 },
    { key: 'hor_atual', label: 'Hor/Km Atual', visible: true, order: 5, width: 28 },
    { key: 'intervalo', label: 'Intervalo', visible: true, order: 6, width: 25 },
    { key: 'consumo', label: 'Consumo', visible: true, order: 7, width: 25 },
    { key: 'quantidade', label: 'Qtd Diesel', visible: true, order: 8, width: 21 },
  ],
};

const DEFAULT_TITLES: Record<string, string> = {
  lancamentos_tanques: 'LANÇAMENTOS — TANQUES',
  lancamentos_comboios: 'LANÇAMENTOS — COMBOIOS',
  horimetros_resumo: 'RELATÓRIO DE HORÍMETROS',
  frota_mobilizacao: 'RELATÓRIO DE MOBILIZAÇÃO',
  tanques_report: 'RELATÓRIO DE TANQUES',
};

export function useReportConfig(reportType: string) {
  const [config, setConfig] = useState<ReportConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const defaultConfig: ReportConfig = {
    columns: DEFAULT_COLUMNS[reportType] || [],
    style: {
      ...DEFAULT_STYLE,
      titleText: DEFAULT_TITLES[reportType] || '',
    },
  };

  const fetchConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('report_configurations' as any)
        .select('config')
        .eq('report_type', reportType)
        .maybeSingle();

      if (error) throw error;

      if (data && (data as any).config) {
        const saved = (data as any).config as ReportConfig;
        // Merge with defaults to ensure new columns are included
        const mergedColumns = defaultConfig.columns.map(defCol => {
          const savedCol = saved.columns?.find(c => c.key === defCol.key);
          return savedCol ? { ...defCol, ...savedCol } : defCol;
        });
        setConfig({
          columns: mergedColumns,
          style: { ...defaultConfig.style, ...saved.style },
        });
      } else {
        setConfig(defaultConfig);
      }
    } catch {
      setConfig(defaultConfig);
    } finally {
      setLoading(false);
    }
  }, [reportType]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = useCallback(async (newConfig: ReportConfig) => {
    try {
      const { error } = await supabase
        .from('report_configurations' as any)
        .upsert(
          { report_type: reportType, config: newConfig, updated_at: new Date().toISOString() },
          { onConflict: 'report_type' }
        );

      if (error) throw error;
      setConfig(newConfig);
      toast.success('Configuração salva com sucesso!');
    } catch (err) {
      console.error('Error saving report config:', err);
      toast.error('Erro ao salvar configuração');
    }
  }, [reportType]);

  const resetConfig = useCallback(async () => {
    try {
      await supabase
        .from('report_configurations' as any)
        .delete()
        .eq('report_type', reportType);

      setConfig(defaultConfig);
      toast.success('Configuração restaurada para o padrão');
    } catch {
      toast.error('Erro ao restaurar configuração');
    }
  }, [reportType]);

  return { config: config || defaultConfig, loading, saveConfig, resetConfig, defaultConfig };
}

// Hook to load ALL report configs at once (for the config page)
export function useAllReportConfigs() {
  const [configs, setConfigs] = useState<Record<string, ReportConfig>>({});
  const [loading, setLoading] = useState(true);

  const reportTypes = Object.keys(DEFAULT_COLUMNS);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const { data, error } = await supabase
          .from('report_configurations' as any)
          .select('report_type, config');

        if (error) throw error;

        const result: Record<string, ReportConfig> = {};
        reportTypes.forEach(type => {
          const saved = (data as any[])?.find((d: any) => d.report_type === type);
          const defaultCols = DEFAULT_COLUMNS[type] || [];
          const defaultStyle = { ...DEFAULT_STYLE, titleText: DEFAULT_TITLES[type] || '' };

          if (saved?.config) {
            const s = saved.config as ReportConfig;
            const mergedCols = defaultCols.map(defCol => {
              const savedCol = s.columns?.find(c => c.key === defCol.key);
              return savedCol ? { ...defCol, ...savedCol } : defCol;
            });
            result[type] = { columns: mergedCols, style: { ...defaultStyle, ...s.style } };
          } else {
            result[type] = { columns: defaultCols, style: defaultStyle };
          }
        });

        setConfigs(result);
      } catch {
        // Use defaults
        const result: Record<string, ReportConfig> = {};
        reportTypes.forEach(type => {
          result[type] = {
            columns: DEFAULT_COLUMNS[type] || [],
            style: { ...DEFAULT_STYLE, titleText: DEFAULT_TITLES[type] || '' },
          };
        });
        setConfigs(result);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const saveConfig = useCallback(async (reportType: string, newConfig: ReportConfig) => {
    try {
      const { error } = await supabase
        .from('report_configurations' as any)
        .upsert(
          { report_type: reportType, config: newConfig, updated_at: new Date().toISOString() },
          { onConflict: 'report_type' }
        );

      if (error) throw error;
      setConfigs(prev => ({ ...prev, [reportType]: newConfig }));
      toast.success('Configuração salva!');
    } catch {
      toast.error('Erro ao salvar');
    }
  }, []);

  return { configs, loading, saveConfig, reportTypes };
}

export { DEFAULT_COLUMNS, DEFAULT_STYLE, DEFAULT_TITLES };
