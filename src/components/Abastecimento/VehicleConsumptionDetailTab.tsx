import { useState, useMemo, useEffect, Fragment } from 'react';
import { format, isValid, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Fuel,
  Gauge,
  Truck,
  AlertTriangle,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  X,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

function formatBR(value: number, decimals = 2): string {
  if (!value && value !== 0) return '-';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    if (isValid(d)) return d;
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

const isEquipmentCategory = (category: string): boolean => {
  const cat = category?.toLowerCase() || '';
  return cat.includes('equipamento') || cat.includes('máquina') || cat.includes('maquina') ||
    cat.includes('trator') || cat.includes('retroescavadeira') || cat.includes('escavadeira') ||
    cat.includes('pá carregadeira') || cat.includes('rolo') || cat.includes('motoniveladora') ||
    cat.includes('compactador') || cat.includes('gerador');
};

export function VehicleConsumptionDetailTab({ data, refetch, loading }: VehicleConsumptionDetailTabProps) {
  const { settings } = useObraSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('today');
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'code' | 'consumption' | 'liters'>('code');
  const [selectedVehicle, setSelectedVehicle] = useState<string>('all');

  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    switch (dateFilterType) {
      case 'today': { const s = new Date(); s.setHours(0,0,0,0); return { start: s, end: today }; }
      case 'week': return { start: subDays(today, 7), end: today };
      case 'month': return { start: subDays(today, 30), end: today };
      case 'period': return { start: startDate || subDays(today, 30), end: endDate || today };
      default: return { start: null, end: null };
    }
  }, [dateFilterType, startDate, endDate]);

  const vehicleSummaries = useMemo(() => {
    const vehicleMap = new Map<string, VehicleSummary>();

    data.rows.forEach(row => {
      const vehicleCode = String(row['VEICULO'] || '').trim();
      if (!vehicleCode) return;
      const dateStr = String(row['DATA'] || '');
      const dateObj = parseDate(dateStr);
      if (!dateObj) return;

      if (dateRange.start && dateRange.end) {
        if (!isWithinInterval(dateObj, { start: startOfDay(dateRange.start), end: endOfDay(dateRange.end) })) return;
      }

      const category = String(row['CATEGORIA'] || '').toUpperCase();
      const isEquipment = isEquipmentCategory(category);
      const horimeterPrevious = parseNumber(row['HORIMETRO ANTERIOR']);
      const horimeterCurrent = parseNumber(row['HORIMETRO ATUAL']);
      const kmPrevious = parseNumber(row['KM ANTERIOR']);
      const kmCurrent = parseNumber(row['KM ATUAL']);
      const fuelQuantity = parseNumber(row['QUANTIDADE']);
      // Only compute interval if both previous and current are > 0 (avoid inflated values when previous is missing)
      const horimeterInterval = (horimeterPrevious > 0 && horimeterCurrent > horimeterPrevious) ? horimeterCurrent - horimeterPrevious : 0;
      const kmInterval = (kmPrevious > 0 && kmCurrent > kmPrevious) ? kmCurrent - kmPrevious : 0;

      let consumption = 0;
      if (isEquipment && horimeterInterval > 0 && fuelQuantity > 0) consumption = fuelQuantity / horimeterInterval;
      else if (!isEquipment && kmInterval > 0 && fuelQuantity > 0) consumption = kmInterval / fuelQuantity;

      const record: VehicleRecord = {
        date: dateStr, time: String(row['HORA'] || ''), dateObj, fuelQuantity,
        horimeterPrevious, horimeterCurrent, kmPrevious, kmCurrent,
        horimeterInterval, kmInterval, consumption,
        location: String(row['LOCAL'] || ''), operator: String(row['OPERADOR'] || ''),
      };

      if (!vehicleMap.has(vehicleCode)) {
        vehicleMap.set(vehicleCode, {
          vehicleCode, vehicleDescription: String(row['DESCRICAO'] || ''),
          category, isEquipment, totalLiters: 0, totalHours: 0, totalKm: 0,
          avgConsumption: 0, consumptionUnit: isEquipment ? 'L/h' : 'km/L',
          recordCount: 0, records: [],
        });
      }

      const s = vehicleMap.get(vehicleCode)!;
      s.totalLiters += fuelQuantity;
      s.totalHours += horimeterInterval;
      s.totalKm += kmInterval;
      s.recordCount++;
      s.records.push(record);
    });

    vehicleMap.forEach(s => {
      // Calculate average only from records with valid intervals
      const validRecords = s.records.filter(r => r.consumption > 0);
      if (validRecords.length > 0) {
        const sumConsumption = validRecords.reduce((acc, r) => acc + r.consumption, 0);
        s.avgConsumption = sumConsumption / validRecords.length;
      } else {
        s.avgConsumption = 0;
      }
      s.records.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    });

    return Array.from(vehicleMap.values());
  }, [data.rows, dateRange]);

  const filteredSummaries = useMemo(() => {
    let result = vehicleSummaries;
    if (selectedVehicle && selectedVehicle !== 'all') {
      result = result.filter(v => v.vehicleCode === selectedVehicle);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v =>
        v.vehicleCode.toLowerCase().includes(term) ||
        v.vehicleDescription.toLowerCase().includes(term)
      );
    }
    result.sort((a, b) => {
      if (sortBy === 'consumption') return b.avgConsumption - a.avgConsumption;
      if (sortBy === 'liters') return b.totalLiters - a.totalLiters;
      return a.vehicleCode.localeCompare(b.vehicleCode);
    });
    return result;
  }, [vehicleSummaries, searchTerm, sortBy, selectedVehicle]);

  // Auto-expand when a specific vehicle is selected
  useEffect(() => {
    if (selectedVehicle && selectedVehicle !== 'all') {
      setExpandedVehicles(new Set([selectedVehicle]));
    }
  }, [selectedVehicle]);

  // Available vehicles for dropdown
  const vehicleOptions = useMemo(() => {
    return vehicleSummaries
      .map(v => ({ code: v.vehicleCode, label: `${v.vehicleCode} - ${v.vehicleDescription || 'Sem descrição'}` }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [vehicleSummaries]);

  // Compute global average per type for divergence detection
  const globalAvg = useMemo(() => {
    const equip = vehicleSummaries.filter(v => v.isEquipment && v.avgConsumption > 0);
    const veic = vehicleSummaries.filter(v => !v.isEquipment && v.avgConsumption > 0);
    const equipAvg = equip.length > 0 ? equip.reduce((s, v) => s + v.avgConsumption, 0) / equip.length : 0;
    const veicAvg = veic.length > 0 ? veic.reduce((s, v) => s + v.avgConsumption, 0) / veic.length : 0;
    return { equipAvg, veicAvg };
  }, [vehicleSummaries]);

  const metrics = useMemo(() => {
    const totalLiters = vehicleSummaries.reduce((s, v) => s + v.totalLiters, 0);
    const totalRecords = vehicleSummaries.reduce((s, v) => s + v.recordCount, 0);
    const total = vehicleSummaries.length;
    const equipCount = vehicleSummaries.filter(v => v.isEquipment).length;
    const veicCount = vehicleSummaries.filter(v => !v.isEquipment).length;
    // Count vehicles with consumption >30% above global average
    const divergent = vehicleSummaries.filter(v => {
      if (v.avgConsumption <= 0) return false;
      const avg = v.isEquipment ? globalAvg.equipAvg : globalAvg.veicAvg;
      if (avg <= 0) return false;
      if (v.isEquipment) return v.avgConsumption > avg * 1.3; // L/h: higher = worse
      return v.avgConsumption < avg * 0.7; // km/L: lower = worse
    }).length;
    return { totalLiters, totalRecords, total, equipCount, veicCount, divergent };
  }, [vehicleSummaries, globalAvg]);

  const getDivergenceStatus = (v: VehicleSummary) => {
    if (v.avgConsumption <= 0) return 'neutral';
    const avg = v.isEquipment ? globalAvg.equipAvg : globalAvg.veicAvg;
    if (avg <= 0) return 'neutral';
    if (v.isEquipment) {
      const ratio = v.avgConsumption / avg;
      if (ratio > 1.3) return 'high';
      if (ratio < 0.8) return 'low';
    } else {
      const ratio = v.avgConsumption / avg;
      if (ratio < 0.7) return 'high'; // km/L lower = bad
      if (ratio > 1.2) return 'low';
    }
    return 'normal';
  };

  const toggleVehicle = (code: string) => {
    setExpandedVehicles(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  };

  const exportVehiclePDF = (v: VehicleSummary) => {
    const doc = new jsPDF('landscape');
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pw, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`HISTÓRICO DE CONSUMO - ${v.vehicleCode}`, pw / 2, 10, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(v.vehicleDescription || '', pw / 2, 17, { align: 'center' });
    if (settings?.nome) {
      doc.setFontSize(8);
      doc.text(`${settings.nome}${settings.cidade ? ` - ${settings.cidade}` : ''}`, pw / 2, 23, { align: 'center' });
    }

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    const periodText = dateRange.start && dateRange.end
      ? `Período: ${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`
      : 'Todos os registros';
    doc.text(periodText, 14, 36);
    doc.text(`Total: ${formatBR(v.totalLiters)} L | ${v.recordCount} abast. | Consumo Médio: ${formatBR(v.avgConsumption)} ${v.consumptionUnit}`, 14, 42);
    doc.text(`${v.isEquipment ? 'Total Horas' : 'Total Km'}: ${v.isEquipment ? formatBR(v.totalHours) + ' h' : formatBR(v.totalKm, 0) + ' km'}`, 14, 48);

    const headers = v.isEquipment
      ? [['Data', 'Hora', 'Litros', 'Hor. Ant.', 'Hor. Atual', 'Δ Horas', 'L/h', 'Local']]
      : [['Data', 'Hora', 'Litros', 'Km Ant.', 'Km Atual', 'Δ Km', 'km/L', 'Local']];

    autoTable(doc, {
      startY: 54,
      head: headers,
      body: v.records.map(r => [
        r.date, r.time, formatBR(r.fuelQuantity),
        v.isEquipment ? formatBR(r.horimeterPrevious) : formatBR(r.kmPrevious, 0),
        v.isEquipment ? formatBR(r.horimeterCurrent) : formatBR(r.kmCurrent, 0),
        v.isEquipment ? (r.horimeterInterval > 0 ? formatBR(r.horimeterInterval) : '-') : (r.kmInterval > 0 ? formatBR(r.kmInterval, 0) : '-'),
        r.consumption > 0 ? formatBR(r.consumption) : '-',
        r.location || '-',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
      styles: { fontSize: 7 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
    });
    doc.save(`consumo-${v.vehicleCode}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pw, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MONITORAMENTO DE CONSUMO', pw / 2, 10, { align: 'center' });
    if (settings?.nome) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`${settings.nome}${settings.cidade ? ` - ${settings.cidade}` : ''}`, pw / 2, 17, { align: 'center' });
    }

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Total: ${formatBR(metrics.totalLiters)} L | ${metrics.total} veículos | ${metrics.totalRecords} abast.`, 14, 32);

    autoTable(doc, {
      startY: 38,
      head: [['Veículo', 'Descrição', 'Tipo', 'Litros', 'Horas/Km', 'Consumo Médio', 'Status']],
      body: filteredSummaries.map(s => [
        s.vehicleCode, s.vehicleDescription,
        s.isEquipment ? 'Equip.' : 'Veículo',
        formatBR(s.totalLiters),
        s.isEquipment ? `${formatBR(s.totalHours)} h` : `${formatBR(s.totalKm, 0)} km`,
        `${formatBR(s.avgConsumption)} ${s.consumptionUnit}`,
        getDivergenceStatus(s) === 'high' ? '⚠ ALTO' : getDivergenceStatus(s) === 'low' ? '✓ BAIXO' : 'Normal',
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 8 },
      styles: { fontSize: 7 },
    });
    doc.save(`consumo-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const dateButtons: { key: DateFilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'today', label: 'Hoje' },
    { key: 'week', label: '7 Dias' },
    { key: 'month', label: '30 Dias' },
    { key: 'period', label: 'Período' },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Fuel className="h-4 w-4" />
            Total Diesel
          </div>
          <p className="text-2xl font-bold">{formatBR(metrics.totalLiters, 0)} L</p>
          <p className="text-xs text-muted-foreground mt-1">{metrics.totalRecords} abastecimentos</p>
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Gauge className="h-4 w-4" />
            Equipamentos
          </div>
          <p className="text-2xl font-bold">{metrics.equipCount}</p>
          {globalAvg.equipAvg > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Média: {formatBR(globalAvg.equipAvg)} L/h</p>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Truck className="h-4 w-4" />
            Veículos
          </div>
          <p className="text-2xl font-bold">{metrics.veicCount}</p>
          {globalAvg.veicAvg > 0 && (
            <p className="text-xs text-muted-foreground mt-1">Média: {formatBR(globalAvg.veicAvg)} km/L</p>
          )}
        </div>
      </div>

      {/* Filters - compact */}
      <div className="bg-card rounded-lg border border-border p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {dateButtons.map(b => (
            <Button
              key={b.key}
              variant={dateFilterType === b.key ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setDateFilterType(b.key)}
            >
              {b.key === 'period' && <CalendarDays className="h-3 w-3 mr-1" />}
              {b.label}
            </Button>
          ))}
        </div>

        {dateFilterType === 'period' && (
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Calendar className="h-3 w-3 mr-1" />
                  {startDate ? format(startDate, 'dd/MM/yy') : 'Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">a</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  <Calendar className="h-3 w-3 mr-1" />
                  {endDate ? format(endDate, 'dd/MM/yy') : 'Fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Vehicle filter dropdown */}
        <div className="flex items-center gap-1">
          <Truck className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
            <SelectTrigger className="h-8 w-48 text-xs bg-background border-border z-50">
              <SelectValue placeholder="Todos os veículos" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-[9999] max-h-60">
              <SelectItem value="all" className="text-xs">Todos os veículos</SelectItem>
              {vehicleOptions.map(opt => (
                <SelectItem key={opt.code} value={opt.code} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedVehicle !== 'all' && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedVehicle('all')}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>


        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-7 h-8 w-40 text-xs"
          />
        </div>

        {/* PDF export: single vehicle or all */}
        {selectedVehicle !== 'all' && filteredSummaries.length === 1 ? (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => exportVehiclePDF(filteredSummaries[0])}>
            <FileText className="h-3.5 w-3.5" />
            PDF Veículo
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportToPDF}>
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Vehicle Table */}
      {filteredSummaries.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <Truck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">Ajuste os filtros para visualizar dados de consumo.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10">
                <TableHead className="font-semibold text-primary text-xs w-8 px-2"></TableHead>
                <TableHead className="font-semibold text-primary text-xs px-2">Veículo</TableHead>
                <TableHead className="font-semibold text-primary text-xs px-2">Descrição</TableHead>
                <TableHead className="text-right font-semibold text-primary text-xs px-2">Litros</TableHead>
                <TableHead className="text-right font-semibold text-primary text-xs px-2">Hor./Km Ant.</TableHead>
                <TableHead className="text-right font-semibold text-primary text-xs px-2">Hor./Km Atual</TableHead>
                <TableHead className="text-right font-semibold text-primary text-xs px-2">Intervalo</TableHead>
                <TableHead className="text-right font-semibold text-primary text-xs px-2">Consumo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSummaries.map((v) => {
                const status = getDivergenceStatus(v);
                const isExpanded = expandedVehicles.has(v.vehicleCode);
                const latest = v.records.length > 0 ? v.records[0] : null;
                return (
                  <Fragment key={v.vehicleCode}>
                        <TableRow 
                          className={cn(
                            "cursor-pointer hover:bg-muted/50 transition-colors",
                            status === 'high' && "bg-destructive/5",
                            isExpanded && "bg-muted/30"
                          )}
                          onClick={() => toggleVehicle(v.vehicleCode)}
                        >
                          <TableCell className="w-8 px-2 py-2">
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              {v.isEquipment ? (
                                <Gauge className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              ) : (
                                <Truck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              )}
                              <span className="font-bold text-xs">{v.vehicleCode}</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-2 py-2">
                            <span className="text-xs">{v.vehicleDescription || '-'}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium px-2 py-2">
                            {formatBR(v.totalLiters, 0)} L
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground px-2 py-2">
                            {latest ? (v.isEquipment ? formatBR(latest.horimeterPrevious) : formatBR(latest.kmPrevious, 0)) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs px-2 py-2">
                            {latest ? (v.isEquipment ? formatBR(latest.horimeterCurrent) : formatBR(latest.kmCurrent, 0)) : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs px-2 py-2">
                            {v.isEquipment ? `${formatBR(v.totalHours)} h` : `${formatBR(v.totalKm, 0)} km`}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-mono font-bold text-xs px-2 py-2",
                            status === 'high' && "text-destructive",
                            status === 'low' && "text-emerald-600 dark:text-emerald-400",
                            status === 'normal' && "text-foreground",
                          )}>
                            {v.avgConsumption > 0 ? `${formatBR(v.avgConsumption)} ${v.consumptionUnit}` : '-'}
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="p-0 bg-muted/20">
                            <div className="p-3">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs">Data</TableHead>
                                    <TableHead className="text-xs">Hora</TableHead>
                                    <TableHead className="text-xs text-right">Litros</TableHead>
                                    <TableHead className="text-xs text-right">{v.isEquipment ? 'Hor. Ant.' : 'Km Ant.'}</TableHead>
                                    <TableHead className="text-xs text-right">{v.isEquipment ? 'Hor. Atual' : 'Km Atual'}</TableHead>
                                    <TableHead className="text-xs text-right">{v.isEquipment ? 'Δ Horas' : 'Δ Km'}</TableHead>
                                    <TableHead className="text-xs text-right">{v.consumptionUnit}</TableHead>
                                    <TableHead className="text-xs">Local</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {v.records.map((r, i) => {
                                    const avg = v.avgConsumption;
                                    const isRecordHigh = avg > 0 && r.consumption > 0 && (
                                      v.isEquipment ? r.consumption > avg * 1.3 : r.consumption < avg * 0.7
                                    );
                                    return (
                                      <TableRow key={i} className={cn(isRecordHigh && "bg-destructive/5")}>
                                        <TableCell className="text-xs">{r.date}</TableCell>
                                        <TableCell className="text-xs">{r.time}</TableCell>
                                        <TableCell className="text-xs text-right font-mono">{formatBR(r.fuelQuantity)}</TableCell>
                                        <TableCell className="text-xs text-right font-mono">
                                          {v.isEquipment ? formatBR(r.horimeterPrevious) : formatBR(r.kmPrevious, 0)}
                                        </TableCell>
                                        <TableCell className="text-xs text-right font-mono">
                                          {v.isEquipment ? formatBR(r.horimeterCurrent) : formatBR(r.kmCurrent, 0)}
                                        </TableCell>
                                        <TableCell className="text-xs text-right font-mono font-medium">
                                          {v.isEquipment
                                            ? (r.horimeterInterval > 0 ? formatBR(r.horimeterInterval) : '-')
                                            : (r.kmInterval > 0 ? formatBR(r.kmInterval, 0) : '-')
                                          }
                                        </TableCell>
                                        <TableCell className={cn(
                                          "text-xs text-right font-mono font-bold",
                                          isRecordHigh ? "text-destructive" : r.consumption > 0 ? "text-emerald-600 dark:text-emerald-400" : ""
                                        )}>
                                          {r.consumption > 0 ? formatBR(r.consumption) : '-'}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{r.location || '-'}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                        )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          <div className="p-3 border-t text-xs text-muted-foreground text-center">
            {filteredSummaries.length} veículos/equipamentos • {metrics.totalRecords} abastecimentos
          </div>
        </div>
      )}
    </div>
  );
}
