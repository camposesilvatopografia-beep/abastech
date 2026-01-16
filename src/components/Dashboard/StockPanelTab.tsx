import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Package2, Calendar, ArrowUp, ArrowDown, Maximize2, LayoutGrid, Fuel, Truck, Building } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
}> = {
  geral: {
    gradient: 'bg-gradient-to-br from-blue-500/10 via-background to-indigo-500/5',
    border: 'border-blue-500/30 hover:border-blue-500/50',
    icon: LayoutGrid,
    iconBg: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    titleColor: 'text-blue-700 dark:text-blue-400'
  },
  tanque: {
    gradient: 'bg-gradient-to-br from-emerald-500/10 via-background to-teal-500/5',
    border: 'border-emerald-500/30 hover:border-emerald-500/50',
    icon: Fuel,
    iconBg: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    titleColor: 'text-emerald-700 dark:text-emerald-400'
  },
  comboio: {
    gradient: 'bg-gradient-to-br from-amber-500/10 via-background to-orange-500/5',
    border: 'border-amber-500/30 hover:border-amber-500/50',
    icon: Truck,
    iconBg: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
    titleColor: 'text-amber-700 dark:text-amber-400'
  }
};

function StockCard({ 
  data, 
  showSaida = false,
  onExpand,
  variant = 'geral'
}: { 
  data: StockCardData; 
  showSaida?: boolean;
  onExpand?: () => void;
  variant?: CardVariant;
}) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const styles = cardStyles[variant];
  const IconComponent = styles.icon;

  return (
    <Card className={cn(
      "relative border-2 hover:shadow-lg transition-all duration-300",
      styles.gradient,
      styles.border
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", styles.iconBg)}>
              <IconComponent className="h-4 w-4" />
            </div>
            <CardTitle className={cn("text-base font-bold tracking-tight", styles.titleColor)}>
              {data.title}
            </CardTitle>
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
              {showSaida ? 'Entradas' : 'Entrada'}
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

function extractStockData(sheetData: SheetData, localName: string): StockCardData {
  const today = format(new Date(), 'dd/MM/yyyy');
  
  if (!sheetData.rows || sheetData.rows.length === 0) {
    return {
      title: localName,
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
  
  // Try to extract values from different possible column names
  const estoqueAtual = parseNumber(
    lastRow['EstoqueAtual'] || 
    lastRow['Estoque Atual'] || 
    lastRow['ESTOQUE_ATUAL'] || 
    lastRow['ESTOQUE ATUAL'] ||
    lastRow['Estoque atual'] ||
    lastRow['H'] || // Column H often contains current stock
    0
  );
  
  const estoqueAnterior = parseNumber(
    lastRow['EstoqueAnterior'] || 
    lastRow['Estoque Anterior'] || 
    lastRow['ESTOQUE_ANTERIOR'] || 
    lastRow['ESTOQUE ANTERIOR'] ||
    lastRow['Estoque anterior'] ||
    0
  );
  
  const entradas = parseNumber(
    lastRow['Entrada'] || 
    lastRow['Entradas'] || 
    lastRow['ENTRADA'] || 
    lastRow['ENTRADAS'] ||
    0
  );
  
  const saidas = parseNumber(
    lastRow['Saida'] || 
    lastRow['Saída'] || 
    lastRow['Saidas'] || 
    lastRow['Saídas'] ||
    lastRow['SAIDA'] || 
    lastRow['SAÍDA'] ||
    0
  );

  const dataRow = String(
    lastRow['Data'] || 
    lastRow['DATA'] || 
    lastRow['data'] ||
    today
  );

  return {
    title: localName,
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
        title: 'Movimento Diário',
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
      const rowDate = String(row['Data'] || row['DATA'] || '').trim();
      return rowDate === todayFormatted;
    });

    if (!targetRow && geralData.rows.length > 0) {
      targetRow = geralData.rows[geralData.rows.length - 1];
    }

    if (!targetRow) {
      return {
        title: 'Movimento Diário',
        data: today,
        descricao: 'Resumo Diário',
        estoqueAtual: 0,
        estoqueAnterior: 0,
        entradas: 0,
        saidas: 0
      };
    }

    const estoqueAnterior = parseNumber(targetRow['Estoque Anterior'] || targetRow['ESTOQUE ANTERIOR'] || 0);
    const entrada = parseNumber(targetRow['Entrada'] || targetRow['ENTRADA'] || 0);
    const saidaComboios = parseNumber(targetRow['Saida para Comboios'] || targetRow['SAIDA PARA COMBOIOS'] || 0);
    const saidaEquipamentos = parseNumber(targetRow['Saida para Equipamentos'] || targetRow['SAIDA PARA EQUIPAMENTOS'] || 0);
    // Try to get Estoque Atual from column G first
    let estoqueAtual = parseNumber(targetRow['Estoque Atual'] || targetRow['ESTOQUE ATUAL'] || targetRow['G'] || 0);
    // Fallback to calculation if not found
    if (estoqueAtual === 0) {
      estoqueAtual = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
    }
    
    const dataRow = String(targetRow['Data'] || targetRow['DATA'] || today);

    return {
      title: 'Movimento Diário',
      data: dataRow || today,
      descricao: 'Resumo Diário',
      estoqueAtual,
      estoqueAnterior,
      entradas: entrada,
      saidas: saidaComboios + saidaEquipamentos
    };
  }, [geralData.rows, today]);

  // Extract stock data for each location
  const estoqueTanque01 = useMemo(() => 
    extractStockData(estoqueCanteiro01Data, 'Tanque Canteiro 01'),
    [estoqueCanteiro01Data]
  );

  const estoqueTanque02 = useMemo(() => 
    extractStockData(estoqueCanteiro02Data, 'Tanque Canteiro 02'),
    [estoqueCanteiro02Data]
  );

  const estoqueComboio01 = useMemo(() => 
    extractStockData(estoqueComboio01Data, 'Comboio 01'),
    [estoqueComboio01Data]
  );

  const estoqueComboio02 = useMemo(() => 
    extractStockData(estoqueComboio02Data, 'Comboio 02'),
    [estoqueComboio02Data]
  );

  const estoqueComboio03 = useMemo(() => 
    extractStockData(estoqueComboio03Data, 'Comboio 03'),
    [estoqueComboio03Data]
  );

  // Get the sheet data for the expanded card
  const getExpandedSheetData = (): { title: string; data: SheetData } => {
    switch (expandedCard) {
      case 'geral':
        return { title: 'Movimento Diário', data: geralData };
      case 'tanque01':
        return { title: 'Tanque Canteiro 01', data: estoqueCanteiro01Data };
      case 'tanque02':
        return { title: 'Tanque Canteiro 02', data: estoqueCanteiro02Data };
      case 'comboio01':
        return { title: 'Comboio 01', data: estoqueComboio01Data };
      case 'comboio02':
        return { title: 'Comboio 02', data: estoqueComboio02Data };
      case 'comboio03':
        return { title: 'Comboio 03', data: estoqueComboio03Data };
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
            <p className="text-sm text-muted-foreground">Visão geral de todos os estoques</p>
          </div>
        </div>
      </div>

      {/* Movimento Diário - Full Width */}
      <div className="w-full">
        <StockCard 
          data={movimentoDiario} 
          showSaida 
          variant="geral"
          onExpand={() => setExpandedCard('geral')}
        />
      </div>

      {/* Section: Tanques */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
        <div className="flex items-center gap-2">
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
