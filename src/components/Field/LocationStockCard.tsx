import { useMemo, forwardRef, useImperativeHandle } from 'react';
import { 
  Fuel, 
  TrendingDown, 
  LogIn, 
  LogOut as LogOutIcon,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface LocationStockCardProps {
  location: string;
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
  
  // Direct string comparison
  if (dateStr === todayFormatted) return true;
  
  // Try parsing
  const parsedDate = parseBrazilianDate(dateStr);
  if (parsedDate) {
    return parsedDate.toDateString() === today.toDateString();
  }
  
  return false;
}

export const LocationStockCard = forwardRef<LocationStockCardRef, LocationStockCardProps>(
  function LocationStockCard({ location }, ref) {
  const { theme } = useTheme();
  const stockSheetName = getStockSheetName(location);
  const { data: stockSheetData, loading, refetch } = useSheetData(stockSheetName);
  
  // Expose refetch method to parent
  useImperativeHandle(ref, () => ({
    refetch: () => {
      refetch();
    }
  }), [refetch]);
  
  // Get today's date formatted
  const todayStr = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });

  // Calculate stock KPIs from location-specific sheet for TODAY only
  const stockKPIs = useMemo(() => {
    if (!stockSheetData.rows.length) {
      return { estoqueAnterior: 0, entradas: 0, saidas: 0, estoqueAtual: 0, hasData: false };
    }

    // Find today's row
    let estoqueAnterior = 0;
    let entradas = 0;
    let saidas = 0;
    let estoqueAtual = 0;
    let hasData = false;

    // First, try to find today's row
    for (const row of stockSheetData.rows) {
      const rowDate = String(row['DATA'] || row['Data'] || row['data'] || '').trim();
      
      if (isToday(rowDate)) {
        hasData = true;
        
        estoqueAtual = parseFloat(String(
          row['ESTOQUE ATUAL'] || row['Estoque Atual'] || row['EST_ATUAL'] || 
          row['ESTOQUE'] || row['Estoque'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        estoqueAnterior = parseFloat(String(
          row['ESTOQUE ANTERIOR'] || row['Estoque Anterior'] || row['EST_ANTERIOR'] || 
          row['ANTERIOR'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        entradas = parseFloat(String(
          row['ENTRADA'] || row['Entrada'] || row['ENTRADAS'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        saidas = parseFloat(String(
          row['SAÍDA'] || row['Saída'] || row['SAIDA'] || row['Saida'] || 
          row['SAIDAS'] || row['SAÍDAS'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        break;
      }
    }

    // If no today's row found, get the most recent row as fallback
    if (!hasData) {
      const sortedRows = [...stockSheetData.rows].reverse();
      for (const row of sortedRows) {
        estoqueAtual = parseFloat(String(
          row['ESTOQUE ATUAL'] || row['Estoque Atual'] || row['EST_ATUAL'] || 
          row['ESTOQUE'] || row['Estoque'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        estoqueAnterior = parseFloat(String(
          row['ESTOQUE ANTERIOR'] || row['Estoque Anterior'] || row['EST_ANTERIOR'] || 
          row['ANTERIOR'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        entradas = parseFloat(String(
          row['ENTRADA'] || row['Entrada'] || row['ENTRADAS'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;
        
        saidas = parseFloat(String(
          row['SAÍDA'] || row['Saída'] || row['SAIDA'] || row['Saida'] || 
          row['SAIDAS'] || row['SAÍDAS'] || 0
        ).replace(/\./g, '').replace(',', '.')) || 0;

        if (estoqueAtual > 0 || entradas > 0 || saidas > 0) {
          hasData = true;
          break;
        }
      }
    }

    return {
      estoqueAnterior,
      entradas,
      saidas,
      estoqueAtual: Math.max(0, estoqueAtual),
      hasData,
    };
  }, [stockSheetData.rows]);

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
            <Database className="w-4 h-4 text-amber-500" />
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
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
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
                -{stockKPIs.saidas.toLocaleString('pt-BR')}
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
