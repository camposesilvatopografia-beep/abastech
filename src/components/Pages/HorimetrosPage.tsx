import { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Clock,
  RefreshCw,
  AlertTriangle,
  Download,
  Upload,
  Plus,
  Search,
  Calendar,
  X,
  CheckCircle,
  Timer,
  FileText,
  Wrench,
  Wifi,
  WifiOff,
  Database
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { HorimeterModal } from '@/components/Horimetros/HorimeterModal';
import { supabase } from '@/integrations/supabase/client';

const SHEET_NAME = 'Horimetros';

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy'];
  for (const fmt of formats) {
    const parsed = parse(dateStr, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

export function HorimetrosPage() {
  const { data, loading, refetch, update } = useSheetData(SHEET_NAME);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'sistema' | 'sheets'>('sheets');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [quickFilter, setQuickFilter] = useState<string | null>('hoje');
  const [showNewModal, setShowNewModal] = useState(false);
  const [isFixingZeroed, setIsFixingZeroed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [isTesting, setIsTesting] = useState(false);

  // Test connection on mount
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    setIsTesting(true);
    setConnectionStatus('checking');
    
    try {
      const { data: result, error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getSheetNames' },
      });
      
      if (error) {
        console.error('Connection test failed:', error);
        setConnectionStatus('error');
        toast({
          title: 'Erro de conexão',
          description: 'Falha ao conectar com o Google Sheets',
          variant: 'destructive',
        });
      } else {
        setConnectionStatus('connected');
        toast({
          title: 'Conexão OK',
          description: 'Conectado ao Google Sheets com sucesso',
        });
      }
    } catch (err) {
      console.error('Connection test error:', err);
      setConnectionStatus('error');
    } finally {
      setIsTesting(false);
    }
  };

  const syncData = async () => {
    setIsTesting(true);
    try {
      await refetch();
      toast({
        title: 'Dados Sincronizados',
        description: `${data.rows.length} registros carregados`,
      });
    } catch (err) {
      toast({
        title: 'Erro ao sincronizar',
        description: 'Falha ao carregar dados do Google Sheets',
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const applyQuickFilter = (filter: string) => {
    const today = new Date();
    setQuickFilter(filter);
    
    switch (filter) {
      case 'hoje':
        setStartDate(today);
        setEndDate(today);
        break;
      case 'semana':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 7);
        setStartDate(weekStart);
        setEndDate(today);
        break;
      case 'mes':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        setStartDate(monthStart);
        setEndDate(today);
        break;
      case 'todos':
        setStartDate(undefined);
        setEndDate(undefined);
        break;
    }
  };

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setQuickFilter(null);
  };

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );

      let matchesDate = true;
      if (startDate || endDate) {
        const rowDateStr = String(row['DATA'] || '');
        const rowDate = parseDate(rowDateStr);
        
        if (rowDate) {
          if (startDate && endDate) {
            matchesDate = isWithinInterval(rowDate, {
              start: startOfDay(startDate),
              end: endOfDay(endDate)
            });
          } else if (startDate) {
            matchesDate = rowDate >= startOfDay(startDate);
          } else if (endDate) {
            matchesDate = rowDate <= endOfDay(endDate);
          }
        } else {
          matchesDate = false;
        }
      }

      return matchesSearch && matchesDate;
    });
  }, [data.rows, search, startDate, endDate]);

  // Find zeroed records that need correction
  const zeroedRecords = useMemo(() => {
    return data.rows.filter(row => {
      const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
      return horas === 0;
    });
  }, [data.rows]);

  const metrics = useMemo(() => {
    let horasTotais = 0;
    let registros = 0;
    let zerados = 0;
    let inconsistentes = 0;

    filteredRows.forEach(row => {
      const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
      horasTotais += horas;
      registros++;
      
      if (horas === 0) zerados++;
      if (horas < 0) inconsistentes++;
    });

    return {
      horasTotais,
      mediaRegistro: registros > 0 ? horasTotais / registros : 0,
      registros,
      faltamCadastrar: 154 - registros,
      inconsistentes,
      zerados
    };
  }, [filteredRows]);

  // Function to fix zeroed horimeters by finding the previous valid value
  const handleFixZeroed = useCallback(async () => {
    if (zeroedRecords.length === 0) {
      toast({
        title: 'Nenhum registro zerado',
        description: 'Não há registros com horímetro zerado para corrigir.',
      });
      return;
    }

    setIsFixingZeroed(true);
    let fixed = 0;
    let errors = 0;

    try {
      for (const record of zeroedRecords) {
        const veiculo = getRowValue(record as any, ['VEICULO', 'Veiculo', 'veiculo', 'EQUIPAMENTO', 'Equipamento']);
        const rowIndex = record._rowIndex;

        if (!veiculo || !rowIndex) {
          errors++;
          continue;
        }

        // Find previous valid record for this vehicle
        const vehicleRecords = data.rows.filter(row => {
          const v = getRowValue(row as any, ['VEICULO', 'Veiculo', 'veiculo', 'EQUIPAMENTO', 'Equipamento']);
          const h = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));
          return v === veiculo && h > 0 && row._rowIndex !== rowIndex;
        });

        if (vehicleRecords.length === 0) {
          // No previous record, skip
          continue;
        }

        // Sort by date descending to get the most recent valid record
        const sorted = vehicleRecords.sort((a, b) => {
          const dateA = getRowValue(a as any, ['DATA', 'Data', 'data']);
          const dateB = getRowValue(b as any, ['DATA', 'Data', 'data']);
          return dateB.localeCompare(dateA);
        });

        const lastValidRecord = sorted[0];
        const lastValidValue = parseNumber(getRowValue(lastValidRecord as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'horimetro', 'KM', 'km']));

        if (lastValidValue > 0) {
          try {
            // Update the zeroed record with the last valid value
            const updatedData = { ...record };
            
            // Update the hours/km field
            if (record['HORAS'] !== undefined) updatedData['HORAS'] = lastValidValue.toString().replace('.', ',');
            if (record['HORIMETRO'] !== undefined) updatedData['HORIMETRO'] = lastValidValue.toString().replace('.', ',');
            if (record['KM'] !== undefined) updatedData['KM'] = lastValidValue.toString().replace('.', ',');
            
            // Add observation about the fix
            const obs = getRowValue(record as any, ['OBSERVACAO', 'Observacao', 'observacao', 'OBS']);
            updatedData['OBSERVACAO'] = obs ? `${obs} | CORRIGIDO: ${lastValidValue}` : `CORRIGIDO AUTOMATICAMENTE: ${lastValidValue}`;

            await update(rowIndex, updatedData);
            fixed++;
          } catch (err) {
            console.error(`Error fixing record ${rowIndex}:`, err);
            errors++;
          }
        }
      }

      toast({
        title: 'Correção Concluída',
        description: `${fixed} registros corrigidos${errors > 0 ? `, ${errors} erros` : ''}.`,
      });

      // Refresh data
      await refetch();
    } catch (error) {
      console.error('Error fixing zeroed records:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao corrigir registros. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsFixingZeroed(false);
    }
  }, [zeroedRecords, data.rows, update, refetch, toast]);

  const pendingEquipments = useMemo(() => {
    return [
      { codigo: 'CM-122', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-133', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.1', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.10', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.2', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.3', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.4', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.5', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-22.8', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-24.3', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-24.4', descricao: 'Caminhão Basculante' },
      { codigo: 'CM-24.5', descricao: 'Caminhão Basculante' },
      { codigo: 'CQ-20.1', descricao: 'Carregadeira' },
      { codigo: 'EC-21.2', descricao: 'Escavadeira Hidráulica' },
      { codigo: 'EC-21.3', descricao: 'Escavadeira Hidráulica' },
      { codigo: 'EC-21.4', descricao: 'Escavadeira Hidráulica' },
    ];
  }, []);

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Horímetros', 14, 22);
    
    doc.setFontSize(10);
    const dateRange = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    doc.text(`Período: ${dateRange}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    doc.setFontSize(12);
    doc.text('Resumo:', 14, 46);
    doc.setFontSize(10);
    doc.text(`Horas Totais: ${metrics.horasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`, 14, 54);
    doc.text(`Média por Registro: ${metrics.mediaRegistro.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`, 14, 60);
    doc.text(`Total de Registros: ${metrics.registros}`, 14, 66);
    doc.text(`Zerados: ${metrics.zerados}`, 14, 72);

    const tableData = filteredRows.slice(0, 100).map(row => [
      getRowValue(row as any, ['VEICULO', 'EQUIPAMENTO', 'Veiculo', 'Equipamento']),
      getRowValue(row as any, ['DATA', 'Data']),
      getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'KM']),
      getRowValue(row as any, ['OPERADOR', 'Operador', 'MOTORISTA', 'Motorista'])
    ]);

    autoTable(doc, {
      head: [['Veículo', 'Data', 'Horas/KM', 'Operador']],
      body: tableData,
      startY: 82,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`horimetros_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Horímetros</h1>
              <p className="text-muted-foreground">Controle de horas trabalhadas dos equipamentos</p>
            </div>
            {/* Connection Status */}
            <div className={cn(
              "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium",
              connectionStatus === 'connected' && "bg-emerald-500/10 text-emerald-500",
              connectionStatus === 'error' && "bg-red-500/10 text-red-500",
              connectionStatus === 'checking' && "bg-amber-500/10 text-amber-500"
            )}>
              {connectionStatus === 'connected' && <Wifi className="w-3 h-3" />}
              {connectionStatus === 'error' && <WifiOff className="w-3 h-3" />}
              {connectionStatus === 'checking' && <RefreshCw className="w-3 h-3 animate-spin" />}
              {connectionStatus === 'connected' ? 'Conectado' : connectionStatus === 'error' ? 'Desconectado' : 'Verificando...'}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={testConnection} 
              disabled={isTesting}
            >
              <Database className={cn("w-4 h-4 mr-2", isTesting && "animate-pulse")} />
              Testar Conexão
            </Button>
            <Button variant="outline" size="sm" onClick={syncData} disabled={loading || isTesting}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Sincronizar
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-primary border-primary"
              onClick={handleFixZeroed}
              disabled={isFixingZeroed || zeroedRecords.length === 0}
            >
              {isFixingZeroed ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4 mr-2" />
              )}
              Corrigir Zerados ({zeroedRecords.length})
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <FileText className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={() => setShowNewModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo
            </Button>
          </div>
        </div>

        {/* Warning Banner */}
        {zeroedRecords.length > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="font-semibold text-warning">Horímetros Zerados Detectados</p>
                <p className="text-sm text-muted-foreground">
                  Existem <span className="font-medium text-primary">{zeroedRecords.length}</span> registros com valores zerados que precisam de correção.
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="text-primary border-primary"
              onClick={handleFixZeroed}
              disabled={isFixingZeroed}
            >
              {isFixingZeroed ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="w-4 h-4 mr-2" />
              )}
              Corrigir Zerados ({zeroedRecords.length})
            </Button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('sistema')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'sistema'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Sistema (Backend)
          </button>
          <button
            onClick={() => setActiveTab('sheets')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === 'sheets'
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            Google Sheets
          </button>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar veículo, operador, obra..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Data início'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setQuickFilter(null);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              
              <span className="text-sm text-muted-foreground">até</span>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Data fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setQuickFilter(null);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={quickFilter === 'hoje' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('hoje')}
              >
                Hoje
              </Button>
              <Button
                variant={quickFilter === 'semana' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('semana')}
              >
                7 dias
              </Button>
              <Button
                variant={quickFilter === 'mes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('mes')}
              >
                Mês
              </Button>
              <Button
                variant={quickFilter === 'todos' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('todos')}
              >
                Todos
              </Button>
            </div>

            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Período:</span>
            <span className="font-medium">
              {startDate && endDate 
                ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
                : 'Todo período'}
            </span>
            <span className="text-muted-foreground">• {filteredRows.length} registros</span>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <MetricCard
            title="HORAS TOTAIS"
            value={`${metrics.horasTotais.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`}
            subtitle="No período"
            variant="primary"
            icon={Clock}
          />
          <MetricCard
            title="MÉDIA POR REGISTRO"
            value={`${metrics.mediaRegistro.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} h`}
            subtitle="No período"
            icon={Timer}
          />
          <MetricCard
            title="REGISTROS"
            value={metrics.registros.toString()}
            subtitle="No período"
            icon={CheckCircle}
          />
          <MetricCard
            title="FALTAM CADASTRAR"
            value={Math.max(0, metrics.faltamCadastrar).toString()}
            subtitle="Pendentes"
            variant="primary"
            icon={Clock}
          />
          <MetricCard
            title="INCONSISTÊNCIAS"
            value={metrics.inconsistentes.toString()}
            subtitle="Valores negativos"
            icon={AlertTriangle}
          />
        </div>

        {/* Data Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold">Registros de Horímetros</h2>
            <p className="text-sm text-muted-foreground">Dados do período selecionado</p>
          </div>
          
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Veículo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Horas/KM</TableHead>
                <TableHead>Operador</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                    Carregando dados...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado para o período
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.slice(0, 50).map((row, idx) => {
                  const horas = parseNumber(getRowValue(row as any, ['HORAS', 'HORIMETRO', 'Horimetro', 'KM']));
                  const isZeroed = horas === 0;
                  
                  return (
                    <TableRow key={idx} className={isZeroed ? 'bg-warning/5' : ''}>
                      <TableCell className="font-medium">
                        {getRowValue(row as any, ['VEICULO', 'EQUIPAMENTO', 'Veiculo', 'Equipamento'])}
                      </TableCell>
                      <TableCell>{getRowValue(row as any, ['DATA', 'Data'])}</TableCell>
                      <TableCell className={cn("text-right", isZeroed && "text-warning")}>
                        {horas.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}
                      </TableCell>
                      <TableCell>{getRowValue(row as any, ['OPERADOR', 'Operador', 'MOTORISTA', 'Motorista'])}</TableCell>
                      <TableCell>
                        {isZeroed ? (
                          <span className="inline-flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle className="w-3 h-3" />
                            Zerado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle className="w-3 h-3" />
                            OK
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pending Equipments */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Horímetros Pendentes ({pendingEquipments.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {pendingEquipments.map(equip => (
              <div 
                key={equip.codigo} 
                className="bg-card rounded-lg border border-border p-3 text-center hover:bg-muted/50 cursor-pointer"
                onClick={() => setShowNewModal(true)}
              >
                <div className="font-semibold text-primary">{equip.codigo}</div>
                <div className="text-xs text-muted-foreground truncate">{equip.descricao}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Horimeter Modal */}
      <HorimeterModal 
        open={showNewModal} 
        onOpenChange={setShowNewModal}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
