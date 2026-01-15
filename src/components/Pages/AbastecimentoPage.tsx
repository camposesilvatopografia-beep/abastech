import { useState, useMemo, useCallback } from 'react';
import { 
  Fuel, 
  RefreshCw, 
  Printer, 
  FileText, 
  Wifi, 
  Database,
  Search,
  Calendar,
  X,
  BarChart3,
  List,
  Droplet,
  ArrowDownUp,
  FileSpreadsheet,
  MapPin,
  Filter,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Download,
  Building2,
  Eye,
  Image,
  Truck,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { AdminFuelRecordModal } from '@/components/Dashboard/AdminFuelRecordModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useSheetData } from '@/hooks/useGoogleSheets';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SHEET_NAME = 'AbastecimentoCanteiro01';
const GERAL_SHEET = 'GERAL';
const SANEAMENTO_STOCK_SHEET = 'estoqueobrasaneamento';

const TABS = [
  { id: 'resumo', label: 'Resumo', icon: BarChart3 },
  { id: 'detalhamento', label: 'Detalhamento', icon: List },
  { id: 'saneamento', label: 'Saneamento', icon: Droplet },
  { id: 'entradas', label: 'Entradas', icon: ArrowDownUp },
  { id: 'relatorios', label: 'Relatórios', icon: FileSpreadsheet },
];

const PERIOD_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: '30dias', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'personalizado', label: 'Personalizado' },
];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Try DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const date = new Date(year, month, day);
    if (isValid(date)) return date;
  }
  
  // Try other formats
  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

