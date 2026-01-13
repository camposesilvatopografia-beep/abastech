import { useMemo } from 'react';
import { Trophy, TrendingUp, Fuel, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConsumptionRankingProps {
  data: Array<{
    veiculo: string;
    totalLitros: number;
    abastecimentos: number;
    mediaPorAbastecimento: number;
  }>;
  title?: string;
  maxItems?: number;
}

export function ConsumptionRanking({ 
  data, 
  title = "Ranking de Consumo", 
  maxItems = 10 
}: ConsumptionRankingProps) {
  const rankingData = useMemo(() => {
    return data
      .sort((a, b) => b.totalLitros - a.totalLitros)
      .slice(0, maxItems);
  }, [data, maxItems]);

  const maxConsumption = rankingData[0]?.totalLitros || 1;

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Trophy className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Trophy className="w-4 h-4 text-amber-600" />;
    return <span className="text-sm font-medium text-muted-foreground w-4 text-center">{index + 1}</span>;
  };

  const getBarColor = (index: number) => {
    if (index === 0) return 'bg-red-500';
    if (index === 1) return 'bg-orange-500';
    if (index === 2) return 'bg-amber-500';
    return 'bg-primary/60';
  };

  if (rankingData.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">Maiores consumidores</p>
          </div>
        </div>
        <div className="text-center text-muted-foreground py-8">
          Sem dados para exibir
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">Top {maxItems} maiores consumidores</p>
          </div>
        </div>
      </div>
      
      <div className="p-4 space-y-3">
        {rankingData.map((item, index) => {
          const percentage = (item.totalLitros / maxConsumption) * 100;
          
          return (
            <div key={item.veiculo} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {getRankIcon(index)}
                  <span className="font-medium">{item.veiculo}</span>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <span className="text-muted-foreground text-xs">
                    {item.abastecimentos} abast. | Média: {item.mediaPorAbastecimento.toFixed(1)} L
                  </span>
                  <span className="font-semibold text-primary min-w-[80px]">
                    {item.totalLitros.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
                  </span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn("h-full rounded-full transition-all duration-500", getBarColor(index))}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="p-4 border-t border-border bg-muted/30">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total (Top {rankingData.length}):</span>
          <span className="font-semibold">
            {rankingData.reduce((sum, item) => sum + item.totalLitros, 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
          </span>
        </div>
      </div>
    </div>
  );
}
