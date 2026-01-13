import { useState, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SheetRow } from '@/lib/googleSheets';

interface DataTableProps {
  headers: string[];
  rows: SheetRow[];
  loading: boolean;
  onEdit: (row: SheetRow) => void;
  onDelete: (row: SheetRow) => void;
  onCreate: () => void;
}

const ROWS_PER_PAGE = 10;

export function DataTable({ headers, rows, loading, onEdit, onDelete, onCreate }: DataTableProps) {
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [columnFilter, setColumnFilter] = useState<string | null>(null);

  const filteredAndSortedRows = useMemo(() => {
    let result = [...rows];

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((row) =>
        headers.some((header) =>
          String(row[header] ?? '').toLowerCase().includes(searchLower)
        )
      );
    }

    // Apply column filter
    if (columnFilter) {
      result = result.filter((row) => row[columnFilter] !== '' && row[columnFilter] != null);
    }

    // Apply sorting
    if (sortColumn) {
      result.sort((a, b) => {
        const aVal = String(a[sortColumn] ?? '');
        const bVal = String(b[sortColumn] ?? '');
        const comparison = aVal.localeCompare(bVal, 'pt-BR', { numeric: true });
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [rows, search, sortColumn, sortDirection, headers, columnFilter]);

  const totalPages = Math.ceil(filteredAndSortedRows.length / ROWS_PER_PAGE);
  const paginatedRows = filteredAndSortedRows.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE
  );

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const displayHeaders = headers.filter(h => h !== '_rowIndex');

  if (loading) {
    return (
      <div className="flex-1 p-6">
        <div className="dashboard-card p-6 h-full">
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin-slow" />
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-hidden flex flex-col">
      <div className="dashboard-card flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar em todos os campos..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 input-field"
              />
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filtrar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="bg-popover">
                <DropdownMenuItem onClick={() => setColumnFilter(null)}>
                  Mostrar todos
                </DropdownMenuItem>
                {displayHeaders.map((header) => (
                  <DropdownMenuItem key={header} onClick={() => setColumnFilter(header)}>
                    Apenas com {header}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button onClick={onCreate} className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Novo Registro
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {displayHeaders.map((header) => (
                  <TableHead
                    key={header}
                    className="font-semibold text-foreground cursor-pointer select-none"
                    onClick={() => handleSort(header)}
                  >
                    <div className="flex items-center gap-2">
                      {header}
                      <ArrowUpDown className={`w-3 h-3 ${sortColumn === header ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-24 text-right font-semibold text-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={displayHeaders.length + 1} className="h-32 text-center text-muted-foreground">
                    {search ? 'Nenhum resultado encontrado.' : 'Nenhum dado disponível.'}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, index) => (
                  <TableRow key={row._rowIndex || index} className="table-row-hover">
                    {displayHeaders.map((header) => (
                      <TableCell key={header} className="max-w-xs truncate">
                        {String(row[header] ?? '')}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          onClick={() => onEdit(row)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => onDelete(row)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {paginatedRows.length} de {filteredAndSortedRows.length} registro{filteredAndSortedRows.length !== 1 ? 's' : ''}
          </p>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium px-2">
              Página {currentPage} de {Math.max(1, totalPages)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
