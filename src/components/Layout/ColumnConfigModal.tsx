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
  Eye,
  EyeOff,
  Settings2,
  RotateCcw,
  Save,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { ColumnConfig } from '@/hooks/useLayoutPreferences';
import { cn } from '@/lib/utils';

interface ColumnConfigModalProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnConfig[];
  onSave: (columns: ColumnConfig[]) => void;
  onReset: () => void;
  saving?: boolean;
  moduleName: string;
}

export function ColumnConfigModal({
  open,
  onClose,
  columns,
  onSave,
  onReset,
  saving,
  moduleName,
}: ColumnConfigModalProps) {
  const [localColumns, setLocalColumns] = useState<ColumnConfig[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setLocalColumns([...columns].sort((a, b) => a.order - b.order));
    }
  }, [open, columns]);

  const toggleVisibility = (key: string) => {
    setLocalColumns((prev) =>
      prev.map((col) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= localColumns.length) return;

    const newColumns = [...localColumns];
    const temp = newColumns[index];
    newColumns[index] = newColumns[newIndex];
    newColumns[newIndex] = temp;

    // Update order values
    newColumns.forEach((col, idx) => {
      col.order = idx;
    });

    setLocalColumns(newColumns);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColumns = [...localColumns];
    const draggedItem = newColumns[draggedIndex];
    newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedItem);

    // Update order values
    newColumns.forEach((col, idx) => {
      col.order = idx;
    });

    setLocalColumns(newColumns);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = () => {
    onSave(localColumns);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  const visibleCount = localColumns.filter((c) => c.visible).length;
  const hiddenCount = localColumns.filter((c) => !c.visible).length;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle>Configurar Colunas</DialogTitle>
              <p className="text-sm text-muted-foreground">{moduleName}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 px-1 text-sm">
          <span className="text-muted-foreground">
            <Eye className="w-4 h-4 inline mr-1" />
            {visibleCount} visíveis
          </span>
          <span className="text-muted-foreground">
            <EyeOff className="w-4 h-4 inline mr-1" />
            {hiddenCount} ocultas
          </span>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-2">
            {localColumns.map((column, index) => (
              <div
                key={column.key}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  column.visible
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-muted/50 border-border opacity-60',
                  draggedIndex === index && 'opacity-50 scale-95'
                )}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />

                <Checkbox
                  id={`col-${column.key}`}
                  checked={column.visible}
                  onCheckedChange={() => toggleVisibility(column.key)}
                />

                <Label
                  htmlFor={`col-${column.key}`}
                  className={cn(
                    'flex-1 cursor-pointer text-sm',
                    !column.visible && 'text-muted-foreground line-through'
                  )}
                >
                  {column.label}
                </Label>

                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveColumn(index, 'up')}
                    disabled={index === 0}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveColumn(index, 'down')}
                    disabled={index === localColumns.length - 1}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            className="gap-2"
            disabled={saving}
          >
            <RotateCcw className="w-4 h-4" />
            Restaurar Padrão
          </Button>
          <Button onClick={handleSave} className="gap-2" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
