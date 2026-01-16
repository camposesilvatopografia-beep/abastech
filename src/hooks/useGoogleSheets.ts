import { useState, useEffect, useCallback } from 'react';
import {
  getSheetNames,
  getSheetData,
  createRow,
  updateRow,
  deleteRow,
  SheetData,
  SheetRow,
} from '@/lib/googleSheets';
import { useToast } from '@/hooks/use-toast';

// ---------------------------------------------
// Global request de-dupe (per browser tab)
// ---------------------------------------------
const inFlightBySheet = new Map<string, Promise<SheetData>>();
const lastFetchAtBySheet = new Map<string, number>();

function canPollNow() {
  // Avoid background-tab polling bursts
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

export function useSheetNames() {
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchSheetNames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const names = await getSheetNames();
      setSheetNames(names);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sheet names';
      setError(message);
      toast({
        title: 'Erro',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSheetNames();
  }, [fetchSheetNames]);

  return { sheetNames, loading, error, refetch: fetchSheetNames };
}

export function useSheetData(
  sheetName: string | null,
  options?: { pollingInterval?: number; suppressErrors?: boolean }
) {
  const [data, setData] = useState<SheetData>({ headers: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const { toast } = useToast();
  const pollingInterval = options?.pollingInterval || 0; // 0 = no polling
  const suppressErrors = options?.suppressErrors || false; // Don't show toast for optional sheets

  const fetchData = useCallback(
    async (silent = false, forceNoCache = false) => {
      if (!sheetName) return;

      // Throttle ultra-bursty refreshes (double-clicks, multi-components mounting at once)
      const now = Date.now();
      const last = lastFetchAtBySheet.get(sheetName) ?? 0;
      if (now - last < 800 && silent) return;

      // De-dupe in-flight requests per sheet
      const existing = inFlightBySheet.get(sheetName);
      if (existing) {
        try {
          const sheetData = await existing;
          setData(sheetData);
          return;
        } catch (e) {
          // Fall through to normal error handling below
        }
      }

      lastFetchAtBySheet.set(sheetName, now);

      const promise = (async () => {
        // Polling (silent) always bypasses cache; manual refresh can request bypass too.
        const noCache = silent || forceNoCache;
        const sheetData = await getSheetData(sheetName, { noCache });
        return sheetData;
      })();

      inFlightBySheet.set(sheetName, promise);

      try {
        if (!silent) setLoading(true);
        setError(null);
        const sheetData = await promise;
        setData(sheetData);
        setLastUpdatedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(message);
        // Only show toast if not suppressed and not silent
        if (!silent && !suppressErrors) {
          toast({
            title: 'Erro ao carregar dados',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        inFlightBySheet.delete(sheetName);
        if (!silent) setLoading(false);
      }
    },
    [sheetName, toast, suppressErrors]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling for real-time updates
  useEffect(() => {
    if (!pollingInterval || pollingInterval <= 0) return;

    let intervalId: number | null = null;

    const start = () => {
      if (intervalId) return;
      intervalId = window.setInterval(() => {
        if (!canPollNow()) return;
        fetchData(true); // silent refresh
      }, pollingInterval);
    };

    const stop = () => {
      if (!intervalId) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const onVisibility = () => {
      if (canPollNow()) start();
      else stop();
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pollingInterval, fetchData]);

  const create = useCallback(
    async (rowData: Record<string, any>) => {
      if (!sheetName) return;

      try {
        await createRow(sheetName, rowData);
        toast({
          title: 'Sucesso',
          description: 'Registro criado com sucesso!',
        });
        await fetchData();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create row';
        toast({
          title: 'Erro ao criar registro',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [sheetName, fetchData, toast]
  );

  const update = useCallback(
    async (rowIndex: number, rowData: Record<string, any>) => {
      if (!sheetName) return;

      try {
        await updateRow(sheetName, rowIndex, rowData);
        toast({
          title: 'Sucesso',
          description: 'Registro atualizado com sucesso!',
        });
        await fetchData();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update row';
        toast({
          title: 'Erro ao atualizar registro',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [sheetName, fetchData, toast]
  );

  const remove = useCallback(
    async (rowIndex: number) => {
      if (!sheetName) return;

      try {
        await deleteRow(sheetName, rowIndex);
        toast({
          title: 'Sucesso',
          description: 'Registro excluído com sucesso!',
        });
        await fetchData();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete row';
        toast({
          title: 'Erro ao excluir registro',
          description: message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [sheetName, fetchData, toast]
  );

  return {
    data,
    loading,
    error,
    lastUpdatedAt,
    refetch: fetchData,
    create,
    update,
    remove,
  };
}
