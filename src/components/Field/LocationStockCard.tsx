import { useMemo, forwardRef, useImperativeHandle, useEffect, useState, useCallback } from 'react';
import { 
  Fuel, 
  TrendingDown, 
  LogIn, 
  LogOut as LogOutIcon,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface LocalRecordKPI {
  entradas: number;
  saidas: number;
}

interface LocationStockCardProps {
  location: string;
  localRecordKPIs?: LocalRecordKPI;
}

// Expose refetch method via ref
export interface LocationStockCardRef {
  refetch: () => void;
}

// Helper function to get the stock sheet name for a location
function getStockSheetName(location: string): string {
  const normalized = location.toLowerCase().trim();
  
  if (normalized.includes('comboio 01') || normalized.includes('comboio01') || normalized === 'cb-01') {
    return 'EstoqueComboio01';
  }
  if (normalized.includes('comboio 02') || normalized.includes('comboio02') || normalized === 'cb-02') {
    return 'EstoqueComboio02';
  }
  if (normalized.includes('comboio 03') || normalized.includes('comboio03') || normalized === 'cb-03') {
    return 'EstoqueComboio03';
  }
  if (normalized.includes('tanque canteiro 01') || normalized.includes('canteiro01') || normalized.includes('canteiro 01')) {
    return 'EstoqueCanteiro01';
  }
  if (normalized.includes('tanque canteiro 02') || normalized.includes('canteiro02') || normalized.includes('canteiro 02')) {
    return 'EstoqueCanteiro02';
  }
  
  // Default fallback
  return 'GERAL';
}

// Helper to get location match strings for DB queries
function getLocationMatchStrings(location: string): string[] {
  const normalized = location.toLowerCase().trim();
  if (normalized.includes('comboio 01')) return ['Comboio 01', 'comboio 01', 'CB-01'];
  if (normalized.includes('comboio 02')) return ['Comboio 02', 'comboio 02', 'CB-02'];
  if (normalized.includes('comboio 03')) return ['Comboio 03', 'comboio 03', 'CB-03'];
  if (normalized.includes('canteiro 01')) return ['Tanque Canteiro 01', 'tanque canteiro 01', 'Canteiro 01'];
  if (normalized.includes('canteiro 02')) return ['Tanque Canteiro 02', 'tanque canteiro 02', 'Canteiro 02'];
  return [location];
}

// Helper to parse Brazilian date format (dd/MM/yyyy)
function parseBrazilianDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return null;
}

// Helper to check if date is today
function isToday(dateStr: string): boolean {
  const today = new Date();
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  
  if (dateStr === todayFormatted) return true;
  
  const parsedDate = parseBrazilianDate(dateStr);
  if (parsedDate) {
    return parsedDate.toDateString() === today.toDateString();
  }
  
  return false;
}

