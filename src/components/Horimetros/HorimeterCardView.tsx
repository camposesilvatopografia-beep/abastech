import { format } from 'date-fns';
import { Clock, Pencil, Trash2, User, Building, Tag, Gauge } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface HorimeterReading {
  id: string;
  reading_date: string;
  current_value: number;
  previous_value: number | null;
  current_km?: number | null;
  previous_km?: number | null;
  operator: string | null;
  observations: string | null;
  interval: number;
  km_interval?: number;
  vehicle?: {
    id: string;
    code: string;
    name: string;
    category: string | null;
    company: string | null;
  };
}

interface HorimeterCardViewProps {
  readings: HorimeterReading[];
  selectedIds: Set<string>;
  selectionModeActive: boolean;
  onToggleSelection: (id: string) => void;
  onEdit: (reading: HorimeterReading) => void;
  onDelete: (reading: HorimeterReading) => void;
}

export function HorimeterCardView({
  readings,
  selectedIds,
  selectionModeActive,
  onToggleSelection,
  onEdit,
  onDelete,
}: HorimeterCardViewProps) {
  if (readings.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Nenhum registro encontrado para o período selecionado</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
      {readings.map((reading) => (
        <Card 
          key={reading.id} 
          className={cn(
            "overflow-hidden transition-all",
            selectedIds.has(reading.id) && "ring-2 ring-primary bg-primary/5"
          )}
        >
          <CardContent className="p-0">
            {/* Header with date and vehicle */}
            <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
              <div className="flex items-center gap-3">
                {selectionModeActive && (
                  <Checkbox
                    checked={selectedIds.has(reading.id)}
                    onCheckedChange={() => onToggleSelection(reading.id)}
                  />
                )}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {format(new Date(reading.reading_date + 'T00:00:00'), 'dd/MM/yyyy')}
                  </Badge>
                  <span className="font-bold text-primary">{reading.vehicle?.code}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(reading)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(reading)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>

            {/* Main content */}
            <div className="p-4 space-y-3">
              {/* Vehicle description */}
              <p className="text-sm text-muted-foreground truncate">{reading.vehicle?.name}</p>

              {/* Horimeter values - prominent display */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/30 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Anterior</p>
                  <p className="font-bold text-sm">
                    {reading.previous_value?.toLocaleString('pt-BR') || '-'}
                  </p>
                </div>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-2">
                  <p className="text-[10px] text-primary uppercase tracking-wider mb-1">Atual</p>
                  <p className="font-bold text-lg text-primary">
                    {reading.current_value.toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className={cn(
                  "rounded-lg p-2",
                  reading.interval > 0 ? "bg-green-500/10 border border-green-500/20" : 
                  reading.interval < 0 ? "bg-red-500/10 border border-red-500/20" : 
                  "bg-muted/30"
                )}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Intervalo</p>
                  <p className={cn(
                    "font-bold text-sm",
                    reading.interval > 0 ? "text-green-600" : 
                    reading.interval < 0 ? "text-red-600" : ""
                  )}>
                    {reading.interval > 0 ? '+' : ''}{reading.interval.toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* KM values if available */}
              {(reading.current_km || reading.previous_km) && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2">
                    <p className="text-[10px] text-blue-600 uppercase tracking-wider mb-1">KM Anterior</p>
                    <p className="font-bold text-sm text-blue-600">
                      {reading.previous_km?.toLocaleString('pt-BR') || '-'}
                    </p>
                  </div>
                  <div className="bg-blue-100 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 rounded-lg p-2">
                    <p className="text-[10px] text-blue-600 uppercase tracking-wider mb-1">KM Atual</p>
                    <p className="font-bold text-lg text-blue-600">
                      {reading.current_km?.toLocaleString('pt-BR') || '-'}
                    </p>
                  </div>
                  <div className={cn(
                    "rounded-lg p-2",
                    (reading.km_interval || 0) > 0 ? "bg-blue-500/10 border border-blue-500/20" : "bg-muted/30"
                  )}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total KM</p>
                    <p className="font-bold text-sm text-blue-600">
                      {reading.km_interval 
                        ? (reading.km_interval > 0 ? '+' : '') + reading.km_interval.toLocaleString('pt-BR')
                        : '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* Meta info */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground pt-2 border-t">
                {reading.vehicle?.company && (
                  <div className="flex items-center gap-1">
                    <Building className="w-3 h-3" />
                    <span>{reading.vehicle.company}</span>
                  </div>
                )}
                {reading.vehicle?.category && (
                  <div className="flex items-center gap-1">
                    <Tag className="w-3 h-3" />
                    <span>{reading.vehicle.category}</span>
                  </div>
                )}
                {reading.operator && (
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{reading.operator}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
