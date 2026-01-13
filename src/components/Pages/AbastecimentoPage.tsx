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
  CheckCircle
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

export function AbastecimentoPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const { data: geralData } = useSheetData(GERAL_SHEET);
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
    // Look for EstoqueAtual in the first row or sum all values
    const firstRow = geralData.rows[0];
    const estoqueValue = firstRow?.['EstoqueAtual'] || firstRow?.['ESTOQUEATO'] || firstRow?.['Estoque'] || firstRow?.['estoque'] || 0;
    return parseFloat(String(estoqueValue).replace(',', '.')) || 0;
  }, [geralData.rows]);

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
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const arla = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;
      const valor = parseFloat(String(row['VALOR TOTAL'] || '0').replace(',', '.')) || 0;
      
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

  // Summary by location
  const resumoPorLocal = useMemo(() => {
    const summary: Record<string, { abastecimentos: number; diesel: number; arla: number; valor: number }> = {};
    
    filteredRows.forEach(row => {
      const local = String(row['LOCAL'] || 'Não informado').trim() || 'Não informado';
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const arlaQtd = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;
      const valor = parseFloat(String(row['VALOR TOTAL'] || '0').replace(',', '.')) || 0;
      
      if (!summary[local]) {
        summary[local] = { abastecimentos: 0, diesel: 0, arla: 0, valor: 0 };
      }
      
      summary[local].abastecimentos++;
      summary[local].diesel += quantidade;
      summary[local].arla += arlaQtd;
      summary[local].valor += valor;
    });

    const entries = Object.entries(summary).sort((a, b) => b[1].diesel - a[1].diesel);
    const total = entries.reduce((acc, [, v]) => ({
      abastecimentos: acc.abastecimentos + v.abastecimentos,
      diesel: acc.diesel + v.diesel,
      arla: acc.arla + v.arla,
      valor: acc.valor + v.valor
    }), { abastecimentos: 0, diesel: 0, arla: 0, valor: 0 });

    return { entries, total };
  }, [filteredRows]);

  // Saneamento data - identify issues
  const saneamentoData = useMemo(() => {
    const issues: Array<{ tipo: string; descricao: string; registro: any; severity: 'error' | 'warning' }> = [];
    
    filteredRows.forEach(row => {
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const horimetroAnt = parseFloat(String(row['HORIMETRO ANTERIOR'] || '0').replace(',', '.')) || 0;
      const horimetroAtual = parseFloat(String(row['HORIMETRO ATUAL'] || '0').replace(',', '.')) || 0;
      const kmAnt = parseFloat(String(row['KM ANTERIOR'] || '0').replace(',', '.')) || 0;
      const kmAtual = parseFloat(String(row['KM ATUAL'] || '0').replace(',', '.')) || 0;
      
      if (quantidade <= 0) {
        issues.push({ tipo: 'Quantidade', descricao: 'Quantidade zerada ou negativa', registro: row, severity: 'error' });
      }
      if (horimetroAtual > 0 && horimetroAtual < horimetroAnt) {
        issues.push({ tipo: 'Horímetro', descricao: 'Horímetro atual menor que anterior', registro: row, severity: 'error' });
      }
      if (kmAtual > 0 && kmAtual < kmAnt) {
        issues.push({ tipo: 'KM', descricao: 'KM atual menor que anterior', registro: row, severity: 'error' });
      }
      if (!row['MOTORISTA']) {
        issues.push({ tipo: 'Motorista', descricao: 'Motorista não informado', registro: row, severity: 'warning' });
      }
      if (!row['VEICULO']) {
        issues.push({ tipo: 'Veículo', descricao: 'Veículo não informado', registro: row, severity: 'warning' });
      }
    });
    
    return issues;
  }, [filteredRows]);

  // Entries data (entradas)
  const entradasData = useMemo(() => {
    return filteredRows.filter(row => {
      const tipo = String(row['TIPO'] || '').toLowerCase();
      return tipo.includes('entrada') || tipo.includes('recebimento') || tipo.includes('compra');
    });
  }, [filteredRows]);

  // Clear period filter
  const clearPeriod = useCallback(() => {
    setPeriodFilter('hoje');
    setStartDate(new Date());
    setEndDate(new Date());
  }, []);

  // Export to PDF
  const exportPDF = useCallback(() => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Title
      doc.setFontSize(18);
      doc.text('Relatório de Abastecimento', pageWidth / 2, 20, { align: 'center' });
      
      // Subtitle with date range
      doc.setFontSize(10);
      doc.text(`Período: ${format(dateRange.start, 'dd/MM/yyyy')} - ${format(dateRange.end, 'dd/MM/yyyy')}`, pageWidth / 2, 28, { align: 'center' });
      doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 34, { align: 'center' });
      
      // Metrics summary
      doc.setFontSize(12);
      doc.text('Resumo:', 14, 45);
      doc.setFontSize(10);
      doc.text(`Total de Registros: ${metrics.registros}`, 14, 52);
      doc.text(`Total Diesel: ${metrics.totalQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, 14, 58);
      doc.text(`Total Arla: ${metrics.totalArla.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, 14, 64);
      doc.text(`Valor Total: R$ ${metrics.totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 70);
      
      // Table
      const tableData = filteredRows.slice(0, 100).map(row => [
        String(row['DATA'] || ''),
        String(row['HORA'] || ''),
        String(row['VEICULO'] || ''),
        String(row['MOTORISTA'] || ''),
        String(row['TIPO DE COMBUSTIVEL'] || ''),
        parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')).toLocaleString('pt-BR') + ' L',
        String(row['LOCAL'] || '')
      ]);
      
      autoTable(doc, {
        startY: 80,
        head: [['Data', 'Hora', 'Veículo', 'Motorista', 'Combustível', 'Qtd', 'Local']],
        body: tableData,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [239, 125, 50] }
      });
      
      doc.save(`abastecimento_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [filteredRows, dateRange, metrics]);

  // Print function
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Fuel className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Abastecimento</h1>
              <p className="text-muted-foreground">Resumo de abastecimentos em tempo real</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={isExporting}>
              <FileText className={cn("w-4 h-4 mr-2", isExporting && "animate-spin")} />
              {isExporting ? 'Exportando...' : 'Salvar PDF'}
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("w-2 h-2 rounded-full", loading ? "bg-warning animate-pulse" : "bg-success")} />
            <span className={cn("font-medium", loading ? "text-warning" : "text-success")}>
              {loading ? 'Sincronizando...' : 'Conectado ao Google Sheets'}
            </span>
            <span className="text-muted-foreground">• {data.rows.length} registros totais</span>
            <span className="text-muted-foreground">• {filteredRows.length} filtrados</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <Wifi className="w-4 h-4 mr-2" />
              Testar Conexão
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <Database className="w-4 h-4 mr-2" />
              Sincronizar BD
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="REGISTROS NO PERÍODO"
            value={metrics.registros.toString()}
            subtitle={`${PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label || 'Período'}`}
            variant="primary"
            icon={Fuel}
            className="border-l-4 border-l-blue-500"
          />
          <MetricCard
            title="TOTAL DIESEL"
            value={`${metrics.totalQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Litros consumidos"
            variant="primary"
            icon={Droplet}
            className="border-l-4 border-l-amber-500"
          />
          <MetricCard
            title="TOTAL ARLA"
            value={`${metrics.totalArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Litros consumidos"
            variant="primary"
            icon={Calendar}
            className="border-l-4 border-l-emerald-500"
          />
          <MetricCard
            title="ESTOQUE ATUAL"
            value={`${estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Combustível disponível"
            variant="primary"
            icon={TrendingUp}
            className="border-l-4 border-l-purple-500"
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
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-64 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar veículo, motorista..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={localFilter} onValueChange={setLocalFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos os Locais" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Locais</SelectItem>
                {locais.map(local => (
                  <SelectItem key={local} value={local}>{local}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos os Tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Tipos</SelectItem>
                {tipos.map(tipo => (
                  <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={combustivelFilter} onValueChange={setCombustivelFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos Combustíveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Combustíveis</SelectItem>
                {combustiveis.map(comb => (
                  <SelectItem key={comb} value={comb}>{comb}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Período:</span>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-48">
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
                    <TableHead>Local</TableHead>
                    <TableHead className="text-center">Abastecimentos</TableHead>
                    <TableHead className="text-center">Diesel (L)</TableHead>
                    <TableHead className="text-center">Arla (L)</TableHead>
                    <TableHead className="text-center">% do Total</TableHead>
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
                  ) : resumoPorLocal.entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Nenhum dado encontrado para o período selecionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {resumoPorLocal.entries.map(([local, values]) => (
                        <TableRow key={local}>
                          <TableCell className="font-medium">{local}</TableCell>
                          <TableCell className="text-center">{values.abastecimentos}</TableCell>
                          <TableCell className="text-center">
                            {values.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            {values.arla > 0 ? values.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {resumoPorLocal.total.abastecimentos > 0 
                              ? ((values.abastecimentos / resumoPorLocal.total.abastecimentos) * 100).toFixed(1) + '%'
                              : '0%'
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-center">{resumoPorLocal.total.abastecimentos}</TableCell>
                        <TableCell className="text-center">
                          {resumoPorLocal.total.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {resumoPorLocal.total.arla > 0 
                            ? resumoPorLocal.total.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-center text-primary">100%</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'detalhamento' && (
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
                        {parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')).toLocaleString('pt-BR')} L
                      </TableCell>
                      <TableCell>{row['LOCAL']}</TableCell>
                      <TableCell className="text-right">
                        R$ {parseFloat(String(row['VALOR TOTAL'] || '0').replace(',', '.')).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
        )}

        {activeTab === 'saneamento' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <h2 className="text-lg font-semibold">Problemas Detectados</h2>
              </div>
              <Badge variant={saneamentoData.length > 0 ? "destructive" : "outline"}>
                {saneamentoData.length} problema{saneamentoData.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            {saneamentoData.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Tudo certo!</h3>
                <p className="text-muted-foreground">Nenhum problema de saneamento encontrado no período selecionado.</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Severidade</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saneamentoData.slice(0, 50).map((issue, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Badge variant={issue.severity === 'error' ? 'destructive' : 'outline'} className={issue.severity === 'warning' ? 'bg-warning/20 text-warning border-warning/30' : ''}>
                            {issue.severity === 'error' ? 'Erro' : 'Aviso'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{issue.tipo}</TableCell>
                        <TableCell>{issue.descricao}</TableCell>
                        <TableCell>{issue.registro['VEICULO'] || '-'}</TableCell>
                        <TableCell>{issue.registro['DATA'] || '-'}</TableCell>
                      </TableRow>
                    ))}
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
              <h2 className="text-lg font-semibold">Entradas de Combustível</h2>
              <Badge variant="outline">{entradasData.length} registro{entradasData.length !== 1 ? 's' : ''}</Badge>
            </div>

            {entradasData.length === 0 ? (
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
                      <TableHead>Nota Fiscal</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entradasData.map((row, index) => (
                      <TableRow key={row._rowIndex || index}>
                        <TableCell>{row['DATA']}</TableCell>
                        <TableCell>
                          <Badge className="bg-success/20 text-success border-success/30">Entrada</Badge>
                        </TableCell>
                        <TableCell>{row['FORNECEDOR'] || '-'}</TableCell>
                        <TableCell>{row['NOTA FISCAL'] || '-'}</TableCell>
                        <TableCell className="text-right font-medium text-success">
                          +{parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')).toLocaleString('pt-BR')} L
                        </TableCell>
                        <TableCell className="text-right">
                          R$ {parseFloat(String(row['VALOR TOTAL'] || '0').replace(',', '.')).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                  <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Resumo por Local</h3>
                    <p className="text-sm text-muted-foreground">Consumo agrupado por local</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={exportPDF}>
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>

              <div className="bg-card rounded-lg border border-border p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Análise de Consumo</h3>
                    <p className="text-sm text-muted-foreground">Consumo por veículo</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={exportPDF}>
                  <FileText className="w-4 h-4 mr-2" />
                  Exportar PDF
                </Button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-3">Estatísticas do Período</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Registros</p>
                  <p className="text-xl font-bold">{metrics.registros}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Diesel</p>
                  <p className="text-xl font-bold">{metrics.totalQuantidade.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Arla</p>
                  <p className="text-xl font-bold">{metrics.totalArla.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Média por Registro</p>
                  <p className="text-xl font-bold">{metrics.mediaConsumo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
