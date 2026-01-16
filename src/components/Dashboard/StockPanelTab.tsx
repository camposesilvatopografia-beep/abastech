import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Package2, Calendar, ArrowUp, ArrowDown, Maximize2, Fuel, Truck, Database, RefreshCw, BarChart3 } from 'lucide-react';
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
  estoqueAtual: number;
  estoqueAnterior: number;
  entradas: number;
  saidas?: number;
}

type CardVariant = 'geral' | 'tanque01' | 'tanque02' | 'comboio01' | 'comboio02' | 'comboio03';

// Cores mais suaves, com destaque forte apenas para o Resumo Geral
const cardStyles: Record<CardVariant, {
  bg: string;
  headerBg: string;
  text: string;
  subtext: string;
  icon: typeof Package2;
}> = {
  geral: {
    bg: 'bg-gradient-to-br from-[#1a365d] via-[#1e3a5f] to-[#234876]', // Navy blue forte
    headerBg: 'bg-white/10',
    text: 'text-white',
    subtext: 'text-white/70',
    icon: BarChart3
  },
  tanque01: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800',
    headerBg: 'bg-emerald-100 dark:bg-emerald-900/50',
    text: 'text-emerald-900 dark:text-emerald-100',
    subtext: 'text-emerald-600 dark:text-emerald-400',
    icon: Fuel
  },
  tanque02: {
    bg: 'bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800',
    headerBg: 'bg-teal-100 dark:bg-teal-900/50',
    text: 'text-teal-900 dark:text-teal-100',
    subtext: 'text-teal-600 dark:text-teal-400',
    icon: Fuel
  },
  comboio01: {
    bg: 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800',
    headerBg: 'bg-amber-100 dark:bg-amber-900/50',
    text: 'text-amber-900 dark:text-amber-100',
    subtext: 'text-amber-600 dark:text-amber-400',
    icon: Truck
  },
  comboio02: {
    bg: 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800',
    headerBg: 'bg-orange-100 dark:bg-orange-900/50',
    text: 'text-orange-900 dark:text-orange-100',
    subtext: 'text-orange-600 dark:text-orange-400',
    icon: Truck
  },
  comboio03: {
    bg: 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800',
    headerBg: 'bg-rose-100 dark:bg-rose-900/50',
    text: 'text-rose-900 dark:text-rose-100',
    subtext: 'text-rose-600 dark:text-rose-400',
    icon: Truck
  }
};

