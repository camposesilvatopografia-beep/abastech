import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { X, Calendar, Package2, ArrowUp, ArrowDown, History } from 'lucide-react';
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
import { SheetData } from '@/lib/googleSheets';

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
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  // Calculate totals
  const totals = historyRows.reduce((acc, row) => ({
    entradas: acc.entradas + row.entrada,
    saidas: acc.saidas + row.saida
  }), { entradas: 0, saidas: 0 });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold">
                  Histórico de Movimentações
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">{title}</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-border">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">Registros</span>
            <div className="text-lg font-bold text-foreground">{historyRows.length}</div>
          </div>
          <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">Total Entradas</span>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-emerald-600 dark:text-emerald-500">
              <ArrowUp className="h-4 w-4" />
              {formatNumber(totals.entradas)}
            </div>
          </div>
          <div className="bg-rose-500/10 rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">Total Saídas</span>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-rose-600 dark:text-rose-500">
              <ArrowDown className="h-4 w-4" />
              {formatNumber(totals.saidas)}
            </div>
          </div>
          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">Saldo</span>
            <div className="flex items-center justify-center gap-1 text-lg font-bold text-primary">
              <Package2 className="h-4 w-4" />
              {formatNumber(totals.entradas - totals.saidas)}
            </div>
          </div>
        </div>

        {/* History Table */}
        <ScrollArea className="h-[400px]">
          {historyRows.length > 0 ? (
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[120px]">
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
                    <TableCell className="text-right text-amber-600 dark:text-amber-500">
                      {formatNumber(row.estoqueAnterior)}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.entrada > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-500 font-medium">
                          +{formatNumber(row.entrada)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.saida > 0 ? (
                        <span className="text-rose-600 dark:text-rose-500 font-medium">
                          -{formatNumber(row.saida)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
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
      </DialogContent>
    </Dialog>
  );
}
