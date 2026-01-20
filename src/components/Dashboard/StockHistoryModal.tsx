import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Calendar, Package2, ArrowUp, ArrowDown, History, Table2, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SheetData } from '@/lib/googleSheets';
import { cn } from '@/lib/utils';

interface StockHistoryModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  sheetData: SheetData;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

interface HistoryRow {
  data: string;
  estoqueAnterior: number;
  entrada: number;
  saida: number;
  estoqueAtual: number;
}

function extractHistoryRows(sheetData: SheetData): HistoryRow[] {
  if (!sheetData.rows || sheetData.rows.length === 0) {
    return [];
  }

  return sheetData.rows.map(row => {
    const data = String(
      row['Data'] || row['DATA'] || row['data'] || ''
    );

    const estoqueAnterior = parseNumber(
      row['EstoqueAnterior'] || 
      row['Estoque Anterior'] || 
      row['ESTOQUE_ANTERIOR'] || 
      row['ESTOQUE ANTERIOR'] ||
      0
    );

    const entrada = parseNumber(
      row['Entrada'] || 
      row['Entradas'] || 
      row['ENTRADA'] || 
      row['ENTRADAS'] ||
      0
    );

    const saida = parseNumber(
      row['Saida'] || 
      row['Saída'] || 
      row['Saidas'] || 
      row['Saídas'] ||
      row['SAIDA'] || 
      row['SAÍDA'] ||
      row['Saida para Comboios'] ||
      row['Saida para Equipamentos'] ||
      0
    );

    // Try to calculate saidas for Geral sheet (sum of comboios + equipamentos)
    const saidaComboios = parseNumber(row['Saida para Comboios'] || 0);
    const saidaEquipamentos = parseNumber(row['Saida para Equipamentos'] || 0);
    const totalSaida = saidaComboios + saidaEquipamentos > 0 
      ? saidaComboios + saidaEquipamentos 
      : saida;

    const estoqueAtual = parseNumber(
      row['EstoqueAtual'] || 
      row['Estoque Atual'] || 
      row['ESTOQUE_ATUAL'] || 
      row['ESTOQUE ATUAL'] ||
      row['H'] ||
      0
    );

    return {
      data,
      estoqueAnterior,
      entrada,
      saida: totalSaida,
      estoqueAtual
    };
  }).filter(row => row.data).reverse(); // Most recent first
}

