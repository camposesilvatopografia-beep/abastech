import { cn } from '@/lib/utils';
import { Calendar, Maximize2, Package2, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface StockPanelCardProps {
  title: string;
  data: {
    data: string;
    local?: string;
    descricao?: string;
    estoqueAtual: number;
    estoqueAnterior: number;
    entradas: number;
    saidas?: number;
  };
  variant?: 'default' | 'summary';
  onExpand?: () => void;
}

export function StockPanelCard({ title, data, variant = 'default', onExpand }: StockPanelCardProps) {
  const formatNumber = (value: number) => {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Card className="relative bg-card border border-border hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
          {onExpand && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onExpand}>
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
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
            {variant === 'summary' ? 'Entradas' : 'Entrada'}
          </span>
          <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-500">
            <ArrowUp className="h-4 w-4" />
            <span className="text-sm font-medium">{formatNumber(data.entradas)}</span>
          </div>
        </div>

        {/* Saídas (optional) */}
        {data.saidas !== undefined && (
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
