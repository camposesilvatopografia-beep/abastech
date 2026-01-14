import { useState, useMemo, useEffect } from 'react';
import { 
  Package,
  RefreshCw,
  Printer,
  FileText,
  Search,
  Droplet,
  TrendingDown,
  TrendingUp,
  Fuel,
  Calendar,
  X,
  Wifi,
  WifiOff,
  Bell,
  BellRing,
  AlertTriangle
} from 'lucide-react';
import { useStockAlerts } from '@/hooks/useStockAlerts';
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
import { cn } from '@/lib/utils';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

const ABASTECIMENTO_SHEET = 'AbastecimentoCanteiro01';
const GERAL_SHEET = 'GERAL';
const ARLA_SHEET = 'EstoqueArla';
const POLLING_INTERVAL = 30000; // 30 seconds

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

export function EstoquesPage() {
  const { data: abastecimentoData, loading, refetch } = useSheetData(ABASTECIMENTO_SHEET, { pollingInterval: POLLING_INTERVAL });
  const { data: geralData } = useSheetData(GERAL_SHEET, { pollingInterval: POLLING_INTERVAL });
  const { data: arlaData } = useSheetData(ARLA_SHEET, { pollingInterval: POLLING_INTERVAL });
  
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [quickFilter, setQuickFilter] = useState<string | null>('hoje');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(true);

  // Update last sync time when data changes
  useEffect(() => {
    if (abastecimentoData.rows.length > 0 || geralData.rows.length > 0) {
      setLastUpdate(new Date());
      setIsConnected(true);
    }
  }, [abastecimentoData.rows.length, geralData.rows.length]);

  // Apply quick filters
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

  // Filter rows by date and search
  const filteredRows = useMemo(() => {
    return abastecimentoData.rows.filter(row => {
      // Search filter
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );

      // Date filter
      let matchesDate = true;
      if (startDate || endDate) {
        const rowDateStr = String(row['DATA'] || '');
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

      return matchesSearch && matchesDate;
    });
  }, [abastecimentoData.rows, search, startDate, endDate]);

  // Calculate metrics from real data
  const metrics = useMemo(() => {
    // Get stock from GERAL sheet - find today's row or use last row
    let estoqueDiesel = 0;
    let estoqueAnterior = 0;
    
    if (geralData.rows.length > 0) {
      const todayStr = format(new Date(), 'dd/MM/yyyy');
      
      // Try to find today's row
      let targetRow = geralData.rows.find(row => {
        const rowDate = String(row['Data'] || row['DATA'] || '');
        return rowDate === todayStr;
      });
      
      // If no row for today, use the last row
      if (!targetRow) {
        targetRow = geralData.rows[geralData.rows.length - 1];
      }
      
      estoqueDiesel = parseNumber(targetRow?.['EstoqueAtual'] || targetRow?.['ESTOQUE ATUAL'] || targetRow?.['Estoque Atual']);
      estoqueAnterior = parseNumber(targetRow?.['EstoqueAnterior'] || targetRow?.['ESTOQUE ANTERIOR'] || targetRow?.['Estoque Anterior']);
    }

    // Get ARLA stock from EstoqueArla sheet
    let estoqueArla = 0;
    if (arlaData.rows.length > 0) {
      const lastArlaRow = arlaData.rows[arlaData.rows.length - 1];
      estoqueArla = parseNumber(lastArlaRow?.['EstoqueAtual'] || lastArlaRow?.['ESTOQUE ATUAL'] || lastArlaRow?.['Estoque Atual']);
    }

    // Calculate saidas (exits) and entradas (entries) from filtered abastecimento data
    let saidasPeriodo = 0;
    let entradasPeriodo = 0;
    let saidasArla = 0;

    filteredRows.forEach(row => {
      const quantidade = parseNumber(row['QUANTIDADE'] || row['Quantidade']);
      const arla = parseNumber(row['QUANTIDADE DE ARLA'] || row['Quantidade de Arla'] || row['ARLA']);
      const tipo = String(row['TIPO DE OPERACAO'] || row['TIPO'] || row['Tipo'] || '').toLowerCase();
      const fornecedor = String(row['FORNECEDOR'] || '').trim();
      const local = String(row['LOCAL'] || '').toLowerCase();

      // Count exits (Saída type, no supplier)
      if (!fornecedor && quantidade > 0) {
        if (!tipo.includes('entrada')) {
          saidasPeriodo += quantidade;
        }
      }
      
      // Count entries (from suppliers at tanks)
      if (fornecedor && quantidade > 0) {
        if (local.includes('tanque 01') || local.includes('tanque 02') || 
            local.includes('tanque canteiro 01') || local.includes('tanque canteiro 02')) {
          entradasPeriodo += quantidade;
        }
      }

      // ARLA exits
      if (arla > 0) {
        saidasArla += arla;
      }
    });

    return {
      estoqueDiesel,
      estoqueAnterior,
      estoqueArla,
      saidasPeriodo,
      entradasPeriodo,
      saidasArla
    };
  }, [geralData.rows, arlaData.rows, filteredRows]);

  // Stock alerts with push notifications
  const { checkNow, getAlertStatus } = useStockAlerts({
    estoqueDiesel: metrics.estoqueDiesel,
    estoqueArla: metrics.estoqueArla,
  });

  const stockHistory = useMemo(() => {
    const byDate: Record<string, { diesel: number; arla: number }> = {};
    
    filteredRows.forEach(row => {
      const date = String(row['DATA'] || 'Sem data');
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const arla = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;

      if (!byDate[date]) {
        byDate[date] = { diesel: 0, arla: 0 };
      }
      byDate[date].diesel += quantidade;
      byDate[date].arla += arla;
    });

    return Object.entries(byDate).slice(0, 10);
  }, [filteredRows]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Estoques', 14, 22);
    
    doc.setFontSize(10);
    const dateRange = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    doc.text(`Período: ${dateRange}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    // Metrics summary
    doc.setFontSize(12);
    doc.text('Resumo:', 14, 46);
    doc.setFontSize(10);
    doc.text(`Estoque Diesel: ${metrics.estoqueDiesel.toLocaleString('pt-BR')} L`, 14, 54);
    doc.text(`Estoque Arla: ${metrics.estoqueArla.toLocaleString('pt-BR')} L`, 14, 60);
    doc.text(`Saídas no Período: ${metrics.saidasPeriodo.toLocaleString('pt-BR')} L`, 14, 66);
    doc.text(`Entradas no Período: ${metrics.entradasPeriodo.toLocaleString('pt-BR')} L`, 100, 66);

    // Table
    const tableData = stockHistory.map(([date, values]) => [
      date,
      values.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      values.arla > 0 ? values.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'
    ]);

    autoTable(doc, {
      head: [['Data', 'Diesel (L)', 'Arla (L)']],
      body: tableData,
      startY: 76,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`estoques_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Estoques</h1>
              <p className="text-sm text-muted-foreground">Controle de combustíveis</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={checkNow}
              className="relative"
              title="Verificar alertas de estoque"
            >
              {(getAlertStatus().diesel !== 'ok' || getAlertStatus().arla !== 'ok') ? (
                <BellRing className="w-4 h-4 sm:mr-2 text-amber-500 animate-pulse" />
              ) : (
                <Bell className="w-4 h-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">Alertas</span>
              {(getAlertStatus().diesel === 'critical' || getAlertStatus().arla === 'critical') && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-destructive rounded-full animate-pulse" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <Printer className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-xs md:text-sm">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-success" />
              <span className="text-success font-medium">Conectado</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-destructive" />
              <span className="text-destructive font-medium">Desconectado</span>
            </>
          )}
          <span className="text-muted-foreground">
            • Última atualização: {format(lastUpdate, 'HH:mm:ss', { locale: ptBR })}
          </span>
          <span className="text-muted-foreground">
            • Atualiza a cada 30s
          </span>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
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

            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Período:</span>
            <span className="font-medium">
              {startDate && endDate 
                ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
                : 'Todo período'}
            </span>
            <span className="text-muted-foreground">• {filteredRows.length.toLocaleString('pt-BR')} registros</span>
          </div>
        </div>

        {/* Stock Alert Banner */}
        {(getAlertStatus().diesel !== 'ok' || getAlertStatus().arla !== 'ok') && (
          <div className={cn(
            "flex items-center gap-3 p-3 rounded-lg border",
            getAlertStatus().diesel === 'critical' || getAlertStatus().arla === 'critical'
              ? "bg-destructive/10 border-destructive/30 text-destructive"
              : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
          )}>
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-sm">
                {getAlertStatus().diesel === 'critical' || getAlertStatus().arla === 'critical'
                  ? '🚨 Alerta Crítico de Estoque!'
                  : '⚠️ Atenção: Estoque Baixo'}
              </p>
              <p className="text-xs opacity-80">
                {getAlertStatus().diesel !== 'ok' && `Diesel: ${getAlertStatus().diesel === 'critical' ? 'CRÍTICO' : 'Baixo'}`}
                {getAlertStatus().diesel !== 'ok' && getAlertStatus().arla !== 'ok' && ' • '}
                {getAlertStatus().arla !== 'ok' && `ARLA: ${getAlertStatus().arla === 'critical' ? 'CRÍTICO' : 'Baixo'}`}
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={checkNow}
              className="shrink-0"
            >
              <Bell className="w-4 h-4 mr-1" />
              Notificar
            </Button>
          </div>
        )}

        {/* Main Stock Cards - Responsive Grid */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <div className="relative">
            {getAlertStatus().diesel !== 'ok' && (
              <div className={cn(
                "absolute -top-2 -right-2 z-10 px-2 py-0.5 rounded-full text-xs font-bold",
                getAlertStatus().diesel === 'critical' 
                  ? "bg-destructive text-destructive-foreground animate-pulse" 
                  : "bg-amber-500 text-white"
              )}>
                {getAlertStatus().diesel === 'critical' ? '⚠️ CRÍTICO' : '⚠️ BAIXO'}
              </div>
            )}
            <MetricCard
              title="ESTOQUE DIESEL"
              value={`${metrics.estoqueDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L`}
              subtitle="Disponível"
              variant={getAlertStatus().diesel === 'critical' ? 'red' : getAlertStatus().diesel === 'warning' ? 'yellow' : 'blue'}
              icon={Fuel}
            />
          </div>
          <div className="relative">
            {getAlertStatus().arla !== 'ok' && (
              <div className={cn(
                "absolute -top-2 -right-2 z-10 px-2 py-0.5 rounded-full text-xs font-bold",
                getAlertStatus().arla === 'critical' 
                  ? "bg-destructive text-destructive-foreground animate-pulse" 
                  : "bg-amber-500 text-white"
              )}>
                {getAlertStatus().arla === 'critical' ? '⚠️ CRÍTICO' : '⚠️ BAIXO'}
              </div>
            )}
            <MetricCard
              title="ESTOQUE ARLA"
              value={`${metrics.estoqueArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
              subtitle="Disponível"
              variant={getAlertStatus().arla === 'critical' ? 'red' : 'yellow'}
              icon={Droplet}
            />
          </div>
        </div>

        {/* Movement Cards - Responsive Grid */}
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <MetricCard
            title="SAÍDAS NO PERÍODO"
            value={`${metrics.saidasPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle={quickFilter === 'hoje' ? 'Consumo de hoje' : 'Consumo no período'}
            variant="red"
            icon={TrendingDown}
          />
          <MetricCard
            title="ENTRADAS NO PERÍODO"
            value={`${metrics.entradasPeriodo.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Fornecedor → Tanques"
            variant="green"
            icon={TrendingUp}
          />
        </div>

      </div>
    </div>
  );
}
