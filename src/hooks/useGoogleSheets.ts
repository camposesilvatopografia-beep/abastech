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
//
// IMPORTANT:
// We key by "sheet + cache mode" so a manual "noCache" refresh is never
// forced to await a cached in-flight request (which would make cards look stale).
// ---------------------------------------------
const inFlightByKey = new Map<string, Promise<SheetData>>();
const lastFetchAtByKey = new Map<string, number>();

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

      // Polling (silent) always bypasses cache; manual refresh can request bypass too.
      const noCache = silent || forceNoCache;
      const requestKey = `${sheetName}|${noCache ? 'noCache' : 'cache'}`;

      const last = lastFetchAtByKey.get(requestKey) ?? 0;
      if (now - last < 800 && silent) return;

      // De-dupe in-flight requests per (sheet + cacheMode)
      const existing = inFlightByKey.get(requestKey);
      if (existing) {
        try {
          const sheetData = await existing;
          setData(sheetData);
          return;
        } catch {
          // Fall through to normal error handling below
        }
      }

      lastFetchAtByKey.set(requestKey, now);

      const promise = (async () => {
        const sheetData = await getSheetData(sheetName, { noCache });
        return sheetData;
      })();

      inFlightByKey.set(requestKey, promise);

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
        inFlightByKey.delete(requestKey);
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
      if (canPollNow()) {
        start();
        // Refresh immediately when the user comes back to the tab (avoid showing stale cards)
        fetchData(true, true);
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);

    const onFocus = () => {
      if (!canPollNow()) return;
      fetchData(true, true);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
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
