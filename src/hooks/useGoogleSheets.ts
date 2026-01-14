import { useState, useEffect, useCallback } from 'react';
import { 
  getSheetNames, 
  getSheetData, 
  createRow, 
  updateRow, 
  deleteRow,
  SheetData,
  SheetRow 
} from '@/lib/googleSheets';
import { useToast } from '@/hooks/use-toast';

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

export function useSheetData(sheetName: string | null, options?: { pollingInterval?: number }) {
  const [data, setData] = useState<SheetData>({ headers: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const pollingInterval = options?.pollingInterval || 0; // 0 = no polling

  const fetchData = useCallback(async (silent = false) => {
    if (!sheetName) return;
    
    try {
      if (!silent) setLoading(true);
      setError(null);
      const sheetData = await getSheetData(sheetName);
      setData(sheetData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(message);
      if (!silent) {
        toast({
          title: 'Erro ao carregar dados',
          description: message,
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [sheetName, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling for real-time updates
  useEffect(() => {
    if (!pollingInterval || pollingInterval <= 0) return;
    
    const intervalId = setInterval(() => {
      fetchData(true); // silent refresh
    }, pollingInterval);

    return () => clearInterval(intervalId);
  }, [pollingInterval, fetchData]);

  const create = useCallback(async (rowData: Record<string, any>) => {
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
  }, [sheetName, fetchData, toast]);

  const update = useCallback(async (rowIndex: number, rowData: Record<string, any>) => {
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
  }, [sheetName, fetchData, toast]);

  const remove = useCallback(async (rowIndex: number) => {
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
  }, [sheetName, fetchData, toast]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    create,
    update,
    remove,
  };
}
