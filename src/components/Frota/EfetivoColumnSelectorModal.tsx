import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  GripVertical,
  ArrowUp,
  ArrowDown,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EfetivoColumn {
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

// Preferred default order for companies
const PREFERRED_ORDER = [
  'engemat',
  'a. barreto',
  'barreto',
  'l. pereira',
  'pereira',
  'consórcio',
  'consorcio',
  'terceiros',
];

function getPreferredOrder(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < PREFERRED_ORDER.length; i++) {
    if (lower.includes(PREFERRED_ORDER[i])) return i;
  }
  return PREFERRED_ORDER.length;
}

interface EfetivoColumnSelectorModalProps {
  open: boolean;
  onClose: () => void;
  companies: string[];
  onGenerate: (selectedColumns: EfetivoColumn[]) => void;
  loading?: boolean;
}

export function EfetivoColumnSelectorModal({
  open,
  onClose,
  companies,
  onGenerate,
  loading,
}: EfetivoColumnSelectorModalProps) {
  const [columns, setColumns] = useState<EfetivoColumn[]>([]);

  useEffect(() => {
    if (open && companies.length > 0) {
      // Sort companies by preferred order
      const sorted = [...companies].sort(
        (a, b) => getPreferredOrder(a) - getPreferredOrder(b) || a.localeCompare(b, 'pt-BR')
      );
      const saved = localStorage.getItem('efetivo-pdf-columns');
      if (saved) {
        try {
          const savedCols = JSON.parse(saved) as EfetivoColumn[];
          // Merge saved with current companies
          const merged = sorted.map((c, idx) => {
            const found = savedCols.find(s => s.key === c);
            return found ? { ...found, label: c } : { key: c, label: c, visible: true, order: idx };
          });
          merged.sort((a, b) => a.order - b.order);
          setColumns(merged);
          return;
        } catch { /* ignore */ }
      }
      setColumns(sorted.map((c, idx) => ({ key: c, label: c, visible: true, order: idx })));
    }
  }, [open, companies]);

  const toggleVisibility = (key: string) => {
    setColumns(prev => prev.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;
    const newCols = [...columns];
    [newCols[index], newCols[newIndex]] = [newCols[newIndex], newCols[index]];
    newCols.forEach((c, i) => { c.order = i; });
    setColumns(newCols);
  };

  const handleGenerate = () => {
    localStorage.setItem('efetivo-pdf-columns', JSON.stringify(columns));
    onGenerate(columns);
  };

  const handleReset = () => {
    const sorted = [...companies].sort(
      (a, b) => getPreferredOrder(a) - getPreferredOrder(b) || a.localeCompare(b, 'pt-BR')
    );
    setColumns(sorted.map((c, idx) => ({ key: c, label: c, visible: true, order: idx })));
  };

  const visibleCount = columns.filter(c => c.visible).length;

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle>Configurar Colunas do Efetivo</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Selecione e ordene as empresas no relatório
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="text-sm text-muted-foreground px-1">
          {visibleCount} de {columns.length} empresas selecionadas
        </div>

        <ScrollArea className="h-[350px] pr-4">
          <div className="space-y-2">
            {columns.map((col, index) => (
              <div
                key={col.key}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  col.visible
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/50 border-border opacity-60'
                )}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />

                <Checkbox
                  id={`efetivo-col-${col.key}`}
                  checked={col.visible}
                  onCheckedChange={() => toggleVisibility(col.key)}
                />

                <Label
                  htmlFor={`efetivo-col-${col.key}`}
                  className={cn(
                    'flex-1 cursor-pointer text-sm font-medium',
                    !col.visible && 'text-muted-foreground line-through'
                  )}
                >
                  {col.label}
                </Label>

                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => moveColumn(index, 'up')} disabled={index === 0}>
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => moveColumn(index, 'down')} disabled={index === columns.length - 1}>
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Restaurar Padrão
          </Button>
          <Button onClick={handleGenerate} disabled={loading || visibleCount === 0} className="gap-2 bg-teal-600 hover:bg-teal-700">
            <FileText className="w-4 h-4" />
            {loading ? 'Gerando...' : 'Gerar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