export function AbastecimentoPage() {
  const { user } = useAuth();
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const { data: geralData } = useSheetData(GERAL_SHEET);
  const { data: saneamentoStockData } = useSheetData(SANEAMENTO_STOCK_SHEET);
  // Fetch stock data for comboios
  const { data: estoqueComboio01Data } = useSheetData('EstoqueComboio01');
  const { data: estoqueComboio02Data } = useSheetData('EstoqueComboio02');
  const { data: estoqueComboio03Data } = useSheetData('EstoqueComboio03');
  const { data: estoqueTanque01Data } = useSheetData('EstoqueTanque01');
  const { data: estoqueTanque02Data } = useSheetData('EstoqueTanque02');
  
  const [activeTab, setActiveTab] = useState('resumo');
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [combustivelFilter, setCombustivelFilter] = useState('all');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('hoje');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [isExporting, setIsExporting] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showAdminRecordModal, setShowAdminRecordModal] = useState(false);

  // Check if user can create records (admin or samarakelle)
  const canCreateRecords = useMemo(() => {
    if (!user) return false;
    const username = user.username?.toLowerCase() || '';
    return username === 'jeanallbuquerque@gmail.com' || 
           username === 'samarakelle' || 
           user.role === 'admin';
  }, [user]);

  // Get saneamento stock from estoqueobrasaneamento sheet (column H)
  const estoqueSaneamento = useMemo(() => {
    if (!saneamentoStockData.rows.length) return 0;
    const lastRow = saneamentoStockData.rows[saneamentoStockData.rows.length - 1];
    // Column H is typically index 7 (0-based), or look for specific column name
    const headers = saneamentoStockData.headers;
    const colHIndex = headers.length > 7 ? headers[7] : null;
    const estoqueValue = colHIndex ? lastRow?.[colHIndex] : lastRow?.['EstoqueAtual'] || lastRow?.['Estoque'] || 0;
    return parseNumber(estoqueValue);
  }, [saneamentoStockData.rows, saneamentoStockData.headers]);

  // Get date range based on period filter
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    
    switch (periodFilter) {
      case 'hoje':
        return { start: today, end: endOfDay(today) };
      case 'ontem':
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: endOfDay(yesterday) };
      case '7dias':
        return { start: subDays(today, 7), end: endOfDay(today) };
      case '30dias':
        return { start: subDays(today, 30), end: endOfDay(today) };
      case 'mes':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'personalizado':
        return { 
          start: startDate ? startOfDay(startDate) : subDays(today, 30), 
          end: endDate ? endOfDay(endDate) : endOfDay(today) 
        };
      default:
        return { start: today, end: endOfDay(today) };
    }
  }, [periodFilter, startDate, endDate]);

  // Filter rows by date and other filters
  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const rowDate = parseDate(String(row['DATA'] || ''));
      
      // Date filter
      if (rowDate) {
        if (!isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
          return false;
        }
      }
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matches = Object.values(row).some(v => 
          String(v).toLowerCase().includes(searchLower)
        );
        if (!matches) return false;
      }
      
      // Local filter
      if (localFilter !== 'all' && row['LOCAL'] !== localFilter) return false;
      
      // Tipo filter
      if (tipoFilter !== 'all' && row['TIPO'] !== tipoFilter) return false;
      
      // Combustivel filter
      if (combustivelFilter !== 'all' && row['TIPO DE COMBUSTIVEL'] !== combustivelFilter) return false;
      
      // Empresa filter
      if (empresaFilter !== 'all') {
        const empresa = String(row['EMPRESA'] || row['Empresa'] || '').trim();
        if (empresa !== empresaFilter) return false;
      }
      
      return true;
    });
  }, [data.rows, dateRange, search, localFilter, tipoFilter, combustivelFilter, empresaFilter]);

  // Calculate metrics from GERAL sheet based on date filter
  // IMPORTANT: Estoque Atual should be CALCULATED using the formula:
  // (Estoque Anterior + Entrada) - (Saída Comboios + Saída Equipamentos)
  const metricsFromGeral = useMemo(() => {
    if (!geralData.rows.length) {
      return {
        estoqueAnterior: 0,
        entrada: 0,
        saidaComboios: 0,
        saidaEquipamentos: 0,
        estoqueAtual: 0
      };
    }
    
    // For single day filter, find the exact date row
    const isSingleDay = periodFilter === 'hoje' || periodFilter === 'ontem' || 
      (periodFilter === 'personalizado' && startDate && endDate && 
        format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd'));
    
    if (isSingleDay) {
      const targetDate = periodFilter === 'ontem' 
        ? format(subDays(new Date(), 1), 'dd/MM/yyyy')
        : startDate 
          ? format(startDate, 'dd/MM/yyyy')
          : format(new Date(), 'dd/MM/yyyy');
      
      const matchingRow = geralData.rows.find(row => {
        const rowDate = String(row['Data'] || row['DATA'] || '').trim();
        return rowDate === targetDate;
      });
      
      if (matchingRow) {
        const estoqueAnterior = parseNumber(matchingRow['Estoque Anterior'] || matchingRow['ESTOQUE ANTERIOR'] || 0);
        const entrada = parseNumber(matchingRow['Entrada'] || matchingRow['ENTRADA'] || 0);
        const saidaComboios = parseNumber(matchingRow['Saida para Comboios'] || matchingRow['SAIDA PARA COMBOIOS'] || 0);
        const saidaEquipamentos = parseNumber(matchingRow['Saida para Equipamentos'] || matchingRow['SAIDA PARA EQUIPAMENTOS'] || 0);
        
        // CALCULATE Estoque Atual using the formula: (Anterior + Entrada) - Saídas
        const estoqueCalculado = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
        
        return {
          estoqueAnterior,
          entrada,
          saidaComboios,
          saidaEquipamentos,
          estoqueAtual: estoqueCalculado
        };
      }
    }
    
    // For period filters, sum values for all matching dates
    let totalEntrada = 0;
    let totalSaidaComboios = 0;
    let totalSaidaEquipamentos = 0;
    let firstEstoqueAnterior = 0;
    let foundFirst = false;
    
    geralData.rows.forEach(row => {
      const rowDateStr = String(row['Data'] || row['DATA'] || '').trim();
      const rowDate = parseDate(rowDateStr);
      
      if (rowDate && isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
        if (!foundFirst) {
          firstEstoqueAnterior = parseNumber(row['Estoque Anterior'] || row['ESTOQUE ANTERIOR'] || 0);
          foundFirst = true;
        }
        
        totalEntrada += parseNumber(row['Entrada'] || row['ENTRADA'] || 0);
        totalSaidaComboios += parseNumber(row['Saida para Comboios'] || row['SAIDA PARA COMBOIOS'] || 0);
        totalSaidaEquipamentos += parseNumber(row['Saida para Equipamentos'] || row['SAIDA PARA EQUIPAMENTOS'] || 0);
      }
    });
    
    // CALCULATE Estoque Atual using the formula: (Anterior + Entrada) - Saídas
    const estoqueCalculado = (firstEstoqueAnterior + totalEntrada) - (totalSaidaComboios + totalSaidaEquipamentos);
    
    return {
      estoqueAnterior: firstEstoqueAnterior,
      entrada: totalEntrada,
      saidaComboios: totalSaidaComboios,
      saidaEquipamentos: totalSaidaEquipamentos,
      estoqueAtual: estoqueCalculado
    };
  }, [geralData.rows, periodFilter, startDate, endDate, dateRange]);

  // Validate stock: calculate expected vs actual from spreadsheet
  const stockValidation = useMemo(() => {
    const { estoqueAnterior, entrada, saidaComboios, saidaEquipamentos, estoqueAtual } = metricsFromGeral;
    
    // Expected = (Estoque Anterior + Entrada) - (Saída Comboios + Saída Equipamentos)
    const estoqueCalculado = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
    const divergencia = estoqueAtual - estoqueCalculado;
    const hasDivergence = Math.abs(divergencia) > 0.01; // Tolerance for floating point
    
    return {
      estoqueCalculado,
      estoqueAtualPlanilha: estoqueAtual,
      divergencia,
      hasDivergence,
      percentDivergence: estoqueCalculado > 0 ? (divergencia / estoqueCalculado) * 100 : 0
    };
  }, [metricsFromGeral]);

  // Calculate additional metrics from filtered rows (registros, arla, valor)
  const additionalMetrics = useMemo(() => {
    let totalArla = 0;
    let totalValor = 0;
    let registros = filteredRows.length;

    filteredRows.forEach(row => {
      const arla = parseNumber(row['QUANTIDADE DE ARLA']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      totalArla += arla;
      totalValor += valor;
    });

    return {
      registros,
      totalArla,
      totalValor
    };
  }, [filteredRows]);

  // Get unique values for filters
  const locais = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const local = String(row['LOCAL'] || '').trim();
      if (local) unique.add(local);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const tipos = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const tipo = String(row['TIPO'] || '').trim();
      if (tipo) unique.add(tipo);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const combustiveis = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const comb = String(row['TIPO DE COMBUSTIVEL'] || '').trim();
      if (comb) unique.add(comb);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  // Get unique empresas
  const empresas = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const empresa = String(row['EMPRESA'] || row['Empresa'] || '').trim();
      if (empresa) unique.add(empresa);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  // Summary by location with detailed records
  const resumoPorLocal = useMemo(() => {
    const summary: Record<string, { abastecimentos: number; diesel: number; arla: number; valor: number }> = {};
    
    // Detailed records per location
    const recordsByLocal: Record<string, Array<{
      data: string;
      codigo: string;
      veiculo: string;
      descricao: string;
      motorista: string;
      quantidade: number;
      categoria: string;
      empresa: string;
      horAnterior: number;
      horAtual: number;
      kmAnterior: number;
      kmAtual: number;
    }>> = {};
    
    filteredRows.forEach(row => {
      const local = String(row['LOCAL'] || 'Não informado').trim() || 'Não informado';
      const quantidade = parseNumber(row['QUANTIDADE']);
      const arlaQtd = parseNumber(row['QUANTIDADE DE ARLA']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      if (!summary[local]) {
        summary[local] = { abastecimentos: 0, diesel: 0, arla: 0, valor: 0 };
        recordsByLocal[local] = [];
      }
      
      summary[local].abastecimentos++;
      summary[local].diesel += quantidade;
      summary[local].arla += arlaQtd;
      summary[local].valor += valor;

      // Add detailed record with anterior/atual values - use exact column names from sheet
      recordsByLocal[local].push({
        data: String(row['DATA'] || ''),
        codigo: String(row['VEICULO'] || row['Veiculo'] || row['CODIGO'] || ''),
        veiculo: String(row['VEICULO'] || row['Veiculo'] || ''),
        descricao: String(row['DESCRICAO'] || row['DESCRIÇÃO'] || row['Descricao'] || row['TIPO'] || ''),
        motorista: String(row['MOTORISTA'] || row['Motorista'] || row['OPERADOR'] || row['Operador'] || ''),
        quantidade,
        categoria: String(row['CATEGORIA'] || row['Categoria'] || row['TIPO'] || ''),
        empresa: String(row['EMPRESA'] || row['Empresa'] || row['COMPANY'] || ''),
        horAnterior: parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || row['HORIMETRO_ANTERIOR'] || 0),
        horAtual: parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || row['HORIMETRO'] || row['Horimetro'] || 0),
        kmAnterior: parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0),
        kmAtual: parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || row['KM'] || row['Km'] || 0),
      });
    });

    const entries = Object.entries(summary).sort((a, b) => b[1].diesel - a[1].diesel);
    const total = entries.reduce((acc, [, v]) => ({
      abastecimentos: acc.abastecimentos + v.abastecimentos,
      diesel: acc.diesel + v.diesel,
      arla: acc.arla + v.arla,
      valor: acc.valor + v.valor
    }), { abastecimentos: 0, diesel: 0, arla: 0, valor: 0 });

    return { entries, total, recordsByLocal };
  }, [filteredRows]);
  
  // Group data by company for the company report
  const resumoPorEmpresa = useMemo(() => {
    const empresaMap: Record<string, {
      categorias: Record<string, Array<{
        codigo: string;
        descricao: string;
        motorista: string;
        quantidade: number;
        horAnterior: number;
        horAtual: number;
        kmAnterior: number;
        kmAtual: number;
      }>>;
      totalDiesel: number;
    }> = {};
    
    // Collect all records and group by company then category
    Object.values(resumoPorLocal.recordsByLocal).flat().forEach(record => {
      const empresa = record.empresa || 'Não informado';
      const categoria = record.categoria || 'Outros';
      
      if (!empresaMap[empresa]) {
        empresaMap[empresa] = { categorias: {}, totalDiesel: 0 };
      }
      
      if (!empresaMap[empresa].categorias[categoria]) {
        empresaMap[empresa].categorias[categoria] = [];
      }
      
      empresaMap[empresa].categorias[categoria].push({
        codigo: record.codigo,
        descricao: record.descricao,
        motorista: record.motorista,
        quantidade: record.quantidade,
        horAnterior: record.horAnterior,
        horAtual: record.horAtual,
        kmAnterior: record.kmAnterior,
        kmAtual: record.kmAtual,
      });
      
      empresaMap[empresa].totalDiesel += record.quantidade;
    });
    
    return empresaMap;
  }, [resumoPorLocal.recordsByLocal]);

  // Calculate average consumption per vehicle (based on horimetro or km difference)
  const consumoMedioVeiculo = useMemo(() => {
    const veiculoMap = new Map<string, { 
      totalLitros: number; 
      totalHorasTrabalhadas: number; 
      totalKmRodados: number; 
      usaKm: boolean;
      registros: number;
    }>();
    
    filteredRows.forEach(row => {
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      
      // Get horimeter/km ANTERIOR and ATUAL values
      const horAnterior = parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || row['HORIMETRO_ANTERIOR'] || 0);
      const horAtual = parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || row['HORIMETRO'] || row['Horimetro'] || 0);
      const kmAnterior = parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0);
      const kmAtual = parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || row['KM'] || row['Km'] || 0);
      
      const categoria = String(row['CATEGORIA'] || row['Categoria'] || '').toLowerCase();
      
      if (!veiculo || quantidade <= 0) return;
      
      // Calculate differences
      const horasTrabalhadas = horAtual > horAnterior ? horAtual - horAnterior : 0;
      const kmRodados = kmAtual > kmAnterior ? kmAtual - kmAnterior : 0;
      
      const existing = veiculoMap.get(veiculo) || { 
        totalLitros: 0, 
        totalHorasTrabalhadas: 0, 
        totalKmRodados: 0, 
        usaKm: false,
        registros: 0
      };
      
      const usaKm = categoria.includes('veículo') || categoria.includes('veiculo') || 
                    categoria.includes('caminhao') || categoria.includes('caminhão') || 
                    kmRodados > 0;
      
      veiculoMap.set(veiculo, {
        totalLitros: existing.totalLitros + quantidade,
        totalHorasTrabalhadas: existing.totalHorasTrabalhadas + horasTrabalhadas,
        totalKmRodados: existing.totalKmRodados + kmRodados,
        usaKm: existing.usaKm || usaKm,
        registros: existing.registros + 1
      });
    });
    
    return veiculoMap;
  }, [filteredRows]);

  // Saneamento data - filter for "Obra Saneamento"
  const saneamentoFilteredData = useMemo(() => {
    return data.rows.filter(row => {
      const obra = String(row['OBRA'] || row['Obra'] || '').toLowerCase();
      return obra.includes('saneamento');
    });
  }, [data.rows]);

  // Saneamento summary by vehicle
  const saneamentoSummary = useMemo(() => {
    const summary: Record<string, { abastecimentos: number; diesel: number; arla: number }> = {};
    
    saneamentoFilteredData.forEach(row => {
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || 'Não informado').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      const arlaQtd = parseNumber(row['QUANTIDADE DE ARLA']);
      
      if (!summary[veiculo]) {
        summary[veiculo] = { abastecimentos: 0, diesel: 0, arla: 0 };
      }
      
      summary[veiculo].abastecimentos++;
      summary[veiculo].diesel += quantidade;
      summary[veiculo].arla += arlaQtd;
    });

    const entries = Object.entries(summary).sort((a, b) => b[1].diesel - a[1].diesel);
    const total = entries.reduce((acc, [, v]) => ({
      abastecimentos: acc.abastecimentos + v.abastecimentos,
      diesel: acc.diesel + v.diesel,
      arla: acc.arla + v.arla
    }), { abastecimentos: 0, diesel: 0, arla: 0 });

    return { entries, total };
  }, [saneamentoFilteredData]);

  // Entries data - filter by supplier entries and group by location (Tanque 01, Tanque 02)
  const entradasData = useMemo(() => {
    const entries = data.rows.filter(row => {
      const tipo = String(row['TIPO'] || '').toLowerCase();
      const fornecedor = String(row['FORNECEDOR'] || '').trim();
      return (tipo.includes('entrada') || tipo.includes('recebimento') || tipo.includes('compra') || fornecedor);
    });

    // Group by entry location (Tanque)
    const byLocation: Record<string, { registros: any[]; total: number }> = {};
    
    entries.forEach(row => {
      const local = String(row['LOCAL'] || row['TANQUE'] || 'Não informado').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      
      if (!byLocation[local]) {
        byLocation[local] = { registros: [], total: 0 };
      }
      byLocation[local].registros.push(row);
      byLocation[local].total += quantidade;
    });

    return { entries, byLocation };
  }, [data.rows]);

  // Summary of supplier entries
  const entradasPorFornecedor = useMemo(() => {
    const summary: Record<string, { quantidade: number; valor: number; registros: number }> = {};
    
    entradasData.entries.forEach(row => {
      const fornecedor = String(row['FORNECEDOR'] || 'Não informado').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      if (!summary[fornecedor]) {
        summary[fornecedor] = { quantidade: 0, valor: 0, registros: 0 };
      }
      
      summary[fornecedor].quantidade += quantidade;
      summary[fornecedor].valor += valor;
      summary[fornecedor].registros++;
    });

    return Object.entries(summary).sort((a, b) => b[1].quantidade - a[1].quantidade);
  }, [entradasData.entries]);

  // Clear period filter
  const clearPeriod = useCallback(() => {
    setPeriodFilter('hoje');
    setStartDate(new Date());
    setEndDate(new Date());
  }, []);

  // Export detailed PDF with filters - grouped by location (Tanques)
  const exportDetailedPDF = useCallback(() => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      let currentY = 15;
      
      // Iterate through each location (Tanque 01, Tanque 02, etc.)
      const locations = Object.keys(resumoPorLocal.recordsByLocal).sort();
      
      locations.forEach((local, locationIndex) => {
        const records = resumoPorLocal.recordsByLocal[local];
        if (!records || records.length === 0) return;
        
        // Add new page for each location after the first
        if (locationIndex > 0) {
          doc.addPage();
          currentY = 15;
        }
        
        // Title for this location with date range
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(local, pageWidth / 2, currentY, { align: 'center' });
        currentY += 6;
        
        // Date range subtitle
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const dateRangeText = `Período: ${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`;
        doc.text(dateRangeText, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;
        
        // Prepare table data with consumption calculation
        let totalDiesel = 0;
        let totalConsumo = 0;
        let countConsumo = 0;
        
        const tableData = records.map((record, index) => {
          // Determine if using km or hours based on data
          const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
          const anterior = usaKm ? record.kmAnterior : record.horAnterior;
          const atual = usaKm ? record.kmAtual : record.horAtual;
          const intervalo = atual - anterior;
          
          // Calculate consumption (km/l or l/h)
          let consumo = 0;
          if (record.quantidade > 0 && intervalo > 0) {
            if (usaKm) {
              // km/l = intervalo / quantidade
              consumo = intervalo / record.quantidade;
            } else {
              // l/h = quantidade / intervalo
              consumo = record.quantidade / intervalo;
            }
            totalConsumo += consumo;
            countConsumo++;
          }
          
          totalDiesel += record.quantidade;
          
          return [
            (index + 1).toString() + '.',
            record.codigo,
            record.descricao,
            record.motorista,
            anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
            record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
          ];
        });
        
        // Add totals row
        const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
        tableData.push([
          '',
          '',
          '',
          'TOTAL',
          '',
          '',
          '',
          mediaConsumo > 0 ? `Média: ${mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
          totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
        ]);
        
        autoTable(doc, {
          startY: currentY,
          head: [[
            '', 
            'Código', 
            'Descrição', 
            'Motorista/Operador', 
            'Hor/Km\nAnterior', 
            'Hor/Km\nAtual', 
            'Intervalo\n(h/km)', 
            'Consumo', 
            'Qtd Diesel'
          ]],
          body: tableData,
          styles: { 
            fontSize: 8,
            cellPadding: 2,
          },
          headStyles: { 
            fillColor: [200, 200, 200],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 25 },
            2: { cellWidth: 45 },
            3: { cellWidth: 45 },
            4: { cellWidth: 25, halign: 'right' },
            5: { cellWidth: 28, halign: 'right' },
            6: { cellWidth: 28, halign: 'right' },
            7: { cellWidth: 22, halign: 'right' },
            8: { cellWidth: 22, halign: 'right' },
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          didParseCell: (data) => {
            // Style the totals row (last row)
            if (data.row.index === tableData.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [230, 230, 230];
            }
          },
          theme: 'grid',
        });
      });
      
      doc.save(`relatorio_abastecimento_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [resumoPorLocal, dateRange]);

  // Export to PDF (simple) - same format as detailed, grouped by location
  const exportPDF = useCallback(() => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      let currentY = 15;
      
      // Iterate through each location (Tanque 01, Tanque 02, etc.)
      const locations = Object.keys(resumoPorLocal.recordsByLocal).sort();
      
      locations.forEach((local, locationIndex) => {
        const records = resumoPorLocal.recordsByLocal[local];
        if (!records || records.length === 0) return;
        
        // Add new page for each location after the first
        if (locationIndex > 0) {
          doc.addPage();
          currentY = 15;
        }
        
        // Title for this location
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(local, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;
        
        // Prepare table data with consumption calculation
        let totalDiesel = 0;
        let totalConsumo = 0;
        let countConsumo = 0;
        
        const tableData = records.map((record, index) => {
          // Determine if using km or hours based on data
          const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
          const anterior = usaKm ? record.kmAnterior : record.horAnterior;
          const atual = usaKm ? record.kmAtual : record.horAtual;
          const intervalo = atual - anterior;
          
          // Calculate consumption (km/l or l/h)
          let consumo = 0;
          if (record.quantidade > 0 && intervalo > 0) {
            if (usaKm) {
              // km/l = intervalo / quantidade
              consumo = intervalo / record.quantidade;
            } else {
              // l/h = quantidade / intervalo
              consumo = record.quantidade / intervalo;
            }
            totalConsumo += consumo;
            countConsumo++;
          }
          
          totalDiesel += record.quantidade;
          
          return [
            (index + 1).toString() + '.',
            record.codigo,
            record.descricao,
            record.motorista,
            anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
            record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
          ];
        });
        
        // Add totals row
        const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
        tableData.push([
          '',
          '',
          '',
          'TOTAL',
          '',
          '',
          '',
          mediaConsumo > 0 ? `Média: ${mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
          totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
        ]);
        
        autoTable(doc, {
          startY: currentY,
          head: [[
            '', 
            'Código', 
            'Descrição', 
            'Motorista/Operador', 
            'Hor/Km\nAnterior', 
            'Hor/Km\nAtual', 
            'Intervalo\n(h/km)', 
            'Consumo', 
            'Qtd Diesel'
          ]],
          body: tableData,
          styles: { 
            fontSize: 8,
            cellPadding: 2,
          },
          headStyles: { 
            fillColor: [200, 200, 200],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
          },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 25 },
            2: { cellWidth: 45 },
            3: { cellWidth: 45 },
            4: { cellWidth: 25, halign: 'right' },
            5: { cellWidth: 28, halign: 'right' },
            6: { cellWidth: 28, halign: 'right' },
            7: { cellWidth: 22, halign: 'right' },
            8: { cellWidth: 22, halign: 'right' },
          },
          alternateRowStyles: {
            fillColor: [245, 245, 245]
          },
          didParseCell: (data) => {
            // Style the totals row (last row)
            if (data.row.index === tableData.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [230, 230, 230];
            }
          },
          theme: 'grid',
        });
      });
      
      doc.save(`relatorio_abastecimento_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [resumoPorLocal]);

  // Export PDF by Company (Empresa) - formatted like the reference image
  const exportPDFPorEmpresa = useCallback(() => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const empresas = Object.keys(resumoPorEmpresa).sort();
      
      empresas.forEach((empresa, empresaIndex) => {
        const empresaData = resumoPorEmpresa[empresa];
        if (!empresaData) return;
        
        // Add new page for each company after the first
        if (empresaIndex > 0) {
          doc.addPage();
        }
        
        let currentY = 20;
        
        // Header with company name and date
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(`Relatório Geral - ${empresa.toUpperCase()}`, pageWidth / 2, currentY, { align: 'center' });
        
        // Date range on the right
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const dateRangeText = `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`;
        doc.text(dateRangeText, pageWidth - 20, currentY, { align: 'right' });
        
        currentY += 15;
        
        // Iterate through each category (Equipamentos, Veículos, etc.)
        const categorias = Object.keys(empresaData.categorias).sort();
        
        categorias.forEach((categoria) => {
          const records = empresaData.categorias[categoria];
          if (!records || records.length === 0) return;
          
          // Check if we need a new page
          if (currentY > 180) {
            doc.addPage();
            currentY = 20;
          }
          
          // Category title (red underline style)
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(180, 0, 0);
          doc.text(categoria.charAt(0).toUpperCase() + categoria.slice(1), pageWidth / 2, currentY, { align: 'center' });
          doc.setTextColor(0, 0, 0);
          currentY += 6;
          
          // Prepare table data with consumption calculation
          let totalDiesel = 0;
          let totalConsumo = 0;
          let countConsumo = 0;
          
          const tableData = records.map((record, index) => {
            // Determine if using km or hours based on data
            const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
            const anterior = usaKm ? record.kmAnterior : record.horAnterior;
            const atual = usaKm ? record.kmAtual : record.horAtual;
            const intervalo = atual - anterior;
            
            // Calculate consumption (km/l or l/h)
            let consumo = 0;
            if (record.quantidade > 0 && intervalo > 0) {
              if (usaKm) {
                consumo = intervalo / record.quantidade;
              } else {
                consumo = record.quantidade / intervalo;
              }
              totalConsumo += consumo;
              countConsumo++;
            }
            
            totalDiesel += record.quantidade;
            
            return [
              (index + 1).toString() + '.',
              record.codigo,
              record.descricao.length > 20 ? record.descricao.substring(0, 17) + '...' : record.descricao,
              record.motorista,
              anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
              atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
              intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
              consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
              record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
            ];
          });
          
          // Add totals row
          const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
          tableData.push([
            '',
            '',
            '',
            'TOTAL',
            '',
            '',
            '',
            mediaConsumo > 0 ? `Média: ${mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
            totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
          ]);
          
          autoTable(doc, {
            startY: currentY,
            head: [[
              '', 
              'Veículo', 
              'Descrição', 
              'Motorista/Operador', 
              'Hor./Km.\nAnterior', 
              'Hor./Km.\nAtual', 
              'Intervalo\n(h/km)', 
              'Consumo', 
              'Qtd.\nDiesel'
            ]],
            body: tableData,
            styles: { 
              fontSize: 8,
              cellPadding: 2,
            },
            headStyles: { 
              fillColor: [180, 0, 0],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              halign: 'center',
              valign: 'middle',
            },
            columnStyles: {
              0: { cellWidth: 10, halign: 'center' },
              1: { cellWidth: 25 },
              2: { cellWidth: 40 },
              3: { cellWidth: 50 },
              4: { cellWidth: 25, halign: 'right' },
              5: { cellWidth: 25, halign: 'right' },
              6: { cellWidth: 22, halign: 'right' },
              7: { cellWidth: 22, halign: 'right' },
              8: { cellWidth: 18, halign: 'right' },
            },
            alternateRowStyles: {
              fillColor: [255, 255, 255]
            },
            theme: 'grid',
            didParseCell: (data) => {
              // Style the totals row (last row)
              if (data.row.index === tableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 230, 230];
              }
            },
            didDrawPage: (data) => {
              currentY = (data.cursor?.y || currentY) + 10;
            }
          });
          
          // Update currentY after table
          currentY = (doc as any).lastAutoTable?.finalY + 15 || currentY + 50;
        });
      });
      
      doc.save(`relatorio_por_empresa_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [resumoPorEmpresa, dateRange]);

  // Helper to get stock data for a location from its sheet
  const getStockDataFromSheet = useCallback((sheetData: { rows: any[] }, targetDate: string) => {
    if (!sheetData.rows.length) {
      return { estoqueAnterior: 0, entrada: 0, saidaComboios: 0, saidaEquipamentos: 0, total: 0, estoqueAtual: 0 };
    }
    
    // Find row matching target date
    const matchingRow = sheetData.rows.find(row => {
      const rowDate = String(row['Data'] || row['DATA'] || '').trim();
      return rowDate === targetDate;
    });
    
    if (matchingRow) {
      const estoqueAnterior = parseNumber(matchingRow['Estoque Anterior'] || matchingRow['ESTOQUE ANTERIOR'] || 0);
      const entrada = parseNumber(matchingRow['Entrada'] || matchingRow['ENTRADA'] || 0);
      const saidaComboios = parseNumber(matchingRow['Saida Comboios'] || matchingRow['SAIDA COMBOIOS'] || matchingRow['Saida para Comboios'] || 0);
      const saidaEquipamentos = parseNumber(matchingRow['Saida Equipamentos'] || matchingRow['SAIDA EQUIPAMENTOS'] || matchingRow['Saida para Equipamentos'] || 0);
      const total = saidaComboios + saidaEquipamentos;
      const estoqueAtual = parseNumber(matchingRow['Estoque Atual'] || matchingRow['ESTOQUE ATUAL'] || 0);
      
      return { estoqueAnterior, entrada, saidaComboios, saidaEquipamentos, total, estoqueAtual };
    }
    
    // If no exact date match, get last row
    const lastRow = sheetData.rows[sheetData.rows.length - 1];
    return {
      estoqueAnterior: parseNumber(lastRow['Estoque Anterior'] || lastRow['ESTOQUE ANTERIOR'] || 0),
      entrada: parseNumber(lastRow['Entrada'] || lastRow['ENTRADA'] || 0),
      saidaComboios: parseNumber(lastRow['Saida Comboios'] || lastRow['SAIDA COMBOIOS'] || 0),
      saidaEquipamentos: parseNumber(lastRow['Saida Equipamentos'] || lastRow['SAIDA EQUIPAMENTOS'] || 0),
      total: parseNumber(lastRow['Saida Comboios'] || 0) + parseNumber(lastRow['Saida Equipamentos'] || 0),
      estoqueAtual: parseNumber(lastRow['Estoque Atual'] || lastRow['ESTOQUE ATUAL'] || 0)
    };
  }, []);

  // Export General PDF with Summary (Resumo Geral) - Format like the reference image
  const exportPDFResumoGeral = useCallback(() => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const targetDate = format(new Date(), 'dd/MM/yyyy');
      
      let currentY = 20;
      
      // Title - Resumo Geral
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Resumo Geral', pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
      
      // Date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Data: ${targetDate}`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
      
      // Collect stock data for all locations
      const tanque01 = getStockDataFromSheet(estoqueTanque01Data, targetDate);
      const tanque02 = getStockDataFromSheet(estoqueTanque02Data, targetDate);
      const comboio01 = getStockDataFromSheet(estoqueComboio01Data, targetDate);
      const comboio02 = getStockDataFromSheet(estoqueComboio02Data, targetDate);
      const comboio03 = getStockDataFromSheet(estoqueComboio03Data, targetDate);
      
      // Summary table data
      const summaryData = [
        ['Tanque Canteiro 01', tanque01.estoqueAnterior, tanque01.entrada, tanque01.saidaComboios, tanque01.saidaEquipamentos, tanque01.total, tanque01.estoqueAtual],
        ['Tanque Canteiro 02', tanque02.estoqueAnterior, tanque02.entrada, tanque02.saidaComboios, tanque02.saidaEquipamentos, tanque02.total, tanque02.estoqueAtual],
        ['Comboio 01', comboio01.estoqueAnterior, comboio01.entrada, comboio01.saidaComboios, comboio01.saidaEquipamentos, comboio01.total, comboio01.estoqueAtual],
        ['Comboio 02', comboio02.estoqueAnterior, comboio02.entrada, comboio02.saidaComboios, comboio02.saidaEquipamentos, comboio02.total, comboio02.estoqueAtual],
        ['Comboio 03', comboio03.estoqueAnterior, comboio03.entrada, comboio03.saidaComboios, comboio03.saidaEquipamentos, comboio03.total, comboio03.estoqueAtual],
      ];
      
      // Calculate totals
      const totalGeralRow = summaryData.reduce((acc, row) => {
        return [
          'Total geral',
          (acc[1] as number) + (row[1] as number),
          (acc[2] as number) + (row[2] as number),
          (acc[3] as number) + (row[3] as number),
          (acc[4] as number) + (row[4] as number),
          (acc[5] as number) + (row[5] as number),
          (acc[6] as number) + (row[6] as number),
        ];
      }, ['Total geral', 0, 0, 0, 0, 0, 0] as any[]);
      
      summaryData.push(totalGeralRow);
      
      // Format numbers for display
      const formattedSummaryData = summaryData.map(row => [
        row[0],
        typeof row[1] === 'number' ? row[1].toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : row[1],
        typeof row[2] === 'number' ? row[2].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : row[2],
        typeof row[3] === 'number' ? row[3].toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : row[3],
        typeof row[4] === 'number' ? row[4].toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : row[4],
        typeof row[5] === 'number' ? row[5].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : row[5],
        typeof row[6] === 'number' ? row[6].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : row[6],
      ]);
      
      // Draw summary table
      autoTable(doc, {
        startY: currentY,
        head: [[
          'Descrição',
          'Estoque\nAnterior',
          'Entrada',
          'Saída para\nComboios',
          'Saída para\nEquipamentos',
          'Total',
          'Estoque Atual'
        ]],
        body: formattedSummaryData,
        styles: { 
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: { 
          fillColor: [200, 200, 200],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 35, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' },
          6: { cellWidth: 35, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255]
        },
        theme: 'grid',
        didParseCell: (data) => {
          // Style the totals row (last row)
          if (data.row.index === formattedSummaryData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 230, 230];
          }
        },
      });
      
      currentY = (doc as any).lastAutoTable?.finalY + 20 || currentY + 80;
      
      // Section: Tanques 01 e 02 - Detailed records
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 0, 0);
      doc.text('Tanques 01 e 02', pageWidth / 2, currentY, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      currentY += 8;
      
      // Get all records and calculate consumption
      let totalDiesel = 0;
      let totalConsumo = 0;
      let countConsumo = 0;
      
      const allRecords = Object.values(resumoPorLocal.recordsByLocal).flat();
      
      const tableData = allRecords.map((record, index) => {
        const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
        const anterior = usaKm ? record.kmAnterior : record.horAnterior;
        const atual = usaKm ? record.kmAtual : record.horAtual;
        const intervalo = atual - anterior;
        
        let consumo = 0;
        if (record.quantidade > 0 && intervalo > 0) {
          if (usaKm) {
            consumo = intervalo / record.quantidade;
          } else {
            consumo = record.quantidade / intervalo;
          }
          totalConsumo += consumo;
          countConsumo++;
        }
        
        totalDiesel += record.quantidade;
        
        return [
          (index + 1).toString() + '.',
          record.codigo,
          record.descricao,
          record.motorista,
          anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
          atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
          intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
          consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
          record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
        ];
      });
      
      // Check if we need a new page
      if (currentY > 150) {
        doc.addPage();
        currentY = 20;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 0, 0);
        doc.text('Tanques 01 e 02', pageWidth / 2, currentY, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        currentY += 8;
      }
      
      // Draw detailed table
      autoTable(doc, {
        startY: currentY,
        head: [[
          '',
          'Código',
          'Descrição',
          'Motorista/Operador',
          'Hor/Km\nAnterior',
          'Hor/Km\nAtual',
          'Intervalo\n(h/km)',
          'Consumo',
          'Qtd Diesel'
        ]],
        body: tableData,
        styles: { 
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: { 
          fillColor: [200, 200, 200],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 45 },
          3: { cellWidth: 45 },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
          6: { cellWidth: 28, halign: 'right' },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 22, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255]
        },
        theme: 'grid',
      });
      
      doc.save(`resumo_geral_abastecimento_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    } finally {
      setIsExporting(false);
    }
  }, [getStockDataFromSheet, estoqueTanque01Data, estoqueTanque02Data, estoqueComboio01Data, estoqueComboio02Data, estoqueComboio03Data, resumoPorLocal]);

  // Print function
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Fuel className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Abastecimento</h1>
              <p className="text-sm text-muted-foreground">Resumo em tempo real</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {canCreateRecords && (
              <Button 
                size="sm" 
                onClick={() => setShowAdminRecordModal(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Novo Apontamento</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={isExporting}>
              <FileText className={cn("w-4 h-4 sm:mr-2", isExporting && "animate-spin")} />
              <span className="hidden sm:inline">{isExporting ? 'Exportando...' : 'PDF'}</span>
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("w-2 h-2 rounded-full shrink-0", loading ? "bg-warning animate-pulse" : "bg-success")} />
            <span className={cn("font-medium", loading ? "text-warning" : "text-success")}>
              {loading ? 'Sincronizando...' : 'Conectado'}
            </span>
            <span className="text-muted-foreground">• {filteredRows.length} registros</span>
          </div>
        </div>

        {/* Metric Cards - Responsive Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <MetricCard
            title="REGISTROS NO PERÍODO"
            value={additionalMetrics.registros.toString()}
            subtitle={`${PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label || 'Período'}`}
            variant="white"
            icon={Fuel}
          />
          <MetricCard
            title="SAÍDA P/ EQUIPAMENTOS"
            value={`${metricsFromGeral.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Diesel consumido"
            variant="red"
            icon={TrendingDown}
          />
          <MetricCard
            title="SAÍDA P/ COMBOIOS"
            value={`${metricsFromGeral.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Transferências internas"
            variant="yellow"
            icon={Truck}
          />
          <MetricCard
            title="ARLA TOTAL DE SAÍDAS"
            value={`${additionalMetrics.totalArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Arla consumido"
            variant="blue"
            icon={Droplet}
          />
          <MetricCard
            title="ESTOQUE ATUAL"
            value={`${metricsFromGeral.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Combustível disponível"
            variant="navy"
            icon={TrendingUp}
          />
        </div>


        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-3 md:p-4 space-y-3 md:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={localFilter} onValueChange={setLocalFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Locais</SelectItem>
                  {locais.map(local => (
                    <SelectItem key={local} value={local}>{local}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  {tipos.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={combustivelFilter} onValueChange={setCombustivelFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Combustível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Comb.</SelectItem>
                  {combustiveis.map(comb => (
                    <SelectItem key={comb} value={comb}>{comb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Empresas</SelectItem>
                  {empresas.map(emp => (
                    <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Período:</span>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-36 sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {periodFilter === 'personalizado' && (
              <>
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
                      onSelect={setStartDate}
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
                      onSelect={setEndDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <span className="filter-badge">
              {PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label}
              <X className="w-3 h-3 cursor-pointer ml-1" onClick={clearPeriod} />
            </span>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'resumo' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">RESUMO DE SAÍDA POR LOCAL</h2>
            </div>

            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead className="text-right">Quantidade (L)</TableHead>
                    <TableHead className="text-right">Consumo Médio</TableHead>
                    <TableHead className="text-center w-16">Detalhes</TableHead>
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
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum dado encontrado para o período selecionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filteredRows.slice(0, 50).map((row, index) => {
                        const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
                        const consumoData = consumoMedioVeiculo.get(veiculo);
                        
                        // Calculate average consumption based on hours worked or km driven
                        let consumoMedio = '-';
                        if (consumoData && consumoData.totalLitros > 0) {
                          if (consumoData.usaKm && consumoData.totalKmRodados > 0) {
                            const kmL = consumoData.totalKmRodados / consumoData.totalLitros;
                            consumoMedio = `${kmL.toFixed(2)} km/L`;
                          } else if (consumoData.totalHorasTrabalhadas > 0) {
                            const lH = consumoData.totalLitros / consumoData.totalHorasTrabalhadas;
                            consumoMedio = `${lH.toFixed(2)} L/h`;
                          }
                        }

                        return (
                          <TableRow 
                            key={row._rowIndex || index} 
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              setSelectedRecord(row);
                              setShowDetailModal(true);
                            }}
                          >
                            <TableCell>{String(row['DATA'] || '')}</TableCell>
                            <TableCell className="font-medium">{veiculo}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {String(row['DESCRICAO'] || row['DESCRIÇÃO'] || row['Descricao'] || '-')}
                            </TableCell>
                            <TableCell>{String(row['MOTORISTA'] || row['Motorista'] || '-')}</TableCell>
                            <TableCell className="text-right font-medium">
                              {parseNumber(row['QUANTIDADE']).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={cn(
                                "text-sm",
                                consumoMedio !== '-' && "text-primary font-medium"
                              )}>
                                {consumoMedio}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecord(row);
                                  setShowDetailModal(true);
                                }}
                              >
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredRows.length > 50 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                            Mostrando 50 de {filteredRows.length} registros
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'detalhamento' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Detalhamento de Abastecimentos</h2>
              <Button onClick={exportDetailedPDF} disabled={isExporting} className="gap-2">
                <Download className="w-4 h-4" />
                {isExporting ? 'Exportando...' : 'Exportar PDF Detalhado'}
              </Button>
            </div>
            
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                        Carregando dados...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        Nenhum registro encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.slice(0, 100).map((row, index) => (
                      <TableRow key={row._rowIndex || index}>
                        <TableCell>{row['DATA']}</TableCell>
                        <TableCell>{row['HORA']}</TableCell>
                        <TableCell className="font-medium">{row['VEICULO']}</TableCell>
                        <TableCell>{row['MOTORISTA']}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{row['TIPO DE COMBUSTIVEL']}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {parseNumber(row['QUANTIDADE']).toLocaleString('pt-BR')} L
                        </TableCell>
                        <TableCell>{row['LOCAL']}</TableCell>
                        <TableCell className="text-right">
                          R$ {parseNumber(row['VALOR TOTAL']).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {filteredRows.length > 100 && (
                <div className="p-4 text-center text-sm text-muted-foreground border-t">
                  Mostrando 100 de {filteredRows.length} registros
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'saneamento' && (
          <div className="space-y-4">
            {/* Saneamento KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="ESTOQUE OBRA SANEAMENTO"
                value={`${estoqueSaneamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
                subtitle="Estoque atual"
                variant="primary"
                icon={Droplet}
                className="border-l-4 border-l-blue-500"
              />
              <MetricCard
                title="ABASTECIMENTOS SANEAMENTO"
                value={saneamentoFilteredData.length.toString()}
                subtitle="Total de registros"
                variant="primary"
                icon={Fuel}
                className="border-l-4 border-l-amber-500"
              />
              <MetricCard
                title="VEÍCULOS ATENDIDOS"
                value={saneamentoSummary.entries.length.toString()}
                subtitle="Veículos únicos"
                variant="primary"
                icon={TrendingUp}
                className="border-l-4 border-l-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Droplet className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Resumo de Abastecimentos - Obra Saneamento</h2>
              <Badge variant="outline">{saneamentoFilteredData.length} registros</Badge>
            </div>

            {saneamentoFilteredData.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <Droplet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Nenhum registro encontrado</h3>
                <p className="text-muted-foreground">Não há registros de abastecimento para Obra Saneamento.</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Veículo</TableHead>
                      <TableHead className="text-center">Abastecimentos</TableHead>
                      <TableHead className="text-center">Diesel (L)</TableHead>
                      <TableHead className="text-center">Arla (L)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saneamentoSummary.entries.map(([veiculo, values]) => (
                      <TableRow key={veiculo}>
                        <TableCell className="font-medium">{veiculo}</TableCell>
                        <TableCell className="text-center">{values.abastecimentos}</TableCell>
                        <TableCell className="text-center">
                          {values.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {values.arla > 0 ? values.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-center">{saneamentoSummary.total.abastecimentos}</TableCell>
                      <TableCell className="text-center">
                        {saneamentoSummary.total.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {saneamentoSummary.total.arla > 0 
                          ? saneamentoSummary.total.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
                          : '-'
                        }
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'entradas' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-success" />
              <h2 className="text-lg font-semibold">Entradas de Combustível por Fornecedor</h2>
              <Badge variant="outline">{entradasData.entries.length} registros</Badge>
            </div>

            {/* Summary by Supplier */}
            {entradasPorFornecedor.length > 0 && (
              <div className="bg-card rounded-lg border border-border overflow-hidden mb-4">
                <div className="p-4 border-b border-border bg-muted/30">
                  <h3 className="font-semibold">Resumo por Fornecedor</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-center">Registros</TableHead>
                      <TableHead className="text-center">Quantidade (L)</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entradasPorFornecedor.map(([fornecedor, values]) => (
                      <TableRow key={fornecedor}>
                        <TableCell className="font-medium">{fornecedor}</TableCell>
                        <TableCell className="text-center">{values.registros}</TableCell>
                        <TableCell className="text-center text-success font-medium">
                          +{values.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {values.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Summary by Entry Location (Tanques) */}
            {Object.keys(entradasData.byLocation).length > 0 && (
              <div className="bg-card rounded-lg border border-border overflow-hidden mb-4">
                <div className="p-4 border-b border-border bg-muted/30">
                  <h3 className="font-semibold">Entradas por Local (Tanques)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                  {Object.entries(entradasData.byLocation).map(([local, data]) => (
                    <div key={local} className="bg-muted/20 rounded-lg p-4 border">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span className="font-medium">{local}</span>
                      </div>
                      <div className="text-2xl font-bold text-success">
                        +{data.total.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {data.registros.length} entradas
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {entradasData.entries.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <ArrowDownUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Nenhuma entrada encontrada</h3>
                <p className="text-muted-foreground">Não há registros de entrada de combustível no período selecionado.</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Local de Entrada</TableHead>
                      <TableHead>Nota Fiscal</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entradasData.entries.map((row, index) => (
                      <TableRow key={row._rowIndex || index}>
                        <TableCell>{row['DATA']}</TableCell>
                        <TableCell>
                          <Badge className="bg-success/20 text-success border-success/30">Entrada</Badge>
                        </TableCell>
                        <TableCell>{row['FORNECEDOR'] || '-'}</TableCell>
                        <TableCell>{row['LOCAL'] || row['TANQUE'] || '-'}</TableCell>
                        <TableCell>{row['NOTA FISCAL'] || '-'}</TableCell>
                        <TableCell className="text-right font-medium text-success">
                          +{parseNumber(row['QUANTIDADE']).toLocaleString('pt-BR')} L
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {parseNumber(row['VALOR TOTAL']).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'relatorios' && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Relatórios Disponíveis</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card rounded-lg border border-border p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório Completo</h3>
                    <p className="text-sm text-muted-foreground">Por local de abastecimento</p>
                  </div>
                </div>
                <Button className="w-full" onClick={exportPDF} disabled={isExporting}>
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>

              <div className="bg-card rounded-lg border border-border p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório por Empresa</h3>
                    <p className="text-sm text-muted-foreground">Agrupado por empresa e categoria</p>
                  </div>
                </div>
                <Button className="w-full bg-red-600 hover:bg-red-700" onClick={exportPDFPorEmpresa} disabled={isExporting}>
                  <Building2 className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>

              <div className="bg-card rounded-lg border border-border p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Download className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório Detalhado</h3>
                    <p className="text-sm text-muted-foreground">Com filtros aplicados</p>
                  </div>
                </div>
                <Button className="w-full" variant="outline" onClick={exportDetailedPDF} disabled={isExporting}>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar PDF Detalhado
                </Button>
              </div>

              <div className="bg-card rounded-lg border border-border p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório por Local</h3>
                    <p className="text-sm text-muted-foreground">Resumo por ponto de abastecimento</p>
                  </div>
                </div>
                <Button className="w-full" variant="outline" onClick={exportPDF} disabled={isExporting}>
                  <MapPin className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              Detalhes do Abastecimento
            </DialogTitle>
          </DialogHeader>
          
          {selectedRecord && (
            <div className="space-y-6">
              {/* Main Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Data</span>
                  <p className="font-medium">{String(selectedRecord['DATA'] || '-')}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Hora</span>
                  <p className="font-medium">{String(selectedRecord['HORA'] || '-')}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <Badge variant="outline">{String(selectedRecord['TIPO'] || '-')}</Badge>
                </div>
              </div>

              {/* Vehicle Info */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Veículo</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Código</span>
                    <p className="font-medium">{String(selectedRecord['VEICULO'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Descrição</span>
                    <p className="font-medium">{String(selectedRecord['DESCRICAO'] || selectedRecord['DESCRIÇÃO'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Categoria</span>
                    <p className="font-medium">{String(selectedRecord['CATEGORIA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Motorista</span>
                    <p className="font-medium">{String(selectedRecord['MOTORISTA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Empresa</span>
                    <p className="font-medium">{String(selectedRecord['EMPRESA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Obra</span>
                    <p className="font-medium">{String(selectedRecord['OBRA'] || '-')}</p>
                  </div>
                </div>
              </div>

              {/* Fuel Info */}
              <div className="bg-primary/5 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Combustível</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <p className="font-medium">{String(selectedRecord['TIPO DE COMBUSTIVEL'] || 'Diesel')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Quantidade</span>
                    <p className="font-medium text-lg text-primary">
                      {parseNumber(selectedRecord['QUANTIDADE']).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Arla</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['QUANTIDADE DE ARLA']) > 0 
                        ? `${parseNumber(selectedRecord['QUANTIDADE DE ARLA']).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L` 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Local</span>
                    <p className="font-medium">{String(selectedRecord['LOCAL'] || '-')}</p>
                  </div>
                </div>
              </div>

              {/* Horimeter/KM Info */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Horímetro / Quilometragem</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Horímetro Anterior</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['HORIMETRO ANTERIOR']) > 0 
                        ? parseNumber(selectedRecord['HORIMETRO ANTERIOR']).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Horímetro Atual</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['HORIMETRO ATUAL']) > 0 
                        ? parseNumber(selectedRecord['HORIMETRO ATUAL']).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">KM Anterior</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['KM ANTERIOR']) > 0 
                        ? parseNumber(selectedRecord['KM ANTERIOR']).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">KM Atual</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['KM ATUAL']) > 0 
                        ? parseNumber(selectedRecord['KM ATUAL']).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) 
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Photos Section - Always show */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Fotos
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Foto Bomba */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Foto Bomba</span>
                    {selectedRecord['FOTO BOMBA'] && String(selectedRecord['FOTO BOMBA']).trim() ? (
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => setFullscreenImage(String(selectedRecord['FOTO BOMBA']))}
                      >
                        <img 
                          src={String(selectedRecord['FOTO BOMBA'])} 
                          alt="Foto Bomba" 
                          className="w-full h-48 object-cover rounded-lg border border-border group-hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            (e.target as HTMLImageElement).parentElement!.innerHTML = `
                              <div class="w-full h-48 bg-muted/30 rounded-lg border border-border flex items-center justify-center">
                                <span class="text-muted-foreground text-sm">Erro ao carregar imagem</span>
                              </div>
                            `;
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-muted/30 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                        <Image className="w-8 h-8 text-muted-foreground/50" />
                        <span className="text-muted-foreground text-sm">Sem foto</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Foto Horímetro */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Foto Horímetro</span>
                    {selectedRecord['FOTO HORIMETRO'] && String(selectedRecord['FOTO HORIMETRO']).trim() ? (
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => setFullscreenImage(String(selectedRecord['FOTO HORIMETRO']))}
                      >
                        <img 
                          src={String(selectedRecord['FOTO HORIMETRO'])} 
                          alt="Foto Horímetro" 
                          className="w-full h-48 object-cover rounded-lg border border-border group-hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            (e.target as HTMLImageElement).parentElement!.innerHTML = `
                              <div class="w-full h-48 bg-muted/30 rounded-lg border border-border flex items-center justify-center">
                                <span class="text-muted-foreground text-sm">Erro ao carregar imagem</span>
                              </div>
                            `;
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-muted/30 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                        <Image className="w-8 h-8 text-muted-foreground/50" />
                        <span className="text-muted-foreground text-sm">Sem foto</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Observations */}
              {selectedRecord['OBSERVAÇÃO'] && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Observações</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                    {String(selectedRecord['OBSERVAÇÃO'])}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Foto em tela cheia" 
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Admin Fuel Record Modal */}
      {canCreateRecords && (
        <AdminFuelRecordModal
          open={showAdminRecordModal}
          onOpenChange={setShowAdminRecordModal}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
