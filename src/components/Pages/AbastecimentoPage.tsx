import { useState, useMemo } from 'react';
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
  ChevronDown,
  BarChart3,
  List,
  Droplet,
  ArrowDownUp,
  FileSpreadsheet,
  MapPin
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
import { cn } from '@/lib/utils';

const SHEET_NAME = 'AbastecimentoCanteiro01';

const TABS = [
  { id: 'resumo', label: 'Resumo', icon: BarChart3 },
  { id: 'detalhamento', label: 'Detalhamento', icon: List },
  { id: 'saneamento', label: 'Saneamento', icon: Droplet },
  { id: 'entradas', label: 'Entradas', icon: ArrowDownUp },
  { id: 'relatorios', label: 'Relatórios', icon: FileSpreadsheet },
];

export function AbastecimentoPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [activeTab, setActiveTab] = useState('resumo');
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');

  // Calculate metrics
  const metrics = useMemo(() => {
    const today = new Date().toLocaleDateString('pt-BR');
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();

    let registrosHoje = 0;
    let saidasHoje = 0;
    let saidasMes = 0;
    let diasComRegistro = new Set<string>();

    data.rows.forEach(row => {
      const rowDate = String(row['DATA'] || '');
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      
      // Parse date
      const dateParts = rowDate.split('/');
      if (dateParts.length === 3) {
        const rowDay = parseInt(dateParts[0]);
        const rowMonth = parseInt(dateParts[1]) - 1;
        const rowYear = parseInt(dateParts[2]);
        
        if (rowMonth === thisMonth && rowYear === thisYear) {
          saidasMes += quantidade;
          diasComRegistro.add(rowDate);
        }
        
        if (rowDate === today) {
          registrosHoje++;
          saidasHoje += quantidade;
        }
      }
    });

    return {
      registrosHoje,
      saidasHoje,
      saidasMes,
      diasComRegistro: diasComRegistro.size
    };
  }, [data.rows]);

  // Get unique locations
  const locais = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const local = String(row['LOCAL'] || '').trim();
      if (local) unique.add(local);
    });
    return Array.from(unique);
  }, [data.rows]);

  // Get unique types
  const tipos = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const tipo = String(row['TIPO'] || '').trim();
      if (tipo) unique.add(tipo);
    });
    return Array.from(unique);
  }, [data.rows]);

  // Summary by location
  const resumoPorLocal = useMemo(() => {
    const summary: Record<string, { abastecimentos: number; diesel: number; arla: number }> = {};
    
    data.rows.forEach(row => {
      const local = String(row['LOCAL'] || 'Não informado').trim() || 'Não informado';
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const tipoCombustivel = String(row['TIPO DE COMBUSTIVEL'] || '').toLowerCase();
      const arlaQtd = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;
      
      if (!summary[local]) {
        summary[local] = { abastecimentos: 0, diesel: 0, arla: 0 };
      }
      
      summary[local].abastecimentos++;
      
      if (tipoCombustivel.includes('diesel')) {
        summary[local].diesel += quantidade;
      }
      summary[local].arla += arlaQtd;
    });

    const entries = Object.entries(summary);
    const total = entries.reduce((acc, [, v]) => ({
      abastecimentos: acc.abastecimentos + v.abastecimentos,
      diesel: acc.diesel + v.diesel,
      arla: acc.arla + v.arla
    }), { abastecimentos: 0, diesel: 0, arla: 0 });

    return { entries, total };
  }, [data.rows]);

  // Filtered rows for detail view
  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );
      const matchesLocal = localFilter === 'all' || row['LOCAL'] === localFilter;
      const matchesTipo = tipoFilter === 'all' || row['TIPO'] === tipoFilter;
      
      return matchesSearch && matchesLocal && matchesTipo;
    });
  }, [data.rows, search, localFilter, tipoFilter]);

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
            <Button variant="outline" size="sm">
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Salvar PDF
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-success font-medium">Conectado ao Google Sheets</span>
            <span className="text-muted-foreground">• {data.rows.length} registros totais</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Wifi className="w-4 h-4 mr-2" />
              Testar Conexão
            </Button>
            <Button variant="outline" size="sm">
              <Database className="w-4 h-4 mr-2" />
              Sincronizar BD
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="REGISTROS HOJE"
            value={metrics.registrosHoje.toString()}
            subtitle="Registros na tabela Geral"
            variant="primary"
            icon={Fuel}
          />
          <MetricCard
            title="SAÍDAS HOJE"
            value={`${metrics.saidasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Diesel para equipamentos"
            variant="primary"
            icon={Droplet}
          />
          <MetricCard
            title="SAÍDAS NO MÊS"
            value={`${metrics.saidasMes.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle={`${metrics.diasComRegistro} dias com registro`}
            variant="primary"
            icon={Calendar}
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
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative flex-1 max-w-sm">
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

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Data</span>
            <span className="text-sm font-medium">Período</span>
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              13/01/2026
            </Button>
            <span className="filter-badge">
              Hoje
              <X className="w-3 h-3 cursor-pointer" />
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Período: <span className="font-medium text-foreground">Hoje</span>
        </p>

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
                        Nenhum dado encontrado
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
                              : 'NaN%'
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
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.slice(0, 50).map((row, index) => (
                    <TableRow key={row._rowIndex || index}>
                      <TableCell>{row['DATA']}</TableCell>
                      <TableCell>{row['HORA']}</TableCell>
                      <TableCell className="font-medium">{row['VEICULO']}</TableCell>
                      <TableCell>{row['MOTORISTA']}</TableCell>
                      <TableCell>{row['TIPO DE COMBUSTIVEL']}</TableCell>
                      <TableCell className="text-right font-medium">
                        {parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')).toLocaleString('pt-BR')} L
                      </TableCell>
                      <TableCell>{row['LOCAL']}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {filteredRows.length > 50 && (
              <div className="p-4 text-center text-sm text-muted-foreground border-t">
                Mostrando 50 de {filteredRows.length} registros
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
