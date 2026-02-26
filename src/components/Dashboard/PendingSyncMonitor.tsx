import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Loader2, CheckCircle, MapPin, Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PendingGroup {
  location: string;
  count: number;
  oldestDate: string;
  records: { id: string; vehicle_code: string; record_date: string; fuel_quantity: number; record_type: string }[];
}

export function PendingSyncMonitor() {
  const [pendingGroups, setPendingGroups] = useState<PendingGroup[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('field_fuel_records')
        .select('id, vehicle_code, record_date, fuel_quantity, record_type, location')
        .eq('synced_to_sheet', false)
        .lt('record_date', todayStr)
        .order('record_date', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) {
        setPendingGroups([]);
        setTotalPending(0);
        setLoading(false);
        return;
      }

      // Group by location
      const groups: Record<string, PendingGroup> = {};
      for (const r of data) {
        const loc = r.location || 'Sem local';
        if (!groups[loc]) {
          groups[loc] = { location: loc, count: 0, oldestDate: r.record_date, records: [] };
        }
        groups[loc].count++;
        if (r.record_date < groups[loc].oldestDate) groups[loc].oldestDate = r.record_date;
        groups[loc].records.push({
          id: r.id,
          vehicle_code: r.vehicle_code,
          record_date: r.record_date,
          fuel_quantity: r.fuel_quantity,
          record_type: r.record_type || 'saida',
        });
      }

      setPendingGroups(Object.values(groups).sort((a, b) => b.count - a.count));
      setTotalPending(data.length);
    } catch (err) {
      console.error('Error fetching pending sync records:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleSync = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-pending-fuel');
      if (error) throw error;

      setLastSyncResult({ synced: data?.synced || 0, failed: data?.failed || 0 });
      const skippedCount = data?.skipped || 0;

      if (data?.synced > 0) {
        toast.success(`${data.synced} registro(s) sincronizado(s) com sucesso!${skippedCount > 0 ? ` (${skippedCount} já existiam)` : ''}`);
      }
      if (data?.failed > 0) {
        toast.error(`${data.failed} registro(s) falharam na sincronização.`);
      }
      if (data?.synced === 0 && data?.failed === 0) {
        toast.info(skippedCount > 0 ? `${skippedCount} registro(s) já estavam sincronizados.` : 'Nenhum registro pendente para sincronizar.');
      }

      // Refresh data
      await fetchPending();
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Erro ao sincronizar registros pendentes.');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      return format(new Date(y, m - 1, d), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  if (loading) return null;
  if (totalPending === 0 && !lastSyncResult) return null;

  return (
    <Card className={cn(
      "border-2",
      totalPending > 0 ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20" : "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            {totalPending > 0 ? (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <span className="text-amber-700 dark:text-amber-400">
                  {totalPending} Registro(s) Pendente(s) de Sincronização
                </span>
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-700 dark:text-green-400">
                  Todos os registros sincronizados
                </span>
              </>
            )}
          </CardTitle>

          <Button
            onClick={handleSync}
            disabled={syncing || totalPending === 0}
            size="sm"
            className={cn(
              "gap-2",
              totalPending > 0
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            )}
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sincronizar
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {totalPending > 0 && (
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingGroups.map((group) => (
              <div
                key={group.location}
                className={cn(
                  "rounded-lg p-3 border",
                  "bg-background/80 border-amber-200 dark:border-amber-800"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{group.location}</span>
                  <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    {group.count}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>Desde {formatDate(group.oldestDate)}</span>
                </div>
                <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                  {group.records.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      <span>{r.vehicle_code}</span>
                      <span className="ml-auto">{r.fuel_quantity.toLocaleString('pt-BR')}L</span>
                    </div>
                  ))}
                  {group.records.length > 5 && (
                    <span className="text-xs text-muted-foreground">+{group.records.length - 5} mais...</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {lastSyncResult && (
            <div className="mt-3 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
              Último resultado: {lastSyncResult.synced} sincronizado(s), {lastSyncResult.failed} falha(s)
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
