import { useState, useMemo, useCallback } from 'react';
import { 
  Clock,
  RefreshCw,
  AlertTriangle,
  Plus,
  Search,
  Calendar,
  X,
  FileText,
  Wifi,
  WifiOff,
  Pencil,
  Trash2,
  FileSpreadsheet,
  Download,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useVehicles, useHorimeterReadings, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, isWithinInterval, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { DatabaseHorimeterModal } from '@/components/Horimetros/DatabaseHorimeterModal';
import { SyncModal } from '@/components/Horimetros/SyncModal';
import * as XLSX from 'xlsx';

export function HorimetrosPageDB() {
  const { vehicles, loading: vehiclesLoading, refetch: refetchVehicles } = useVehicles();
  const { readings, loading: readingsLoading, refetch: refetchReadings, deleteReading } = useHorimeterReadings();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'resumo' | 'detalhes'>('resumo');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [periodFilter, setPeriodFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HorimeterWithVehicle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<HorimeterWithVehicle | null>(null);

  const loading = vehiclesLoading || readingsLoading;
  const isConnected = !loading && readings.length >= 0;

  // Get unique categories
  const categories = useMemo(() => {
    const unique = new Set<string>();
    vehicles.forEach(v => {
      if (v.category) unique.add(v.category);
    });
    return Array.from(unique).sort();
  }, [vehicles]);

  const clearDateFilter = () => {
    setSelectedDate(undefined);
    setStartDate(undefined);
    setEndDate(undefined);
    setPeriodFilter('todos');
  };

  // Get date range based on period filter
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    
    switch (periodFilter) {
      case 'hoje':
        return { start: today, end: endOfDay(today) };
      case 'ontem':
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: endOfDay(yesterday) };
      case '7dias':
        return { start: subDays(today, 6), end: endOfDay(today) };
      case '30dias':
        return { start: subDays(today, 29), end: endOfDay(today) };
      case 'mes':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'personalizado':
        return { 
          start: startDate ? startOfDay(startDate) : subDays(today, 30), 
          end: endDate ? endOfDay(endDate) : endOfDay(today) 
        };
      case 'todos':
      default:
        return null;
    }
  }, [periodFilter, startDate, endDate]);

  // Filtered readings
  const filteredReadings = useMemo(() => {
    return readings.filter(reading => {
      // Search filter
      const searchLower = search.toLowerCase();
      const matchesSearch = !search || 
        reading.vehicle?.code.toLowerCase().includes(searchLower) ||
        reading.vehicle?.name.toLowerCase().includes(searchLower) ||
        reading.operator?.toLowerCase().includes(searchLower);

      // Category filter
      let matchesCategory = true;
      if (categoryFilter !== 'all') {
        matchesCategory = reading.vehicle?.category?.toLowerCase() === categoryFilter.toLowerCase();
      }

      // Vehicle filter
      let matchesVehicle = true;
      if (vehicleFilter !== 'all') {
        matchesVehicle = reading.vehicle_id === vehicleFilter;
      }

      // Date filter - period range or single date
      let matchesDate = true;
      const readingDate = new Date(reading.reading_date + 'T00:00:00');
      
      if (selectedDate) {
        // Single date selected takes priority
        matchesDate = format(readingDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
      } else if (dateRange) {
        // Use period range
        matchesDate = isWithinInterval(readingDate, { start: dateRange.start, end: dateRange.end });
      }

      return matchesSearch && matchesDate && matchesCategory && matchesVehicle;
    });
  }, [readings, search, selectedDate, dateRange, categoryFilter, vehicleFilter]);

  // Metrics
  const metrics = useMemo(() => {
    let totalValue = 0;
    let zerados = 0;

    filteredReadings.forEach(r => {
      totalValue += r.current_value;
      if (r.current_value === 0) zerados++;
    });

    return {
      total: totalValue,
      media: filteredReadings.length > 0 ? totalValue / filteredReadings.length : 0,
      registros: filteredReadings.length,
      zerados,
    };
  }, [filteredReadings]);

  // Vehicle summary
  const vehicleSummary = useMemo(() => {
    const summary = new Map<string, {
      vehicle: typeof vehicles[0];
      lastReading: number;
      firstReading: number;
      interval: number;
      monthTotal: number;
      count: number;
    }>();

    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    filteredReadings.forEach(reading => {
      if (!reading.vehicle) return;
      
      const vehicleId = reading.vehicle_id;
      const readingDate = new Date(reading.reading_date + 'T00:00:00');
      const isInMonth = isWithinInterval(readingDate, { start: monthStart, end: monthEnd });

      const existing = summary.get(vehicleId);
      if (existing) {
        if (reading.current_value > existing.lastReading) {
          existing.lastReading = reading.current_value;
        }
        if (reading.current_value < existing.firstReading || existing.firstReading === 0) {
          existing.firstReading = reading.current_value;
        }
        existing.interval = existing.lastReading - existing.firstReading;
        if (isInMonth && reading.previous_value) {
          existing.monthTotal += reading.current_value - reading.previous_value;
        }
        existing.count++;
      } else {
        summary.set(vehicleId, {
          vehicle: reading.vehicle,
          lastReading: reading.current_value,
          firstReading: reading.current_value,
          interval: 0,
          monthTotal: isInMonth && reading.previous_value 
            ? reading.current_value - reading.previous_value 
            : 0,
          count: 1,
        });
      }
    });

    return Array.from(summary.values()).sort((a, b) => 
      a.vehicle.code.localeCompare(b.vehicle.code)
    );
  }, [filteredReadings]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchVehicles(), refetchReadings()]);
    toast({
      title: 'Dados atualizados',
      description: `${readings.length} registros carregados`,
    });
  }, [refetchVehicles, refetchReadings, readings.length, toast]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    
    try {
      await deleteReading(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      // Error handled in hook
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Relatório de Horímetros', 14, 22);
    
    doc.setFontSize(10);
    const dateInfo = selectedDate 
      ? format(selectedDate, 'dd/MM/yyyy')
      : 'Todas as datas';
    doc.text(`Data: ${dateInfo}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    const tableData = filteredReadings.map(r => [
      r.vehicle?.code || '-',
      format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
      r.previous_value?.toLocaleString('pt-BR') || '-',
      r.current_value.toLocaleString('pt-BR'),
      r.operator || '-'
    ]);

    autoTable(doc, {
      head: [['Veículo', 'Data', 'Anterior', 'Atual', 'Operador']],
      body: tableData,
      startY: 46,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`horimetros_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const excelData = filteredReadings.map(r => ({
      'Veículo': r.vehicle?.code || '',
      'Descrição': r.vehicle?.name || '',
      'Categoria': r.vehicle?.category || '',
      'Data': format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
      'Valor Anterior': r.previous_value || '',
      'Valor Atual': r.current_value,
      'Operador': r.operator || '',
      'Observação': r.observations || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
      { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Horímetros');
    XLSX.writeFile(workbook, `horimetros_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: 'Exportação concluída',
      description: `${excelData.length} registros exportados`,
    });
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Horímetros</h1>
              <p className="text-sm text-muted-foreground">Controle de horas trabalhadas</p>
            </div>
            <div className={cn(
              "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium",
              isConnected ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
            )}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <RefreshCw className="w-3 h-3 animate-spin" />}
              {isConnected ? 'Banco de Dados' : 'Carregando...'}
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              className="bg-primary hover:bg-primary/90 order-first lg:order-last" 
              onClick={() => setShowNewModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Novo Registro</span>
              <span className="sm:hidden">Novo</span>
            </Button>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={exportToPDF} className="shrink-0">
                <FileText className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={exportToExcel} className="shrink-0">
                <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowSyncModal(true)} className="shrink-0">
                <Download className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sincronizar</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="shrink-0">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title="Total de Registros"
            value={metrics.registros.toString()}
            icon={Clock}
            variant="blue"
          />
          <MetricCard
            title="Média por Registro"
            value={metrics.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
            icon={Clock}
            variant="green"
          />
          <MetricCard
            title="Veículos"
            value={vehicles.length.toString()}
            icon={Clock}
            variant="yellow"
          />
          <MetricCard
            title="Zerados"
            value={metrics.zerados.toString()}
            icon={AlertTriangle}
            variant="red"
          />
        </div>

        {/* Date Filter */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-wrap">
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={periodFilter} onValueChange={(value) => {
              setPeriodFilter(value);
              if (value !== 'personalizado') {
                setSelectedDate(undefined);
              }
            }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
                <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                <SelectItem value="mes">Este mês</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {periodFilter === 'personalizado' && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Calendar className="w-4 h-4 mr-2" />
                      {startDate ? format(startDate, 'dd/MM/yyyy') : 'Data início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-sm text-muted-foreground">até</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Calendar className="w-4 h-4 mr-2" />
                      {endDate ? format(endDate, 'dd/MM/yyyy') : 'Data fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <Button 
              variant={selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => {
                setSelectedDate(new Date());
                setPeriodFilter('hoje');
              }}
            >
              Hoje
            </Button>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Calendar className="w-4 h-4 mr-2" />
                  {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Data específica'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-background" align="start">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    if (date) setPeriodFilter('personalizado');
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            
            {(selectedDate || periodFilter !== 'todos') && (
              <Button variant="ghost" size="sm" onClick={clearDateFilter} title="Limpar filtros">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Todas</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Veículo" />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Todos</SelectItem>
              {vehicles.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por veículo, operador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === 'resumo' 
                ? "border-b-2 border-primary text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab('resumo')}
          >
            Resumo por Veículo
          </button>
          <button
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === 'detalhes' 
                ? "border-b-2 border-primary text-primary" 
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab('detalhes')}
          >
            Detalhes
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2">Carregando dados...</span>
          </div>
        ) : activeTab === 'resumo' ? (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Último</TableHead>
                  <TableHead className="text-right">Intervalo</TableHead>
                  <TableHead className="text-right">Mês</TableHead>
                  <TableHead className="text-center">Registros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicleSummary.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado. Importe dados da planilha ou crie um novo registro.
                    </TableCell>
                  </TableRow>
                ) : (
                  vehicleSummary.map(item => (
                    <TableRow key={item.vehicle.id}>
                      <TableCell className="font-medium">{item.vehicle.code}</TableCell>
                      <TableCell>{item.vehicle.name}</TableCell>
                      <TableCell>{item.vehicle.category}</TableCell>
                      <TableCell className="text-right">
                        {item.lastReading.toLocaleString('pt-BR')} {item.vehicle.unit}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        +{item.interval.toLocaleString('pt-BR')} {item.vehicle.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.monthTotal.toLocaleString('pt-BR')} {item.vehicle.unit}
                      </TableCell>
                      <TableCell className="text-center">{item.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Anterior</TableHead>
                  <TableHead className="text-right">Atual</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReadings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReadings.map(reading => (
                    <TableRow key={reading.id}>
                      <TableCell className="font-medium">{reading.vehicle?.code}</TableCell>
                      <TableCell>
                        {format(new Date(reading.reading_date + 'T00:00:00'), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        {reading.previous_value?.toLocaleString('pt-BR') || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {reading.current_value.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>{reading.operator || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {reading.observations || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingRecord(reading)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirm(reading)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Modals */}
      <DatabaseHorimeterModal
        open={showNewModal || !!editingRecord}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewModal(false);
            setEditingRecord(null);
          }
        }}
        onSuccess={() => refetchReadings()}
        editRecord={editingRecord}
      />

      <SyncModal
        open={showSyncModal}
        onOpenChange={setShowSyncModal}
        onSuccess={() => {
          refetchVehicles();
          refetchReadings();
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o registro de {deleteConfirm?.vehicle?.code} 
              do dia {deleteConfirm && format(new Date(deleteConfirm.reading_date + 'T00:00:00'), 'dd/MM/yyyy')}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
