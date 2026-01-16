import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Package2, Calendar, ArrowUp, ArrowDown, Maximize2, Fuel, Truck, BarChart3, Database, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SheetData } from '@/lib/googleSheets';
import { StockHistoryModal } from './StockHistoryModal';
import { cn } from '@/lib/utils';

interface StockPanelTabProps {
  geralData: SheetData;
  estoqueCanteiro01Data: SheetData;
  estoqueCanteiro02Data: SheetData;
  estoqueComboio01Data: SheetData;
  estoqueComboio02Data: SheetData;
  estoqueComboio03Data: SheetData;
  dateRange: { start: Date; end: Date };
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

interface StockCardData {
  title: string;
  sheetName: string;
  data: string;
  local?: string;
  descricao?: string;
  estoqueAtual: number;
  estoqueAnterior: number;
  entradas: number;
  saidas?: number;
}

type CardVariant = 'geral' | 'tanque' | 'comboio';

const cardStyles: Record<CardVariant, { 
  gradient: string; 
  border: string; 
  icon: typeof Package2;
  iconBg: string;
  titleColor: string;
  badgeClass: string;
}> = {
  geral: {
    gradient: 'bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 dark:from-slate-800 dark:via-blue-800 dark:to-indigo-800',
    border: 'border-0 ring-2 ring-blue-500/50 shadow-xl shadow-blue-500/20',
    icon: BarChart3,
    iconBg: 'bg-white/20 text-white',
    titleColor: 'text-white',
    badgeClass: 'bg-white/20 text-white border-white/30'
  },
  tanque: {
    gradient: 'bg-gradient-to-br from-emerald-500/10 via-background to-teal-500/5',
    border: 'border-2 border-emerald-500/30 hover:border-emerald-500/50',
    icon: Fuel,
    iconBg: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    titleColor: 'text-emerald-700 dark:text-emerald-400',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
  },
  comboio: {
    gradient: 'bg-gradient-to-br from-amber-500/10 via-background to-orange-500/5',
    border: 'border-2 border-amber-500/30 hover:border-amber-500/50',
    icon: Truck,
    iconBg: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-700 dark:text-amber-400',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
  }
};

// Resumo Geral Card - Special Design
function ResumoGeralCard({ 
  data, 
  onExpand 
}: { 
  data: StockCardData; 
  onExpand?: () => void;
}) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Card className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 dark:from-slate-800 dark:via-blue-800 dark:to-indigo-800 border-0 ring-2 ring-blue-500/50 shadow-2xl shadow-blue-500/30">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAyNHYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
      
      <CardHeader className="pb-3 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-white tracking-tight">
                {data.title}
              </CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="bg-white/20 text-white/90 border-white/30 text-xs font-medium">
                  <Database className="h-3 w-3 mr-1" />
                  Geral
                </Badge>
              </div>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-9 w-9 hover:bg-white/20 rounded-full text-white/80 hover:text-white"
            onClick={onExpand}
            title="Ver histórico detalhado"
          >
            <Maximize2 className="h-5 w-5" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="relative z-10 space-y-5 pt-0">
        {/* Data Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
            <Calendar className="h-4 w-4 text-white/70" />
            <span className="text-sm font-semibold text-white">{data.data}</span>
          </div>
        </div>

        {/* Estoque Atual - Principal */}
        <div className="text-center py-4 px-6 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20">
          <span className="text-xs font-semibold text-white/70 uppercase tracking-widest">Estoque Atual</span>
          <div className="flex items-center justify-center gap-3 mt-2">
            <Package2 className="h-7 w-7 text-blue-300" />
            <span className="text-4xl font-black text-white tracking-tight">
              {formatNumber(data.estoqueAtual)}
            </span>
            <span className="text-sm text-white/60 font-medium">Litros</span>
          </div>
        </div>

        {/* Grid de Métricas */}
        <div className="grid grid-cols-3 gap-3">
          {/* Estoque Anterior */}
          <div className="text-center p-4 bg-amber-500/20 backdrop-blur-sm rounded-xl border border-amber-400/30">
            <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider">Anterior</span>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <Package2 className="h-4 w-4 text-amber-300" />
              <span className="text-base font-bold text-amber-100">
                {formatNumber(data.estoqueAnterior)}
              </span>
            </div>
          </div>

