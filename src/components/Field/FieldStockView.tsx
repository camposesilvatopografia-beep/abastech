import { useState } from 'react';
import { ArrowLeft, Package2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocationStockCard, LocationStockCardRef } from './LocationStockCard';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useRef } from 'react';

const ALL_LOCATIONS = [
  'Tanque Canteiro 01',
  'Tanque Canteiro 02',
  'Comboio 01',
  'Comboio 02',
  'Comboio 03',
];

interface FieldStockViewProps {
  onBack: () => void;
  assignedLocations?: string[];
}

export function FieldStockView({ onBack, assignedLocations }: FieldStockViewProps) {
  const { theme } = useTheme();
  const cardRefs = useRef<Record<string, LocationStockCardRef | null>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Show all locations or only assigned ones
  const locations = assignedLocations && assignedLocations.length > 0
    ? ALL_LOCATIONS.filter(loc => 
        assignedLocations.some(al => 
          loc.toLowerCase().includes(al.toLowerCase()) || al.toLowerCase().includes(loc.toLowerCase())
        )
      )
    : ALL_LOCATIONS;

  // If filtering resulted in empty, show all
  const displayLocations = locations.length > 0 ? locations : ALL_LOCATIONS;

  const handleRefreshAll = () => {
    setRefreshing(true);
    Object.values(cardRefs.current).forEach(ref => ref?.refetch());
    setTimeout(() => setRefreshing(false), 2000);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className={cn(
              "h-9 w-9 rounded-xl",
              theme === 'dark' ? "hover:bg-slate-700" : "hover:bg-slate-200"
            )}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className={cn(
              "text-lg font-bold flex items-center gap-2",
              theme === 'dark' ? "text-slate-200" : "text-slate-700"
            )}>
              <Package2 className="w-5 h-5 text-blue-500" />
              Painel de Estoques
            </h2>
            <p className="text-xs text-muted-foreground">Estoque de combustível por local</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="h-8 gap-1.5"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Stock Cards */}
      <div className="space-y-3">
        {displayLocations.map(location => (
          <LocationStockCard
            key={location}
            ref={(el) => { cardRefs.current[location] = el; }}
            location={location}
          />
        ))}
      </div>
    </div>
  );
}
