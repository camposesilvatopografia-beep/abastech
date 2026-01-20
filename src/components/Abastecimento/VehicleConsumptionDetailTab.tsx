import { useState, useMemo } from 'react';
import { format, isValid, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Fuel,
  Gauge,
  Truck,
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useObraSettings } from '@/hooks/useObraSettings';

interface VehicleConsumptionDetailTabProps {
  data: {
    headers: string[];
    rows: Record<string, any>[];
  };
  refetch: () => void;
  loading: boolean;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function formatBrazilianNumber(value: number, decimals = 2): string {
  if (!value && value !== 0) return '-';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const date = new Date(year, month, day);
    if (isValid(date)) return date;
  }
  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
}

interface VehicleRecord {
  date: string;
  time: string;
  dateObj: Date;
  fuelQuantity: number;
  horimeterPrevious: number;
  horimeterCurrent: number;
  kmPrevious: number;
  kmCurrent: number;
  horimeterInterval: number;
  kmInterval: number;
  consumption: number;
  location: string;
  operator: string;
  rowIndex: number;
}

interface VehicleSummary {
  vehicleCode: string;
  vehicleDescription: string;
  category: string;
  isEquipment: boolean;
  totalLiters: number;
  totalHours: number;
  totalKm: number;
  avgConsumption: number;
  consumptionUnit: string;
  recordCount: number;
  records: VehicleRecord[];
}

type DateFilterType = 'all' | 'today' | 'week' | 'month' | 'period';
type GroupByType = 'vehicle' | 'description';

