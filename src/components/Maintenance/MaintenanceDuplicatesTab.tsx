import { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, Check, Copy, Loader2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { deleteRow, getSheetData } from '@/lib/googleSheets';
import { toast } from 'sonner';

interface ServiceOrder {
  id: string;
  order_number: string;
  vehicle_code: string;
  vehicle_description: string | null;
  order_date: string;
  order_type: string;
  priority: string;
  status: string;
  problem_description: string | null;
  entry_date: string | null;
  entry_time: string | null;
  end_date: string | null;
  created_at: string;
  mechanic_name: string | null;
}

interface DuplicateGroup {
  key: string;
  vehicleCode: string;
  entryDate: string;
  problem: string;
  orders: ServiceOrder[];
}

interface MaintenanceDuplicatesTabProps {
  orders: ServiceOrder[];
  onRefresh: () => void;
}

const ORDEM_SERVICO_SHEET = 'Ordem_Servico';

export function MaintenanceDuplicatesTab({ orders, onRefresh }: MaintenanceDuplicatesTabProps) {
  const [viewMode, setViewMode] = useState<'duplicados' | 'todos'>('duplicados');
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  // Detect duplicates: same vehicle_code + same entry_date
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, ServiceOrder[]>();

    orders.forEach(order => {
      const date = order.entry_date || order.order_date;
      if (!order.vehicle_code || !date) return;
      const key = `${order.vehicle_code}|${date}`;
      const existing = groups.get(key) || [];
      existing.push(order);
      groups.set(key, existing);
    });

    const result: DuplicateGroup[] = [];
    groups.forEach((groupOrders, key) => {
      if (groupOrders.length > 1) {
        // Sort: keep the one with most data filled as first (the "keeper")
        groupOrders.sort((a, b) => {
          const scoreA = [a.problem_description, a.mechanic_name, a.end_date, a.entry_time].filter(Boolean).length;
          const scoreB = [b.problem_description, b.mechanic_name, b.end_date, b.entry_time].filter(Boolean).length;
          return scoreB - scoreA; // most complete first
        });

        result.push({
          key,
          vehicleCode: groupOrders[0].vehicle_code,
          entryDate: groupOrders[0].entry_date || groupOrders[0].order_date,
          problem: groupOrders[0].problem_description || '-',
          orders: groupOrders,
        });
      }
    });

    return result.sort((a, b) => b.orders.length - a.orders.length);
  }, [orders]);

  const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.orders.length - 1, 0);

  const toggleSelect = (id: string) => {
    setSelectedToDelete(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Auto-select all duplicates in a group (keep the first, select rest)
  const autoSelectGroup = (group: DuplicateGroup) => {
    setSelectedToDelete(prev => {
      const next = new Set(prev);
      group.orders.slice(1).forEach(o => next.add(o.id));
      return next;
    });
  };

  // Auto-select ALL duplicates across all groups
  const autoSelectAll = () => {
    setSelectedToDelete(prev => {
      const next = new Set(prev);
      duplicateGroups.forEach(group => {
        group.orders.slice(1).forEach(o => next.add(o.id));
      });
      return next;
    });
  };

  const clearSelection = () => setSelectedToDelete(new Set());

  // Find sheet row index for deletion
  const findSheetRowIndex = async (vehicleCode: string, entryDate: string | null): Promise<number> => {
    try {
      const sheetData = await getSheetData(ORDEM_SERVICO_SHEET, { noCache: true });
      const rows = sheetData.rows || [];
      
      let formattedDate = '';
      if (entryDate) {
        try {
          const d = new Date(entryDate);
          formattedDate = format(d, 'dd/MM/yyyy');
        } catch { formattedDate = entryDate; }
      }
      
      const idx = rows.findIndex((row: any) => {
        const rowVehicle = String(row['Veiculo'] || row['VEICULO'] || '').trim();
        const rowDate = String(row['Data_Entrada'] || row['DATA_ENTRADA'] || '').trim();
        return rowVehicle === vehicleCode && rowDate === formattedDate;
      });
      
      return idx >= 0 ? idx + 2 : -1;
    } catch {
      return -1;
    }
  };

  // Delete selected duplicates
  const handleDeleteSelected = async () => {
    if (selectedToDelete.size === 0) return;
    setIsDeleting(true);

    let deleted = 0;
    let sheetDeleted = 0;
    let errors = 0;

    try {
      for (const id of selectedToDelete) {
        const order = orders.find(o => o.id === id);
        if (!order) continue;

        try {
          // Delete from database
          const { error } = await supabase
            .from('service_orders')
            .delete()
            .eq('id', id);

          if (error) {
            errors++;
            continue;
          }
          deleted++;

          // Try to delete from sheet too
          try {
            const sheetIdx = await findSheetRowIndex(order.vehicle_code, order.entry_date || order.order_date);
            if (sheetIdx > 0) {
              await deleteRow(ORDEM_SERVICO_SHEET, sheetIdx);
              sheetDeleted++;
            }
          } catch { /* sheet sync is best-effort */ }
        } catch {
          errors++;
        }
      }

      toast.success(`${deleted} duplicado(s) removido(s)${sheetDeleted > 0 ? ` (${sheetDeleted} da planilha)` : ''}${errors > 0 ? `, ${errors} erro(s)` : ''}`);
      setSelectedToDelete(new Set());
      setConfirmOpen(false);
      onRefresh();
    } catch (err) {
      console.error('Error deleting duplicates:', err);
      toast.error('Erro ao remover duplicados');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
          <Copy className="w-5 h-5 mx-auto text-red-600 mb-1" />
          <p className="text-xl font-bold text-red-700 dark:text-red-300">{duplicateGroups.length}</p>
          <p className="text-xs text-red-600">Grupos Duplicados</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
          <AlertTriangle className="w-5 h-5 mx-auto text-amber-600 mb-1" />
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{totalDuplicates}</p>
          <p className="text-xs text-amber-600">Registros Extras</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
          <Eye className="w-5 h-5 mx-auto text-blue-600 mb-1" />
          <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{orders.length}</p>
          <p className="text-xs text-blue-600">Total de OS</p>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'duplicados' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('duplicados')}
            className="text-xs gap-1"
          >
            <Copy className="w-3 h-3" />
            Duplicados ({duplicateGroups.length})
          </Button>
          <Button
            variant={viewMode === 'todos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('todos')}
            className="text-xs gap-1"
          >
            <Eye className="w-3 h-3" />
            Todos ({orders.length})
          </Button>
        </div>

        {viewMode === 'duplicados' && duplicateGroups.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={autoSelectAll}
            >
              <Check className="w-3 h-3" />
              Selecionar Todos Extras
            </Button>
            {selectedToDelete.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={clearSelection}
                >
                  Limpar ({selectedToDelete.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="w-3 h-3" />
                  Excluir {selectedToDelete.size} duplicado(s)
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Duplicate groups */}
      {viewMode === 'duplicados' && (
        <div className="space-y-3">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-card rounded-lg border border-border">
              <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="font-medium">🎉 Nenhum duplicado encontrado!</p>
              <p className="text-sm">Todos os registros são únicos.</p>
            </div>
          ) : (
            duplicateGroups.map(group => (
              <div key={group.key} className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between bg-muted/50 p-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 font-bold">
                      {group.orders.length}x
                    </Badge>
                    <span className="font-mono font-medium text-sm">{group.vehicleCode}</span>
                    <span className="text-sm text-muted-foreground">—</span>
                    <span className="text-sm">{formatDate(group.entryDate)}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => autoSelectGroup(group)}
                  >
                    <Trash2 className="w-3 h-3" />
                    Selecionar extras
                  </Button>
                </div>
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 py-1 px-2"></TableHead>
                      <TableHead className="py-1 px-2">Nº OS</TableHead>
                      <TableHead className="py-1 px-2">Problema</TableHead>
                      <TableHead className="py-1 px-2 hidden sm:table-cell">Mecânico</TableHead>
                      <TableHead className="py-1 px-2">Status</TableHead>
                      <TableHead className="py-1 px-2 hidden md:table-cell">Criado em</TableHead>
                      <TableHead className="py-1 px-2">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.orders.map((order, idx) => {
                      const isKeeper = idx === 0;
                      const isSelected = selectedToDelete.has(order.id);
                      return (
                        <TableRow
                          key={order.id}
                          className={cn(
                            isKeeper && 'bg-green-50/50 dark:bg-green-950/20',
                            isSelected && 'bg-red-50/50 dark:bg-red-950/20',
                          )}
                        >
                          <TableCell className="py-1 px-2">
                            {isKeeper ? (
                              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                                ✓ Manter
                              </Badge>
                            ) : (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(order.id)}
                              />
                            )}
                          </TableCell>
                          <TableCell className="py-1 px-2 font-mono">{order.order_number}</TableCell>
                          <TableCell className="py-1 px-2 max-w-[200px] truncate">
                            {order.problem_description || '-'}
                          </TableCell>
                          <TableCell className="py-1 px-2 hidden sm:table-cell">
                            {order.mechanic_name || '-'}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                          </TableCell>
                          <TableCell className="py-1 px-2 hidden md:table-cell text-muted-foreground">
                            {format(new Date(order.created_at), 'dd/MM HH:mm')}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {!isKeeper && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-destructive hover:text-destructive"
                                onClick={() => {
                                  setSelectedToDelete(new Set([order.id]));
                                  setConfirmOpen(true);
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </div>
      )}

      {/* All orders view */}
      {viewMode === 'todos' && (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="py-2 px-2">Nº OS</TableHead>
                <TableHead className="py-2 px-2">Veículo</TableHead>
                <TableHead className="py-2 px-2">Data Entrada</TableHead>
                <TableHead className="py-2 px-2 hidden sm:table-cell">Problema</TableHead>
                <TableHead className="py-2 px-2">Status</TableHead>
                <TableHead className="py-2 px-2 text-center">Duplicado?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.slice(0, 200).map(order => {
                const date = order.entry_date || order.order_date;
                const key = `${order.vehicle_code}|${date}`;
                const isDuplicate = duplicateGroups.some(g => g.key === key);
                return (
                  <TableRow key={order.id} className={cn(isDuplicate && 'bg-red-50/30 dark:bg-red-950/10')}>
                    <TableCell className="py-1 px-2 font-mono">{order.order_number}</TableCell>
                    <TableCell className="py-1 px-2">{order.vehicle_code}</TableCell>
                    <TableCell className="py-1 px-2">{formatDate(date)}</TableCell>
                    <TableCell className="py-1 px-2 hidden sm:table-cell max-w-[200px] truncate">
                      {order.problem_description || '-'}
                    </TableCell>
                    <TableCell className="py-1 px-2">
                      <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                    </TableCell>
                    <TableCell className="py-1 px-2 text-center">
                      {isDuplicate ? (
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">Sim</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {orders.length > 200 && (
            <p className="text-xs text-center py-2 text-muted-foreground">
              Exibindo 200 de {orders.length} registros
            </p>
          )}
        </div>
      )}

      {/* Confirm deletion dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <AlertDialogTitle>Confirmar Exclusão de Duplicados</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2">
              Você está prestes a excluir <strong>{selectedToDelete.size} registro(s) duplicado(s)</strong> do banco de dados e da planilha.
              Os registros marcados como "Manter" não serão afetados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isDeleting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Excluir {selectedToDelete.size} duplicado(s)
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