          {/* Entradas */}
          <div className="text-center p-4 bg-emerald-500/20 backdrop-blur-sm rounded-xl border border-emerald-400/30">
            <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider">Entradas</span>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <ArrowUp className="h-4 w-4 text-emerald-300" />
              <span className="text-base font-bold text-emerald-100">
                {formatNumber(data.entradas)}
              </span>
            </div>
          </div>

          {/* Saídas */}
          <div className="text-center p-4 bg-rose-500/20 backdrop-blur-sm rounded-xl border border-rose-400/30">
            <span className="text-[10px] font-bold text-rose-200 uppercase tracking-wider">Saídas</span>
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <ArrowDown className="h-4 w-4 text-rose-300" />
              <span className="text-base font-bold text-rose-100">
                {formatNumber(data.saidas || 0)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StockCard({ 
  data, 
  showSaida = false,
  onExpand,
  variant = 'tanque'
}: { 
  data: StockCardData; 
  showSaida?: boolean;
  onExpand?: () => void;
  variant?: 'tanque' | 'comboio';
}) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const styles = cardStyles[variant];
  const IconComponent = styles.icon;

  return (
    <Card className={cn(
      "relative hover:shadow-lg transition-all duration-300",
      styles.gradient,
      styles.border
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", styles.iconBg)}>
              <IconComponent className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className={cn("text-base font-bold tracking-tight", styles.titleColor)}>
                {data.title}
              </CardTitle>
              <Badge variant="outline" className={cn("text-[10px] mt-1", styles.badgeClass)}>
                <Database className="h-2.5 w-2.5 mr-1" />
                {data.sheetName}
              </Badge>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 hover:bg-primary/10 rounded-full"
            onClick={onExpand}
            title="Ver histórico detalhado"
          >
            <Maximize2 className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {/* Data Badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-full">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{data.data}</span>
          </div>
        </div>

        {/* Estoque Atual - Destaque Principal */}
        <div className="text-center py-3 px-4 bg-primary/5 rounded-xl border border-primary/20">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estoque Atual</span>
          <div className="flex items-center justify-center gap-2 mt-1">
            <Package2 className="h-5 w-5 text-primary" />
            <span className="text-2xl font-extrabold text-primary tracking-tight">
              {formatNumber(data.estoqueAtual)}
            </span>
            <span className="text-xs text-muted-foreground font-medium">L</span>
          </div>
        </div>

        {/* Grid de Métricas */}
        <div className="grid grid-cols-2 gap-3">
          {/* Estoque Anterior */}
          <div className="text-center p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wider">Anterior</span>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <Package2 className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {formatNumber(data.estoqueAnterior)}
              </span>
            </div>
          </div>

          {/* Entradas */}
          <div className="text-center p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Entrada
            </span>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <ArrowUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" />
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {formatNumber(data.entradas)}
              </span>
            </div>
          </div>
        </div>

        {/* Saídas (optional) */}
        {showSaida && data.saidas !== undefined && (
          <div className="text-center p-3 bg-rose-500/10 rounded-lg border border-rose-500/20">
            <span className="text-[10px] font-medium text-rose-700 dark:text-rose-400 uppercase tracking-wider">Saídas</span>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <ArrowDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-500" />
              <span className="text-sm font-bold text-rose-700 dark:text-rose-400">
                {formatNumber(data.saidas)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function extractStockData(sheetData: SheetData, localName: string, sheetName: string): StockCardData {
  const today = format(new Date(), 'dd/MM/yyyy');
  
  if (!sheetData.rows || sheetData.rows.length === 0) {
    return {
      title: localName,
      sheetName,
      data: today,
      local: localName,
      estoqueAtual: 0,
      estoqueAnterior: 0,
      entradas: 0,
      saidas: 0
    };
  }

  // Get the last row (most recent data)
  const lastRow = sheetData.rows[sheetData.rows.length - 1];
  
  // Try to extract values from different possible column names (including trimmed versions)
  const getColumnValue = (row: any, ...keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
      // Try trimmed version
      const trimmedKey = key.trim();
      if (row[trimmedKey] !== undefined && row[trimmedKey] !== null && row[trimmedKey] !== '') return row[trimmedKey];
      // Try with leading space
      if (row[` ${key}`] !== undefined && row[` ${key}`] !== null && row[` ${key}`] !== '') return row[` ${key}`];
    }
    return 0;
  };

  const estoqueAtual = parseNumber(getColumnValue(lastRow,
    'EstoqueAtual', 'Estoque Atual', 'ESTOQUE_ATUAL', 'ESTOQUE ATUAL', 
    'Estoque atual', 'estoque_atual', 'H'
  ));
  
  const estoqueAnterior = parseNumber(getColumnValue(lastRow,
    'EstoqueAnterior', 'Estoque Anterior', 'ESTOQUE_ANTERIOR', 'ESTOQUE ANTERIOR',
    'Estoque anterior', 'estoque_anterior'
  ));
  
  const entradas = parseNumber(getColumnValue(lastRow,
    'Entrada', 'Entradas', 'ENTRADA', 'ENTRADAS', 'entrada', 'entradas'
  ));
  
  const saidas = parseNumber(getColumnValue(lastRow,
    'Saida', 'Saída', 'Saidas', 'Saídas', 'SAIDA', 'SAÍDA', 'saida', 'saída'
  ));

  const dataRow = String(getColumnValue(lastRow, 'Data', 'DATA', 'data') || today);

  return {
    title: localName,
    sheetName,
    data: dataRow || today,
    local: localName,
    estoqueAtual,
    estoqueAnterior,
    entradas,
    saidas
  };
}

type ExpandedCard = 'geral' | 'tanque01' | 'tanque02' | 'comboio01' | 'comboio02' | 'comboio03' | null;

export function StockPanelTab({
  geralData,
  estoqueCanteiro01Data,
  estoqueCanteiro02Data,
  estoqueComboio01Data,
  estoqueComboio02Data,
  estoqueComboio03Data,
  dateRange
}: StockPanelTabProps) {
  const today = format(new Date(), 'd/M/yyyy');
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);

  // Calculate daily summary from GERAL sheet
  const movimentoDiario = useMemo<StockCardData>(() => {
    if (!geralData.rows || geralData.rows.length === 0) {
      return {
        title: 'Resumo Geral',
        sheetName: 'Geral',
        data: today,
        descricao: 'Resumo Diário',
        estoqueAtual: 0,
        estoqueAnterior: 0,
        entradas: 0,
        saidas: 0
      };
    }

    // Find today's row or get the last row
    const todayFormatted = format(new Date(), 'dd/MM/yyyy');
    let targetRow = geralData.rows.find(row => {
      const rowDate = String(row['Data'] || row['DATA'] || row[' Data'] || '').trim();
      return rowDate === todayFormatted;
    });

    if (!targetRow && geralData.rows.length > 0) {
      targetRow = geralData.rows[geralData.rows.length - 1];
    }

    if (!targetRow) {
      return {
        title: 'Resumo Geral',
        sheetName: 'Geral',
        data: today,
        descricao: 'Resumo Diário',
        estoqueAtual: 0,
        estoqueAnterior: 0,
        entradas: 0,
        saidas: 0
      };
    }

    const estoqueAnterior = parseNumber(targetRow['Estoque Anterior'] || targetRow['ESTOQUE ANTERIOR'] || targetRow[' Estoque Anterior'] || 0);
    const entrada = parseNumber(targetRow['Entrada'] || targetRow['ENTRADA'] || targetRow[' Entrada'] || 0);
    const saidaComboios = parseNumber(targetRow['Saida para Comboios'] || targetRow['SAIDA PARA COMBOIOS'] || targetRow[' Saida para Comboios'] || 0);
    const saidaEquipamentos = parseNumber(targetRow['Saida para Equipamentos'] || targetRow['SAIDA PARA EQUIPAMENTOS'] || targetRow[' Saida para Equipamentos'] || 0);
    
    // Try to get Estoque Atual from column G first
    let estoqueAtual = parseNumber(targetRow['Estoque Atual'] || targetRow['ESTOQUE ATUAL'] || targetRow[' Estoque Atual'] || targetRow['G'] || 0);
    // Fallback to calculation if not found
    if (estoqueAtual === 0) {
      estoqueAtual = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
    }
    
    const dataRow = String(targetRow['Data'] || targetRow['DATA'] || targetRow[' Data'] || today);

    return {
      title: 'Resumo Geral',
      sheetName: 'Geral',
      data: dataRow || today,
      descricao: 'Resumo Diário',
      estoqueAtual,
      estoqueAnterior,
      entradas: entrada,
      saidas: saidaComboios + saidaEquipamentos
    };
  }, [geralData.rows, today]);

  // Extract stock data for each location - CORRECTLY MAPPED TO SHEETS
  const estoqueTanque01 = useMemo(() => 
    extractStockData(estoqueCanteiro01Data, 'Tanque Canteiro 01', 'EstoqueCanteiro01'),
    [estoqueCanteiro01Data]
  );

  const estoqueTanque02 = useMemo(() => 
    extractStockData(estoqueCanteiro02Data, 'Tanque Canteiro 02', 'EstoqueCanteiro02'),
    [estoqueCanteiro02Data]
  );

  const estoqueComboio01 = useMemo(() => 
    extractStockData(estoqueComboio01Data, 'Comboio 01', 'EstoqueComboio01'),
    [estoqueComboio01Data]
  );

  const estoqueComboio02 = useMemo(() => 
    extractStockData(estoqueComboio02Data, 'Comboio 02', 'EstoqueComboio02'),
    [estoqueComboio02Data]
  );

  const estoqueComboio03 = useMemo(() => 
    extractStockData(estoqueComboio03Data, 'Comboio 03', 'EstoqueComboio03'),
    [estoqueComboio03Data]
  );

  // Get the sheet data for the expanded card
  const getExpandedSheetData = (): { title: string; data: SheetData } => {
    switch (expandedCard) {
      case 'geral':
        return { title: 'Resumo Geral (Geral)', data: geralData };
      case 'tanque01':
        return { title: 'Tanque Canteiro 01 (EstoqueCanteiro01)', data: estoqueCanteiro01Data };
      case 'tanque02':
        return { title: 'Tanque Canteiro 02 (EstoqueCanteiro02)', data: estoqueCanteiro02Data };
      case 'comboio01':
        return { title: 'Comboio 01 (EstoqueComboio01)', data: estoqueComboio01Data };
      case 'comboio02':
        return { title: 'Comboio 02 (EstoqueComboio02)', data: estoqueComboio02Data };
      case 'comboio03':
        return { title: 'Comboio 03 (EstoqueComboio03)', data: estoqueComboio03Data };
      default:
        return { title: '', data: { headers: [], rows: [] } };
    }
  };

  const expandedData = getExpandedSheetData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Painel de Estoque</h2>
            <p className="text-sm text-muted-foreground">Dados sincronizados das planilhas</p>
          </div>
        </div>
      </div>

      {/* Resumo Geral - Full Width com Design Especial */}
      <ResumoGeralCard 
        data={movimentoDiario}
        onExpand={() => setExpandedCard('geral')}
      />

      {/* Section: Tanques */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Fuel className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tanques Canteiro</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StockCard 
            data={estoqueTanque01} 
            variant="tanque"
            onExpand={() => setExpandedCard('tanque01')}
          />
          <StockCard 
            data={estoqueTanque02} 
            showSaida 
            variant="tanque"
            onExpand={() => setExpandedCard('tanque02')}
          />
        </div>
      </div>

      {/* Section: Comboios */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Truck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Comboios</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StockCard 
            data={estoqueComboio01} 
            variant="comboio"
            onExpand={() => setExpandedCard('comboio01')}
          />
          <StockCard 
            data={estoqueComboio02} 
            variant="comboio"
            onExpand={() => setExpandedCard('comboio02')}
          />
          <StockCard 
            data={estoqueComboio03} 
            variant="comboio"
            onExpand={() => setExpandedCard('comboio03')}
          />
        </div>
      </div>

      {/* History Modal */}
      <StockHistoryModal
        open={expandedCard !== null}
        onClose={() => setExpandedCard(null)}
        title={expandedData.title}
        sheetData={expandedData.data}
      />
    </div>
  );
}
