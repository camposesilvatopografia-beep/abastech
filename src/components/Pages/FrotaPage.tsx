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
  ChevronRight
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
import { cn } from '@/lib/utils';

const SHEET_NAME = 'Veiculos';

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

export function FrotaPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'tipo' | 'tabela'>('tipo');

  const metrics = useMemo(() => {
    const empresas = new Set<string>();
    const categorias = new Set<string>();
    
    data.rows.forEach(row => {
      const empresa = String(row['EMPRESA'] || '').trim();
      const categoria = String(row['CATEGORIA'] || row['TIPO'] || '').trim();
      if (empresa) empresas.add(empresa);
      if (categoria) categorias.add(categoria);
    });

    return {
      totalVeiculos: data.rows.length,
      tiposEquipamento: categorias.size,
      empresas: empresas.size,
      veiculosAtivos: data.rows.length
    };
  }, [data.rows]);

  const empresas = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const empresa = String(row['EMPRESA'] || '').trim();
      if (empresa) unique.add(empresa);
    });
    return Array.from(unique);
  }, [data.rows]);

  const tipos = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const tipo = String(row['TIPO'] || row['CATEGORIA'] || '').trim();
      if (tipo) unique.add(tipo);
    });
    return Array.from(unique);
  }, [data.rows]);

  const groupedVehicles = useMemo(() => {
    const groups: Record<string, VehicleGroup> = {};
    
    data.rows.forEach(row => {
      const tipo = String(row['TIPO'] || row['CATEGORIA'] || 'Outros').trim();
      const empresa = String(row['EMPRESA'] || '').trim();
      const codigo = String(row['CODIGO'] || row['VEICULO'] || '').trim();
      const descricao = String(row['DESCRICAO'] || row['DESCRIÇÃO'] || '').trim();
      const categoria = String(row['CATEGORIA'] || '').trim();
      
      if (!groups[tipo]) {
        groups[tipo] = { name: tipo, empresas: 0, veiculos: 0, items: [] };
      }
      
      groups[tipo].veiculos++;
      groups[tipo].items.push({ codigo, descricao, empresa, categoria });
    });

    // Count unique empresas per group
    Object.values(groups).forEach(group => {
      const uniqueEmpresas = new Set(group.items.map(i => i.empresa));
      group.empresas = uniqueEmpresas.size;
    });

    return Object.values(groups);
  }, [data.rows]);

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );
      const matchesEmpresa = empresaFilter === 'all' || row['EMPRESA'] === empresaFilter;
      const matchesTipo = tipoFilter === 'all' || row['TIPO'] === tipoFilter || row['CATEGORIA'] === tipoFilter;
      
      return matchesSearch && matchesEmpresa && matchesTipo;
    });
  }, [data.rows, search, empresaFilter, tipoFilter]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => 
      prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
    );
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Gestão de Frota</h1>
              <p className="text-muted-foreground">Cadastro e monitoramento de veículos e equipamentos</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm">
              Testar Sync
            </Button>
            <Button variant="outline" size="sm">
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Gerar PDF
            </Button>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Novo Veículo
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-success font-medium">Conectado ao Google Sheets</span>
          <span className="text-muted-foreground">• {data.rows.length} veículos</span>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="TOTAL DE VEÍCULOS"
            value={metrics.totalVeiculos.toString()}
            subtitle="Cadastrados"
            variant="primary"
            icon={Truck}
          />
          <MetricCard
            title="TIPOS DE EQUIPAMENTO"
            value={metrics.tiposEquipamento.toString()}
            subtitle="Categorias diferentes"
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
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, motorista..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
              <SelectTrigger className="w-48">
                <Building2 className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Todas Empresas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Empresas</SelectItem>
                {empresas.map(empresa => (
                  <SelectItem key={empresa} value={empresa}>{empresa}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-48">
                <Settings className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Todos Tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                {tipos.map(tipo => (
                  <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm">Expandir Todos</Button>
            <Button variant="outline" size="sm">Recolher Todos</Button>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
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
          <div className="bg-card rounded-lg border border-border p-4">
            <p className="text-muted-foreground text-center py-8">
              Tabela geral em desenvolvimento
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
