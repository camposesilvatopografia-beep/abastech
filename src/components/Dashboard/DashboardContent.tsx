import { useMemo, useState, useCallback, useEffect } from 'react';
import { Droplet, TrendingDown, TrendingUp, Package, Truck, ArrowDownCircle, ArrowUpCircle, Clock, Fuel, Calendar, MessageCircle, Wifi, RefreshCw, X, Search, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricCard } from './MetricCard';
import { StockSummary } from './StockSummary';
import { ConsumptionRanking } from './ConsumptionRanking';
import { KPIDiagnosticsModal } from './KPIDiagnosticsModal';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { format, parse, isWithinInterval, startOfDay, endOfDay, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { toast as sonnerToast } from 'sonner';

const GERAL_SHEET = 'Geral';
const ABASTECIMENTO_SHEET = 'AbastecimentoCanteiro01';
const VEHICLE_SHEET = 'Veiculo';
const ARLA_SHEET = 'EstoqueArla';

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

// Parse Brazilian date format (dd/MM/yyyy) to Date object
function parseBrazilianDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    // Try dd/MM/yyyy format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      const date = new Date(year, month, day);
      if (isValid(date)) return date;
    }
    // Try ISO format
    const isoDate = new Date(dateStr);
    if (isValid(isoDate)) return isoDate;
    return null;
  } catch {
    return null;
  }
}

