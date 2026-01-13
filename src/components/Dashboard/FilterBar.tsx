import { Search, Calendar, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface FilterBarProps {
  totalRecords: number;
}

export function FilterBar({ totalRecords }: FilterBarProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-4">
      {/* Search and Date filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar veículos, locais, motoristas..."
            className="pl-10 h-10 input-field"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-10 gap-2">
            <Calendar className="w-4 h-4" />
            13/01/2026
          </Button>
          <span className="text-sm text-muted-foreground">até</span>
          <Button variant="outline" className="h-10 gap-2">
            <Calendar className="w-4 h-4" />
            Data fim
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="filter-badge">
            Hoje
            <X className="w-3 h-3 cursor-pointer" />
          </span>
        </div>
      </div>

      {/* Period info */}
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">Período:</span>
        <span className="font-medium">Hoje</span>
        <span className="text-muted-foreground">• {totalRecords.toLocaleString('pt-BR')} registros encontrados</span>
      </div>
    </div>
  );
}
