import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'mobilizado', label: 'Mobilizado' },
  { value: 'desmobilizado', label: 'Desmobilizado' },
  { value: 'em transito', label: 'Em Trânsito' },
  { value: 'reserva', label: 'Reserva' },
];

interface BatchStatusModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedVehicles: string[]; // vehicle codes
}

export function BatchStatusModal({ open, onClose, onSuccess, selectedVehicles }: BatchStatusModalProps) {
  const [newStatus, setNewStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);

  const handleBatchUpdate = async () => {
    if (!newStatus) {
      toast.error('Selecione o novo status');
      return;
    }

    setProcessing(true);
    setTotal(selectedVehicles.length);
    setProgress(0);

    try {
      // First, fetch all sheet data to find row indices
      const { data: sheetData, error: fetchError } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Veiculo', noCache: true },
      });

      if (fetchError) throw fetchError;

      const rows = sheetData?.rows || [];
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s/g, '');

      let updated = 0;
      let errors = 0;

      for (const code of selectedVehicles) {
        const targetCode = normalize(code);
        const matchedRow = rows.find((r: any) => {
          const rowCode = normalize(String(r.CODIGO || r['CÓDIGO'] || r['Codigo'] || ''));
          return rowCode === targetCode;
        });

        if (!matchedRow?._rowIndex) {
          errors++;
          setProgress(prev => prev + 1);
          continue;
        }

        try {
          // Build row data preserving existing values, only changing STATUS
          const rowData: Record<string, string> = {};
          for (const [key, val] of Object.entries(matchedRow)) {
            if (key === '_rowIndex') continue;
            rowData[key] = String(val ?? '');
          }
          // Update status
          const statusKey = Object.keys(rowData).find(k => k.toUpperCase() === 'STATUS') || 'STATUS';
          rowData[statusKey] = newStatus;

          const { error } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'update',
              sheetName: 'Veiculo',
              rowIndex: matchedRow._rowIndex,
              data: rowData,
            },
          });

          if (error) throw error;
          updated++;
        } catch (e) {
          console.error(`Error updating ${code}:`, e);
          errors++;
        }

        setProgress(prev => prev + 1);

        // Small delay to avoid rate limiting
        if (updated % 5 === 0) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (errors === 0) {
        toast.success(`${updated} veículo(s) atualizado(s) com sucesso!`);
      } else {
        toast.warning(`${updated} atualizado(s), ${errors} erro(s)`);
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Batch update error:', error);
      toast.error('Erro ao atualizar em lote');
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !processing && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Atualizar Status em Lote
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{selectedVehicles.length}</span> veículo(s) selecionado(s)
          </p>

          <div className="max-h-32 overflow-y-auto rounded border border-border p-2 text-xs space-y-0.5">
            {selectedVehicles.map(code => (
              <div key={code} className="text-muted-foreground">{code}</div>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Novo Status</label>
            <Select value={newStatus} onValueChange={setNewStatus} disabled={processing}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {processing && (
            <div className="space-y-2">
              <Progress value={(progress / total) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {progress} de {total} processados
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancelar
          </Button>
          <Button onClick={handleBatchUpdate} disabled={processing || !newStatus} className="gap-2">
            {processing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : null}
            {processing ? 'Processando...' : 'Atualizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
