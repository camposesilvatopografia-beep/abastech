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
  Download
} from 'lucide-react';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const { data: geralData } = useSheetData(GERAL_SHEET);
  const { data: saneamentoStockData } = useSheetData(SANEAMENTO_STOCK_SHEET);
  const [activeTab, setActiveTab] = useState('resumo');
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [combustivelFilter, setCombustivelFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('hoje');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [isExporting, setIsExporting] = useState(false);

  // Get current stock from GERAL sheet (column G - EstoqueAtual)
  const estoqueAtual = useMemo(() => {
    if (!geralData.rows.length) return 0;
    const lastRow = geralData.rows[geralData.rows.length - 1];
    const estoqueValue = lastRow?.['EstoqueAtual'] || 0;
    return parseNumber(estoqueValue);
  }, [geralData.rows]);

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
      
      return true;
    });
  }, [data.rows, dateRange, search, localFilter, tipoFilter, combustivelFilter]);

  // Calculate metrics from filtered data
  const metrics = useMemo(() => {
    let totalQuantidade = 0;
    let totalArla = 0;
    let totalValor = 0;
    let registros = 0;

    filteredRows.forEach(row => {
      const quantidade = parseNumber(row['QUANTIDADE']);
      const arla = parseNumber(row['QUANTIDADE DE ARLA']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      totalQuantidade += quantidade;
      totalArla += arla;
      totalValor += valor;
      registros++;
    });

    return {
      registros,
      totalQuantidade,
      totalArla,
      totalValor,
      mediaConsumo: registros > 0 ? totalQuantidade / registros : 0
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

      // Add detailed record with anterior/atual values
      recordsByLocal[local].push({
        data: String(row['DATA'] || ''),
        codigo: String(row['VEICULO'] || row['Veiculo'] || row['CODIGO'] || ''),
        veiculo: String(row['VEICULO'] || row['Veiculo'] || ''),
        descricao: String(row['DESCRIÇÃO'] || row['DESCRICAO'] || row['Descricao'] || row['TIPO'] || ''),
        motorista: String(row['MOTORISTA'] || row['Motorista'] || row['OPERADOR'] || row['Operador'] || ''),
        quantidade,
        categoria: String(row['CATEGORIA'] || row['Categoria'] || row['TIPO'] || '').toLowerCase(),
        horAnterior: parseNumber(row['HOR_ANTERIOR'] || row['HORIMETRO_ANTERIOR'] || row['HORAS_ANTERIOR'] || row['Hor_Anterior'] || 0),
        horAtual: parseNumber(row['HOR_ATUAL'] || row['HORIMETRO'] || row['Horimetro'] || row['HORAS'] || row['Hor_Atual'] || 0),
        kmAnterior: parseNumber(row['KM_ANTERIOR'] || row['QUILOMETRAGEM_ANTERIOR'] || row['Km_Anterior'] || 0),
        kmAtual: parseNumber(row['KM_ATUAL'] || row['KM'] || row['Km'] || row['QUILOMETRAGEM'] || row['Km_Atual'] || 0),
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

  // Calculate average consumption per vehicle (based on horimetro or km)
  const consumoMedioVeiculo = useMemo(() => {
    const veiculoMap = new Map<string, { totalLitros: number; totalHoras: number; totalKm: number; usaKm: boolean }>();
    
    filteredRows.forEach(row => {
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      const horimetro = parseNumber(row['HORIMETRO'] || row['Horimetro'] || row['HORAS']);
      const km = parseNumber(row['KM'] || row['Km'] || row['QUILOMETRAGEM']);
      const categoria = String(row['CATEGORIA'] || row['Categoria'] || '').toLowerCase();
      
      if (!veiculo) return;
      
      const existing = veiculoMap.get(veiculo) || { totalLitros: 0, totalHoras: 0, totalKm: 0, usaKm: false };
      const usaKm = categoria.includes('veículo') || categoria.includes('veiculo') || km > 0;
      
      veiculoMap.set(veiculo, {
        totalLitros: existing.totalLitros + quantidade,
        totalHoras: existing.totalHoras + horimetro,
        totalKm: existing.totalKm + km,
        usaKm: existing.usaKm || usaKm
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
        
        // Title for this location
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(local, pageWidth / 2, currentY, { align: 'center' });
        currentY += 8;
        
        // Prepare table data with consumption calculation
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
          }
          
          return [
            (index + 1).toString() + '.',
            record.codigo,
            record.descricao,
            record.motorista,
            anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
            record.quantidade.toString()
          ];
        });
        
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
          }
          
          return [
            (index + 1).toString() + '.',
            record.codigo,
            record.descricao,
            record.motorista,
            anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
            consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
            record.quantidade.toString()
          ];
        });
        
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title="REGISTROS NO PERÍODO"
            value={metrics.registros.toString()}
            subtitle={`${PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label || 'Período'}`}
            variant="white"
            icon={Fuel}
          />
          <MetricCard
            title="TOTAL DE SAÍDAS"
            value={`${metrics.totalQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Diesel consumido"
            variant="red"
            icon={TrendingDown}
          />
          <MetricCard
            title="TOTAL ARLA"
            value={`${metrics.totalArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Arla consumido"
            variant="yellow"
            icon={Droplet}
          />
          <MetricCard
            title="ESTOQUE ATUAL"
            value={`${estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                        Carregando dados...
                      </TableCell>
                    </TableRow>
                  ) : filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhum dado encontrado para o período selecionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {filteredRows.slice(0, 50).map((row, index) => {
                        const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
                        const consumoData = consumoMedioVeiculo.get(veiculo);
                        
                        // Calculate average consumption
                        let consumoMedio = '-';
                        if (consumoData && consumoData.totalLitros > 0) {
                          if (consumoData.usaKm && consumoData.totalKm > 0) {
                            const kmL = consumoData.totalKm / consumoData.totalLitros;
                            consumoMedio = `${kmL.toFixed(2)} km/L`;
                          } else if (consumoData.totalHoras > 0) {
                            const lH = consumoData.totalLitros / consumoData.totalHoras;
                            consumoMedio = `${lH.toFixed(2)} L/h`;
                          }
                        }

                        return (
                          <TableRow key={row._rowIndex || index}>
                            <TableCell>{String(row['DATA'] || '')}</TableCell>
                            <TableCell className="font-medium">{veiculo}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {String(row['DESCRIÇÃO'] || row['DESCRICAO'] || row['Descricao'] || '-')}
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
                          </TableRow>
                        );
                      })}
                      {filteredRows.length > 50 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-card rounded-lg border border-border p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Relatório Completo</h3>
                    <p className="text-sm text-muted-foreground">Todos os abastecimentos do período</p>
                  </div>
                </div>
                <Button className="w-full" onClick={exportPDF} disabled={isExporting}>
                  <FileText className="w-4 h-4 mr-2" />
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
    </div>
  );
}
