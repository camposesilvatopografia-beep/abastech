import { useState, useMemo } from 'react';
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
  X
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
import { cn } from '@/lib/utils';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

const SHEET_NAME = 'AbastecimentoCanteiro01';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function EstoquesPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [quickFilter, setQuickFilter] = useState<string | null>('hoje');

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

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
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
  }, [data.rows, search, startDate, endDate]);

  const metrics = useMemo(() => {
    let totalDiesel = 0;
    let totalArla = 0;
    let saidasHoje = 0;
    let entradasHoje = 0;

    const today = new Date().toLocaleDateString('pt-BR');

    filteredRows.forEach(row => {
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const arla = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;
      const rowDate = String(row['DATA'] || '');
      const tipo = String(row['TIPO'] || '').toLowerCase();

      totalDiesel += quantidade;
      totalArla += arla;

      if (rowDate === today) {
        if (tipo.includes('saida') || tipo.includes('saída')) {
          saidasHoje += quantidade;
        } else if (tipo.includes('entrada')) {
          entradasHoje += quantidade;
        }
      }
    });

    // Simulated stock values
    const estoqueDiesel = 20667.2;
    const estoqueArla = 1643;

    return {
      estoqueDiesel,
      estoqueArla,
      saidasGeral: totalDiesel,
      saidasHoje,
      entradasHoje
    };
  }, [filteredRows]);

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
    doc.text(`Saídas Período: ${metrics.saidasGeral.toLocaleString('pt-BR')} L`, 14, 66);

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
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Estoques</h1>
              <p className="text-muted-foreground">Controle de combustíveis e lubrificantes</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm">
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <FileText className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-success font-medium">Conectado ao Google Sheets</span>
          <span className="text-muted-foreground">• Sincronizado em tempo real</span>
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

        {/* Main Stock Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            title="ESTOQUE DIESEL"
            value={`${metrics.estoqueDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L`}
            subtitle="Disponível"
            variant="blue"
            icon={Fuel}
          />
          <MetricCard
            title="ESTOQUE ARLA"
            value={`${metrics.estoqueArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Disponível"
            variant="blue"
            icon={Droplet}
          />
        </div>

        {/* Movement Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="SAÍDAS PERÍODO"
            value={`${metrics.saidasGeral.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Total no período"
            variant="red"
            icon={TrendingDown}
          />
          <MetricCard
            title="SAÍDAS HOJE"
            value={`${metrics.saidasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Consumo do dia"
            variant="red"
            icon={TrendingDown}
          />
          <MetricCard
            title="ENTRADAS HOJE"
            value={`${metrics.entradasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Reposição do dia"
            variant="green"
            icon={TrendingUp}
          />
        </div>

        {/* Stock Summary Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Movimentação de Estoque</h2>
            <p className="text-sm text-muted-foreground">Registros do período selecionado</p>
          </div>
          
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Diesel (L)</TableHead>
                <TableHead className="text-right">Arla (L)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                    Carregando dados...
                  </TableCell>
                </TableRow>
              ) : stockHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Nenhum dado encontrado para o período
                  </TableCell>
                </TableRow>
              ) : (
                stockHistory.map(([date, values]) => (
                  <TableRow key={date}>
                    <TableCell className="font-medium">{date}</TableCell>
                    <TableCell className="text-right">
                      {values.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {values.arla > 0 ? values.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
