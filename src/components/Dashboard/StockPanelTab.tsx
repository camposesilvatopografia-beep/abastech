import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Package2, Calendar, ArrowUp, ArrowDown, Maximize2, Fuel, Truck, Database, RefreshCw } from 'lucide-react';
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

type CardVariant = 'geral' | 'tanque' | 'comboio';

const cardColors: Record<CardVariant, {
  bg: string;
  border: string;
  header: string;
  icon: string;
}> = {
  geral: {
    bg: 'bg-gradient-to-br from-indigo-600 to-blue-700 dark:from-indigo-700 dark:to-blue-800',
    border: 'ring-2 ring-indigo-400/50',
    header: 'text-white',
    icon: 'text-white/80'
  },
  tanque: {
    bg: 'bg-card',
    border: 'border-2 border-emerald-500/40',
    header: 'text-emerald-700 dark:text-emerald-400',
    icon: 'text-emerald-600 dark:text-emerald-400'
  },
  comboio: {
    bg: 'bg-card',
    border: 'border-2 border-amber-500/40',
    header: 'text-amber-700 dark:text-amber-400',
    icon: 'text-amber-600 dark:text-amber-400'
  }
};

function StockCard({ 
  data, 
  variant = 'tanque',
  onExpand
}: { 
  data: StockCardData; 
  variant?: CardVariant;
  onExpand?: () => void;
}) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const colors = cardColors[variant];
  const isGeral = variant === 'geral';

  return (
    <Card className={cn(
      "relative overflow-hidden transition-all duration-200 hover:shadow-lg",
      colors.bg,
      colors.border,
      isGeral && "text-white"
    )}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {variant === 'tanque' && <Fuel className={cn("h-4 w-4", colors.icon)} />}
            {variant === 'comboio' && <Truck className={cn("h-4 w-4", colors.icon)} />}
            {variant === 'geral' && <Package2 className={cn("h-4 w-4", colors.icon)} />}
            <CardTitle className={cn("text-sm font-bold", colors.header)}>
              {data.title}
            </CardTitle>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "h-6 w-6 rounded-full",
              isGeral ? "hover:bg-white/20 text-white/70 hover:text-white" : "hover:bg-muted"
            )}
            onClick={onExpand}
            title="Ver histórico"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Badge 
          variant="outline" 
          className={cn(
            "text-[9px] w-fit mt-1 font-mono",
            isGeral ? "bg-white/10 text-white/80 border-white/20" : "text-muted-foreground"
          )}
        >
          <Database className="h-2.5 w-2.5 mr-1" />
          {data.sheetName}
        </Badge>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-2 space-y-3">
        {/* Data */}
        <div className="flex items-center justify-center gap-1.5">
          <Calendar className={cn("h-3.5 w-3.5", isGeral ? "text-white/60" : "text-muted-foreground")} />
          <span className={cn("text-xs font-medium", isGeral ? "text-white/80" : "text-muted-foreground")}>
            {data.data}
          </span>
        </div>

        {/* Estoque Atual - Destaque */}
        <div className={cn(
          "text-center py-3 rounded-lg",
          isGeral ? "bg-white/10" : "bg-primary/5 border border-primary/20"
        )}>
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            isGeral ? "text-white/60" : "text-muted-foreground"
          )}>
            Estoque Atual
          </span>
          <div className="flex items-center justify-center gap-2 mt-1">
            <Package2 className={cn("h-5 w-5", isGeral ? "text-blue-200" : "text-primary")} />
            <span className={cn(
              "text-2xl font-black tracking-tight",
              isGeral ? "text-white" : "text-primary"
            )}>
              {formatNumber(data.estoqueAtual)}
            </span>
          </div>
        </div>

        {/* Estoque Anterior */}
        <div className={cn(
          "text-center py-2 rounded-lg",
          isGeral ? "bg-amber-500/20" : "bg-amber-500/10 border border-amber-500/20"
        )}>
          <span className={cn(
            "text-[9px] font-semibold uppercase tracking-wider",
            isGeral ? "text-amber-200" : "text-amber-700 dark:text-amber-400"
          )}>
            Estoque Anterior
          </span>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <Package2 className={cn("h-3.5 w-3.5", isGeral ? "text-amber-300" : "text-amber-600 dark:text-amber-500")} />
            <span className={cn(
              "text-sm font-bold",
              isGeral ? "text-amber-100" : "text-amber-700 dark:text-amber-400"
            )}>
              {formatNumber(data.estoqueAnterior)}
            </span>
          </div>
        </div>

        {/* Entradas */}
        <div className={cn(
          "text-center py-2 rounded-lg",
          isGeral ? "bg-emerald-500/20" : "bg-emerald-500/10 border border-emerald-500/20"
        )}>
          <span className={cn(
            "text-[9px] font-semibold uppercase tracking-wider",
            isGeral ? "text-emerald-200" : "text-emerald-700 dark:text-emerald-400"
          )}>
            Entrada
          </span>
          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            <ArrowUp className={cn("h-3.5 w-3.5", isGeral ? "text-emerald-300" : "text-emerald-600 dark:text-emerald-500")} />
            <span className={cn(
              "text-sm font-bold",
              isGeral ? "text-emerald-100" : "text-emerald-700 dark:text-emerald-400"
            )}>
              {formatNumber(data.entradas)}
            </span>
          </div>
        </div>

        {/* Saídas */}
        {data.saidas !== undefined && (
          <div className={cn(
            "text-center py-2 rounded-lg",
            isGeral ? "bg-rose-500/20" : "bg-rose-500/10 border border-rose-500/20"
          )}>
            <span className={cn(
              "text-[9px] font-semibold uppercase tracking-wider",
              isGeral ? "text-rose-200" : "text-rose-700 dark:text-rose-400"
            )}>
              Saída
            </span>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <ArrowDown className={cn("h-3.5 w-3.5", isGeral ? "text-rose-300" : "text-rose-600 dark:text-rose-500")} />
              <span className={cn(
                "text-sm font-bold",
                isGeral ? "text-rose-100" : "text-rose-700 dark:text-rose-400"
              )}>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Histórico Geral</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Atualização automática</span>
        </div>
      </div>

      {/* Grid de Cards - Layout Original */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Movimento Diário */}
        <StockCard 
          data={resumoGeral}
          variant="geral"
          onExpand={() => setExpandedCard('geral')}
        />

        {/* Tanque Canteiro 01 */}
        <StockCard 
          data={estoqueTanque01}
          variant="tanque"
          onExpand={() => setExpandedCard('tanque01')}
        />

        {/* Tanque Canteiro 02 */}
        <StockCard 
          data={estoqueTanque02}
          variant="tanque"
          onExpand={() => setExpandedCard('tanque02')}
        />

        {/* Comboio 01 */}
        <StockCard 
          data={estoqueComboio01}
          variant="comboio"
          onExpand={() => setExpandedCard('comboio01')}
        />

        {/* Comboio 02 */}
        <StockCard 
          data={estoqueComboio02}
          variant="comboio"
          onExpand={() => setExpandedCard('comboio02')}
        />

        {/* Comboio 03 */}
        <StockCard 
          data={estoqueComboio03}
          variant="comboio"
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
