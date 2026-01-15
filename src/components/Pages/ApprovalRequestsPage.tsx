import { useState, useEffect } from 'react';
import {
  Check,
  X,
  AlertCircle,
  Trash2,
  Edit2,
  Clock,
  User,
  Truck,
  Fuel,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface PendingRequest {
  id: string;
  record_id: string;
  request_type: string;
  requested_by: string;
  requested_at: string;
  status: string;
  proposed_changes: any;
  request_reason?: string;
  requester_name?: string;
  record_details?: {
    vehicle_code: string;
    fuel_quantity: number;
    record_date: string;
    record_time: string;
    location: string;
  };
}

export function ApprovalRequestsPage() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      // Fetch pending requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('field_record_requests')
        .select('*')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (requestsError) throw requestsError;

      if (!requestsData || requestsData.length === 0) {
        setRequests([]);
        setIsLoading(false);
        return;
      }

      // Enrich with user names and record details
      const enrichedRequests = await Promise.all(
        requestsData.map(async (request) => {
          // Get requester name
          const { data: userData } = await supabase
            .from('field_users')
            .select('name')
            .eq('id', request.requested_by)
            .single();

          // Get record details
          const { data: recordData } = await supabase
            .from('field_fuel_records')
            .select('vehicle_code, fuel_quantity, record_date, record_time, location')
            .eq('id', request.record_id)
            .single();

          return {
            ...request,
            requester_name: userData?.name || 'Desconhecido',
            record_details: recordData || undefined,
          };
        })
      );

      setRequests(enrichedRequests);
    } catch (err) {
      console.error('Error fetching requests:', err);
      toast.error('Erro ao carregar solicitações');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return;

    setIsProcessing(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem('abastech_user') || '{}');

      if (actionType === 'approve') {
        // If approving a delete request, delete from database AND Google Sheets
        if (selectedRequest.request_type === 'delete') {
          // First, get the record details before deleting
          const { data: recordToDelete, error: fetchError } = await supabase
            .from('field_fuel_records')
            .select('*')
            .eq('id', selectedRequest.record_id)
            .single();

          if (fetchError) {
            console.error('Error fetching record for deletion:', fetchError);
            // Continue with deletion even if we can't fetch details
          }

          // Delete from database
          const { error: deleteError } = await supabase
            .from('field_fuel_records')
            .delete()
            .eq('id', selectedRequest.record_id);

          if (deleteError) throw deleteError;

          // Sync deletion to Google Sheets (find and remove matching row)
          if (recordToDelete) {
            try {
              toast.info('Sincronizando exclusão com planilha...');
              
              // Get all rows from the sheet to find the matching one
              const { data: sheetData } = await supabase.functions.invoke('google-sheets', {
                body: { action: 'getData', sheetName: 'AbastecimentoCanteiro01' },
              });
              
              const rows = sheetData?.rows || [];
              
              // Format the date for comparison (DD/MM/YYYY)
              const recordDate = new Date(recordToDelete.record_date);
              const formattedDate = `${String(recordDate.getDate()).padStart(2, '0')}/${String(recordDate.getMonth() + 1).padStart(2, '0')}/${recordDate.getFullYear()}`;
              
              // Find the row index by matching vehicle, date, time, and quantity
              const rowIndex = rows.findIndex((row: any) => {
                const rowVehicle = String(row['VEICULO'] || row['Veiculo'] || '').trim();
                const rowDate = String(row['DATA'] || row['Data'] || '').trim();
                const rowTime = String(row['HORA'] || row['Hora'] || '').trim();
                const rowQty = parseFloat(String(row['QUANTIDADE'] || row['Quantidade'] || 0)) || 0;
                
                return rowVehicle === recordToDelete.vehicle_code && 
                       rowDate === formattedDate &&
                       rowTime === recordToDelete.record_time &&
                       Math.abs(rowQty - recordToDelete.fuel_quantity) < 0.01;
              });
              
              if (rowIndex >= 0) {
                const sheetRowIndex = rowIndex + 2; // +1 for header, +1 for 1-based index
                
                await supabase.functions.invoke('google-sheets', {
                  body: {
                    action: 'delete',
                    sheetName: 'AbastecimentoCanteiro01',
                    rowIndex: sheetRowIndex,
                  },
                });
                
                console.log('✓ Registro excluído da planilha AbastecimentoCanteiro01');
              } else {
                console.warn('Registro não encontrado na planilha para exclusão');
              }
            } catch (syncErr) {
              console.error('Erro ao sincronizar exclusão com planilha:', syncErr);
              // Don't fail the operation - DB deletion was successful
            }
          }
        }
        
        // If approving an edit request, apply the proposed changes
        if (selectedRequest.request_type === 'edit' && selectedRequest.proposed_changes?.proposed) {
          const proposed = selectedRequest.proposed_changes.proposed;
          const { error: updateError } = await supabase
            .from('field_fuel_records')
            .update({
              fuel_quantity: proposed.fuel_quantity,
              horimeter_current: proposed.horimeter_current || null,
              km_current: proposed.km_current || null,
              arla_quantity: proposed.arla_quantity || null,
              observations: proposed.observations || null,
            })
            .eq('id', selectedRequest.record_id);

          if (updateError) throw updateError;
        }

        // Update request status - use reviewer_name instead of reviewed_by to avoid FK constraint
        const { error } = await supabase
          .from('field_record_requests')
          .update({
            status: 'approved',
            reviewed_by: null, // Don't use FK - admin may be from system_users
            reviewer_name: currentUser.name || 'Admin',
            reviewed_at: new Date().toISOString(),
            review_notes: reviewNotes || null,
          })
          .eq('id', selectedRequest.id);

        if (error) throw error;

        toast.success(
          selectedRequest.request_type === 'delete'
            ? 'Exclusão aprovada e registro removido do sistema e planilha'
            : 'Edição aprovada e alterações aplicadas'
        );
      } else {
        // Reject the request - use reviewer_name instead of reviewed_by
        const { error } = await supabase
          .from('field_record_requests')
          .update({
            status: 'rejected',
            reviewed_by: null,
            reviewer_name: currentUser.name || 'Admin',
            reviewed_at: new Date().toISOString(),
            review_notes: reviewNotes || null,
          })
          .eq('id', selectedRequest.id);

        if (error) throw error;
        toast.success('Solicitação rejeitada');
      }

      setSelectedRequest(null);
      setActionType(null);
      setReviewNotes('');
      fetchRequests();
    } catch (err) {
      console.error('Error processing request:', err);
      toast.error('Erro ao processar solicitação');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Aprovações Pendentes</h1>
          <p className="text-muted-foreground">
            Gerencie solicitações de edição e exclusão dos apontadores de campo
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {requests.length} pendente{requests.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Tudo em dia!</h3>
            <p className="text-muted-foreground text-center">
              Não há solicitações pendentes de aprovação no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="border-l-4 border-l-amber-500">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    {/* Icon */}
                    <div className={`p-3 rounded-full ${
                      request.request_type === 'delete' 
                        ? 'bg-red-100 text-red-600' 
                        : 'bg-blue-100 text-blue-600'
                    }`}>
                      {request.request_type === 'delete' ? (
                        <Trash2 className="w-5 h-5" />
                      ) : (
                        <Edit2 className="w-5 h-5" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={request.request_type === 'delete' ? 'destructive' : 'default'}>
                          {request.request_type === 'delete' ? 'Exclusão' : 'Edição'}
                        </Badge>
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(request.requested_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm mb-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{request.requester_name}</span>
                        <span className="text-muted-foreground">solicitou</span>
                      </div>

                      {request.record_details && (
                        <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Truck className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{request.record_details.vehicle_code}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Fuel className="w-4 h-4 text-muted-foreground" />
                            <span>{request.record_details.fuel_quantity}L</span>
                            <span className="text-muted-foreground">•</span>
                            <span>{request.record_details.location}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Registro de {request.record_details.record_date} às {request.record_details.record_time}
                          </div>
                        </div>
                      )}
                      
                      {/* Proposed changes for edit requests */}
                      {request.request_type === 'edit' && request.proposed_changes && (
                        <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">Alterações propostas:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {request.proposed_changes.original?.fuel_quantity !== request.proposed_changes.proposed?.fuel_quantity && (
                              <div>
                                <span className="text-muted-foreground">Combustível:</span>
                                <span className="ml-1 line-through text-red-500">{request.proposed_changes.original?.fuel_quantity}L</span>
                                <span className="ml-1 text-green-600 font-medium">→ {request.proposed_changes.proposed?.fuel_quantity}L</span>
                              </div>
                            )}
                            {request.proposed_changes.original?.horimeter_current !== request.proposed_changes.proposed?.horimeter_current && (
                              <div>
                                <span className="text-muted-foreground">Horímetro:</span>
                                <span className="ml-1 line-through text-red-500">{request.proposed_changes.original?.horimeter_current || '-'}</span>
                                <span className="ml-1 text-green-600 font-medium">→ {request.proposed_changes.proposed?.horimeter_current || '-'}</span>
                              </div>
                            )}
                            {request.proposed_changes.original?.km_current !== request.proposed_changes.proposed?.km_current && (
                              <div>
                                <span className="text-muted-foreground">KM:</span>
                                <span className="ml-1 line-through text-red-500">{request.proposed_changes.original?.km_current || '-'}</span>
                                <span className="ml-1 text-green-600 font-medium">→ {request.proposed_changes.proposed?.km_current || '-'}</span>
                              </div>
                            )}
                            {request.proposed_changes.original?.arla_quantity !== request.proposed_changes.proposed?.arla_quantity && (
                              <div>
                                <span className="text-muted-foreground">ARLA:</span>
                                <span className="ml-1 line-through text-red-500">{request.proposed_changes.original?.arla_quantity || 0}L</span>
                                <span className="ml-1 text-green-600 font-medium">→ {request.proposed_changes.proposed?.arla_quantity || 0}L</span>
                              </div>
                            )}
                          </div>
                          {request.proposed_changes.original?.observations !== request.proposed_changes.proposed?.observations && (
                            <div className="mt-2 text-xs">
                              <span className="text-muted-foreground">Observações:</span>
                              <p className="text-blue-900 dark:text-blue-100 mt-1">{request.proposed_changes.proposed?.observations || '(vazio)'}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Request reason */}
                      {request.request_reason && (
                        <div className="mt-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Motivo da solicitação:</p>
                              <p className="text-sm text-amber-900 dark:text-amber-100">{request.request_reason}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setSelectedRequest(request);
                        setActionType('approve');
                      }}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-300 text-red-600 hover:bg-red-50"
                      onClick={() => {
                        setSelectedRequest(request);
                        setActionType('reject');
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Rejeitar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={!!selectedRequest && !!actionType} onOpenChange={() => {
        setSelectedRequest(null);
        setActionType(null);
        setReviewNotes('');
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {actionType === 'approve' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  Confirmar Aprovação
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  Confirmar Rejeição
                </>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve' && selectedRequest?.request_type === 'delete' ? (
                <span className="text-red-600 font-medium">
                  O registro será excluído permanentemente. Esta ação não pode ser desfeita.
                </span>
              ) : actionType === 'approve' ? (
                'O usuário poderá editar o registro após sua aprovação.'
              ) : (
                'O usuário será notificado que sua solicitação foi rejeitada.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Adicione uma observação sobre sua decisão..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="mt-2"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={isProcessing}
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : actionType === 'approve' ? (
                'Confirmar Aprovação'
              ) : (
                'Confirmar Rejeição'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}