export function StockHistoryModal({ open, onClose, title, sheetData }: StockHistoryModalProps) {
  const historyRows = extractHistoryRows(sheetData);

  // Raw rows (most recent first)
  const rawHeaders = (sheetData.headers || []).filter((h) => String(h).trim() && String(h) !== '_rowIndex');
  const rawRows = (sheetData.rows || []).slice().reverse();

  // Calculate totals (from resumo)
  const totals = historyRows.reduce(
    (acc, row) => ({
      entradas: acc.entradas + row.entrada,
      saidas: acc.saidas + row.saida,
    }),
    { entradas: 0, saidas: 0 }
  );

  const saldo = totals.entradas - totals.saidas;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        {/* Header with navy blue gradient */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Detalhamento</h2>
                <p className="text-sm text-slate-300">{title}</p>
              </div>
            </div>
            <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30">
              {historyRows.length} registros
            </Badge>
          </div>
        </div>

        {/* RESUMO DE ESTOQUE - Summary Bar */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <Package2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-white uppercase tracking-wide">Resumo de Estoque</span>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {/* Registros */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Registros:</span>
              <span className="text-lg font-bold text-white">{historyRows.length}</span>
            </div>
            
            {/* Entradas */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Entradas:</span>
              <span className={cn(
                "text-lg font-bold flex items-center gap-1",
                totals.entradas > 0 ? "text-emerald-400" : "text-slate-400"
              )}>
                {totals.entradas > 0 && <TrendingUp className="h-4 w-4" />}
                +{formatNumber(totals.entradas)} L
              </span>
            </div>
            
            {/* Saídas */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Saídas:</span>
              <span className={cn(
                "text-lg font-bold flex items-center gap-1",
                totals.saidas > 0 ? "text-rose-400" : "text-slate-400"
              )}>
                {totals.saidas > 0 && <TrendingDown className="h-4 w-4" />}
                -{formatNumber(totals.saidas)} L
              </span>
            </div>
            
            {/* Saldo */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">Saldo:</span>
              <span className={cn(
                "text-lg font-bold",
                saldo >= 0 ? "text-sky-400" : "text-rose-400"
              )}>
                {saldo >= 0 ? '+' : ''}{formatNumber(saldo)} L
              </span>
            </div>
          </div>
        </div>

        <Tabs defaultValue="resumo" className="w-full flex flex-col flex-1">
          <div className="px-6 py-3 border-b border-border bg-muted/30">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="resumo" className="gap-2 data-[state=active]:bg-background">
                <History className="h-4 w-4" />
                Resumo
              </TabsTrigger>
              <TabsTrigger value="tabela" className="gap-2 data-[state=active]:bg-background">
                <Table2 className="h-4 w-4" />
                Tabela Completa
              </TabsTrigger>
            </TabsList>
          </div>

          {/* RESUMO (movimentações) */}
          <TabsContent value="resumo" className="m-0 flex-1">
            {/* Summary Cards */}
            <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-border bg-muted/20">
              <div className="bg-background rounded-xl p-4 text-center border border-border shadow-sm">
                <span className="text-xs text-muted-foreground font-medium">Registros</span>
                <div className="text-2xl font-bold text-foreground mt-1">{historyRows.length}</div>
              </div>
              <div className="bg-emerald-500/5 rounded-xl p-4 text-center border border-emerald-500/20 shadow-sm">
                <span className="text-xs text-muted-foreground font-medium">Total Entradas</span>
                <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-emerald-600 dark:text-emerald-500 mt-1">
                  <ArrowUp className="h-5 w-5" />
                  {formatNumber(totals.entradas)}
                </div>
              </div>
              <div className="bg-rose-500/5 rounded-xl p-4 text-center border border-rose-500/20 shadow-sm">
                <span className="text-xs text-muted-foreground font-medium">Total Saídas</span>
                <div className="flex items-center justify-center gap-1.5 text-2xl font-bold text-rose-600 dark:text-rose-500 mt-1">
                  <ArrowDown className="h-5 w-5" />
                  {formatNumber(totals.saidas)}
                </div>
              </div>
              <div className="bg-sky-500/5 rounded-xl p-4 text-center border border-sky-500/20 shadow-sm">
                <span className="text-xs text-muted-foreground font-medium">Saldo</span>
                <div className={cn(
                  "flex items-center justify-center gap-1.5 text-2xl font-bold mt-1",
                  saldo >= 0 ? "text-sky-600 dark:text-sky-500" : "text-rose-600 dark:text-rose-500"
                )}>
                  <Package2 className="h-5 w-5" />
                  {saldo >= 0 ? '+' : ''}{formatNumber(saldo)}
                </div>
              </div>
            </div>

            {/* History Table */}
            <ScrollArea className="h-[360px]">
              {historyRows.length > 0 ? (
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[140px]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          Data
                        </div>
                      </TableHead>
                      <TableHead className="text-right">Est. Anterior</TableHead>
                      <TableHead className="text-right">
                        <span className="text-emerald-600 dark:text-emerald-500">Entrada</span>
                      </TableHead>
                      <TableHead className="text-right">
                        <span className="text-rose-600 dark:text-rose-500">Saída</span>
                      </TableHead>
                      <TableHead className="text-right">Est. Atual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map((row, index) => (
                      <TableRow key={index} className="hover:bg-muted/50">
                        <TableCell className="font-medium">
                          <Badge variant="outline" className="font-mono text-xs">
                            {row.data}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-amber-600 dark:text-amber-500 font-medium">
                          {formatNumber(row.estoqueAnterior)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.entrada > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-500 font-semibold">
                              +{formatNumber(row.entrada)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.saida > 0 ? (
                            <span className="text-rose-600 dark:text-rose-500 font-semibold">
                              -{formatNumber(row.saida)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-sky-600 dark:text-sky-500">
                          {formatNumber(row.estoqueAtual)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                  <Package2 className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm">Nenhum histórico disponível</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* TABELA (igual planilha) */}
          <TabsContent value="tabela" className="m-0 flex-1">
            <ScrollArea className="h-[480px]">
              {rawHeaders.length > 0 && rawRows.length > 0 ? (
                <div className="w-full overflow-x-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        {rawHeaders.map((h) => (
                          <TableHead key={String(h)} className="whitespace-nowrap font-semibold">
                            {String(h)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rawRows.map((row: any, idx: number) => (
                        <TableRow key={row?._rowIndex ?? idx} className="hover:bg-muted/50">
                          {rawHeaders.map((h) => (
                            <TableCell key={String(h)} className="whitespace-nowrap">
                              {String(row?.[h] ?? '')}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                  <Package2 className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm">Nenhum dado disponível</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
