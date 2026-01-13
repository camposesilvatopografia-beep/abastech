import { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Clock,
  RefreshCw,
  AlertTriangle,
  Download,
  Upload,
  Plus,
  Search,
  Calendar,
  X,
  CheckCircle,
  Timer,
  FileText,
  Wrench,
  Wifi,
  WifiOff,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { HorimeterModal } from '@/components/Horimetros/HorimeterModal';
import { supabase } from '@/integrations/supabase/client';

const SHEET_NAME = 'Horimetros';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/_/g, '');
}

function findColumnKey(row: Record<string, any>, candidates: string[]): string | null {
  const keys = Object.keys(row);
  const normalized = new Map(keys.map(k => [normalizeKey(k), k] as const));
  for (const c of candidates) {
    const found = normalized.get(normalizeKey(c));
    if (found) return found;
  }
  return null;
}

export function HorimetrosPage() {
  const { data, loading, refetch, update } = useSheetData(SHEET_NAME);
  const { data: vehicleData } = useSheetData('Veiculo');
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'resumo' | 'detalhes'>('resumo');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [quickFilter, setQuickFilter] = useState<string | null>('mes');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedPendingVehicle, setSelectedPendingVehicle] = useState<string | undefined>(undefined);
  const [isFixingZeroed, setIsFixingZeroed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [isTesting, setIsTesting] = useState(false);
  const [autoFixReport, setAutoFixReport] = useState<null | {
    ranAt: string;
    fixed: number;
    skippedNoHistory: number;
    skippedNoColumns: number;
    errors: number;
    vehiclesAffected: number;
  }>(null);
  const [autoFixEnabled, setAutoFixEnabled] = useState(true);

  // Get unique categories from data
  const categories = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const cat = getRowValue(row as any, ['Categoria', 'CATEGORIA', 'categoria', 'TIPO', 'Tipo', 'tipo']);
      if (cat) unique.add(cat);
    });
    // Also check vehicle data
    vehicleData.rows.forEach(row => {
      const cat = getRowValue(row as any, ['Categoria', 'CATEGORIA', 'categoria', 'TIPO', 'Tipo', 'tipo']);
      if (cat) unique.add(cat);
    });
    return Array.from(unique).sort();
  }, [data.rows, vehicleData.rows]);

  // Test connection on mount
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setIsTesting(true);
    setConnectionStatus('checking');
    
    try {
      const { error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getSheetNames' },
      });
      
      if (error) {
        console.error('Connection test failed:', error);
        setConnectionStatus('error');
        toast({
          title: 'Erro de conexão',
          description: 'Falha ao conectar com o Google Sheets',
          variant: 'destructive',
        });
      } else {
        setConnectionStatus('connected');
      }
    } catch (err) {
      console.error('Connection test error:', err);
      setConnectionStatus('error');
    } finally {
      setIsTesting(false);
    }
  };

  const syncData = async () => {
    setIsTesting(true);
    try {
      await refetch();
      toast({
        title: 'Dados Sincronizados',
        description: `${data.rows.length} registros carregados`,
      });
    } catch (err) {
      toast({
        title: 'Erro ao sincronizar',
        description: 'Falha ao carregar dados do Google Sheets',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const applyQuickFilter = (filter: string) => {
    const today = new Date();
    setQuickFilter(filter);
    
    switch (filter) {
      case 'hoje':
        setStartDate(today);
        setEndDate(today);
        break;
      case 'semana':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        setStartDate(weekStart);
        setEndDate(today);
        break;
      case 'mes':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setStartDate(monthStart);
        setEndDate(today);
        break;
      case 'todos':
        setStartDate(undefined);
        setEndDate(undefined);
        break;
    }
  };

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setQuickFilter(null);
  };

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );

      // Category filter
      let matchesCategory = true;
      if (categoryFilter !== 'all') {
        const rowCat = getRowValue(row as any, ['Categoria', 'CATEGORIA', 'categoria', 'TIPO', 'Tipo', 'tipo']);
        matchesCategory = rowCat.toLowerCase() === categoryFilter.toLowerCase();
      }

      let matchesDate = true;
      if (startDate || endDate) {
        const rowDateStr = String(row['DATA'] || row['Data'] || '');
        const rowDate = parseDate(rowDateStr);
        
        if (rowDate) {
          if (startDate && endDate) {
            matchesDate = isWithinInterval(rowDate, {
              start: startOfDay(startDate),
              end: endOfDay(endDate)
            });
          } else if (startDate) {
            matchesDate = rowDate >= startOfDay(startDate);
          } else if (endDate) {
            matchesDate = rowDate <= endOfDay(endDate);
          }
        } else {
          matchesDate = false;
        }
      }

      return matchesSearch && matchesDate && matchesCategory;
    });
  }, [data.rows, search, startDate, endDate, categoryFilter]);

  // Find zeroed records that need correction
  const zeroedRecords = useMemo(() => {
    const readingCandidates = ['HORAS', 'HORIMETRO', 'HORÍMETRO', 'KM', 'QUILOMETRAGEM', 'KILOMETRAGEM'];

    return data.rows.filter(row => {
      const readingKey = findColumnKey(row as any, readingCandidates);
      if (!readingKey) return false;
      const horas = parseNumber((row as any)[readingKey]);
      return horas === 0;
    });
  }, [data.rows]);

  const metrics = useMemo(() => {
    let horasTotais = 0;
    let registros = 0;
    let zerados = 0;
    let inconsistentes = 0;

    filteredRows.forEach(row => {
      const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
      horasTotais += horas;
      registros++;
      
      if (horas === 0) zerados++;
      if (horas < 0) inconsistentes++;
    });

    return {
      horasTotais,
      mediaRegistro: registros > 0 ? horasTotais / registros : 0,
      registros,
      faltamCadastrar: 154 - registros,
      inconsistentes,
      zerados
    };
  }, [filteredRows]);

  // Vehicle summary with all required columns
  const vehicleSummary = useMemo(() => {
    const summary = new Map<string, {
      veiculo: string;
      descricao: string;
      categoria: string;
      horAnterior: number;
      horAtual: number;
      kmAnterior: number;
      kmAtual: number;
      intervaloHor: number;
      intervaloKm: number;
      totalMesHor: number;
      totalMesKm: number;
      usaKm: boolean;
      registros: number;
    }>();

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    filteredRows.forEach(row => {
      const veiculo = getRowValue(row as any, ['Veiculo', 'VEICULO', 'VEÍCULO', 'EQUIPAMENTO']);
      if (!veiculo) return;

      const descricao = getRowValue(row as any, ['Descricao', 'DESCRICAO', 'DESCRIÇÃO', 'Descrição']);
      const categoria = getRowValue(row as any, ['Categoria', 'CATEGORIA', 'TIPO', 'Tipo']);
      
      const horAnterior = parseNumber(getRowValue(row as any, ['Hor_Anterior', 'HOR_ANTERIOR', 'HORIMETRO_ANTERIOR']));
      const horAtual = parseNumber(getRowValue(row as any, ['Hor_Atual', 'HOR_ATUAL', 'HORIMETRO_ATUAL', 'HORIMETRO', 'HORAS']));
      const kmAnterior = parseNumber(getRowValue(row as any, ['Km_Anterior', 'KM_ANTERIOR', 'QUILOMETRAGEM_ANTERIOR']));
      const kmAtual = parseNumber(getRowValue(row as any, ['Km_Atual', 'KM_ATUAL', 'QUILOMETRAGEM_ATUAL', 'KM']));

      // Determine if uses KM based on category: "Veículo" uses km, "Equipamento" uses h
      const categoriaLower = categoria.toLowerCase();
      const usaKm = categoriaLower.includes('veículo') || categoriaLower.includes('veiculo') || 
                   categoriaLower === 'veiculo' || categoriaLower === 'veículo' ||
                   kmAtual > 0 || kmAnterior > 0;

      const rowDateStr = getRowValue(row as any, ['Data', 'DATA']);
      const rowDate = parseDate(rowDateStr);
      const isInMonth = rowDate && isWithinInterval(rowDate, { start: monthStart, end: monthEnd });

      const existing = summary.get(veiculo);
      if (existing) {
        // Update with latest values (assuming sorted by date)
        if (horAtual > existing.horAtual) {
          existing.intervaloHor = horAtual - existing.horAtual;
          existing.horAtual = horAtual;
        }
        if (horAnterior > 0 && (existing.horAnterior === 0 || horAnterior < existing.horAnterior)) {
          existing.horAnterior = horAnterior;
        }
        if (kmAtual > existing.kmAtual) {
          existing.intervaloKm = kmAtual - existing.kmAtual;
          existing.kmAtual = kmAtual;
        }
        if (kmAnterior > 0 && (existing.kmAnterior === 0 || kmAnterior < existing.kmAnterior)) {
          existing.kmAnterior = kmAnterior;
        }
        if (isInMonth) {
          existing.totalMesHor += horAtual - horAnterior;
          existing.totalMesKm += kmAtual - kmAnterior;
        }
        existing.registros++;
      } else {
        summary.set(veiculo, {
          veiculo,
          descricao,
          categoria,
          horAnterior,
          horAtual,
          kmAnterior,
          kmAtual,
          intervaloHor: horAtual - horAnterior,
          intervaloKm: kmAtual - kmAnterior,
          totalMesHor: isInMonth ? horAtual - horAnterior : 0,
          totalMesKm: isInMonth ? kmAtual - kmAnterior : 0,
          usaKm,
          registros: 1,
        });
      }
    });

    // Recalculate intervals as total range
    summary.forEach((item, key) => {
      if (item.horAnterior > 0 && item.horAtual > 0) {
        item.intervaloHor = item.horAtual - item.horAnterior;
      }
      if (item.kmAnterior > 0 && item.kmAtual > 0) {
        item.intervaloKm = item.kmAtual - item.kmAnterior;
      }
    });

    return Array.from(summary.values()).sort((a, b) => a.veiculo.localeCompare(b.veiculo));
  }, [filteredRows]);

  const COLUMN_CANDIDATES = useMemo(() => {
    return {
      // As seen in the user's sheet screenshot
      horAtual: ['Hor_Atual', 'HOR_ATUAL', 'HORATUAL', 'HORIMETRO_ATUAL', 'HORIMETROATUAL', 'HORÍMETRO_ATUAL', 'HORÍMETROATUAL'],
      horAnterior: ['Hor_Anterior', 'HOR_ANTERIOR', 'HORANTERIOR', 'HORIMETRO_ANTERIOR', 'HORIMETROANTERIOR', 'HORÍMETRO_ANTERIOR', 'HORÍMETROANTERIOR'],
      kmAtual: ['Km_Atual', 'KM_ATUAL', 'KMATUAL', 'QUILOMETRAGEM_ATUAL', 'QUILOMETRAGEMATUAL'],
      kmAnterior: ['Km_Anterior', 'KM_ANTERIOR', 'KMANTERIOR', 'QUILOMETRAGEM_ANTERIOR', 'QUILOMETRAGEMANTERIOR'],

      // Fallbacks found in older versions
      readingGeneric: ['HORAS', 'HORIMETRO', 'HORÍMETRO', 'KM', 'QUILOMETRAGEM', 'KILOMETRAGEM'],
      vehicle: ['Veiculo', 'VEICULO', 'VEÍCULO', 'EQUIPAMENTO'],
      date: ['Data', 'DATA', 'data'],
      obs: ['OBSERVACAO', 'OBSERVAÇÃO', 'Observacao', 'observacao', 'OBS'],
    };
  }, []);

  const runFixZeroed = useCallback(async (opts?: { auto?: boolean }) => {
    const isAuto = !!opts?.auto;

    if (data.rows.length === 0) {
      toast({
        title: 'Sem dados',
        description: 'Não há dados carregados para corrigir.',
        variant: 'destructive',
      });
      return;
    }

    const vehicleSet = new Set<string>();
    let fixed = 0;
    let errors = 0;
    let skippedNoHistory = 0;
    let skippedNoColumns = 0;

    // Helper: which metric columns exist for this row?
    const pickMetricKeys = (row: Record<string, any>) => {
      const horAtualKey = findColumnKey(row, COLUMN_CANDIDATES.horAtual);
      const horAnteriorKey = findColumnKey(row, COLUMN_CANDIDATES.horAnterior);
      const kmAtualKey = findColumnKey(row, COLUMN_CANDIDATES.kmAtual);
      const kmAnteriorKey = findColumnKey(row, COLUMN_CANDIDATES.kmAnterior);
      const genericKey = findColumnKey(row, COLUMN_CANDIDATES.readingGeneric);
      return { horAtualKey, horAnteriorKey, kmAtualKey, kmAnteriorKey, genericKey };
    };

    const getVehicle = (row: Record<string, any>) => {
      const vehicleKey = findColumnKey(row, COLUMN_CANDIDATES.vehicle);
      return vehicleKey ? String(row[vehicleKey] || '').trim() : '';
    };

    const getRowDate = (row: Record<string, any>) => {
      const dateKey = findColumnKey(row, COLUMN_CANDIDATES.date);
      const dateStr = dateKey ? String(row[dateKey] || '').trim() : '';
      return parseDate(dateStr);
    };

    const findLastValid = (vehicle: string, metricKeyCandidates: string[], currentRowDate: Date | null, currentRowIndex: number) => {
      // Filter records of same vehicle with valid metric (>0) and older than current date (if date exists)
      const candidates = data.rows
        .filter(r => getVehicle(r as any) === vehicle && (r as any)._rowIndex !== currentRowIndex)
        .map(r => {
          const metricKey = findColumnKey(r as any, metricKeyCandidates);
          const value = metricKey ? parseNumber((r as any)[metricKey]) : 0;
          const date = getRowDate(r as any);
          const idx = (r as any)._rowIndex ?? 0;
          return { r, value, date, idx };
        })
        .filter(x => x.value > 0);

      const filtered = currentRowDate
        ? candidates.filter(x => x.date ? x.date.getTime() <= currentRowDate.getTime() : true)
        : candidates;

      filtered.sort((a, b) => {
        if (a.date && b.date) return b.date.getTime() - a.date.getTime();
        return (b.idx ?? 0) - (a.idx ?? 0);
      });

      return filtered[0]?.value ?? 0;
    };

    // Identify rows to fix (any of the relevant columns is 0)
    const rowsToFix = data.rows.filter(row => {
      const { horAtualKey, horAnteriorKey, kmAtualKey, kmAnteriorKey, genericKey } = pickMetricKeys(row as any);
      const keys = [horAtualKey, horAnteriorKey, kmAtualKey, kmAnteriorKey, genericKey].filter(Boolean) as string[];
      if (keys.length === 0) return false;
      return keys.some(k => parseNumber((row as any)[k]) === 0);
    });

    if (rowsToFix.length === 0) {
      toast({
        title: 'Nenhum registro zerado',
        description: 'Não há registros com horímetro/KM zerado para corrigir.',
      });
      return;
    }

    setIsFixingZeroed(true);

    try {
      for (const record of rowsToFix) {
        const rowIndex = (record as any)._rowIndex;
        if (!rowIndex) {
          errors++;
          continue;
        }

        const veiculo = getVehicle(record as any);
        if (!veiculo) {
          skippedNoColumns++;
          continue;
        }

        const recDate = getRowDate(record as any);
        const { horAtualKey, horAnteriorKey, kmAtualKey, kmAnteriorKey, genericKey } = pickMetricKeys(record as any);

        const obsKey = findColumnKey(record as any, COLUMN_CANDIDATES.obs) || 'OBSERVACAO';
        const obsExisting = obsKey ? String((record as any)[obsKey] || '').trim() : '';

        const updatedData: Record<string, any> = { ...(record as any) };
        let didUpdate = false;

        const updateIfZero = (key: string | null, metricCandidates: string[]) => {
          if (!key) return;
          const current = parseNumber((record as any)[key]);
          if (current !== 0) return;
          const last = findLastValid(veiculo, metricCandidates, recDate, rowIndex);
          if (last > 0) {
            updatedData[key] = last.toString().replace('.', ',');
            didUpdate = true;
          } else {
            skippedNoHistory++;
          }
        };

        // Prefer explicit columns from screenshot
        if (horAtualKey || horAnteriorKey) {
          updateIfZero(horAnteriorKey, COLUMN_CANDIDATES.horAtual);
          updateIfZero(horAtualKey, COLUMN_CANDIDATES.horAtual);
        }

        if (kmAtualKey || kmAnteriorKey) {
          updateIfZero(kmAnteriorKey, COLUMN_CANDIDATES.kmAtual);
          updateIfZero(kmAtualKey, COLUMN_CANDIDATES.kmAtual);
        }

        // Fallback generic column
        if (!didUpdate && genericKey) {
          updateIfZero(genericKey, COLUMN_CANDIDATES.readingGeneric);
        }

        if (!didUpdate) {
          // nothing to update (no columns or no history)
          continue;
        }

        const suffix = `CORRIGIDO AUTOMATICAMENTE: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`;
        updatedData[obsKey] = obsExisting ? `${obsExisting} | ${suffix}` : suffix;

        try {
          await update(rowIndex, updatedData);
          fixed++;
          vehicleSet.add(veiculo);
        } catch (err) {
          console.error(`Error fixing record ${rowIndex}:`, err);
          errors++;
        }
      }

      const report = {
        ranAt: format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
        fixed,
        skippedNoHistory,
        skippedNoColumns,
        errors,
        vehiclesAffected: vehicleSet.size,
      };
      setAutoFixReport(report);

      toast({
        title: isAuto ? 'Auto-correção concluída' : 'Correção concluída',
        description: `${fixed} corrigidos${vehicleSet.size ? ` (${vehicleSet.size} veículos)` : ''}${skippedNoHistory ? `, ${skippedNoHistory} sem histórico` : ''}${errors ? `, ${errors} erros` : ''}.`,
      });

      await refetch();
    } finally {
      setIsFixingZeroed(false);
    }
  }, [COLUMN_CANDIDATES, data.rows, refetch, toast, update]);

  const handleFixZeroed = useCallback(async () => {
    return runFixZeroed({ auto: false });
  }, [runFixZeroed]);

  // Auto-run once per day when data is available (after runFixZeroed is declared)
  useEffect(() => {
    if (!autoFixEnabled) return;
    if (connectionStatus !== 'connected') return;
    if (isFixingZeroed) return;
    if (!data.rows.length) return;

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const storageKey = `abastech:horimetros:autoFix:${todayKey}`;
    const alreadyRan = localStorage.getItem(storageKey) === '1';
    if (alreadyRan) return;

    localStorage.setItem(storageKey, '1');
    runFixZeroed({ auto: true });
  }, [autoFixEnabled, connectionStatus, data.rows.length, isFixingZeroed, runFixZeroed]);

  const pendingEquipments = useMemo(() => {
    return [
      { codigo: 'CM-122', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-133', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.1', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.10', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.2', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.3', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.4', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.5', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.8', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-24.3', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-24.4', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-24.5', descricao: 'Caminhão Basculante' },
      { codigo: 'CQ-20.1', descricao: 'Carregadeira' },
      { codigo: 'EC-21.2', descricao: 'Escavadeira Hidráulica' },
      { codigo: 'EC-21.3', descricao: 'Escavadeira Hidráulica' },
      { codigo: 'EC-21.4', descricao: 'Escavadeira Hidráulica' },
    ];
  }, []);

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Horímetros', 14, 22);
    
    doc.setFontSize(10);
    const dateRange = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    doc.text(`Período: ${dateRange}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    doc.setFontSize(12);
    doc.text('Resumo:', 14, 46);
    doc.setFontSize(10);
    doc.text(`Horas Totais: ${metrics.horasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`, 14, 54);
    doc.text(`Média por Registro: ${metrics.mediaRegistro.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`, 14, 60);
    doc.text(`Total de Registros: ${metrics.registros}`, 14, 66);
    doc.text(`Zerados: ${metrics.zerados}`, 14, 72);

    const tableData = filteredRows.slice(0, 100).map(row => [
      getRowValue(row as any, ['VEICULO', 'EQUIPAMENTO', 'Veiculo', 'Equipamento']),
      getRowValue(row as any, ['DATA', 'Data']),
      getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'KM']),
      getRowValue(row as any, ['OPERADOR', 'Operador', 'MOTORISTA', 'Motorista'])
    ]);

    autoTable(doc, {
      head: [['Veículo', 'Data', 'Horas/KM', 'Operador']],
      body: tableData,
      startY: 82,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`horimetros_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Horímetros</h1>
              <p className="text-muted-foreground">Controle de horas trabalhadas dos equipamentos</p>
            </div>
            {/* Connection Status */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium",
              connectionStatus === 'connected' && "bg-emerald-500/10 text-emerald-500",
              connectionStatus === 'error' && "bg-red-500/10 text-red-500",
              connectionStatus === 'checking' && "bg-amber-500/10 text-amber-500"
            )}>
              {connectionStatus === 'connected' && <Wifi className="w-3 h-3" />}
              {connectionStatus === 'error' && <WifiOff className="w-3 h-3" />}
              {connectionStatus === 'checking' && <RefreshCw className="w-3 h-3 animate-spin" />}
              {connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'error' ? 'Desconectado' : 'Verificando...'}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testConnection} 
              disabled={isTesting}
            >
              <Database className={cn("w-4 h-4 mr-2", isTesting && "animate-pulse")} />
              Testar Conexão
            </Button>
            <Button variant="outline" size="sm" onClick={syncData} disabled={loading || isTesting}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Sincronizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-primary border-primary"
              onClick={handleFixZeroed}
              disabled={isFixingZeroed}
            >
              {isFixingZeroed ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4 mr-2" />
              )}
              Corrigir Zerados
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runFixZeroed({ auto: true })}
              disabled={isFixingZeroed || !autoFixEnabled}
            >
              <Wrench className="w-4 h-4 mr-2" />
              Corrigir Zerados (Auto)
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <FileText className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setShowNewModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo
            </Button>
          </div>
        </div>

        {/* Auto-fix Report */}
        {autoFixReport && (
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">Relatório — Correção automática</p>
                <p className="text-sm text-muted-foreground">Executado em: {autoFixReport.ranAt}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAutoFixReport(null)}>
                <X className="w-4 h-4 mr-1" />
                Fechar
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              <div className="bg-muted/30 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Corrigidos</div>
                <div className="text-lg font-bold text-primary">{autoFixReport.fixed}</div>
              </div>
              <div className="bg-muted/30 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Veículos</div>
                <div className="text-lg font-bold">{autoFixReport.vehiclesAffected}</div>
              </div>
              <div className="bg-muted/30 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Sem histórico</div>
                <div className="text-lg font-bold text-amber-500">{autoFixReport.skippedNoHistory}</div>
              </div>
              <div className="bg-muted/30 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Sem colunas</div>
                <div className="text-lg font-bold text-amber-500">{autoFixReport.skippedNoColumns}</div>
              </div>
              <div className="bg-muted/30 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Erros</div>
                <div className="text-lg font-bold text-red-500">{autoFixReport.errors}</div>
              </div>
            </div>
          </div>
        )}

        {/* Warning Banner */}
        {zeroedRecords.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="font-semibold text-warning">Horímetros Zerados Detectados</p>
                <p className="text-sm text-muted-foreground">
                  Existem <span className="font-medium text-primary">{zeroedRecords.length}</span> registros com valores zerados que precisam de correção.
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="text-primary border-primary"
              onClick={handleFixZeroed}
              disabled={isFixingZeroed}
            >
              {isFixingZeroed ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4 mr-2" />
              )}
              Corrigir Zerados ({zeroedRecords.length})
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('resumo')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'resumo'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Resumo por Veículo
          </button>
          <button
            onClick={() => setActiveTab('detalhes')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'detalhes'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Detalhamento
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar veículo, operador, obra..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 px-3 py-1 rounded-md border border-input bg-background text-sm"
            >
              <option value="all">Todas Categorias</option>
              <option value="Equipamento">Equipamento</option>
              <option value="Veículo">Veículo</option>
              {categories.filter(c => c !== 'Equipamento' && c !== 'Veículo').map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Data início'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setQuickFilter(null);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              
              <span className="text-sm text-muted-foreground">até</span>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Data fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setQuickFilter(null);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={quickFilter === 'hoje' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('hoje')}
              >
                Hoje
              </Button>
              <Button
                variant={quickFilter === 'semana' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('semana')}
              >
                7 dias
              </Button>
              <Button
                variant={quickFilter === 'mes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('mes')}
              >
                Mês
              </Button>
              <Button
                variant={quickFilter === 'todos' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('todos')}
              >
                Todos
              </Button>
            </div>

            {(startDate || endDate || categoryFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { clearDateFilter(); setCategoryFilter('all'); }}>
                <X className="w-4 h-4 mr-1" />
                Limpar Filtros
              </Button>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Período:</span>
              <span className="font-medium">
                {startDate && endDate 
                  ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
                  : 'Todo período'}
              </span>
            </div>
            {categoryFilter !== 'all' && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Categoria:</span>
                <span className="font-medium text-primary">{categoryFilter}</span>
              </div>
            )}
            <span className="text-muted-foreground">• {filteredRows.length} registros • {vehicleSummary.length} veículos</span>
          </div>
        </div>

        {/* Resumo Tab - Vehicle Summary Table */}
        {activeTab === 'resumo' && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Resumo por Veículo</h2>
              <p className="text-sm text-muted-foreground">Consolidação de horímetros/km por veículo com total do mês</p>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Veículo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Hor/KM Anterior</TableHead>
                    <TableHead className="text-right">Hor/KM Atual</TableHead>
                    <TableHead className="text-right">Intervalo (h/km)</TableHead>
                    <TableHead className="text-right">Total no Mês</TableHead>
                    <TableHead className="text-center">Registros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                        Carregando dados...
                      </TableCell>
                    </TableRow>
                  ) : vehicleSummary.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum veículo encontrado para o período
                      </TableCell>
                    </TableRow>
                  ) : (
                    vehicleSummary.map((item, idx) => {
                      // Determine unit based on category: "Veículo" = km, "Equipamento" = h
                      const categoriaLower = (item.categoria || '').toLowerCase();
                      const isVeiculo = categoriaLower.includes('veículo') || categoriaLower.includes('veiculo') || 
                                       categoriaLower === 'veículo' || categoriaLower === 'veiculo';
                      const usesKm = isVeiculo || item.usaKm;
                      
                      const anterior = usesKm ? item.kmAnterior : item.horAnterior;
                      const atual = usesKm ? item.kmAtual : item.horAtual;
                      const intervalo = usesKm ? item.intervaloKm : item.intervaloHor;
                      const totalMes = usesKm ? item.totalMesKm : item.totalMesHor;
                      const unidade = usesKm ? 'km' : 'h';
                      
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{item.veiculo}</TableCell>
                          <TableCell className="text-muted-foreground">{item.descricao || item.categoria || '-'}</TableCell>
                          <TableCell className="text-right">
                            {anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '-'} {anterior > 0 ? unidade : ''}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '-'} {atual > 0 ? unidade : ''}
                          </TableCell>
                          <TableCell className={cn("text-right", intervalo > 0 ? "text-emerald-500" : "text-muted-foreground")}>
                            {intervalo > 0 ? `+${intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} ${unidade}` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary font-semibold">
                              {totalMes > 0 ? totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '0'} {unidade}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">{item.registros}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Totals Footer */}
            {vehicleSummary.length > 0 && (
              <div className="p-4 border-t border-border bg-muted/30">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total de veículos: {vehicleSummary.length}</span>
                  <div className="flex gap-6 text-sm">
                    <span>
                      <span className="text-muted-foreground">Total Horas no Mês: </span>
                      <span className="font-semibold text-primary">
                        {vehicleSummary.reduce((sum, v) => sum + v.totalMesHor, 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h
                      </span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Total KM no Mês: </span>
                      <span className="font-semibold text-primary">
                        {vehicleSummary.reduce((sum, v) => sum + v.totalMesKm, 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} km
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Detalhes Tab - Individual Records */}
        {activeTab === 'detalhes' && (
          <>
            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <MetricCard
                title="HORAS TOTAIS"
                value={`${metrics.horasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`}
                subtitle="No período"
                variant="primary"
                icon={Clock}
              />
              <MetricCard
                title="MÉDIA POR REGISTRO"
                value={`${metrics.mediaRegistro.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`}
                subtitle="No período"
                icon={Timer}
              />
              <MetricCard
                title="REGISTROS"
                value={metrics.registros.toString()}
                subtitle="No período"
                icon={CheckCircle}
              />
              <MetricCard
                title="FALTAM CADASTRAR"
                value={Math.max(0, metrics.faltamCadastrar).toString()}
                subtitle="Pendentes"
                variant="primary"
                icon={Clock}
              />
              <MetricCard
                title="INCONSISTÊNCIAS"
                value={metrics.inconsistentes.toString()}
                subtitle="Valores negativos"
                icon={AlertTriangle}
              />
            </div>

            {/* Data Table */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold">Registros de Horímetros</h2>
                <p className="text-sm text-muted-foreground">Dados do período selecionado</p>
              </div>
              
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Veículo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Horas/KM</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                        Carregando dados...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum registro encontrado para o período
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.slice(0, 50).map((row, idx) => {
                      const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'Hor_Atual', 'KM', 'Km_Atual']));
                      const isZeroed = horas === 0;
                      
                      return (
                        <TableRow key={idx} className={isZeroed ? 'bg-warning/5' : ''}>
                          <TableCell className="font-medium">
                            {getRowValue(row as any, ['VEICULO', 'EQUIPAMENTO', 'Veiculo', 'Equipamento'])}
                          </TableCell>
                          <TableCell>{getRowValue(row as any, ['DATA', 'Data'])}</TableCell>
                          <TableCell className={cn("text-right", isZeroed && "text-warning")}>
                            {horas.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                          </TableCell>
                          <TableCell>{getRowValue(row as any, ['OPERADOR', 'Operador', 'MOTORISTA', 'Motorista'])}</TableCell>
                          <TableCell>
                            {isZeroed ? (
                              <span className="inline-flex items-center gap-1 text-xs text-warning">
                                <AlertTriangle className="w-3 h-3" />
                                Zerado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-success">
                                <CheckCircle className="w-3 h-3" />
                                OK
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pending Equipments */}
            <div>
              <h2 className="text-lg font-semibold mb-2">Horímetros Pendentes ({pendingEquipments.length})</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {pendingEquipments.map(equip => (
                  <div 
                    key={equip.codigo} 
                    className="bg-card rounded-lg border border-border p-3 text-center hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setSelectedPendingVehicle(equip.codigo);
                      setShowNewModal(true);
                    }}
                  >
                    <div className="font-semibold text-primary">{equip.codigo}</div>
                    <div className="text-xs text-muted-foreground truncate">{equip.descricao}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* New Horimeter Modal */}
      <HorimeterModal 
        open={showNewModal} 
        onOpenChange={(open) => {
          setShowNewModal(open);
          if (!open) setSelectedPendingVehicle(undefined);
        }}
        onSuccess={() => refetch()}
        initialVehicle={selectedPendingVehicle}
      />
    </div>
  );
}
