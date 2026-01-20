import { useState, useMemo, useCallback, useEffect } from 'react';
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
  Upload,
  Users,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Settings,
  CheckSquare,
  Square,
  Layers,
  LayoutGrid,
  LayoutList,
  Wrench,
  List,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useVehicles, useHorimeterReadings, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, isWithinInterval, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { DatabaseHorimeterModal } from '@/components/Horimetros/DatabaseHorimeterModal';
import { SyncModal } from '@/components/Horimetros/SyncModal';
import { BatchHorimeterModal } from '@/components/Horimetros/BatchHorimeterModal';
import { ColumnConfigModal } from '@/components/Layout/ColumnConfigModal';
import { useLayoutPreferences, ColumnConfig } from '@/hooks/useLayoutPreferences';
import * as XLSX from 'xlsx';
import { HorimeterCardView } from '@/components/Horimetros/HorimeterCardView';
import { HorimeterDBCorrectionsTab } from '@/components/Horimetros/HorimeterDBCorrectionsTab';

const TABS = [
  { id: 'registros', label: 'Registros', icon: List },
  { id: 'correcoes', label: 'Correções', icon: Wrench },
];
const DEFAULT_HORIMETER_COLUMNS: ColumnConfig[] = [
  { key: 'select', label: 'Seleção', visible: true, order: 0 },
  { key: 'data', label: 'Data', visible: true, order: 1 },
  { key: 'veiculo', label: 'Veículo', visible: true, order: 2 },
  { key: 'empresa', label: 'Empresa', visible: true, order: 3 },
  { key: 'categoria', label: 'Categoria', visible: true, order: 4 },
  { key: 'anterior', label: 'Hor. Anterior', visible: true, order: 5 },
  { key: 'atual', label: 'Hor. Atual', visible: true, order: 6 },
  { key: 'intervalo', label: 'Intervalo', visible: true, order: 7 },
  { key: 'km_anterior', label: 'KM Anterior', visible: false, order: 8 },
  { key: 'km_atual', label: 'KM Atual', visible: false, order: 9 },
  { key: 'operador', label: 'Operador', visible: true, order: 10 },
  { key: 'observacoes', label: 'Observações', visible: false, order: 11 },
  { key: 'acoes', label: 'Ações', visible: true, order: 12 },
];

