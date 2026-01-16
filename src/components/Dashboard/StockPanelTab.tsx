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

const cardStyles: Record<CardVariant, {
  bg: string;
  text: string;
  accent: string;
  icon: typeof Package2;
}> = {
  geral: {
    bg: 'bg-[#1e3a5f] dark:bg-[#0f2744]', // Navy blue
    text: 'text-white',
    accent: 'text-blue-200',
    icon: BarChart3
  },
  tanque01: {
    bg: 'bg-emerald-600 dark:bg-emerald-700',
    text: 'text-white',
    accent: 'text-emerald-100',
    icon: Fuel
  },
  tanque02: {
    bg: 'bg-teal-600 dark:bg-teal-700',
    text: 'text-white',
    accent: 'text-teal-100',
    icon: Fuel
  },
  comboio01: {
    bg: 'bg-amber-500 dark:bg-amber-600',
    text: 'text-white',
    accent: 'text-amber-100',
    icon: Truck
  },
  comboio02: {
    bg: 'bg-orange-500 dark:bg-orange-600',
    text: 'text-white',
    accent: 'text-orange-100',
    icon: Truck
  },
  comboio03: {
    bg: 'bg-rose-500 dark:bg-rose-600',
    text: 'text-white',
    accent: 'text-rose-100',
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

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-200 hover:shadow-xl hover:scale-[1.02] border-0",
      styles.bg
    )}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconComponent className={cn("h-4 w-4", styles.accent)} />
            <CardTitle className={cn("text-sm font-bold", styles.text)}>
              {data.title}
            </CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 rounded-full hover:bg-white/20 text-white/70 hover:text-white"
            onClick={onExpand}
            title="Ver histórico"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge 
            variant="outline" 
            className="text-[9px] font-mono bg-white/10 text-white/80 border-white/20"
          >
            <Database className="h-2.5 w-2.5 mr-1" />
            {data.sheetName}
          </Badge>
          <div className="flex items-center gap-1 text-white/60">
            <Calendar className="h-3 w-3" />
            <span className="text-[10px]">{data.data}</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-1 space-y-2">
        {/* Estoque Atual - Destaque */}
        <div className="text-center py-3 bg-white/10 rounded-lg backdrop-blur-sm">
          <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
            Estoque Atual
          </span>
          <div className="flex items-center justify-center gap-2 mt-1">
            <Package2 className="h-5 w-5 text-white/80" />
            <span className="text-2xl font-black text-white tracking-tight">
              {formatNumber(data.estoqueAtual)}
            </span>
            <span className="text-xs text-white/50">L</span>
          </div>
        </div>

        {/* Métricas em linha */}
        <div className="grid grid-cols-3 gap-2">
          {/* Estoque Anterior */}
          <div className="text-center py-2 bg-white/5 rounded-md">
            <span className="text-[8px] font-semibold text-amber-200 uppercase tracking-wider block">
              Anterior
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Package2 className="h-3 w-3 text-amber-300" />
              <span className="text-xs font-bold text-amber-100">
                {formatNumber(data.estoqueAnterior)}
              </span>
            </div>
          </div>

          {/* Entradas */}
          <div className="text-center py-2 bg-white/5 rounded-md">
            <span className="text-[8px] font-semibold text-emerald-200 uppercase tracking-wider block">
              Entrada
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <ArrowUp className="h-3 w-3 text-emerald-300" />
              <span className="text-xs font-bold text-emerald-100">
                {formatNumber(data.entradas)}
              </span>
            </div>
          </div>

          {/* Saídas */}
          <div className="text-center py-2 bg-white/5 rounded-md">
            <span className="text-[8px] font-semibold text-rose-200 uppercase tracking-wider block">
              Saída
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <ArrowDown className="h-3 w-3 text-rose-300" />
              <span className="text-xs font-bold text-rose-100">
                {formatNumber(data.saidas || 0)}
              </span>
            </div>
          </div>
        </div>
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
      estoqueAtual: 0,
      estoqueAnterior: 0,
      entradas: 0,
      saidas: 0
    };
  }

  const lastRow = sheetData.rows[sheetData.rows.length - 1];
  
  const getColumnValue = (row: any, ...keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
      const trimmedKey = key.trim();
      if (row[trimmedKey] !== undefined && row[trimmedKey] !== null && row[trimmedKey] !== '') return row[trimmedKey];
      if (row[` ${key}`] !== undefined && row[` ${key}`] !== null && row[` ${key}`] !== '') return row[` ${key}`];
    }
    return 0;
  };

  const estoqueAtual = parseNumber(getColumnValue(lastRow,
    'EstoqueAtual', 'Estoque Atual', 'ESTOQUE_ATUAL', 'ESTOQUE ATUAL', 'Estoque atual', 'H'
  ));
  
  const estoqueAnterior = parseNumber(getColumnValue(lastRow,
    'EstoqueAnterior', 'Estoque Anterior', 'ESTOQUE_ANTERIOR', 'ESTOQUE ANTERIOR', 'Estoque anterior'
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
        title: 'Movimento Diário',
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
      const rowDate = String(row['Data'] || row['DATA'] || row[' Data'] || '').trim();
      return rowDate === todayFormatted;
    });

    if (!targetRow && geralData.rows.length > 0) {
      targetRow = geralData.rows[geralData.rows.length - 1];
    }

    if (!targetRow) {
      return {
        title: 'Movimento Diário',
        sheetName: 'Geral',
        data: today,
        estoqueAtual: 0,
        estoqueAnterior: 0,
        entradas: 0,
        saidas: 0
      };
    }

    const estoqueAnterior = parseNumber(targetRow['Estoque Anterior'] || targetRow['ESTOQUE ANTERIOR'] || targetRow[' Estoque Anterior'] || 0);
    const entrada = parseNumber(targetRow['Entrada'] || targetRow['ENTRADA'] || targetRow[' Entrada'] || 0);
    const saidaComboios = parseNumber(targetRow['Saida para Comboios'] || targetRow['SAIDA PARA COMBOIOS'] || 0);
    const saidaEquipamentos = parseNumber(targetRow['Saida para Equipamentos'] || targetRow['SAIDA PARA EQUIPAMENTOS'] || 0);
    
    let estoqueAtual = parseNumber(targetRow['Estoque Atual'] || targetRow['ESTOQUE ATUAL'] || targetRow['G'] || 0);
    if (estoqueAtual === 0) {
      estoqueAtual = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
    }
    
    const dataRow = String(targetRow['Data'] || targetRow['DATA'] || today);

    return {
      title: 'Movimento Diário',
      sheetName: 'Geral',
      data: dataRow || today,
      estoqueAtual,
      estoqueAnterior,
      entradas: entrada,
      saidas: saidaComboios + saidaEquipamentos
    };
  }, [geralData.rows, today]);

  // Extract stock data - CORRECTLY MAPPED
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

  const getExpandedSheetData = (): { title: string; data: SheetData } => {
    switch (expandedCard) {
      case 'geral':
        return { title: 'Movimento Diário (Geral)', data: geralData };
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
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl p-4 shadow-lg">
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
            <span className="text-xs text-white/80 font-medium">Atualização automática</span>
          </div>
        </div>
      </div>

      {/* Grid de Cards - Todos lado a lado, mesmo tamanho */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Movimento Diário - Navy Blue */}
        <StockCard 
          data={resumoGeral}
          variant="geral"
          onExpand={() => setExpandedCard('geral')}
        />

        {/* Tanque Canteiro 01 - Emerald */}
        <StockCard 
          data={estoqueTanque01}
          variant="tanque01"
          onExpand={() => setExpandedCard('tanque01')}
        />

        {/* Tanque Canteiro 02 - Teal */}
        <StockCard 
          data={estoqueTanque02}
          variant="tanque02"
          onExpand={() => setExpandedCard('tanque02')}
        />

        {/* Comboio 01 - Amber */}
        <StockCard 
          data={estoqueComboio01}
          variant="comboio01"
          onExpand={() => setExpandedCard('comboio01')}
        />

        {/* Comboio 02 - Orange */}
        <StockCard 
          data={estoqueComboio02}
          variant="comboio02"
          onExpand={() => setExpandedCard('comboio02')}
        />

        {/* Comboio 03 - Rose */}
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
