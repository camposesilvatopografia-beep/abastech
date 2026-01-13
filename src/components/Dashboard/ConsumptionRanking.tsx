import { useMemo, useState } from 'react';
import { Trophy, TrendingUp, Fuel, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface VehicleInfo {
  veiculo: string;
  descricao?: string;
}

interface ConsumptionRankingProps {
  data: Array<{
    veiculo: string;
    totalLitros: number;
    abastecimentos: number;
    mediaPorAbastecimento: number;
  }>;
  vehicleData?: VehicleInfo[];
  title?: string;
  maxItems?: number;
}

export function ConsumptionRanking({ 
  data, 
  vehicleData = [],
  title = "Ranking de Consumo", 
  maxItems = 10 
}: ConsumptionRankingProps) {
  const [periodFilter, setPeriodFilter] = useState<'total' | 'mes'>('total');

  // Filter out "CAMINHAO COMBOIO" vehicles based on description from vehicleData
  const filteredData = useMemo(() => {
    // Create a set of comboio vehicles based on description
    const comboioVehicles = new Set(
      vehicleData
        .filter(v => {
          const desc = (v.descricao || '').toLowerCase();
          return desc.includes('comboio') || desc.includes('caminhão comboio') || desc.includes('caminhao comboio');
        })
        .map(v => v.veiculo.trim().toUpperCase())
    );

    return data.filter(item => {
      const vehicleName = item.veiculo.trim().toUpperCase();
      // Also check if the vehicle name itself contains "comboio"
      if (vehicleName.includes('COMBOIO')) return false;
      // Check against the vehicle descriptions
      return !comboioVehicles.has(vehicleName);
    });
  }, [data, vehicleData]);

  const rankingData = useMemo(() => {
    return filteredData
      .sort((a, b) => b.totalLitros - a.totalLitros)
      .slice(0, maxItems);
  }, [filteredData, maxItems]);

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
            <p className="text-sm text-muted-foreground">Maiores consumidores (equipamentos)</p>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">Top {maxItems} equipamentos (exceto comboios)</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={periodFilter === 'total' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodFilter('total')}
              className="h-7 text-xs"
            >
              Total
            </Button>
            <Button
              variant={periodFilter === 'mes' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriodFilter('mes')}
              className="h-7 text-xs"
            >
              Mês
            </Button>
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
