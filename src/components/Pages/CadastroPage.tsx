import { useState, useMemo } from 'react';
import { 
  Users,
  RefreshCw,
  Plus,
  Search,
  Edit,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSheetData } from '@/hooks/useGoogleSheets';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface CadastroPageProps {
  sheetName: string;
  title: string;
  subtitle: string;
}

export function CadastroPage({ sheetName, title, subtitle }: CadastroPageProps) {
  const { data, loading, refetch } = useSheetData(sheetName);
  const [search, setSearch] = useState('');

  const filteredRows = useMemo(() => {
    if (!search) return data.rows;
    
    return data.rows.filter(row =>
      Object.values(row).some(v =>
        String(v).toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [data.rows, search]);

  const displayHeaders = data.headers.filter(h => h !== '_rowIndex').slice(0, 6);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Novo
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-success font-medium">Conectado ao Google Sheets</span>
          <span className="text-muted-foreground">• {data.rows.length} registros</span>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {displayHeaders.map(header => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={displayHeaders.length + 1} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                    Carregando dados...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={displayHeaders.length + 1} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.slice(0, 50).map((row, index) => (
                  <TableRow key={row._rowIndex || index}>
                    {displayHeaders.map(header => (
                      <TableCell key={header}>{String(row[header] || '')}</TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {filteredRows.length > 50 && (
            <div className="p-4 text-center text-sm text-muted-foreground border-t">
              Mostrando 50 de {filteredRows.length} registros
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
