import { useState, useEffect } from 'react';
import { Edit2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RecordData {
  id: string;
  vehicle_code: string;
  fuel_quantity: number;
  record_date: string;
  record_time: string;
  location: string;
  operator_name?: string;
  horimeter_current?: number;
  km_current?: number;
  arla_quantity?: number;
  observations?: string;
}

interface EditRequestModalProps {
  record: RecordData | null;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRequestModal({ record, userId, onClose, onSuccess }: EditRequestModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [proposedChanges, setProposedChanges] = useState({
    fuel_quantity: 0,
    horimeter_current: 0,
    km_current: 0,
    arla_quantity: 0,
    observations: '',
  });

  useEffect(() => {
    if (record) {
      setProposedChanges({
        fuel_quantity: record.fuel_quantity || 0,
        horimeter_current: record.horimeter_current || 0,
        km_current: record.km_current || 0,
        arla_quantity: record.arla_quantity || 0,
        observations: record.observations || '',
      });
      setReason('');
    }
  }, [record]);

  const handleSubmit = async () => {
    if (!record) return;
    
    if (!reason.trim()) {
      toast.error('Por favor, informe o motivo da alteração');
      return;
    }

    // Check if any changes were made
    const hasChanges = 
      proposedChanges.fuel_quantity !== record.fuel_quantity ||
      proposedChanges.horimeter_current !== (record.horimeter_current || 0) ||
      proposedChanges.km_current !== (record.km_current || 0) ||
      proposedChanges.arla_quantity !== (record.arla_quantity || 0) ||
      proposedChanges.observations !== (record.observations || '');

    if (!hasChanges) {
      toast.error('Nenhuma alteração foi feita');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('field_record_requests')
        .insert({
          record_id: record.id,
          request_type: 'edit',
          requested_by: userId,
          request_reason: reason.trim(),
          proposed_changes: {
            original: {
              fuel_quantity: record.fuel_quantity,
              horimeter_current: record.horimeter_current,
              km_current: record.km_current,
              arla_quantity: record.arla_quantity,
              observations: record.observations,
            },
            proposed: proposedChanges,
          },
        });

      if (error) throw error;

      toast.success('Solicitação de edição enviada para aprovação');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error submitting edit request:', err);
      toast.error('Erro ao enviar solicitação');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!record) return null;

  return (
    <Dialog open={!!record} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Edit2 className="w-5 h-5 text-blue-500" />
            Solicitar Edição
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Registro: <strong className="text-foreground">{record.vehicle_code}</strong> - {record.record_date}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Fuel Quantity */}
          <div className="space-y-2">
            <Label className="text-foreground">
              Quantidade de Combustível (L)
              <span className="text-xs text-muted-foreground ml-2">Atual: {record.fuel_quantity}L</span>
            </Label>
            <Input
              type="number"
              step="0.01"
              value={proposedChanges.fuel_quantity}
              onChange={(e) => setProposedChanges(prev => ({ 
                ...prev, 
                fuel_quantity: parseFloat(e.target.value) || 0 
              }))}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Horimeter */}
          <div className="space-y-2">
            <Label className="text-foreground">
              Horímetro Atual
              <span className="text-xs text-muted-foreground ml-2">Atual: {record.horimeter_current || '-'}</span>
            </Label>
            <Input
              type="number"
              step="0.1"
              value={proposedChanges.horimeter_current}
              onChange={(e) => setProposedChanges(prev => ({ 
                ...prev, 
                horimeter_current: parseFloat(e.target.value) || 0 
              }))}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* KM */}
          <div className="space-y-2">
            <Label className="text-foreground">
              KM Atual
              <span className="text-xs text-muted-foreground ml-2">Atual: {record.km_current || '-'}</span>
            </Label>
            <Input
              type="number"
              step="1"
              value={proposedChanges.km_current}
              onChange={(e) => setProposedChanges(prev => ({ 
                ...prev, 
                km_current: parseInt(e.target.value) || 0 
              }))}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* ARLA */}
          <div className="space-y-2">
            <Label className="text-foreground">
              ARLA (L)
              <span className="text-xs text-muted-foreground ml-2">Atual: {record.arla_quantity || 0}L</span>
            </Label>
            <Input
              type="number"
              step="0.1"
              value={proposedChanges.arla_quantity}
              onChange={(e) => setProposedChanges(prev => ({ 
                ...prev, 
                arla_quantity: parseFloat(e.target.value) || 0 
              }))}
              className="bg-background border-border text-foreground"
            />
          </div>

          {/* Observations */}
          <div className="space-y-2">
            <Label className="text-foreground">Observações</Label>
            <Textarea
              value={proposedChanges.observations}
              onChange={(e) => setProposedChanges(prev => ({ 
                ...prev, 
                observations: e.target.value 
              }))}
              className="bg-background border-border text-foreground min-h-[60px]"
              placeholder="Observações do registro..."
            />
          </div>

          {/* Reason - Required */}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-amber-500">
              Motivo da Alteração <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-background border-amber-600/50 text-foreground min-h-[80px]"
              placeholder="Explique por que você precisa alterar este registro..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !reason.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Solicitar Edição
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