export const LocationStockCard = forwardRef<LocationStockCardRef, LocationStockCardProps>(
  function LocationStockCard({ location, localRecordKPIs }, ref) {
  const { theme } = useTheme();
  const stockSheetName = getStockSheetName(location);
  const todayISO = format(new Date(), 'yyyy-MM-dd');
  
  // Use polling every 15 seconds for sheet data
  const { data: stockSheetData, loading: sheetLoading, refetch } = useSheetData(stockSheetName, { 
    pollingInterval: 15000 
  });

  // Also fetch today's records from DB for instant updates
  const [dbEntradas, setDbEntradas] = useState(0);
  const [dbSaidas, setDbSaidas] = useState(0);
  const [dbVersion, setDbVersion] = useState(0);

  const locationMatches = useMemo(() => getLocationMatchStrings(location), [location]);

  const fetchDbRecords = useCallback(async () => {
    try {
      // Build OR filter for location matches
      const orFilter = locationMatches.map(l => `location.eq.${l}`).join(',');
      
      // Only count records NOT yet synced to sheet — these are the "extra" ones
      const { data, error } = await supabase
        .from('field_fuel_records')
        .select('fuel_quantity, record_type, location, synced_to_sheet')
        .eq('record_date', todayISO)
        .or(orFilter);

      if (error) {
        console.error('Error fetching DB records for stock:', error);
        return;
      }

      let unsyncedEntradas = 0;
      let unsyncedSaidas = 0;
      
      (data || []).forEach(r => {
        // Only count unsynced records as supplement to sheet data
        if (r.synced_to_sheet) return;
        const qty = Math.abs(Number(r.fuel_quantity) || 0);
        if (r.record_type === 'entrada') {
          unsyncedEntradas += qty;
        } else {
          unsyncedSaidas += qty;
        }
      });

      setDbEntradas(unsyncedEntradas);
      setDbSaidas(unsyncedSaidas);
    } catch (err) {
      console.error('Error in fetchDbRecords:', err);
    }
  }, [todayISO, locationMatches]);

  // Initial fetch
  useEffect(() => {
    fetchDbRecords();
  }, [fetchDbRecords]);

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel(`stock-realtime-${location.replace(/\s/g, '-')}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_fuel_records',
        },
        () => {
          // Refetch DB records immediately
          fetchDbRecords();
          // Also trigger sheet refetch after a short delay (sheet needs time to update)
          setTimeout(() => {
            setDbVersion(v => v + 1);
            refetch();
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location, fetchDbRecords, refetch]);
  
  // Expose refetch method to parent
  useImperativeHandle(ref, () => ({
    refetch: () => {
      fetchDbRecords();
      refetch();
    }
  }), [refetch, fetchDbRecords]);
  
  // Get today's date formatted
  const todayStr = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });

    // Helper to parse Brazilian number from sheet
    const parseBRNumber = (value: any): number => {
      if (!value) return 0;
      return parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0;
    };

    // Calculate stock KPIs - use sheet values directly, only supplement with unsynced DB data
    const stockKPIs = useMemo(() => {
      if (!stockSheetData.rows.length && dbEntradas === 0 && dbSaidas === 0) {
        return { estoqueAnterior: 0, entradas: 0, saidas: 0, estoqueAtual: 0, hasData: false };
      }

      let estoqueAnterior = 0;
      let sheetEntradas = 0;
      let sheetSaidas = 0;
      let estoqueAtual = 0;
      let hasData = false;

      // Helper to extract values from a row
      const extractRow = (row: any) => {
        const ea = parseBRNumber(
          row['EstoqueAtual'] || row['Estoque Atual'] || row['ESTOQUE ATUAL'] || 0
        );
        const ant = parseBRNumber(
          row['Estoque Anterior'] || row['EstoqueAnterior'] || row['ESTOQUE ANTERIOR'] || 0
        );
        const ent = parseBRNumber(
          row['Entrada'] || row['ENTRADA'] || 0
        );
        // Use the total Saida column (column E), NOT sub-columns
        const sai = parseBRNumber(
          row['Saida'] || row['SAIDA'] || row['SAÍDA'] || row['Saída'] || 0
        );
        return { estoqueAtual: ea, estoqueAnterior: ant, entradas: ent, saidas: sai };
      };

      // First, try to find today's row in the sheet
      for (const row of stockSheetData.rows) {
        const rowDate = String(row['DATA'] || row['Data'] || row['data'] || '').trim();
        
        if (isToday(rowDate)) {
          hasData = true;
          const vals = extractRow(row);
          estoqueAtual = vals.estoqueAtual;
          estoqueAnterior = vals.estoqueAnterior;
          sheetEntradas = vals.entradas;
          sheetSaidas = vals.saidas;
          break;
        }
      }

      // If no today's row found, get the most recent row as fallback
      if (!hasData) {
        const sortedRows = [...stockSheetData.rows].reverse();
        for (const row of sortedRows) {
          const vals = extractRow(row);
          if (vals.estoqueAtual > 0 || vals.entradas > 0 || vals.saidas > 0) {
            estoqueAtual = vals.estoqueAtual;
            estoqueAnterior = vals.estoqueAnterior;
            sheetEntradas = vals.entradas;
            sheetSaidas = vals.saidas;
            hasData = true;
            break;
          }
        }
      }

      // Sheet is the source of truth. ADD unsynced DB/local records on top.
      const finalEntradas = sheetEntradas + dbEntradas + (localRecordKPIs?.entradas ?? 0);
      const finalSaidas = sheetSaidas + dbSaidas + (localRecordKPIs?.saidas ?? 0);
      
      // Recalculate EstoqueAtual only if there are unsynced records
      let finalEstoqueAtual = estoqueAtual;
      if (dbEntradas > 0 || dbSaidas > 0 || localRecordKPIs) {
        if (estoqueAnterior > 0) {
          finalEstoqueAtual = Math.max(0, estoqueAnterior + finalEntradas - finalSaidas);
        }
      }

      return {
        estoqueAnterior,
        entradas: finalEntradas,
        saidas: Math.abs(finalSaidas),
        estoqueAtual: finalEstoqueAtual,
        hasData: hasData || dbEntradas > 0 || dbSaidas > 0 || !!localRecordKPIs,
      };
    }, [stockSheetData.rows, localRecordKPIs, dbEntradas, dbSaidas]);

  // Get short location name for display
  const shortLocationName = useMemo(() => {
    const normalized = location.toLowerCase();
    if (normalized.includes('comboio 01') || normalized.includes('cb-01')) return 'Comboio 01';
    if (normalized.includes('comboio 02') || normalized.includes('cb-02')) return 'Comboio 02';
    if (normalized.includes('comboio 03') || normalized.includes('cb-03')) return 'Comboio 03';
    if (normalized.includes('canteiro 01')) return 'Canteiro 01';
    if (normalized.includes('canteiro 02')) return 'Canteiro 02';
    return location;
  }, [location]);

  return (
    <Card className={cn(
      theme === 'dark' 
        ? "bg-slate-800/50 border-slate-700" 
        : "bg-white border-slate-200 shadow-sm"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className={cn(
          "text-sm flex items-center justify-between",
          theme === 'dark' ? "text-slate-200" : "text-slate-700"
        )}>
          <span className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {shortLocationName}
          </span>
          <span className={cn(
            "text-[10px] font-normal",
            theme === 'dark' ? "text-slate-400" : "text-slate-500"
          )}>
            {todayStr}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {sheetLoading && dbEntradas === 0 && dbSaidas === 0 ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {/* 1. Estoque Anterior */}
            <div className={cn(
              "rounded-lg p-2 text-center border",
              theme === 'dark' 
                ? "bg-yellow-900/30 border-yellow-700/50" 
                : "bg-yellow-50 border-yellow-200"
            )}>
              <LogOutIcon className="w-3 h-3 mx-auto mb-1 text-yellow-500" />
              <p className="text-lg font-bold text-yellow-500">
                {stockKPIs.estoqueAnterior.toLocaleString('pt-BR')}
              </p>
              <p className={cn(
                "text-[10px]",
                theme === 'dark' ? "text-yellow-300/70" : "text-yellow-600/70"
              )}>Est. Anterior</p>
            </div>
            
            {/* 2. Entradas */}
            <div className={cn(
              "rounded-lg p-2 text-center border",
              theme === 'dark' 
                ? "bg-green-900/30 border-green-700/50" 
                : "bg-green-50 border-green-200"
            )}>
              <LogIn className="w-3 h-3 mx-auto mb-1 text-green-500" />
              <p className="text-lg font-bold text-green-500">
                +{stockKPIs.entradas.toLocaleString('pt-BR')}
              </p>
              <p className={cn(
                "text-[10px]",
                theme === 'dark' ? "text-green-300/70" : "text-green-600/70"
              )}>Entradas</p>
            </div>
            
            {/* 3. Saídas */}
            <div className={cn(
              "rounded-lg p-2 text-center border",
              theme === 'dark' 
                ? "bg-red-900/30 border-red-700/50" 
                : "bg-red-50 border-red-200"
            )}>
              <TrendingDown className="w-3 h-3 mx-auto mb-1 text-red-500" />
              <p className="text-lg font-bold text-red-500">
                {stockKPIs.saidas.toLocaleString('pt-BR')}
              </p>
              <p className={cn(
                "text-[10px]",
                theme === 'dark' ? "text-red-300/70" : "text-red-600/70"
              )}>Saídas</p>
            </div>
            
            {/* 4. Estoque Atual */}
            <div className={cn(
              "rounded-lg p-2 text-center border",
              theme === 'dark' 
                ? "bg-blue-900/30 border-blue-700/50" 
                : "bg-blue-50 border-blue-200"
            )}>
              <Fuel className="w-3 h-3 mx-auto mb-1 text-blue-500" />
              <p className="text-lg font-bold text-blue-500">
                {stockKPIs.estoqueAtual.toLocaleString('pt-BR')}
              </p>
              <p className={cn(
                "text-[10px]",
                theme === 'dark' ? "text-blue-300/70" : "text-blue-600/70"
              )}>Est. Atual</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
