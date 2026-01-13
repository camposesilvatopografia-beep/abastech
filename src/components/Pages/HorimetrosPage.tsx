import { useState, useMemo } from 'react';
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
  Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { cn } from '@/lib/utils';

const SHEET_NAME = 'Horimetros';

export function HorimetrosPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'sistema' | 'sheets'>('sheets');

  const metrics = useMemo(() => {
    let horasTotais = 0;
    let registros = 0;
    let zerados = 0;
    let inconsistentes = 0;

    data.rows.forEach(row => {
      const horas = parseFloat(String(row['HORAS'] || row['HORIMETRO'] || '0').replace(',', '.')) || 0;
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
  }, [data.rows]);

  const pendingEquipments = useMemo(() => {
    // Simulated pending equipments
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
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-primary border-primary">
              Testar Sync
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" className="text-primary border-primary">
              <RefreshCw className="w-4 h-4 mr-2" />
              Corrigir Zerados ({metrics.zerados})
            </Button>
            <Button variant="outline" size="sm">
              <Upload className="w-4 h-4 mr-2" />
              Importar do Sheets
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Novo
            </Button>
          </div>
        </div>

        {/* Warning Banner */}
        {metrics.zerados > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="font-semibold text-warning">Horímetros Zerados Detectados</p>
                <p className="text-sm text-muted-foreground">
                  Existem <span className="font-medium text-primary">{metrics.zerados}</span> registros com valores zerados que precisam de correção.
                </p>
              </div>
            </div>
            <Button variant="outline" className="text-primary border-primary">
              <RefreshCw className="w-4 h-4 mr-2" />
              Corrigir Zerados ({metrics.zerados})
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('sistema')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'sistema'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Sistema (Supabase)
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'sheets'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Google Sheets
          </button>
        </div>

        {/* Filters */}
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
          {data.rows.length} registros encontrados • Período: <span className="font-medium text-foreground">Hoje</span>
        </p>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <MetricCard
            title="HORAS TOTAIS"
            value={`${metrics.horasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`}
            subtitle="Hoje"
            variant="primary"
            icon={Clock}
          />
          <MetricCard
            title="MÉDIA POR REGISTRO"
            value={`${metrics.mediaRegistro.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`}
            subtitle="Hoje"
            icon={Timer}
          />
          <MetricCard
            title="REGISTROS"
            value={metrics.registros.toString()}
            subtitle="Hoje"
            icon={CheckCircle}
          />
          <MetricCard
            title="FALTAM CADASTRAR"
            value={Math.max(0, metrics.faltamCadastrar).toString()}
            subtitle="Hoje"
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

        {/* Pending Equipments */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Horímetros Pendentes ({pendingEquipments.length})</h2>
          <p className="text-sm text-muted-foreground mb-4">Clique em um equipamento para registrar</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {pendingEquipments.map((equip, idx) => (
              <button
                key={idx}
                className="flex items-center gap-3 p-3 bg-warning/10 border border-warning/30 rounded-lg hover:bg-warning/20 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full border-2 border-warning flex items-center justify-center">
                  <Clock className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <p className="font-medium">{equip.codigo}</p>
                  <p className="text-xs text-muted-foreground">{equip.descricao}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