export function HorimetrosPageDB() {
  const isMobile = useIsMobile();
  const { vehicles, loading: vehiclesLoading, refetch: refetchVehicles } = useVehicles();
  const { readings, loading: readingsLoading, refetch: refetchReadings, deleteReading } = useHorimeterReadings();
  const { toast } = useToast();
  
  // Column configuration
  const { 
    columnConfig, 
    visibleColumns,
    savePreferences: saveColumnPrefs,
    resetToDefaults: resetColumnPrefs 
  } = useLayoutPreferences('horimetros', DEFAULT_HORIMETER_COLUMNS);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [periodFilter, setPeriodFilter] = useState('hoje');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('ativo');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HorimeterWithVehicle | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<HorimeterWithVehicle | null>(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [activeTab, setActiveTab] = useState('registros');
  // Multi-selection state - disabled by default
  const [selectionModeActive, setSelectionModeActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  
  // View mode - auto-detect based on device
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  
  // Auto-switch to cards on mobile
  useEffect(() => {
    if (isMobile) {
      setViewMode('cards');
    }
  }, [isMobile]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  
  const ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

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

  // Get unique companies
  const companies = useMemo(() => {
    const unique = new Set<string>();
    vehicles.forEach(v => {
      if (v.company) unique.add(v.company);
    });
    return Array.from(unique).sort();
  }, [vehicles]);

  // Get unique statuses
  const statuses = useMemo(() => {
    const unique = new Set<string>();
    vehicles.forEach(v => {
      if (v.status) unique.add(v.status);
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

      // Company filter
      let matchesCompany = true;
      if (companyFilter !== 'all') {
        matchesCompany = reading.vehicle?.company?.toLowerCase() === companyFilter.toLowerCase();
      }

      // Vehicle filter
      let matchesVehicle = true;
      if (vehicleFilter !== 'all') {
        matchesVehicle = reading.vehicle_id === vehicleFilter;
      }

      // Status filter - filter by vehicle status
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        matchesStatus = reading.vehicle?.status?.toLowerCase() === statusFilter.toLowerCase();
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

      return matchesSearch && matchesDate && matchesCategory && matchesCompany && matchesVehicle && matchesStatus;
    }).sort((a, b) => {
      // Sort by date descending, then by vehicle code
      const dateCompare = new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return (a.vehicle?.code || '').localeCompare(b.vehicle?.code || '');
    });
  }, [readings, search, selectedDate, dateRange, categoryFilter, companyFilter, vehicleFilter]);

  // Calculate interval for each reading
  const readingsWithInterval = useMemo(() => {
    return filteredReadings.map(reading => ({
      ...reading,
      interval: reading.previous_value 
        ? reading.current_value - reading.previous_value 
        : 0
    }));
  }, [filteredReadings]);

  // Pagination calculations
  const totalPages = Math.ceil(readingsWithInterval.length / rowsPerPage);
  const paginatedReadings = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return readingsWithInterval.slice(startIndex, startIndex + rowsPerPage);
  }, [readingsWithInterval, currentPage, rowsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedDate, dateRange, categoryFilter, companyFilter, vehicleFilter, statusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    let totalInterval = 0;
    let zerados = 0;

    readingsWithInterval.forEach(r => {
      totalInterval += r.interval;
      if (r.current_value === 0) zerados++;
    });

    return {
      registros: readingsWithInterval.length,
      totalInterval,
      zerados,
    };
  }, [readingsWithInterval]);

  // Get the reference date for missing vehicles calculation
  const referenceDate = useMemo(() => {
    if (selectedDate) return selectedDate;
    if (periodFilter === 'hoje') return new Date();
    if (periodFilter === 'ontem') return subDays(new Date(), 1);
    return new Date();
  }, [selectedDate, periodFilter]);

  // Vehicles with readings on the reference date
  const vehiclesWithReadingsOnDate = useMemo(() => {
    const dateStr = format(referenceDate, 'yyyy-MM-dd');
    const vehicleIds = new Set<string>();
    readings.forEach(r => {
      if (r.reading_date === dateStr) {
        vehicleIds.add(r.vehicle_id);
      }
    });
    return vehicleIds;
  }, [readings, referenceDate]);

  // Missing vehicles (no reading on reference date)
  const missingVehicles = useMemo(() => {
    return vehicles.filter(v => !vehiclesWithReadingsOnDate.has(v.id));
  }, [vehicles, vehiclesWithReadingsOnDate]);

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
      // Force immediate refetch to ensure UI is in sync
      await refetchReadings();
    } catch (err) {
      // Error handled in hook
    }
  };

  // Bulk delete handler - optimized for speed with parallel deletion
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    const idsToDelete = Array.from(selectedIds);
    const totalCount = idsToDelete.length;
    
    try {
      // Delete in parallel batches of 10 for efficiency
      const batchSize = 10;
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        await Promise.all(batch.map(id => deleteReading(id)));
      }
      
      toast({
        title: 'Exclusão concluída',
        description: `${totalCount} registro(s) excluído(s) com sucesso`,
      });
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
      await refetchReadings();
    } catch (err) {
      toast({
        title: 'Erro ao excluir',
        description: 'Alguns registros podem não ter sido excluídos',
        variant: 'destructive',
      });
    }
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle all selections
  const toggleSelectAll = () => {
    if (selectedIds.size === readingsWithInterval.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(readingsWithInterval.map(r => r.id)));
    }
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionModeActive) {
      setSelectedIds(new Set());
    }
    setSelectionModeActive(!selectionModeActive);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Red header bar
    doc.setFillColor(220, 53, 69);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('RELATÓRIO DE HORÍMETROS', pageWidth / 2, 16, { align: 'center' });
    
    let y = 35;
    
    // Filters info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    
    let dateInfo = 'Todas as datas';
    if (selectedDate) {
      dateInfo = format(selectedDate, 'dd/MM/yyyy');
    } else if (periodFilter !== 'todos' && dateRange) {
      dateInfo = `${format(dateRange.start, 'dd/MM/yyyy')} até ${format(dateRange.end, 'dd/MM/yyyy')}`;
    }
    doc.text(`Período: ${dateInfo}`, 14, y);
    
    if (companyFilter !== 'all') {
      doc.text(`Empresa: ${companyFilter}`, 100, y);
    }
    
    if (vehicleFilter !== 'all') {
      const vehicle = vehicles.find(v => v.id === vehicleFilter);
      doc.text(`Veículo: ${vehicle?.code || vehicleFilter}`, companyFilter !== 'all' ? 200 : 100, y);
    }
    
    y += 6;
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, y);
    doc.text(`Total: ${readingsWithInterval.length} registros`, 100, y);
    
    y += 10;

    const tableData = readingsWithInterval.map(r => [
      format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
      r.vehicle?.code || '-',
      r.vehicle?.company || '-',
      r.vehicle?.category || '-',
      r.previous_value?.toLocaleString('pt-BR') || '-',
      r.current_value.toLocaleString('pt-BR'),
      r.interval > 0 ? `+${r.interval.toLocaleString('pt-BR')}` : r.interval.toLocaleString('pt-BR'),
      r.operator || '-',
    ]);

    autoTable(doc, {
      head: [['Data', 'Veículo', 'Empresa', 'Categoria', 'Anterior', 'Atual', 'Intervalo', 'Operador']],
      body: tableData,
      startY: y,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 53, 69], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });

    // Add totals
    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de registros: ${readingsWithInterval.length}`, 14, finalY + 10);
    doc.text(`Intervalo total: ${metrics.totalInterval.toLocaleString('pt-BR')}`, 100, finalY + 10);

    const fileName = companyFilter !== 'all' 
      ? `horimetros_${companyFilter.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`
      : `horimetros_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    
    doc.save(fileName);
  };

  const exportToExcel = () => {
    const excelData = readingsWithInterval.map(r => ({
      'Data': format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
      'Veículo': r.vehicle?.code || '',
      'Anterior': r.previous_value || '',
      'Atual': r.current_value,
      'Intervalo': r.interval,
      'Descrição': r.vehicle?.name || '',
      'Categoria': r.vehicle?.category || '',
      'Operador': r.operator || '',
      'Observação': r.observations || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 25 }, { wch: 15 }, { wch: 20 }, { wch: 30 },
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
              {isConnected ? 'Conectado' : 'Carregando...'}
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
            
            <Button 
              variant="outline"
              onClick={() => setShowBatchModal(true)}
              className="order-first lg:order-last"
            >
              <Layers className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Cadastro em Lote</span>
              <span className="sm:hidden">Lote</span>
            </Button>
            
            <Button 
              variant={selectionModeActive ? "secondary" : "outline"}
              size="sm"
              onClick={toggleSelectionMode}
            >
              {selectionModeActive ? <CheckSquare className="w-4 h-4 mr-2" /> : <Square className="w-4 h-4 mr-2" />}
              <span className="hidden sm:inline">Selecionar</span>
            </Button>
            
            {selectionModeActive && selectedIds.size > 0 && (
              <Button 
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir ({selectedIds.size})
              </Button>
            )}
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* View mode toggle */}
              <div className="flex items-center border rounded-lg overflow-hidden">
                <Button 
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-none h-8"
                  onClick={() => setViewMode('table')}
                >
                  <LayoutList className="w-4 h-4" />
                </Button>
                <Button 
                  variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-none h-8"
                  onClick={() => setViewMode('cards')}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
              </div>
              
              <Button variant="outline" size="sm" onClick={() => setShowColumnConfig(true)} className="shrink-0">
                <Settings className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Colunas</span>
              </Button>
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

        {/* Metrics - Simplified */}
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-2 flex items-center gap-3">
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total de Registros</p>
              <p className="text-xl font-bold text-primary">{metrics.registros}</p>
            </div>
          </div>
          
          {/* Missing vehicles - compact */}
          <div 
            className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors flex items-center gap-3"
            onClick={() => setShowMissingModal(true)}
          >
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">Sem registro hoje</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-300">{missingVehicles.length}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          {TABS.map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className="gap-2"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {activeTab === 'correcoes' ? (
          <HorimeterDBCorrectionsTab 
            readings={readings} 
            refetch={refetchReadings} 
            loading={loading}
          />
        ) : (
        <>
        {/* Filters */}
        <div className="bg-card rounded-lg border p-4 space-y-3">
          {/* Date Filter Row - Simplified: Hoje, Data, Período */}
          <div className="flex flex-wrap gap-2 items-center pb-3 border-b">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Data:</span>
            
            {/* Hoje button */}
            <Button
              variant={periodFilter === 'hoje' && !selectedDate ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => {
                setPeriodFilter('hoje');
                setSelectedDate(undefined);
                setStartDate(undefined);
                setEndDate(undefined);
              }}
            >
              Hoje
            </Button>
            
            {/* Single date picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant={selectedDate ? 'default' : 'outline'} 
                  size="sm" 
                  className="h-7 text-xs"
                >
                  {selectedDate ? format(selectedDate, 'dd/MM/yyyy') : 'Data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-background" align="start">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setPeriodFilter('todos');
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            
            {/* Period range pickers */}
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant={startDate ? 'default' : 'outline'} 
                    size="sm" 
                    className="h-7 text-xs"
                  >
                    {startDate ? format(startDate, 'dd/MM/yy') : 'De'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setSelectedDate(undefined);
                      setPeriodFilter('personalizado');
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant={endDate ? 'default' : 'outline'} 
                    size="sm" 
                    className="h-7 text-xs"
                  >
                    {endDate ? format(endDate, 'dd/MM/yy') : 'Até'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setSelectedDate(undefined);
                      setPeriodFilter('personalizado');
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {(startDate || endDate || selectedDate || periodFilter !== 'hoje') && (
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearDateFilter}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
          
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-wrap">

            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Categoria:</span>
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
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Empresa:</span>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Todas</SelectItem>
                  {companies.map(comp => (
                    <SelectItem key={comp} value={comp}>{comp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Veículo:</span>
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

            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Todos</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
        </div>

        {/* Details Table or Card View */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2">Carregando dados...</span>
          </div>
        ) : viewMode === 'cards' ? (
          <>
            <HorimeterCardView
              readings={paginatedReadings}
              selectedIds={selectedIds}
              selectionModeActive={selectionModeActive}
              onToggleSelection={toggleSelection}
              onEdit={(reading) => setEditingRecord(reading as any)}
              onDelete={(reading) => setDeleteConfirm(reading as any)}
            />
            
            {/* Pagination Footer for Cards */}
            {readingsWithInterval.length > 0 && (
              <div className="bg-card border rounded-lg p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    Total: <strong>{readingsWithInterval.length}</strong> registros
                    {selectedIds.size > 0 && (
                      <span className="ml-2 text-primary">({selectedIds.size} selecionados)</span>
                    )}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Exibir:</span>
                  <Select value={rowsPerPage.toString()} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {ROWS_PER_PAGE_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt.toString()}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <span className="text-xs text-muted-foreground mx-2">
                    Pág. {currentPage} de {totalPages || 1}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || totalPages === 0}
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectionModeActive && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === readingsWithInterval.length && readingsWithInterval.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Hor. Anterior</TableHead>
                  <TableHead className="text-right">Hor. Atual</TableHead>
                  <TableHead className="text-right">Intervalo</TableHead>
                  <TableHead className="text-right">KM Anterior</TableHead>
                  <TableHead className="text-right">KM Atual</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReadings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={selectionModeActive ? 13 : 12} className="text-center py-8 text-muted-foreground">
                      Nenhum registro encontrado para o período selecionado
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedReadings.map(reading => (
                    <TableRow key={reading.id} className={cn(selectedIds.has(reading.id) && "bg-primary/5")}>
                      {selectionModeActive && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(reading.id)}
                            onCheckedChange={() => toggleSelection(reading.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        {format(new Date(reading.reading_date + 'T00:00:00'), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">{reading.vehicle?.code}</TableCell>
                      <TableCell>{reading.vehicle?.company || '-'}</TableCell>
                      <TableCell>{reading.vehicle?.category || '-'}</TableCell>
                      <TableCell className="text-right">
                        {reading.previous_value?.toLocaleString('pt-BR') || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {reading.current_value.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        reading.interval > 0 ? "text-green-600" : reading.interval < 0 ? "text-red-600" : ""
                      )}>
                        {reading.interval > 0 ? '+' : ''}{reading.interval.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {(reading as any).previous_km?.toLocaleString('pt-BR') || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium text-blue-600">
                        {(reading as any).current_km?.toLocaleString('pt-BR') || '-'}
                      </TableCell>
                      <TableCell>{reading.operator || '-'}</TableCell>
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
            
            {/* Pagination Footer */}
            {readingsWithInterval.length > 0 && (
              <div className="border-t bg-muted/30 p-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">
                    Total: <strong>{readingsWithInterval.length}</strong> registros
                    {selectedIds.size > 0 && (
                      <span className="ml-2 text-primary">({selectedIds.size} selecionados)</span>
                    )}
                  </span>
                  <span className="text-muted-foreground hidden sm:inline">
                    Intervalo: <strong className="text-green-600">+{metrics.totalInterval.toLocaleString('pt-BR')}</strong>
                  </span>
                </div>
                
                {/* Pagination Controls */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Exibir:</span>
                  <Select value={rowsPerPage.toString()} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      {ROWS_PER_PAGE_OPTIONS.map(opt => (
                        <SelectItem key={opt} value={opt.toString()}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <span className="text-xs text-muted-foreground mx-2">
                    Pág. {currentPage} de {totalPages || 1}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages || totalPages === 0}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-8 w-8"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages || totalPages === 0}
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
        </>
        )}

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
        externalReadings={readings}
      />

      <SyncModal
        open={showSyncModal}
        onOpenChange={setShowSyncModal}
        onSuccess={() => {
          refetchVehicles();
          refetchReadings();
        }}
      />

      <BatchHorimeterModal
        open={showBatchModal}
        onOpenChange={setShowBatchModal}
        onSuccess={() => refetchReadings()}
      />

      <ColumnConfigModal
        open={showColumnConfig}
        onClose={() => setShowColumnConfig(false)}
        columns={columnConfig}
        onSave={saveColumnPrefs}
        onReset={resetColumnPrefs}
        moduleName="Horímetros"
      />

      {/* Missing Vehicles Modal */}
      <Dialog open={showMissingModal} onOpenChange={setShowMissingModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Veículos sem Registro - {format(referenceDate, 'dd/MM/yyyy')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            {missingVehicles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>Todos os veículos possuem registro para esta data!</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  {missingVehicles.length} veículo(s) sem apontamento de horímetro:
                </p>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingVehicles.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-medium">{v.code}</TableCell>
                          <TableCell>{v.name}</TableCell>
                          <TableCell>{v.category || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setShowMissingModal(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão em Lote</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{selectedIds.size}</strong> registro(s)?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir {selectedIds.size} Registro(s)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
