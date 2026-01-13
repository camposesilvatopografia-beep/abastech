import { cn } from '@/lib/utils';

interface SummaryRow {
  label: string;
  value: string;
  isSubItem?: boolean;
  isPositive?: boolean;
  isNegative?: boolean;
  isTotal?: boolean;
}

interface StockSummaryProps {
  title: string;
  subtitle: string;
  rows: SummaryRow[];
}

export function StockSummary({ title, subtitle, rows }: StockSummaryProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-4">
      <div className="mb-4">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="space-y-0">
        <div className="flex justify-between py-2 border-b border-border">
          <span className="text-sm font-medium text-muted-foreground">Métrica</span>
          <span className="text-sm font-medium text-muted-foreground">Valor (L)</span>
        </div>
        
        {rows.map((row, index) => (
          <div 
            key={index}
            className={cn(
              "flex justify-between py-2",
              row.isTotal && "border-t border-border mt-2 pt-3"
            )}
          >
            <span className={cn(
              "text-sm",
              row.isSubItem && "pl-4 text-muted-foreground",
              row.isPositive && "text-success",
              row.isNegative && "text-destructive",
              row.isTotal && "font-semibold"
            )}>
              {row.isSubItem && "↳ "}{row.label}
            </span>
            <span className={cn(
              "text-sm font-medium",
              row.isPositive && "text-success",
              row.isNegative && "text-destructive",
              row.isTotal && "text-primary font-bold"
            )}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
