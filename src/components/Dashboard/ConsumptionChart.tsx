import { BarChart3 } from 'lucide-react';

interface ConsumptionChartProps {
  title: string;
  subtitle: string;
}

export function ConsumptionChart({ title, subtitle }: ConsumptionChartProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-4 h-full">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sem dados para exibir</p>
        </div>
      </div>
    </div>
  );
}
