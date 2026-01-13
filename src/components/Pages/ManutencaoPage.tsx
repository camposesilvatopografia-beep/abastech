import { useState, useMemo } from 'react';
import { 
  Wrench,
  RefreshCw,
  FileSpreadsheet,
  Plus,
  Search,
  Calendar,
  ClipboardList,
  LayoutGrid,
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  Edit,
  FileText,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { Badge } from '@/components/ui/badge';
import { useSheetData } from '@/hooks/useGoogleSheets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const SHEET_NAME = 'Manutencao';

const TABS = [
  { id: 'ordens', label: 'Ordens de Serviço', icon: ClipboardList },
  { id: 'quadro', label: 'Quadro Resumo', icon: LayoutGrid },
  { id: 'ranking', label: 'Ranking', icon: BarChart3 },
  { id: 'problemas', label: 'Problemas Recorrentes', icon: TrendingUp },
];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function ManutencaoPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [activeTab, setActiveTab] = useState('ordens');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

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
      const status = String(row['STATUS'] || '').toLowerCase();
      const matchesStatus = statusFilter === 'all' || status.includes(statusFilter);
      
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
      
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [data.rows, search, statusFilter, startDate, endDate]);

  const metrics = useMemo(() => {
    let emManutencao = 0;
    let aguardandoPecas = 0;
    let urgentes = 0;
    let finalizadas = 0;

    filteredRows.forEach(row => {
      const status = String(row['STATUS'] || '').toLowerCase();
      const prioridade = String(row['PRIORIDADE'] || '').toLowerCase();

      if (status.includes('andamento') || status.includes('aberta')) {
        emManutencao++;
      }
      if (status.includes('aguardando') || status.includes('peças') || status.includes('pecas')) {
        aguardandoPecas++;
      }
      if (prioridade.includes('alta') || prioridade.includes('máxima') || prioridade.includes('urgente')) {
        urgentes++;
      }
      if (status.includes('finalizada') || status.includes('concluída') || status.includes('concluida')) {
        finalizadas++;
      }
    });

    return { emManutencao, aguardandoPecas, urgentes, finalizadas };
  }, [filteredRows]);

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('finalizada') || s.includes('concluída')) {
      return <Badge className="bg-success/20 text-success border-success/30">Finalizada</Badge>;
    }
    if (s.includes('andamento') || s.includes('aberta')) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">Em Andamento</Badge>;
    }
    if (s.includes('aguardando')) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">Aguardando</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const getTipoBadge = (tipo: string) => {
    const t = tipo.toLowerCase();
    if (t.includes('corretiva')) {
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Corretiva</Badge>;
    }
    if (t.includes('preventiva')) {
      return <Badge className="bg-success/20 text-success border-success/30">Preventiva</Badge>;
    }
    return <Badge variant="outline">{tipo}</Badge>;
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const p = prioridade.toLowerCase();
    if (p.includes('alta') || p.includes('máxima') || p.includes('urgente')) {
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Alta</Badge>;
    }
    if (p.includes('média') || p.includes('media')) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">Média</Badge>;
    }
    return <Badge className="bg-muted text-muted-foreground">Baixa</Badge>;
  };

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(18);
    doc.text('Relatório de Ordens de Serviço', 14, 22);
    
    doc.setFontSize(10);
    const dateRange = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    doc.text(`Período: ${dateRange}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    doc.setFontSize(12);
    doc.text('Resumo:', 14, 46);
    doc.setFontSize(10);
    doc.text(`Em Manutenção: ${metrics.emManutencao}`, 14, 54);
    doc.text(`Aguardando Peças: ${metrics.aguardandoPecas}`, 14, 60);
    doc.text(`Urgentes: ${metrics.urgentes}`, 100, 54);
    doc.text(`Finalizadas: ${metrics.finalizadas}`, 100, 60);

    const tableData = filteredRows.slice(0, 100).map((row, index) => [
      String(row['N_OS'] || row['OS'] || `OS-${String(index + 1).padStart(5, '0')}`),
      String(row['DATA'] || ''),
      String(row['VEICULO'] || ''),
      String(row['TIPO'] || 'Corretiva'),
      String(row['PROBLEMA'] || row['DESCRICAO_PROBLEMA'] || '').slice(0, 30),
      String(row['MECANICO'] || row['RESPONSAVEL'] || ''),
      String(row['PRIORIDADE'] || 'Média'),
      String(row['STATUS'] || 'Em Andamento')
    ]);

    autoTable(doc, {
      head: [['Nº OS', 'Data', 'Veículo', 'Tipo', 'Problema', 'Mecânico', 'Prioridade', 'Status']],
      body: tableData,
      startY: 70,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`manutencao_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Ordens de Serviço</h1>
              <p className="text-sm text-muted-foreground">Manutenção preventiva e corretiva</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">XLSX</span>
            </Button>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Nova O.S.</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          </div>
        </div>

        {/* Metric Cards - Responsive Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title="EM MANUTENÇÃO"
            value={metrics.emManutencao.toString()}
            subtitle="Abertas + Em andamento"
            variant="primary"
            icon={Wrench}
          />
          <MetricCard
            title="AGUARDANDO PEÇAS"
            value={metrics.aguardandoPecas.toString()}
            subtitle="Paradas"
            variant="primary"
            icon={Clock}
          />
          <MetricCard
            title="URGENTES"
            value={metrics.urgentes.toString()}
            subtitle="Prioridade máxima"
            variant="primary"
            icon={AlertTriangle}
          />
          <MetricCard
            title="FINALIZADAS"
            value={metrics.finalizadas.toString()}
            subtitle="Total no período"
            variant="primary"
            icon={CheckCircle}
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-border">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-primary text-foreground bg-muted/50"
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
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar veículo, nº OS, mecânico..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos os Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="andamento">Em Andamento</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
                <SelectItem value="aguardando">Aguardando Peças</SelectItem>
              </SelectContent>
            </Select>

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
          </div>

          <div className="flex items-center gap-4 flex-wrap">
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
            <span className="text-muted-foreground">• {filteredRows.length} ordens</span>
          </div>
        </div>

        {/* Table */}
        {activeTab === 'ordens' && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nº OS</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Problema</TableHead>
                  <TableHead>Mecânico</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                      Carregando dados...
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma ordem de serviço encontrada para o período
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.slice(0, 50).map((row, index) => (
                    <TableRow key={row._rowIndex || index}>
                      <TableCell className="font-medium">{row['N_OS'] || row['OS'] || `OS-${String(index + 1).padStart(5, '0')}`}</TableCell>
                      <TableCell>{row['DATA']}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row['VEICULO']}</p>
                          <p className="text-xs text-muted-foreground">{row['DESCRICAO'] || row['TIPO_VEICULO']}</p>
                        </div>
                      </TableCell>
                      <TableCell>{getTipoBadge(String(row['TIPO'] || 'Corretiva'))}</TableCell>
                      <TableCell className="max-w-32 truncate">{row['PROBLEMA'] || row['DESCRICAO_PROBLEMA']}</TableCell>
                      <TableCell>{row['MECANICO'] || row['RESPONSAVEL']}</TableCell>
                      <TableCell>{getPrioridadeBadge(String(row['PRIORIDADE'] || 'Média'))}</TableCell>
                      <TableCell>{getStatusBadge(String(row['STATUS'] || 'Em Andamento'))}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Other tabs content */}
        {activeTab === 'quadro' && (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            Quadro Resumo - Em desenvolvimento
          </div>
        )}
        {activeTab === 'ranking' && (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            Ranking - Em desenvolvimento
          </div>
        )}
        {activeTab === 'problemas' && (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            Problemas Recorrentes - Em desenvolvimento
          </div>
        )}
      </div>
    </div>
  );
}
