import { format, parse, isAfter, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Calendar, Package2, ArrowUp, ArrowDown, History, Table2, BarChart3, TrendingUp, TrendingDown, Clock } from 'lucide-react';
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
  if (!value && value !== 0) return 0;
  const str = String(value).trim().replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
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

/** Tenta parsear uma data no formato dd/MM/yyyy */
function parseDateBR(dateStr: string): Date | null {
  try {
    const parsed = parse(dateStr.trim(), 'dd/MM/yyyy', new Date());
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractHistoryRows(sheetData: SheetData): HistoryRow[] {
  if (!sheetData.rows || sheetData.rows.length === 0) {
    return [];
  }

  const today = startOfDay(new Date());

  return sheetData.rows.map(row => {
    const data = String(
      row['Data'] || row['DATA'] || row['data'] || ''
    );

    const estoqueAnterior = parseNumber(
      row['EstoqueAnterior'] ??
      row['Estoque Anterior'] ??
      row['ESTOQUE_ANTERIOR'] ??
      row['ESTOQUE ANTERIOR'] ??
      null
    );

    const entrada = parseNumber(
      row['Entrada'] ??
      row['Entradas'] ??
      row['ENTRADA'] ??
      row['ENTRADAS'] ??
      null
    );

    const saida = parseNumber(
      row['Saida'] ??
      row['Saída'] ??
      row['Saidas'] ??
      row['Saídas'] ??
      row['SAIDA'] ??
      row['SAÍDA'] ??
      null
    );

    // For Geral sheet: sum comboios + equipamentos if available
    const saidaComboios = parseNumber(row['Saida para Comboios'] ?? null);
    const saidaEquipamentos = parseNumber(row['Saida para Equipamentos'] ?? null);
    const totalSaida = (saidaComboios + saidaEquipamentos) > 0
      ? saidaComboios + saidaEquipamentos
      : saida;

    const estoqueAtual = parseNumber(
      row['EstoqueAtual'] ??
      row['Estoque Atual'] ??
      row['ESTOQUE_ATUAL'] ??
      row['ESTOQUE ATUAL'] ??
      null
    );

    return {
      data,
      estoqueAnterior,
      entrada,
      saida: totalSaida,
      estoqueAtual
    };
  })
  .filter(row => {
    if (!row.data) return false;
    const parsed = parseDateBR(row.data);
    if (!parsed) return true; // mantém linhas sem data parseável
    return !isAfter(startOfDay(parsed), today);
  })
  .reverse(); // Mais recente primeiro
}

export function StockHistoryModal({ open, onClose, title, sheetData }: StockHistoryModalProps) {
  const historyRows = extractHistoryRows(sheetData);

  // Raw rows (most recent first), sem datas futuras
  const rawHeaders = (sheetData.headers || []).filter((h) => String(h).trim() && String(h) !== '_rowIndex');
  const _today = startOfDay(new Date());
  const todayStr = format(_today, 'dd/MM/yyyy');

  const rawRows = (sheetData.rows || [])
    .filter(row => {
      const dateStr = String(row['Data'] || row['DATA'] || row['data'] || '').trim();
      if (!dateStr) return true;
      const parsed = parseDateBR(dateStr);
      if (!parsed) return true;
      return !isAfter(startOfDay(parsed), _today);
    })
    .slice()
    .reverse();

  // Dados do dia atual
  const todayRow = historyRows.find(r => r.data.trim() === todayStr);
  
  // Fallback: se não há dados hoje, usar a linha mais recente disponível
  const latestRow = historyRows[0];
  const displayRow = todayRow || latestRow;
  const hasToday = !!todayRow;

  // Calculate totals (from resumo) — apenas sobre linhas com datas válidas
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
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] p-0 gap-0 overflow-hidden flex flex-col">
        {/* Header */}
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

        {/* ── KPIs do DIA ATUAL (ou mais recente) ────────────────── */}
        <div className="bg-slate-800 px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-sky-400" />
            <span className="text-sm font-semibold text-white uppercase tracking-wide">
              {hasToday ? `Hoje — ${todayStr}` : `Mais Recente — ${displayRow?.data || '—'}`}
            </span>
            {hasToday ? (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Com dados</span>
            ) : displayRow ? (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Último registro disponível
              </span>
            ) : (
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-600 text-slate-400">Sem registros</span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Estoque Anterior */}
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-300 block">Est. Anterior</span>
              <span className={cn(
                "text-2xl font-black mt-1 block",
                displayRow && displayRow.estoqueAnterior < 0 ? "text-rose-300" : "text-amber-200"
              )}>
                {displayRow ? formatNumber(displayRow.estoqueAnterior) : '—'}
              </span>
            </div>
            {/* Entrada */}
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 block">
                {hasToday ? 'Entrada Hoje' : 'Entrada'}
              </span>
              <div className="flex items-center justify-center gap-1 mt-1">
                {(displayRow?.entrada ?? 0) > 0 && <ArrowUp className="h-4 w-4 text-emerald-400" />}
                <span className="text-2xl font-black text-emerald-200">
                  {displayRow ? formatNumber(displayRow.entrada) : '—'}
                </span>
              </div>
            </div>
            {/* Saída */}
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-300 block">
                {hasToday ? 'Saída Hoje' : 'Saída'}
              </span>
              <div className="flex items-center justify-center gap-1 mt-1">
                {(displayRow?.saida ?? 0) > 0 && <ArrowDown className="h-4 w-4 text-rose-400" />}
                <span className="text-2xl font-black text-rose-200">
                  {displayRow ? formatNumber(displayRow.saida) : '—'}
                </span>
              </div>
            </div>
            {/* Estoque Atual */}
            <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 px-4 py-3 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300 block">Est. Atual</span>
              <div className="flex items-center justify-center gap-1 mt-1">
                <Package2 className="h-4 w-4 text-sky-400" />
                <span className={cn(
                  "text-2xl font-black",
                  displayRow && displayRow.estoqueAtual < 0 ? "text-rose-300" : "text-sky-200"
                )}>
                  {displayRow ? formatNumber(displayRow.estoqueAtual) : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── TABELA DE HISTÓRICO (expandida, sem abas) ────────── */}
        <ScrollArea className="flex-1">
          {historyRows.length > 0 ? (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow className="hover:bg-transparent border-b-2 border-border">
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
                {historyRows.map((row, index) => {
                  const isToday = row.data.trim() === todayStr;
                  const isLatest = !hasToday && index === 0;
                  return (
                    <TableRow
                      key={index}
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        isToday && "bg-sky-100/80 dark:bg-sky-950/40 font-semibold border-l-4 border-l-sky-500",
                        isLatest && !isToday && "bg-amber-50 dark:bg-amber-950/20 border-l-4 border-l-amber-500"
                      )}
                    >
                      <TableCell className="font-medium">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-xs",
                            isToday && "bg-sky-100 dark:bg-sky-900/50 border-sky-400 text-sky-700 dark:text-sky-300",
                            isLatest && !isToday && "bg-amber-100 dark:bg-amber-900/30 border-amber-400 text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {isToday ? '📅 Hoje' : isLatest ? `⏱ ${row.data}` : row.data}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        row.estoqueAnterior < 0 ? "text-rose-600 dark:text-rose-500" : "text-amber-600 dark:text-amber-500"
                      )}>
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
                      <TableCell className={cn(
                        "text-right font-bold",
                        row.estoqueAtual < 0 ? "text-rose-600 dark:text-rose-500" : "text-sky-600 dark:text-sky-500"
                      )}>
                        {formatNumber(row.estoqueAtual)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
              <Package2 className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">Nenhum histórico disponível</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}