export function VehicleConsumptionDetailTab({ data, refetch, loading }: VehicleConsumptionDetailTabProps) {
  const { settings } = useObraSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('month');
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'code' | 'consumption' | 'liters'>('code');
  const [groupBy, setGroupBy] = useState<GroupByType>('description');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');

  // Extract unique vehicles for the filter dropdown
  const availableVehicles = useMemo(() => {
    const vehicleMap = new Map<string, { code: string; description: string }>();
    
    data.rows.forEach(row => {
      const code = String(row['VEICULO'] || '').trim();
      if (!code) return;
      
      if (!vehicleMap.has(code)) {
        vehicleMap.set(code, {
          code,
          description: String(row['DESCRICAO'] || ''),
        });
      }
    });
    
    return Array.from(vehicleMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [data.rows]);

  // Determine if a category is equipment (L/h) or vehicle (km/L)
  const isEquipmentCategory = (category: string): boolean => {
    const cat = category?.toLowerCase() || '';
    return cat.includes('equipamento') ||
           cat.includes('máquina') ||
           cat.includes('maquina') ||
           cat.includes('trator') ||
           cat.includes('retroescavadeira') ||
           cat.includes('escavadeira') ||
           cat.includes('pá carregadeira') ||
           cat.includes('rolo') ||
           cat.includes('motoniveladora') ||
           cat.includes('compactador') ||
           cat.includes('gerador');
  };

  // Get date range based on filter type
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (dateFilterType) {
      case 'today':
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return { start: todayStart, end: today };
      case 'week':
        return { start: subDays(today, 7), end: today };
      case 'month':
        return { start: subDays(today, 30), end: today };
      case 'period':
        return { start: startDate || subDays(today, 30), end: endDate || today };
      case 'all':
      default:
        return { start: null, end: null };
    }
  }, [dateFilterType, startDate, endDate]);

  // Process and group data by vehicle
  const vehicleSummaries = useMemo(() => {
    const vehicleMap = new Map<string, VehicleSummary>();

    data.rows.forEach(row => {
      const vehicleCode = String(row['VEICULO'] || '').trim();
      if (!vehicleCode) return;

      const dateStr = String(row['DATA'] || '');
      const dateObj = parseDate(dateStr);
      if (!dateObj) return;

      // Apply date filter
      if (dateRange.start && dateRange.end) {
        if (!isWithinInterval(dateObj, { start: startOfDay(dateRange.start), end: endOfDay(dateRange.end) })) {
          return;
        }
      }

      const category = String(row['CATEGORIA'] || '').toUpperCase();
      const isEquipment = isEquipmentCategory(category);
      
      const horimeterPrevious = parseNumber(row['HORIMETRO ANTERIOR']);
      const horimeterCurrent = parseNumber(row['HORIMETRO ATUAL']);
      const kmPrevious = parseNumber(row['KM ANTERIOR']);
      const kmCurrent = parseNumber(row['KM ATUAL']);
      const fuelQuantity = parseNumber(row['QUANTIDADE']);
      
      const horimeterInterval = horimeterCurrent > horimeterPrevious ? horimeterCurrent - horimeterPrevious : 0;
      const kmInterval = kmCurrent > kmPrevious ? kmCurrent - kmPrevious : 0;

      // Calculate consumption for this record
      let consumption = 0;
      if (isEquipment && horimeterInterval > 0) {
        consumption = fuelQuantity / horimeterInterval; // L/h
      } else if (!isEquipment && fuelQuantity > 0) {
        consumption = kmInterval / fuelQuantity; // km/L
      }

      const record: VehicleRecord = {
        date: dateStr,
        time: String(row['HORA'] || ''),
        dateObj,
        fuelQuantity,
        horimeterPrevious,
        horimeterCurrent,
        kmPrevious,
        kmCurrent,
        horimeterInterval,
        kmInterval,
        consumption,
        location: String(row['LOCAL'] || ''),
        operator: String(row['OPERADOR'] || ''),
        rowIndex: row._rowIndex as number,
      };

      if (!vehicleMap.has(vehicleCode)) {
        vehicleMap.set(vehicleCode, {
          vehicleCode,
          vehicleDescription: String(row['DESCRICAO'] || ''),
          category,
          isEquipment,
          totalLiters: 0,
          totalHours: 0,
          totalKm: 0,
          avgConsumption: 0,
          consumptionUnit: isEquipment ? 'L/h' : 'km/L',
          recordCount: 0,
          records: [],
        });
      }

      const summary = vehicleMap.get(vehicleCode)!;
      summary.totalLiters += fuelQuantity;
      summary.totalHours += horimeterInterval;
      summary.totalKm += kmInterval;
      summary.recordCount++;
      summary.records.push(record);
    });

    // Calculate average consumption for each vehicle
    vehicleMap.forEach(summary => {
      if (summary.isEquipment) {
        summary.avgConsumption = summary.totalHours > 0 ? summary.totalLiters / summary.totalHours : 0;
      } else {
        summary.avgConsumption = summary.totalLiters > 0 ? summary.totalKm / summary.totalLiters : 0;
      }
      
      // Sort records by date (newest first)
      summary.records.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    });

    return Array.from(vehicleMap.values());
  }, [data.rows, dateRange]);

  // Filter by search term and vehicle filter
  const filteredSummaries = useMemo(() => {
    let result = vehicleSummaries;
    
    // Apply vehicle filter
    if (vehicleFilter && vehicleFilter !== 'all') {
      result = result.filter(v => v.vehicleCode === vehicleFilter);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v => 
        v.vehicleCode.toLowerCase().includes(term) ||
        v.vehicleDescription.toLowerCase().includes(term) ||
        v.category.toLowerCase().includes(term)
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'consumption':
          return b.avgConsumption - a.avgConsumption;
        case 'liters':
          return b.totalLiters - a.totalLiters;
        case 'code':
        default:
          return a.vehicleCode.localeCompare(b.vehicleCode);
      }
    });

    return result;
  }, [vehicleSummaries, searchTerm, sortBy, vehicleFilter]);

  // Group summaries by description
  const groupedByDescription = useMemo(() => {
    if (groupBy !== 'description') return null;
    
    const groups = new Map<string, {
      description: string;
      vehicles: VehicleSummary[];
      totalLiters: number;
      totalHours: number;
      totalKm: number;
      avgConsumption: number;
      isEquipment: boolean;
      consumptionUnit: string;
    }>();
    
    filteredSummaries.forEach(summary => {
      const desc = summary.vehicleDescription || 'Outros';
      if (!groups.has(desc)) {
        groups.set(desc, {
          description: desc,
          vehicles: [],
          totalLiters: 0,
          totalHours: 0,
          totalKm: 0,
          avgConsumption: 0,
          isEquipment: summary.isEquipment,
          consumptionUnit: summary.consumptionUnit,
        });
      }
      const group = groups.get(desc)!;
      group.vehicles.push(summary);
      group.totalLiters += summary.totalLiters;
      group.totalHours += summary.totalHours;
      group.totalKm += summary.totalKm;
    });
    
    // Calculate average consumption for each group
    groups.forEach(group => {
      if (group.isEquipment) {
        group.avgConsumption = group.totalHours > 0 ? group.totalLiters / group.totalHours : 0;
      } else {
        group.avgConsumption = group.totalLiters > 0 ? group.totalKm / group.totalLiters : 0;
      }
    });
    
    // Sort groups by description
    return Array.from(groups.values()).sort((a, b) => a.description.localeCompare(b.description));
  }, [filteredSummaries, groupBy]);

  // Global metrics
  const globalMetrics = useMemo(() => {
    const totalLiters = vehicleSummaries.reduce((sum, v) => sum + v.totalLiters, 0);
    const totalRecords = vehicleSummaries.reduce((sum, v) => sum + v.recordCount, 0);
    const totalVehicles = vehicleSummaries.length;
    const equipmentCount = vehicleSummaries.filter(v => v.isEquipment).length;
    const vehicleCount = vehicleSummaries.filter(v => !v.isEquipment).length;
    const totalDescriptions = groupedByDescription?.length || 0;
    
    return { totalLiters, totalRecords, totalVehicles, equipmentCount, vehicleCount, totalDescriptions };
  }, [vehicleSummaries, groupedByDescription]);

  // Toggle vehicle expansion
  const toggleVehicle = (vehicleCode: string) => {
    setExpandedVehicles(prev => {
      const next = new Set(prev);
      if (next.has(vehicleCode)) {
        next.delete(vehicleCode);
      } else {
        next.add(vehicleCode);
      }
      return next;
    });
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE CONSUMO POR VEÍCULO/EQUIPAMENTO', pageWidth / 2, 12, { align: 'center' });
    
    if (settings?.nome) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`${settings.nome}${settings.cidade ? ` - ${settings.cidade}` : ''}`, pageWidth / 2, 19, { align: 'center' });
    }

    // Period
    doc.setFontSize(8);
    let periodStr = 'Período: ';
    switch (dateFilterType) {
      case 'today': periodStr += 'Hoje'; break;
      case 'week': periodStr += 'Últimos 7 dias'; break;
      case 'month': periodStr += 'Últimos 30 dias'; break;
      case 'period': 
        periodStr += dateRange.start && dateRange.end 
          ? `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`
          : 'Todo o período';
        break;
      default: periodStr += 'Todo o período';
    }
    doc.text(periodStr, pageWidth / 2, 25, { align: 'center' });

    // Summary
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Total: ${formatBrazilianNumber(globalMetrics.totalLiters)} L | ${globalMetrics.totalVehicles} veículos/equipamentos | ${globalMetrics.totalRecords} abastecimentos`, 14, 36);

    // Table
    const tableData = filteredSummaries.map(summary => [
      summary.vehicleCode,
      summary.vehicleDescription,
      summary.isEquipment ? 'Equipamento' : 'Veículo',
      formatBrazilianNumber(summary.totalLiters),
      summary.isEquipment 
        ? formatBrazilianNumber(summary.totalHours) + ' h'
        : formatBrazilianNumber(summary.totalKm, 0) + ' km',
      formatBrazilianNumber(summary.avgConsumption) + ' ' + summary.consumptionUnit,
      summary.recordCount.toString(),
    ]);

    autoTable(doc, {
      startY: 42,
      head: [['Veículo', 'Descrição', 'Tipo', 'Total (L)', 'Horas/Km', 'Consumo Médio', 'Abast.']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 60 },
        2: { cellWidth: 25 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 30 },
        5: { halign: 'right', cellWidth: 35 },
        6: { halign: 'center', cellWidth: 18 },
      },
    });

    doc.save(`consumo-detalhado-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Fuel className="h-4 w-4" />
              Total Diesel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatBrazilianNumber(globalMetrics.totalLiters)} L</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Abastecimentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{globalMetrics.totalRecords}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Veículos/Equipamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{globalMetrics.totalVehicles}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Gauge className="h-4 w-4 text-amber-500" />
              Equipamentos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{globalMetrics.equipmentCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-500" />
              Veículos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{globalMetrics.vehicleCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/50 rounded-lg">
        {/* Date Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={dateFilterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilterType('all')}
          >
            Todos
          </Button>
          <Button
            variant={dateFilterType === 'today' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilterType('today')}
          >
            Hoje
          </Button>
          <Button
            variant={dateFilterType === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilterType('week')}
          >
            7 Dias
          </Button>
          <Button
            variant={dateFilterType === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilterType('month')}
          >
            30 Dias
          </Button>
          <Button
            variant={dateFilterType === 'period' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilterType('period')}
          >
            <CalendarDays className="h-4 w-4 mr-1" />
            Período
          </Button>
        </div>

        {/* Period Date Pickers */}
        {dateFilterType === 'period' && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="border-green-500">
                  <Calendar className="h-4 w-4 mr-2" />
                  {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="border-destructive">
                  <Calendar className="h-4 w-4 mr-2" />
                  {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Vehicle Filter */}
        <div className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Filtrar veículo..." />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">Todos os veículos</SelectItem>
              {availableVehicles.map(vehicle => (
                <SelectItem key={vehicle.code} value={vehicle.code}>
                  <span className="font-bold text-primary">{vehicle.code}</span>
                  {vehicle.description && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {vehicle.description}
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vehicleFilter !== 'all' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setVehicleFilter('all')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex-1" />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar veículo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 w-48"
          />
        </div>

        {/* Group By */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Agrupar:</span>
          <Button
            variant={groupBy === 'description' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setGroupBy('description')}
          >
            Descrição
          </Button>
          <Button
            variant={groupBy === 'vehicle' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setGroupBy('vehicle')}
          >
            Veículo
          </Button>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ordenar:</span>
          <Button
            variant={sortBy === 'code' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('code')}
          >
            Código
          </Button>
          <Button
            variant={sortBy === 'liters' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('liters')}
          >
            Litros
          </Button>
          <Button
            variant={sortBy === 'consumption' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('consumption')}
          >
            Consumo
          </Button>
        </div>

        {/* Actions */}
        <Button variant="outline" size="sm" onClick={exportToPDF}>
          <Download className="h-4 w-4 mr-2" />
          PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Grouped by Description */}
      {groupBy === 'description' && groupedByDescription && (
        <div className="space-y-4">
          {groupedByDescription.length === 0 ? (
            <Card className="p-8 text-center">
              <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Nenhum registro encontrado</h3>
              <p className="text-muted-foreground">
                Ajuste os filtros ou o período para visualizar os dados de consumo.
              </p>
            </Card>
          ) : (
            groupedByDescription.map((group) => (
              <Collapsible
                key={group.description}
                open={expandedVehicles.has(group.description)}
                onOpenChange={() => toggleVehicle(group.description)}
              >
                <Card className={cn(
                  "transition-all",
                  expandedVehicles.has(group.description) && "ring-2 ring-primary"
                )}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            group.isEquipment ? "bg-amber-100 dark:bg-amber-900/30" : "bg-blue-100 dark:bg-blue-900/30"
                          )}>
                            {group.isEquipment ? (
                              <Gauge className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                            ) : (
                              <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{group.description}</span>
                              <Badge variant="secondary">
                                {group.vehicles.length} {group.vehicles.length === 1 ? 'veículo' : 'veículos'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {group.vehicles.map(v => v.vehicleCode).join(', ')}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Total</p>
                            <p className="font-bold text-lg">{formatBrazilianNumber(group.totalLiters)} L</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              {group.isEquipment ? 'Horas' : 'Km'}
                            </p>
                            <p className="font-bold text-lg">
                              {group.isEquipment 
                                ? `${formatBrazilianNumber(group.totalHours)} h`
                                : `${formatBrazilianNumber(group.totalKm, 0)} km`
                              }
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Consumo Médio</p>
                            <p className={cn(
                              "font-bold text-lg",
                              group.avgConsumption > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                            )}>
                              {formatBrazilianNumber(group.avgConsumption)} {group.consumptionUnit}
                            </p>
                          </div>
                          <div>
                            {expandedVehicles.has(group.description) ? (
                              <ChevronUp className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="rounded-lg border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Veículo</TableHead>
                              <TableHead className="text-right">Litros</TableHead>
                              <TableHead className="text-right">{group.isEquipment ? 'Horas' : 'Km'}</TableHead>
                              <TableHead className="text-right">Consumo</TableHead>
                              <TableHead className="text-right">Abast.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.vehicles.map((vehicle) => (
                              <TableRow key={vehicle.vehicleCode}>
                                <TableCell>
                                  <div className="font-medium">{vehicle.vehicleCode}</div>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {formatBrazilianNumber(vehicle.totalLiters)}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {vehicle.isEquipment 
                                    ? formatBrazilianNumber(vehicle.totalHours)
                                    : formatBrazilianNumber(vehicle.totalKm, 0)
                                  }
                                </TableCell>
                                <TableCell className={cn(
                                  "text-right font-mono font-medium",
                                  vehicle.avgConsumption > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                                )}>
                                  {vehicle.avgConsumption > 0 ? formatBrazilianNumber(vehicle.avgConsumption) : '-'} {vehicle.consumptionUnit}
                                </TableCell>
                                <TableCell className="text-right">
                                  {vehicle.recordCount}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      )}

      {/* Vehicle List (ungrouped) */}
      {groupBy === 'vehicle' && (
      <div className="space-y-3">
        {filteredSummaries.length === 0 ? (
          <Card className="p-8 text-center">
            <Truck className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Nenhum registro encontrado</h3>
            <p className="text-muted-foreground">
              Ajuste os filtros ou o período para visualizar os dados de consumo.
            </p>
          </Card>
        ) : (
          filteredSummaries.map((summary) => (
            <Collapsible
              key={summary.vehicleCode}
              open={expandedVehicles.has(summary.vehicleCode)}
              onOpenChange={() => toggleVehicle(summary.vehicleCode)}
            >
              <Card className={cn(
                "transition-all",
                expandedVehicles.has(summary.vehicleCode) && "ring-2 ring-primary"
              )}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-lg",
                          summary.isEquipment ? "bg-amber-100 dark:bg-amber-900/30" : "bg-blue-100 dark:bg-blue-900/30"
                        )}>
                          {summary.isEquipment ? (
                            <Gauge className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          ) : (
                            <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-lg">{summary.vehicleCode}</span>
                            <Badge variant="outline" className={cn(
                              summary.isEquipment 
                                ? "border-amber-300 text-amber-700 dark:text-amber-300" 
                                : "border-blue-300 text-blue-700 dark:text-blue-300"
                            )}>
                              {summary.consumptionUnit}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{summary.vehicleDescription}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Total</p>
                          <p className="font-bold text-lg">{formatBrazilianNumber(summary.totalLiters)} L</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {summary.isEquipment ? 'Horas' : 'Km'}
                          </p>
                          <p className="font-bold text-lg">
                            {summary.isEquipment 
                              ? `${formatBrazilianNumber(summary.totalHours)} h`
                              : `${formatBrazilianNumber(summary.totalKm, 0)} km`
                            }
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Consumo Médio</p>
                          <p className={cn(
                            "font-bold text-lg",
                            summary.avgConsumption > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                          )}>
                            {formatBrazilianNumber(summary.avgConsumption)} {summary.consumptionUnit}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Abast.</p>
                          <p className="font-bold text-lg">{summary.recordCount}</p>
                        </div>
                        <div>
                          {expandedVehicles.has(summary.vehicleCode) ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="rounded-lg border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Data</TableHead>
                            <TableHead>Hora</TableHead>
                            <TableHead className="text-right">Litros</TableHead>
                            {summary.isEquipment ? (
                              <>
                                <TableHead className="text-right">Hor. Ant.</TableHead>
                                <TableHead className="text-right">Hor. Atual</TableHead>
                                <TableHead className="text-right">Δ Horas</TableHead>
                              </>
                            ) : (
                              <>
                                <TableHead className="text-right">Km Ant.</TableHead>
                                <TableHead className="text-right">Km Atual</TableHead>
                                <TableHead className="text-right">Δ Km</TableHead>
                              </>
                            )}
                            <TableHead className="text-right">{summary.consumptionUnit}</TableHead>
                            <TableHead>Local</TableHead>
                            <TableHead>Operador</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summary.records.map((record, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{record.date}</TableCell>
                              <TableCell>{record.time}</TableCell>
                              <TableCell className="text-right font-mono">
                                {formatBrazilianNumber(record.fuelQuantity)}
                              </TableCell>
                              {summary.isEquipment ? (
                                <>
                                  <TableCell className="text-right font-mono">
                                    {formatBrazilianNumber(record.horimeterPrevious)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatBrazilianNumber(record.horimeterCurrent)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                                    {record.horimeterInterval > 0 ? formatBrazilianNumber(record.horimeterInterval) : '-'}
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell className="text-right font-mono">
                                    {formatBrazilianNumber(record.kmPrevious, 0)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatBrazilianNumber(record.kmCurrent, 0)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono font-medium text-blue-600 dark:text-blue-400">
                                    {record.kmInterval > 0 ? formatBrazilianNumber(record.kmInterval, 0) : '-'}
                                  </TableCell>
                                </>
                              )}
                              <TableCell className={cn(
                                "text-right font-mono font-medium",
                                record.consumption > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                              )}>
                                {record.consumption > 0 ? formatBrazilianNumber(record.consumption) : '-'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{record.location || '-'}</TableCell>
                              <TableCell className="text-muted-foreground">{record.operator || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))
        )}
      </div>
      )}
    </div>
  );
}
