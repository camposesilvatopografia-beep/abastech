import { useMemo, useState, useCallback } from 'react';
import { Trophy, TrendingUp, Fuel, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { startOfMonth, endOfMonth, isWithinInterval, parse, isValid } from 'date-fns';

interface VehicleInfo {
  veiculo: string;
  descricao?: string;
}

interface ConsumptionData {
  veiculo: string;
  data?: string;
  quantidade: number;
  observacao?: string;
}

// Check if a record is a tank refuel for comboio (shouldn't count for consumption ranking)
const isTankRefuelRecord = (observacao?: string): boolean => {
  if (!observacao) return false;
  return observacao.includes('[ABAST. TANQUE COMBOIO]');
};

interface RankingItem {
  veiculo: string;
  totalLitros: number;
  abastecimentos: number;
  mediaPorAbastecimento: number;
}

interface ConsumptionRankingProps {
  data: RankingItem[];
  rawData?: ConsumptionData[];
  vehicleData?: VehicleInfo[];
  title?: string;
  maxItems?: number;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function ConsumptionRanking({ 
  data, 
  rawData = [],
  vehicleData = [],
  title = "Ranking de Consumo", 
  maxItems = 10 
}: ConsumptionRankingProps) {
  const [periodFilter, setPeriodFilter] = useState<'total' | 'mes'>('total');

  // Filter out "CAMINHAO COMBOIO" vehicles based on description from vehicleData
  const comboioVehicles = useMemo(() => {
    return new Set(
      vehicleData
        .filter(v => {
          const desc = (v.descricao || '').toLowerCase();
          return desc.includes('comboio') || desc.includes('caminhão comboio') || desc.includes('caminhao comboio');
        })
        .map(v => v.veiculo.trim().toUpperCase())
    );
  }, [vehicleData]);

  // Also identify comboio vehicles by their description in the data itself
  const isComboioVehicle = useCallback((veiculo: string, desc?: string): boolean => {
    const vehicleName = veiculo.trim().toUpperCase();
    const descLower = (desc || '').toLowerCase();
    
    // Check if vehicle name or description contains "COMBOIO"
    if (vehicleName.includes('COMBOIO')) return true;
    if (descLower.includes('comboio') || descLower.includes('caminhão comboio') || descLower.includes('caminhao comboio')) return true;
    
    // Check against vehicle data
    return comboioVehicles.has(vehicleName);
  }, [comboioVehicles]);

  // Calculate ranking based on period filter
  const rankingData = useMemo(() => {
    let sourceData: RankingItem[];

    if (periodFilter === 'mes' && rawData.length > 0) {
      // Filter raw data for current month and recalculate
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);

      const vehicleMap = new Map<string, { totalLitros: number; abastecimentos: number }>();
      
      rawData.forEach(item => {
        const veiculo = item.veiculo?.trim();
        const quantidade = item.quantidade || 0;
        
        if (!veiculo || quantidade <= 0) return;
        
        // Exclude tank refuel records for comboios (they shouldn't affect consumption ranking)
        if (isTankRefuelRecord(item.observacao)) return;
        
        // Check date is in current month
        const itemDate = parseDate(item.data || '');
        if (!itemDate || !isWithinInterval(itemDate, { start: monthStart, end: monthEnd })) {
          return;
        }
        
        const existing = vehicleMap.get(veiculo) || { totalLitros: 0, abastecimentos: 0 };
        vehicleMap.set(veiculo, {
          totalLitros: existing.totalLitros + quantidade,
          abastecimentos: existing.abastecimentos + 1
        });
      });

      sourceData = Array.from(vehicleMap.entries()).map(([veiculo, d]) => ({
        veiculo,
        totalLitros: d.totalLitros,
        abastecimentos: d.abastecimentos,
        mediaPorAbastecimento: d.abastecimentos > 0 ? d.totalLitros / d.abastecimentos : 0
      }));
    } else {
      // Use pre-calculated total data
      sourceData = data;
    }

    // Filter out comboios and sort
    return sourceData
      .filter(item => !isComboioVehicle(item.veiculo))
      .sort((a, b) => b.totalLitros - a.totalLitros)
      .slice(0, maxItems);
  }, [data, rawData, periodFilter, comboioVehicles, maxItems, isComboioVehicle]);

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
          <span className="text-muted-foreground">
            Total (Top {rankingData.length}) - {periodFilter === 'mes' ? 'Mês Atual' : 'Acumulado'}:
          </span>
          <span className="font-semibold">
            {rankingData.reduce((sum, item) => sum + item.totalLitros, 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
          </span>
        </div>
      </div>
    </div>
  );
}