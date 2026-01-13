import { useState, useMemo } from 'react';
import { 
  Package,
  RefreshCw,
  Printer,
  FileText,
  Search,
  Droplet,
  TrendingDown,
  TrendingUp,
  Fuel
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
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

const SHEET_NAME = 'AbastecimentoCanteiro01';

export function EstoquesPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');

  const metrics = useMemo(() => {
    let totalDiesel = 0;
    let totalArla = 0;
    let saidasHoje = 0;
    let entradasHoje = 0;

    const today = new Date().toLocaleDateString('pt-BR');

    data.rows.forEach(row => {
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const arla = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;
      const rowDate = String(row['DATA'] || '');
      const tipo = String(row['TIPO'] || '').toLowerCase();

      totalDiesel += quantidade;
      totalArla += arla;

      if (rowDate === today) {
        if (tipo.includes('saida') || tipo.includes('saída')) {
          saidasHoje += quantidade;
        } else if (tipo.includes('entrada')) {
          entradasHoje += quantidade;
        }
      }
    });

    // Simulated stock values (would come from a stock sheet in real implementation)
    const estoqueDiesel = 20667.2;
    const estoqueArla = 1643;

    return {
      estoqueDiesel,
      estoqueArla,
      saidasGeral: totalDiesel,
      saidasHoje,
      entradasHoje
    };
  }, [data.rows]);

  const stockHistory = useMemo(() => {
    // Group by date for history
    const byDate: Record<string, { diesel: number; arla: number }> = {};
    
    data.rows.forEach(row => {
      const date = String(row['DATA'] || 'Sem data');
      const quantidade = parseFloat(String(row['QUANTIDADE'] || '0').replace(',', '.')) || 0;
      const arla = parseFloat(String(row['QUANTIDADE DE ARLA'] || '0').replace(',', '.')) || 0;

      if (!byDate[date]) {
        byDate[date] = { diesel: 0, arla: 0 };
      }
      byDate[date].diesel += quantidade;
      byDate[date].arla += arla;
    });

    return Object.entries(byDate).slice(0, 10);
  }, [data.rows]);

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Estoques</h1>
              <p className="text-muted-foreground">Controle de combustíveis e lubrificantes</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm">
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span className="text-success font-medium">Conectado ao Google Sheets</span>
          <span className="text-muted-foreground">• Sincronizado em tempo real</span>
        </div>

        {/* Main Stock Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            title="ESTOQUE DIESEL"
            value={`${metrics.estoqueDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L`}
            subtitle="Disponível"
            variant="primary"
            icon={Fuel}
          />
          <MetricCard
            title="ESTOQUE ARLA"
            value={`${metrics.estoqueArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Disponível"
            variant="primary"
            icon={Droplet}
          />
        </div>

        {/* Movement Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="SAÍDAS GERAL"
            value={`${metrics.saidasGeral.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Total registrado"
            icon={TrendingDown}
          />
          <MetricCard
            title="SAÍDAS HOJE"
            value={`${metrics.saidasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Consumo do dia"
            icon={TrendingDown}
          />
          <MetricCard
            title="ENTRADAS HOJE"
            value={`${metrics.entradasHoje.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Reposição do dia"
            icon={TrendingUp}
          />
        </div>

        {/* Stock Summary Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Movimentação de Estoque</h2>
            <p className="text-sm text-muted-foreground">Últimos registros por data</p>
          </div>
          
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Diesel (L)</TableHead>
                <TableHead className="text-right">Arla (L)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                    Carregando dados...
                  </TableCell>
                </TableRow>
              ) : stockHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Nenhum dado encontrado
                  </TableCell>
                </TableRow>
              ) : (
                stockHistory.map(([date, values]) => (
                  <TableRow key={date}>
                    <TableCell className="font-medium">{date}</TableCell>
                    <TableCell className="text-right">
                      {values.diesel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {values.arla > 0 ? values.arla.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
