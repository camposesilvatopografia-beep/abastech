import { useMemo } from 'react';
import { format } from 'date-fns';
import { Package2, Calendar, ArrowUp, ArrowDown, Maximize2, LayoutGrid } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SheetData } from '@/lib/googleSheets';

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

function StockCard({ 
  data, 
  showSaida = false 
}: { 
  data: StockCardData; 
  showSaida?: boolean;
}) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Card className="relative bg-card border border-border hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">{data.title}</CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Data */}
        <div className="text-center">
          <span className="text-xs text-muted-foreground">Data</span>
          <div className="flex items-center justify-center gap-1.5 text-primary">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">{data.data}</span>
          </div>
        </div>

        {/* Local / Descrição */}
        {(data.local || data.descricao) && (
          <div className="text-center">
            <span className="text-xs text-muted-foreground">
              {data.local ? 'Local' : 'Descricao'}
            </span>
            <div className="font-semibold text-foreground text-sm">
              {data.local || data.descricao}
            </div>
          </div>
        )}

        {/* Estoque Atual */}
        <div className="text-center">
          <span className="text-xs text-muted-foreground">Estoque Atual</span>
          <div className="flex items-center justify-center gap-1.5 text-primary">
            <Package2 className="h-4 w-4" />
            <span className="text-lg font-bold">{formatNumber(data.estoqueAtual)}</span>
          </div>
        </div>

        {/* Estoque Anterior */}
        <div className="text-center">
          <span className="text-xs text-muted-foreground">Estoque Anterior</span>
          <div className="flex items-center justify-center gap-1.5 text-amber-600 dark:text-amber-500">
            <Package2 className="h-4 w-4" />
            <span className="text-sm font-medium">{formatNumber(data.estoqueAnterior)}</span>
          </div>
        </div>

        {/* Entradas */}
        <div className="text-center">
          <span className="text-xs text-muted-foreground">
            {showSaida ? 'Entradas' : 'Entrada'}
          </span>
          <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-500">
            <ArrowUp className="h-4 w-4" />
            <span className="text-sm font-medium">{formatNumber(data.entradas)}</span>
          </div>
        </div>

        {/* Saídas (optional) */}
        {showSaida && data.saidas !== undefined && (
          <div className="text-center">
            <span className="text-xs text-muted-foreground">Saida</span>
            <div className="flex items-center justify-center gap-1.5 text-rose-600 dark:text-rose-500">
              <ArrowDown className="h-4 w-4" />
              <span className="text-sm font-medium">{formatNumber(data.saidas)}</span>
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
    lastRow['H'] || // Column H often contains current stock
    0
  );
  
  const estoqueAnterior = parseNumber(
    lastRow['EstoqueAnterior'] || 
    lastRow['Estoque Anterior'] || 
    lastRow['ESTOQUE_ANTERIOR'] || 
    lastRow['ESTOQUE ANTERIOR'] ||
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
    const estoqueAtual = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
    
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Histórico Geral</h2>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <LayoutGrid className="w-4 h-4" />
        </Button>
      </div>

      {/* Stock Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Movimento Diário */}
        <StockCard data={movimentoDiario} showSaida />

        {/* Estoque Tanque 01 */}
        <StockCard data={estoqueTanque01} />

        {/* Estoque Tanque 02 */}
        <StockCard data={estoqueTanque02} showSaida />

        {/* Estoque Comboio 03 */}
        <StockCard data={estoqueComboio03} />

        {/* Estoque Comboio 01 */}
        <StockCard data={estoqueComboio01} />

        {/* Estoque Comboio 02 */}
        <StockCard data={estoqueComboio02} />
      </div>
    </div>
  );
}
