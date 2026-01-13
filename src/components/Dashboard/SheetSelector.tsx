import { Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetSelectorProps {
  sheets: string[];
  selectedSheet: string | null;
  onSelect: (sheet: string) => void;
  loading: boolean;
}

export function SheetSelector({ sheets, selectedSheet, onSelect, loading }: SheetSelectorProps) {
  if (loading) {
    return (
      <div className="w-64 bg-sidebar border-r border-sidebar-border p-4">
        <h2 className="text-sm font-semibold text-sidebar-foreground mb-4 uppercase tracking-wider">
          Planilhas
        </h2>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-sidebar-accent rounded-lg animate-pulse-soft" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <nav className="w-64 bg-sidebar border-r border-sidebar-border p-4 flex flex-col">
      <h2 className="text-sm font-semibold text-sidebar-foreground mb-4 uppercase tracking-wider">
        Planilhas
      </h2>
      <div className="space-y-1 flex-1">
        {sheets.map((sheet) => (
          <button
            key={sheet}
            onClick={() => onSelect(sheet)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200",
              selectedSheet === sheet
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <Table2 className="w-4 h-4 flex-shrink-0" />
            <span className="truncate text-sm font-medium">{sheet}</span>
          </button>
        ))}
      </div>
      
      <div className="pt-4 border-t border-sidebar-border mt-4">
        <p className="text-xs text-sidebar-foreground/60">
          {sheets.length} planilha{sheets.length !== 1 ? 's' : ''} disponível{sheets.length !== 1 ? 'eis' : ''}
        </p>
      </div>
    </nav>
  );
}