function StockCard({ 
  data, 
  variant,
  onExpand
}: { 
  data: StockCardData; 
  variant: CardVariant;
  onExpand?: () => void;
}) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const styles = cardStyles[variant];
  const IconComponent = styles.icon;
  const isGeral = variant === 'geral';

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-200 hover:shadow-lg",
      styles.bg,
      isGeral && "shadow-xl"
    )}>
      <CardHeader className={cn("pb-2 pt-3 px-4", styles.headerBg)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconComponent className={cn("h-4 w-4", styles.subtext)} />
            <CardTitle className={cn("text-sm font-bold", styles.text)}>
              {data.title}
            </CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "h-6 w-6 rounded-full",
              isGeral ? "hover:bg-white/20 text-white/70" : "hover:bg-black/5 dark:hover:bg-white/10"
            )}
            onClick={onExpand}
            title="Ver histórico"
          >
            <Maximize2 className={cn("h-3.5 w-3.5", isGeral ? "text-white/70" : styles.subtext)} />
          </Button>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge 
            variant="outline" 
            className={cn(
              "text-[9px] font-mono",
              isGeral ? "bg-white/10 text-white/80 border-white/20" : "bg-white/50 dark:bg-black/20"
            )}
          >
            <Database className="h-2.5 w-2.5 mr-1" />
            {data.sheetName}
          </Badge>
          <div className={cn("flex items-center gap-1", styles.subtext)}>
            <Calendar className="h-3 w-3" />
            <span className="text-[10px]">{data.data}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-3 space-y-2">
        {/* Estoque Atual - Destaque */}
        <div className={cn(
          "text-center py-3 rounded-lg",
          isGeral ? "bg-white/10" : "bg-white dark:bg-black/20 shadow-sm"
        )}>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            isGeral ? "text-white/60" : "text-muted-foreground"
          )}>
            Estoque Atual
          </span>
          <div className="flex items-center justify-center gap-2 mt-1">
            <Package2 className={cn("h-5 w-5", isGeral ? "text-blue-300" : "text-primary")} />
            <span className={cn(
              "text-2xl font-black tracking-tight",
              isGeral ? "text-white" : "text-primary"
            )}>
              {formatNumber(data.estoqueAtual)}
            </span>
            <span className={cn("text-xs", isGeral ? "text-white/50" : "text-muted-foreground")}>L</span>
          </div>
        </div>

        {/* Métricas em linha */}
        <div className="grid grid-cols-3 gap-2">
          {/* Estoque Anterior */}
          <div className={cn(
            "text-center py-2 rounded-md",
            isGeral ? "bg-amber-500/20" : "bg-amber-100 dark:bg-amber-900/30"
          )}>
            <span className={cn(
              "text-[8px] font-semibold uppercase tracking-wider block",
              isGeral ? "text-amber-200" : "text-amber-700 dark:text-amber-400"
            )}>
              Anterior
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Package2 className={cn("h-3 w-3", isGeral ? "text-amber-300" : "text-amber-600 dark:text-amber-400")} />
              <span className={cn(
                "text-xs font-bold",
                isGeral ? "text-amber-100" : "text-amber-800 dark:text-amber-300"
              )}>
                {formatNumber(data.estoqueAnterior)}
              </span>
            </div>
          </div>

          {/* Entradas */}
          <div className={cn(
            "text-center py-2 rounded-md",
            isGeral ? "bg-emerald-500/20" : "bg-emerald-100 dark:bg-emerald-900/30"
          )}>
            <span className={cn(
              "text-[8px] font-semibold uppercase tracking-wider block",
              isGeral ? "text-emerald-200" : "text-emerald-700 dark:text-emerald-400"
            )}>
              Entrada
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <ArrowUp className={cn("h-3 w-3", isGeral ? "text-emerald-300" : "text-emerald-600 dark:text-emerald-400")} />
              <span className={cn(
                "text-xs font-bold",
                isGeral ? "text-emerald-100" : "text-emerald-800 dark:text-emerald-300"
              )}>
                {formatNumber(data.entradas)}
              </span>
            </div>
          </div>

          {/* Saídas */}
          <div className={cn(
            "text-center py-2 rounded-md",
            isGeral ? "bg-rose-500/20" : "bg-rose-100 dark:bg-rose-900/30"
          )}>
            <span className={cn(
              "text-[8px] font-semibold uppercase tracking-wider block",
              isGeral ? "text-rose-200" : "text-rose-700 dark:text-rose-400"
            )}>
              Saída
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <ArrowDown className={cn("h-3 w-3", isGeral ? "text-rose-300" : "text-rose-600 dark:text-rose-400")} />
              <span className={cn(
                "text-xs font-bold",
                isGeral ? "text-rose-100" : "text-rose-800 dark:text-rose-300"
              )}>
                {formatNumber(data.saidas || 0)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Extração de dados para COMBOIOS - Headers: Data, Estoque Anterior, Saida, Entrada, Estoque Atual
function extractComboioData(sheetData: SheetData, localName: string, sheetName: string): StockCardData {
  const today = format(new Date(), 'dd/MM/yyyy');
  
  if (!sheetData.rows || sheetData.rows.length === 0) {
    return {
      title: localName,
      sheetName,
      data: today,
      estoqueAtual: 0,
      estoqueAnterior: 0,
      entradas: 0,
      saidas: 0
    };
  }

  // Pegar a última linha (dados mais recentes)
  const lastRow = sheetData.rows[sheetData.rows.length - 1];
  
  // Headers confirmados: Data, Estoque Anterior, Saida, Entrada, Estoque Atual
  const dataRow = String(lastRow['Data'] || today);
  const estoqueAnterior = parseNumber(lastRow['Estoque Anterior']);
  const saidas = parseNumber(lastRow['Saida']);
  const entradas = parseNumber(lastRow['Entrada']);
  const estoqueAtual = parseNumber(lastRow['Estoque Atual']);

  return {
    title: localName,
    sheetName,
    data: dataRow,
    estoqueAtual,
    estoqueAnterior,
    entradas,
    saidas
  };
}

// Extração de dados para TANQUES (mesma estrutura dos comboios)
function extractTanqueData(sheetData: SheetData, localName: string, sheetName: string): StockCardData {
  const today = format(new Date(), 'dd/MM/yyyy');
  
  if (!sheetData.rows || sheetData.rows.length === 0) {
    return {
      title: localName,
      sheetName,
      data: today,
      estoqueAtual: 0,
      estoqueAnterior: 0,
      entradas: 0,
      saidas: 0
    };
  }

  const lastRow = sheetData.rows[sheetData.rows.length - 1];
  
  // Mesma estrutura: Data, Estoque Anterior, Saida, Entrada, Estoque Atual
  const dataRow = String(lastRow['Data'] || today);
  const estoqueAnterior = parseNumber(lastRow['Estoque Anterior']);
  const saidas = parseNumber(lastRow['Saida']);
  const entradas = parseNumber(lastRow['Entrada']);
  const estoqueAtual = parseNumber(lastRow['Estoque Atual']);

  return {
    title: localName,
    sheetName,
    data: dataRow,
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

  // Resumo Geral from GERAL sheet
  const resumoGeral = useMemo<StockCardData>(() => {
    if (!geralData.rows || geralData.rows.length === 0) {
      return {
        title: 'Resumo Geral',
        sheetName: 'Geral',
        data: today,
        estoqueAtual: 0,
        estoqueAnterior: 0,
        entradas: 0,
        saidas: 0
      };
    }

    const todayFormatted = format(new Date(), 'dd/MM/yyyy');
    let targetRow = geralData.rows.find(row => {
      const rowDate = String(row['Data'] || row['DATA'] || row[' Data'] || row['B'] || '').trim();
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
        estoqueAtual: 0,
        estoqueAnterior: 0,
        entradas: 0,
        saidas: 0
      };
    }

    const estoqueAnterior = parseNumber(targetRow['Estoque Anterior'] || targetRow['ESTOQUE ANTERIOR'] || targetRow['C'] || 0);
    const entrada = parseNumber(targetRow['Entrada'] || targetRow['ENTRADA'] || targetRow['E'] || 0);
    const saidaComboios = parseNumber(targetRow['Saida para Comboios'] || targetRow['SAIDA PARA COMBOIOS'] || 0);
    const saidaEquipamentos = parseNumber(targetRow['Saida para Equipamentos'] || targetRow['SAIDA PARA EQUIPAMENTOS'] || 0);
    const saidaTotal = saidaComboios + saidaEquipamentos || parseNumber(targetRow['D'] || 0);
    
    let estoqueAtual = parseNumber(targetRow['Estoque Atual'] || targetRow['ESTOQUE ATUAL'] || targetRow['G'] || targetRow['H'] || 0);
    if (estoqueAtual === 0) {
      estoqueAtual = (estoqueAnterior + entrada) - saidaTotal;
    }
    
    const dataRow = String(targetRow['Data'] || targetRow['DATA'] || targetRow['B'] || today);

    return {
      title: 'Resumo Geral',
      sheetName: 'Geral',
      data: dataRow || today,
      estoqueAtual,
      estoqueAnterior,
      entradas: entrada,
      saidas: saidaTotal
    };
  }, [geralData.rows, today]);

  // Extract stock data - CORRETAMENTE MAPEADO
  const estoqueTanque01 = useMemo(() => 
    extractTanqueData(estoqueCanteiro01Data, 'Tanque Canteiro 01', 'EstoqueCanteiro01'),
    [estoqueCanteiro01Data]
  );

  const estoqueTanque02 = useMemo(() => 
    extractTanqueData(estoqueCanteiro02Data, 'Tanque Canteiro 02', 'EstoqueCanteiro02'),
    [estoqueCanteiro02Data]
  );

  // COMBOIOS - Usando mapeamento correto: B=Data, C=Est.Anterior, D=Saida, E=Entrada, H=Est.Atual
  const estoqueComboio01 = useMemo(() => 
    extractComboioData(estoqueComboio01Data, 'Comboio 01', 'EstoqueComboio01'),
    [estoqueComboio01Data]
  );

  const estoqueComboio02 = useMemo(() => 
    extractComboioData(estoqueComboio02Data, 'Comboio 02', 'EstoqueComboio02'),
    [estoqueComboio02Data]
  );

  const estoqueComboio03 = useMemo(() => 
    extractComboioData(estoqueComboio03Data, 'Comboio 03', 'EstoqueComboio03'),
    [estoqueComboio03Data]
  );

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
    <div className="space-y-4">
      {/* Header com destaque */}
      <div className="bg-gradient-to-r from-[#1a365d] to-[#2d4a7c] rounded-xl p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-lg">
              <Package2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Painel de Estoques</h2>
              <p className="text-sm text-white/70">Visão consolidada de todos os estoques</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-white/70 animate-spin" />
            <span className="text-xs text-white/80 font-medium">Atualizando a cada 10s</span>
          </div>
        </div>
      </div>

      {/* Grid de Cards - Todos lado a lado, mesmo tamanho */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Resumo Geral - Navy Blue FORTE */}
        <StockCard 
          data={resumoGeral}
          variant="geral"
          onExpand={() => setExpandedCard('geral')}
        />

        {/* Tanque Canteiro 01 */}
        <StockCard 
          data={estoqueTanque01}
          variant="tanque01"
          onExpand={() => setExpandedCard('tanque01')}
        />

        {/* Tanque Canteiro 02 */}
        <StockCard 
          data={estoqueTanque02}
          variant="tanque02"
          onExpand={() => setExpandedCard('tanque02')}
        />

        {/* Comboio 01 */}
        <StockCard 
          data={estoqueComboio01}
          variant="comboio01"
          onExpand={() => setExpandedCard('comboio01')}
        />

        {/* Comboio 02 */}
        <StockCard 
          data={estoqueComboio02}
          variant="comboio02"
          onExpand={() => setExpandedCard('comboio02')}
        />

        {/* Comboio 03 */}
        <StockCard 
          data={estoqueComboio03}
          variant="comboio03"
          onExpand={() => setExpandedCard('comboio03')}
        />
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
