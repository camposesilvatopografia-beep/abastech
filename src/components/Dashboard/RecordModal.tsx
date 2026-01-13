import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SheetRow } from '@/lib/googleSheets';

interface RecordModalProps {
  open: boolean;
  onClose: () => void;
  headers: string[];
  row?: SheetRow | null;
  onSave: (data: Record<string, string>) => Promise<void>;
  mode: 'create' | 'edit';
}

export function RecordModal({ open, onClose, headers, row, onSave, mode }: RecordModalProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const displayHeaders = headers.filter(h => h !== '_rowIndex');

  useEffect(() => {
    if (open) {
      if (mode === 'edit' && row) {
        const data: Record<string, string> = {};
        displayHeaders.forEach((header) => {
          data[header] = String(row[header] ?? '');
        });
        setFormData(data);
      } else {
        const data: Record<string, string> = {};
        displayHeaders.forEach((header) => {
          data[header] = '';
        });
        setFormData(data);
      }
    }
  }, [open, row, mode, displayHeaders.join(',')]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      // Error is handled by the hook
    } finally {
      setSaving(false);
    }
  };

  const isLongText = (header: string) => {
    const value = formData[header] || '';
    return value.length > 100 || header.toLowerCase().includes('descri') || header.toLowerCase().includes('observ');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {mode === 'create' ? 'Novo Registro' : 'Editar Registro'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayHeaders.map((header) => (
              <div key={header} className={isLongText(header) ? 'md:col-span-2' : ''}>
                <Label htmlFor={header} className="text-sm font-medium">
                  {header}
                </Label>
                {isLongText(header) ? (
                  <Textarea
                    id={header}
                    value={formData[header] || ''}
                    onChange={(e) => setFormData({ ...formData, [header]: e.target.value })}
                    className="mt-1.5 input-field resize-none"
                    rows={3}
                  />
                ) : (
                  <Input
                    id={header}
                    value={formData[header] || ''}
                    onChange={(e) => setFormData({ ...formData, [header]: e.target.value })}
                    className="mt-1.5 input-field"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" className="btn-primary gap-2" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
