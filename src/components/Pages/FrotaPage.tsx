import { useState, useMemo } from 'react';
import { 
  Truck,
  RefreshCw,
  Printer,
  FileText,
  Search,
  Building2,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
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

const SHEET_NAME = 'Veiculo';

interface VehicleGroup {
  name: string;
  empresas: number;
  veiculos: number;
  items: Array<{
    codigo: string;
    descricao: string;
    empresa: string;
    categoria: string;
  }>;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  const formats = [
    'dd/MM/yyyy',
    'dd/MM/yyyy HH:mm',
    'dd/MM/yyyy HH:mm:ss',
    'yyyy-MM-dd',
    'yyyy-MM-dd HH:mm',
    'yyyy-MM-dd HH:mm:ss',
    'dd-MM-yyyy',
  ];
  for (const fmt of formats) {
    const parsed = parse(cleaned, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

export function FrotaPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [descricaoFilter, setDescricaoFilter] = useState('all');
  const [groupBy, setGroupBy] = useState<'tipo' | 'empresa' | 'descricao'>('tipo');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'tipo' | 'tabela'>('tipo');
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

  const empresas = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']).trim();
      if (empresa) unique.add(empresa);
    });
    return Array.from(unique);
  }, [data.rows]);

  const tipos = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const tipo = getRowValue(row as any, ['TIPO', 'Tipo', 'tipo', 'CATEGORIA', 'Categoria', 'categoria']).trim();
      if (tipo) unique.add(tipo);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const descricoes = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const desc = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']).trim();
      if (desc) unique.add(desc);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );

      const empresaValue = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']);
      const tipoValue = getRowValue(row as any, ['TIPO', 'Tipo', 'tipo', 'CATEGORIA', 'Categoria', 'categoria']);
      const descricaoValue = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']);

      const matchesEmpresa = empresaFilter === 'all' || empresaValue === empresaFilter;
      const matchesTipo = tipoFilter === 'all' || tipoValue === tipoFilter;
      const matchesDescricao = descricaoFilter === 'all' || descricaoValue === descricaoFilter;

      // Date filter (if the sheet doesn't have date, we treat it as NOT matching when filter is active)
      let matchesDate = true;
      if (startDate || endDate) {
        const rowDateStr = getRowValue(row as any, ['DATA', 'Data', 'data', 'DATA_CADASTRO', 'Data_Cadastro', 'data_cadastro']);
        const rowDate = parseDate(rowDateStr);

        if (!rowDate) return false;

        if (startDate && endDate) {
          matchesDate = isWithinInterval(rowDate, {
            start: startOfDay(startDate),
            end: endOfDay(endDate),
          });
        } else if (startDate) {
          matchesDate = rowDate >= startOfDay(startDate);
        } else if (endDate) {
          matchesDate = rowDate <= endOfDay(endDate);
        }
      }

      return matchesSearch && matchesEmpresa && matchesTipo && matchesDescricao && matchesDate;
    });
  }, [data.rows, search, empresaFilter, tipoFilter, descricaoFilter, startDate, endDate]);

  const metrics = useMemo(() => {
    const empresasSet = new Set<string>();
    const categorias = new Set<string>();
    
    filteredRows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']).trim();
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']).trim();
      if (empresa) empresasSet.add(empresa);
      if (categoria) categorias.add(categoria);
    });

    return {
      totalVeiculos: filteredRows.length,
      tiposEquipamento: categorias.size,
      empresas: empresasSet.size,
      veiculosAtivos: filteredRows.length
    };
  }, [filteredRows]);

  const groupedVehicles = useMemo(() => {
    const groups: Record<string, VehicleGroup> = {};
    
    filteredRows.forEach(row => {
      const tipo = getRowValue(row as any, ['TIPO', 'Tipo', 'tipo', 'CATEGORIA', 'Categoria', 'categoria']) || 'Outros';
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']) || 'Não informada';
      const codigo = getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']);
      const descricao = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']) || 'Sem descrição';
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria']);

      // Determine group key based on groupBy setting
      let groupKey: string;
      switch (groupBy) {
        case 'empresa':
          groupKey = empresa;
          break;
        case 'descricao':
          groupKey = descricao;
          break;
        case 'tipo':
        default:
          groupKey = tipo;
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { name: groupKey, empresas: 0, veiculos: 0, items: [] };
      }

      groups[groupKey].veiculos++;
      groups[groupKey].items.push({ codigo, descricao, empresa, categoria });
    });

    Object.values(groups).forEach(group => {
      const uniqueEmpresas = new Set(group.items.map(i => i.empresa));
      group.empresas = uniqueEmpresas.size;
    });

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows, groupBy]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => 
      prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
    );
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Frota', 14, 22);
    
    doc.setFontSize(10);
    const dateRange = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    doc.text(`Período: ${dateRange}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    doc.setFontSize(12);
    doc.text('Resumo:', 14, 46);
    doc.setFontSize(10);
    doc.text(`Total de Veículos: ${metrics.totalVeiculos}`, 14, 54);
    doc.text(`Tipos de Equipamento: ${metrics.tiposEquipamento}`, 14, 60);
    doc.text(`Empresas: ${metrics.empresas}`, 14, 66);

    const tableData = filteredRows.slice(0, 100).map(row => [
      String(row['CODIGO'] || row['VEICULO'] || ''),
      String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
      String(row['TIPO'] || row['CATEGORIA'] || ''),
      String(row['EMPRESA'] || '')
    ]);

    autoTable(doc, {
      head: [['Código', 'Descrição', 'Tipo', 'Empresa']],
      body: tableData,
      startY: 76,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`frota_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Gestão de Frota</h1>
              <p className="text-sm text-muted-foreground">Veículos e equipamentos</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
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
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Novo Veículo</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-success shrink-0" />
          <span className="text-success font-medium">Conectado</span>
          <span className="text-muted-foreground">• {filteredRows.length} veículos</span>
        </div>

        {/* Metric Cards - Responsive Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title="TOTAL DE VEÍCULOS"
            value={metrics.totalVeiculos.toString()}
            subtitle="No período"
            variant="primary"
            icon={Truck}
          />
          <MetricCard
            title="TIPOS DE EQUIPAMENTO"
            value={metrics.tiposEquipamento.toString()}
            subtitle="Categorias"
            variant="primary"
            icon={Settings}
          />
          <MetricCard
            title="EMPRESAS"
            value={metrics.empresas.toString()}
            subtitle="Fornecedores"
            variant="primary"
            icon={Building2}
          />
          <MetricCard
            title="VEÍCULOS ATIVOS"
            value={metrics.veiculosAtivos.toString()}
            subtitle="Em operação"
            variant="primary"
            icon={Truck}
          />
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-3 md:p-4 space-y-3 md:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <Building2 className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Empresas</SelectItem>
                  {empresas.map(empresa => (
                    <SelectItem key={empresa} value={empresa}>{empresa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <Settings className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  {tipos.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Group By Selection */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <span className="text-sm font-medium text-muted-foreground">Agrupar:</span>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant={groupBy === 'tipo' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('tipo')}
              >
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Tipo</span>
              </Button>
              <Button 
                variant={groupBy === 'empresa' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('empresa')}
              >
                <Building2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Empresa</span>
              </Button>
              <Button 
                variant={groupBy === 'descricao' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setGroupBy('descricao')}
              >
                <Truck className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Descrição</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-wrap">
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

            <Button variant="outline" size="sm" onClick={() => setExpandedGroups(groupedVehicles.map(g => g.name))}>
              Expandir Todos
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExpandedGroups([])}>
              Recolher Todos
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Exibindo {filteredRows.length}</span> de {data.rows.length} veículos
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setViewMode('tipo')}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              viewMode === 'tipo' 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground"
            )}
          >
            Por Tipo/Empresa
          </button>
          <button
            onClick={() => setViewMode('tabela')}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              viewMode === 'tabela' 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground"
            )}
          >
            Tabela Geral
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === 'tipo' ? (
          <div className="space-y-2">
            {groupedVehicles.map(group => (
              <div key={group.name} className="bg-card rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.name)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedGroups.includes(group.name) ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                    <div>
                      <span className="font-semibold">{group.name}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        {group.empresas} empresa{group.empresas !== 1 ? 's' : ''} • {group.veiculos} veículo{group.veiculos !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {group.veiculos}
                  </span>
                </button>
                
                {expandedGroups.includes(group.name) && (
                  <div className="border-t border-border p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.items.map((item, idx) => (
                      <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                        <p className="font-medium">{item.codigo}</p>
                        <p className="text-sm text-muted-foreground">{item.descricao}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Empresa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum veículo encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.slice(0, 50).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row['CODIGO'] || row['VEICULO']}</TableCell>
                      <TableCell>{row['DESCRICAO'] || row['DESCRIÇÃO']}</TableCell>
                      <TableCell>{row['TIPO'] || row['CATEGORIA']}</TableCell>
                      <TableCell>{row['EMPRESA']}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