export function DashboardContent() {
  // Enable polling every 10 seconds for real-time updates
  const POLLING_INTERVAL = 10000;
  
  const { data: geralData, loading, refetch: refetchGeral } = useSheetData(GERAL_SHEET, { pollingInterval: POLLING_INTERVAL });
  const { data: abastecimentoData, refetch: refetchAbastecimento } = useSheetData(ABASTECIMENTO_SHEET, { pollingInterval: POLLING_INTERVAL });
  const { data: vehicleData } = useSheetData(VEHICLE_SHEET, { pollingInterval: POLLING_INTERVAL });
  const { data: arlaData, refetch: refetchArla } = useSheetData(ARLA_SHEET, { pollingInterval: POLLING_INTERVAL });
  const [isSending, setIsSending] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const { toast } = useToast();

  // Real-time sync across all clients - with forced cache bypass
  const handleRealtimeRefresh = useCallback(() => {
    console.log('[Dashboard] Realtime sync event received, refreshing data with cache bypass...');
    refetchGeral(false, true); // not silent, force no cache
    refetchAbastecimento(false, true);
    refetchArla(false, true);
    setLastUpdate(new Date());
  }, [refetchGeral, refetchAbastecimento, refetchArla]);

  // Subscribe to realtime sync events
  useRealtimeSync({
    onSyncEvent: (event) => {
      console.log('[Dashboard] Received sync event:', event.type);
      if (['fuel_record_created', 'fuel_record_updated', 'fuel_record_deleted', 'stock_updated', 'manual_refresh'].includes(event.type)) {
        handleRealtimeRefresh();
        sonnerToast.info('📡 Novos dados recebidos do campo!', { duration: 3000 });
      }
    },
  });

  // Refresh data when window regains focus
  useEffect(() => {
    const handleFocus = () => {
      console.log('[Dashboard] Window focused, refreshing data...');
      refetchGeral(true, true);
      refetchAbastecimento(true, true);
      refetchArla(true, true);
      setLastUpdate(new Date());
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetchGeral, refetchAbastecimento, refetchArla]);

  // Update last sync time when data changes
  useEffect(() => {
    if (abastecimentoData.rows.length > 0 || geralData.rows.length > 0) {
      setLastUpdate(new Date());
    }
  }, [abastecimentoData.rows.length, geralData.rows.length]);

  // Get vehicle info for filtering comboios
  const vehicleInfo = useMemo(() => {
    return vehicleData.rows.map(row => ({
      veiculo: String(row['FROTA'] || row['Frota'] || row['VEICULO'] || row['Codigo'] || '').trim(),
      descricao: String(row['DESCRIÇÃO'] || row['Descricao'] || row['DESCRICAO'] || row['Nome'] || '').trim(),
      categoria: String(row['Categoria'] || row['CATEGORIA'] || '').trim(),
    }));
  }, [vehicleData.rows]);

  // Check if a vehicle is a comboio by its code
  const isComboio = useCallback((vehicleCode: string) => {
    const info = vehicleInfo.find(v => v.veiculo === vehicleCode);
    if (!info) return false;
    const descLower = info.descricao.toLowerCase();
    const catLower = info.categoria.toLowerCase();
    return descLower.includes('comboio') || catLower.includes('comboio');
  }, [vehicleInfo]);

  // Filter abastecimento data by selected date
  const filteredAbastecimentoData = useMemo(() => {
    if (!selectedDate) return abastecimentoData.rows;
    
    return abastecimentoData.rows.filter(row => {
      const rowDateStr = String(row['DATA'] || row['Data'] || '');
      const rowDate = parseBrazilianDate(rowDateStr);
      if (!rowDate) return false;
      
      return isWithinInterval(rowDate, {
        start: startOfDay(selectedDate),
        end: endOfDay(selectedDate)
      });
    });
  }, [abastecimentoData.rows, selectedDate]);

  // Calculate exits from abastecimento data for the selected date (Saída records only)
  const calculatedExits = useMemo(() => {
    let saidaComboios = 0;
    let saidaEquipamentos = 0;

    filteredAbastecimentoData.forEach(row => {
      const tipo = String(row['TIPO DE OPERACAO'] || row['TIPO_OPERACAO'] || row['Tipo'] || row['TIPO'] || '').toLowerCase();
      const local = String(row['LOCAL'] || row['Local'] || '').toLowerCase();
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
      const quantidade = parseNumber(row['QUANTIDADE'] || row['Quantidade']);
      const fornecedor = String(row['FORNECEDOR'] || '').trim();
      
      // Exclude entries from suppliers (has FORNECEDOR or TIPO contains 'entrada')
      if (tipo.includes('entrada') || fornecedor) return;
      if (quantidade <= 0) return;
      
      // Check if the destination is a comboio (LOCAL contains 'comboio')
      // OR if the vehicle code indicates comboio (e.g., 'CB-' prefix or name contains 'COMBOIO')
      const isComboioDestination = local.includes('comboio');
      const isComboioVehicle = isComboio(veiculo) || veiculo.toUpperCase().startsWith('CB-') || veiculo.toUpperCase().includes('COMBOIO');
      
      if (isComboioDestination || isComboioVehicle) {
        saidaComboios += quantidade;
      } else {
        // All other exits go to equipamentos (máquinas, veículos de obra, etc.)
        saidaEquipamentos += quantidade;
      }
    });

    return { saidaComboios, saidaEquipamentos };
  }, [filteredAbastecimentoData, isComboio]);

  // Calculate entries from filtered data - ONLY from external suppliers (Cavalo Marinho, Ipiranga, etc.)
  // NOT from comboios - comboio transfers are internal movements, not entries
  const calculatedEntries = useMemo(() => {
    let entradas = 0;
    
    // List of known suppliers for validation
    const knownSuppliers = ['cavalo marinho', 'ipiranga', 'shell', 'petrobras', 'br', 'ale', 'texaco', 'raízen'];
    
    filteredAbastecimentoData.forEach(row => {
      const tipo = String(row['TIPO DE OPERACAO'] || row['TIPO_OPERACAO'] || row['Tipo'] || row['TIPO'] || '').toLowerCase();
      const fornecedor = String(row['FORNECEDOR'] || '').trim().toLowerCase();
      const quantidade = parseNumber(row['QUANTIDADE'] || row['Quantidade']);
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim().toLowerCase();
      const local = String(row['LOCAL'] || row['Local'] || '').toLowerCase();
      
      // Skip if no quantity
      if (quantidade <= 0) return;
      
      // Entry is valid ONLY if it has a supplier field (external supplier delivery)
      // AND the supplier is NOT a comboio
      const isFromComboio = veiculo.includes('comboio') || veiculo.startsWith('cb-') || local.includes('comboio');
      const hasValidSupplier = fornecedor && !isFromComboio;
      const isEntryType = tipo.includes('entrada');
      
      // Count as entry only if from external supplier (not comboio)
      if ((isEntryType || hasValidSupplier) && !isFromComboio) {
        entradas += quantidade;
      }
    });
    
    return entradas;
  }, [filteredAbastecimentoData]);

  // Extract stock values from GERAL sheet - get EXACT row for selected date
  // IMPORTANT: If no data for the selected date, show zeros (not fallback to last row)
  const stockData = useMemo(() => {
    // Get target date formatted
    const targetDateStr = selectedDate 
      ? format(selectedDate, 'dd/MM/yyyy')
      : format(new Date(), 'dd/MM/yyyy');
    
    // Find exact row for the selected date
    const matchingRow = geralData.rows.find(row => {
      const rowDate = String(row['Data'] || row['DATA'] || '').trim();
      return rowDate === targetDateStr;
    });

    // If we found a matching row for the date, use its values from GERAL sheet
    if (matchingRow) {
      // Use exact column names from Google Sheets
      const estoqueAnterior = parseNumber(matchingRow['Estoque Anterior'] || matchingRow['EstoqueAnterior'] || matchingRow['ESTOQUE ANTERIOR']);
      const entradaGeral = parseNumber(matchingRow['Entrada'] || matchingRow['ENTRADA']);
      const saidaComboiosGeral = parseNumber(matchingRow['Saida para Comboios'] || matchingRow['SAIDA PARA COMBOIOS'] || matchingRow['Saída para Comboios']);
      const saidaEquipamentosGeral = parseNumber(matchingRow['Saida para Equipamentos'] || matchingRow['SAIDA PARA EQUIPAMENTOS'] || matchingRow['Saída para Equipamentos']);
      
      // READ Estoque Atual DIRECTLY from column G of Geral sheet
      const estoqueAtualGeral = parseNumber(matchingRow['Estoque Atual'] || matchingRow['EstoqueAtual'] || matchingRow['ESTOQUE ATUAL']);
      
      // Use values from GERAL sheet (which is the source of truth)
      // Only fallback to calculated values if sheet value is 0
      const finalSaidaComboios = saidaComboiosGeral > 0 ? saidaComboiosGeral : calculatedExits.saidaComboios;
      const finalSaidaEquipamentos = saidaEquipamentosGeral > 0 ? saidaEquipamentosGeral : calculatedExits.saidaEquipamentos;
      const finalEntrada = entradaGeral > 0 ? entradaGeral : calculatedEntries;
      const finalTotalSaidas = finalSaidaComboios + finalSaidaEquipamentos;
      
      return {
        estoqueAnterior,
        entrada: finalEntrada,
        saidaComboios: finalSaidaComboios,
        saidaEquipamentos: finalSaidaEquipamentos,
        estoqueAtual: estoqueAtualGeral,
        totalSaidas: finalTotalSaidas
      };
    }

    // No matching row found for the selected date
    // Use calculated values from abastecimento data for exits/entries
    // For estoque anterior/atual, we need to find the previous day's data or show 0
    const totalSaidas = calculatedExits.saidaComboios + calculatedExits.saidaEquipamentos;
    
    // Find the most recent row before the selected date to get the stock value
    let lastKnownStock = 0;
    if (geralData.rows.length > 0 && selectedDate) {
      // Sort rows by date and find the most recent one before selected date
      const sortedRows = [...geralData.rows].filter(row => {
        const rowDateStr = String(row['Data'] || row['DATA'] || '').trim();
        const rowDate = parseBrazilianDate(rowDateStr);
        if (!rowDate) return false;
        return rowDate < selectedDate;
      }).sort((a, b) => {
        const dateA = parseBrazilianDate(String(a['Data'] || a['DATA'] || ''));
        const dateB = parseBrazilianDate(String(b['Data'] || b['DATA'] || ''));
        return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
      });
      
      if (sortedRows.length > 0) {
        lastKnownStock = parseNumber(sortedRows[0]['Estoque Atual'] || sortedRows[0]['EstoqueAtual'] || sortedRows[0]['ESTOQUE ATUAL']);
      }
    }
    
    return {
      estoqueAnterior: lastKnownStock, // Use last known stock as "anterior"
      entrada: calculatedEntries,
      saidaComboios: calculatedExits.saidaComboios,
      saidaEquipamentos: calculatedExits.saidaEquipamentos,
      estoqueAtual: lastKnownStock > 0 ? lastKnownStock - totalSaidas + calculatedEntries : 0,
      totalSaidas
    };
  }, [geralData.rows, calculatedExits, calculatedEntries, selectedDate]);

  // Get ARLA stock from EstoqueArla sheet - last row
  const estoqueArla = useMemo(() => {
    if (!arlaData.rows.length) return 0;
    const lastRow = arlaData.rows[arlaData.rows.length - 1];
    return parseNumber(lastRow?.['EstoqueAtual']);
  }, [arlaData.rows]);

  // Get recent activities from filtered abastecimento data
  const recentActivities = useMemo(() => {
    if (!filteredAbastecimentoData.length) return [];

    // Apply search filter
    let filtered = filteredAbastecimentoData;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(row => 
        String(row['VEICULO'] || row['Veiculo'] || '').toLowerCase().includes(searchLower) ||
        String(row['MOTORISTA'] || row['Motorista'] || '').toLowerCase().includes(searchLower) ||
        String(row['LOCAL'] || row['Local'] || '').toLowerCase().includes(searchLower)
      );
    }

    // Get last 10 records
    return filtered
      .slice(-10)
      .reverse()
      .map((row, index) => ({
        id: index,
        data: String(row['DATA'] || ''),
        hora: String(row['HORA'] || ''),
        veiculo: String(row['VEICULO'] || row['Veiculo'] || 'N/A'),
        motorista: String(row['MOTORISTA'] || row['Motorista'] || 'N/A'),
        quantidade: parseNumber(row['QUANTIDADE'] || row['Quantidade']),
        combustivel: String(row['TIPO DE COMBUSTIVEL'] || row['Combustivel'] || 'Diesel'),
        local: String(row['LOCAL'] || row['Local'] || 'N/A')
      }));
  }, [filteredAbastecimentoData, search]);

  // Calculate consumption ranking by vehicle (from filtered data)
  const consumptionRanking = useMemo(() => {
    const vehicleMap = new Map<string, { totalLitros: number; abastecimentos: number }>();
    
    filteredAbastecimentoData.forEach(row => {
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
      const quantidade = parseNumber(row['QUANTIDADE'] || row['Quantidade']);
      const tipo = String(row['TIPO DE OPERACAO'] || row['TIPO_OPERACAO'] || row['Tipo'] || '').toLowerCase();
      
      // Only count exits, not entries
      if (tipo.includes('entrada') || tipo.includes('fornecedor')) return;
      if (!veiculo || quantidade <= 0) return;
      
      const existing = vehicleMap.get(veiculo) || { totalLitros: 0, abastecimentos: 0 };
      vehicleMap.set(veiculo, {
        totalLitros: existing.totalLitros + quantidade,
        abastecimentos: existing.abastecimentos + 1
      });
    });
    
    return Array.from(vehicleMap.entries()).map(([veiculo, data]) => ({
      veiculo,
      totalLitros: data.totalLitros,
      abastecimentos: data.abastecimentos,
      mediaPorAbastecimento: data.abastecimentos > 0 ? data.totalLitros / data.abastecimentos : 0
    }));
  }, [filteredAbastecimentoData]);

  // Raw consumption data for month filtering
  const rawConsumptionData = useMemo(() => {
    return abastecimentoData.rows.map(row => ({
      veiculo: String(row['VEICULO'] || row['Veiculo'] || '').trim(),
      data: String(row['DATA'] || row['Data'] || ''),
      quantidade: parseNumber(row['QUANTIDADE'] || row['Quantidade'])
    }));
  }, [abastecimentoData.rows]);

  const summaryRows = [
    { label: 'Estoque Anterior', value: stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) },
    { label: '+ Entradas', value: stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isPositive: true },
    { label: '- Saídas Total', value: stockData.totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isNegative: true },
    { label: 'Para Comboios', value: stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isSubItem: true },
    { label: 'Para Equipamentos', value: stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isSubItem: true },
    { label: 'Estoque Atual', value: stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isTotal: true },
  ];

  const totalRecords = filteredAbastecimentoData.length;

  // Clear date filter
  const clearDateFilter = () => {
    setSelectedDate(undefined);
  };

  // Generate WhatsApp message for daily summary
  const generateWhatsAppMessage = () => {
    const dateStr = selectedDate 
      ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })
      : format(new Date(), 'dd/MM/yyyy', { locale: ptBR });
    const time = format(new Date(), 'HH:mm', { locale: ptBR });
    
    const message = `📊 *RESUMO DO DIA - ESTOQUE*
📅 Data: ${dateStr} às ${time}

🛢️ *DIESEL*
• Estoque Anterior: ${stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
• Entradas: +${stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
• Saídas Total: -${stockData.totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
  ├ Comboios: ${stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
  └ Equipamentos: ${stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
• *Estoque Atual: ${stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L*

💧 *ARLA*
• Estoque: ${estoqueArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L

📈 *Movimentação*
• ${totalRecords} abastecimentos registrados

_Sistema Abastech_`;

    return encodeURIComponent(message);
  };

  const handleWhatsAppExport = () => {
    setIsSending(true);
    const message = generateWhatsAppMessage();
    const whatsappUrl = `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank');
    setIsSending(false);
    toast({
      title: 'WhatsApp',
      description: 'Resumo enviado para o WhatsApp!',
    });
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header with Filters */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar veículos, locais, motoristas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Date Filter */}
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-10 gap-2">
                      <Calendar className="w-4 h-4" />
                      {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Selecionar data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>

                {selectedDate && (
                  <Button variant="ghost" size="sm" onClick={clearDateFilter} className="h-10">
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              {/* Manual Refresh Button */}
              <Button 
                variant="outline"
                size="sm"
                onClick={() => {
                  handleRealtimeRefresh();
                  sonnerToast.success('Dados atualizados!', { duration: 2000 });
                }}
                className="gap-2 h-10"
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                <span className="hidden sm:inline">Atualizar</span>
              </Button>

              {/* Sync Indicator */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border">
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
                    <span className="text-xs text-muted-foreground">Sincronizando...</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-green-500" />
                    <div className="flex flex-col">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">Sincronizado</span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(lastUpdate, 'HH:mm:ss')}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Diagnostics Button */}
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setShowDiagnostics(true)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Diagnóstico</span>
              </Button>

              {/* WhatsApp Button */}
              <Button 
                onClick={handleWhatsAppExport} 
                disabled={isSending}
                className="bg-green-600 hover:bg-green-700 gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">WhatsApp</span>
              </Button>
            </div>
          </div>

          {/* Period info */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Data:</span>
            <span className="font-medium">
              {selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Todos os registros'}
            </span>
            <span className="text-muted-foreground">• {totalRecords.toLocaleString('pt-BR')} registros</span>
          </div>
        </div>

        {/* Primary Stock KPIs - Different colors */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title="ESTOQUE ANTERIOR"
            value={`${stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Diesel - Início do período"
            variant="primary"
            icon={Package}
          />
          <MetricCard
            title="ENTRADAS"
            value={`${stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Recebimentos no período"
            variant="green"
            icon={ArrowDownCircle}
          />
          <MetricCard
            title="TOTAL SAÍDAS"
            value={`${stockData.totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Consumo total no período"
            variant="red"
            icon={TrendingDown}
          />
          <MetricCard
            title="ESTOQUE ATUAL"
            value={`${stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Diesel disponível"
            variant="blue"
            icon={Droplet}
          />
        </div>

        {/* Secondary KPIs - Exits detail and ARLA */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <MetricCard
            title="SAÍDA P/ COMBOIOS"
            value={`${stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Abastecimento em campo"
            icon={Truck}
            className="border-l-4 border-l-orange-500"
          />
          <MetricCard
            title="SAÍDA P/ EQUIPAMENTOS"
            value={`${stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Abastecimento direto"
            icon={ArrowUpCircle}
            className="border-l-4 border-l-amber-500"
          />
          <MetricCard
            title="ESTOQUE ARLA"
            value={`${estoqueArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Arla disponível"
            icon={Droplet}
            className="border-l-4 border-l-cyan-500"
          />
        </div>

        {/* Summary and Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StockSummary
            title="Resumo de Estoque"
            subtitle={selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Último registro'}
            rows={summaryRows}
          />
          <ConsumptionRanking 
            data={consumptionRanking}
            rawData={rawConsumptionData}
            vehicleData={vehicleInfo}
            title="Ranking de Consumo"
            maxItems={10}
          />
        </div>

        {/* Recent Activities */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Atividades Recentes</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedDate 
                    ? `Abastecimentos em ${format(selectedDate, 'dd/MM/yyyy')}`
                    : 'Últimos abastecimentos registrados'}
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentActivities.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Nenhuma atividade encontrada {selectedDate ? 'para esta data' : ''}
              </div>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="p-3 md:p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Fuel className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm md:text-base">{activity.veiculo}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                            {activity.combustivel}
                          </span>
                        </div>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">
                          {activity.motorista} • {activity.local}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right ml-11 sm:ml-0 shrink-0">
                      <div className="font-semibold text-primary text-sm md:text-base">
                        {activity.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
                      </div>
                      <div className="text-xs md:text-sm text-muted-foreground flex items-center gap-1 sm:justify-end">
                        <Calendar className="w-3 h-3" />
                        {activity.data} {activity.hora}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* KPI Diagnostics Modal */}
      <KPIDiagnosticsModal
        open={showDiagnostics}
        onOpenChange={setShowDiagnostics}
        sheetName={GERAL_SHEET}
        sheetHeaders={geralData.headers}
        sheetRows={geralData.rows}
      />
    </div>
  );
}
