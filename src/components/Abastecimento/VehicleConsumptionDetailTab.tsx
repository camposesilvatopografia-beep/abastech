import { useState, useMemo, Fragment } from 'react';
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
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('month');
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'code' | 'consumption' | 'liters'>('code');

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
      const horimeterInterval = horimeterCurrent > horimeterPrevious ? horimeterCurrent - horimeterPrevious : 0;
      const kmInterval = kmCurrent > kmPrevious ? kmCurrent - kmPrevious : 0;

      let consumption = 0;
      if (isEquipment && horimeterInterval > 0) consumption = fuelQuantity / horimeterInterval;
      else if (!isEquipment && fuelQuantity > 0) consumption = kmInterval / fuelQuantity;

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
      if (s.isEquipment) s.avgConsumption = s.totalHours > 0 ? s.totalLiters / s.totalHours : 0;
      else s.avgConsumption = s.totalLiters > 0 ? s.totalKm / s.totalLiters : 0;
      s.records.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    });

    return Array.from(vehicleMap.values());
  }, [data.rows, dateRange]);

  const filteredSummaries = useMemo(() => {
    let result = vehicleSummaries;
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
  }, [vehicleSummaries, searchTerm, sortBy]);

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

        <div className={cn(
          "rounded-lg border p-4",
          metrics.divergent > 0 ? "bg-destructive/10 border-destructive/30" : "bg-card border-border"
        )}>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <AlertTriangle className={cn("h-4 w-4", metrics.divergent > 0 && "text-destructive")} />
            Divergências
          </div>
          <p className={cn("text-2xl font-bold", metrics.divergent > 0 && "text-destructive")}>
            {metrics.divergent}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Consumo acima da média</p>
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

        <div className="flex gap-1">
          <span className="text-xs text-muted-foreground self-center mr-1">Ordenar:</span>
          {([['code', 'Código'], ['liters', 'Litros'], ['consumption', 'Consumo']] as const).map(([key, label]) => (
            <Button
              key={key}
              variant={sortBy === key ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setSortBy(key)}
            >
              {label}
            </Button>
          ))}
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

        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportToPDF}>
          <Download className="h-3.5 w-3.5" />
          PDF
        </Button>
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
                <TableHead className="font-semibold text-primary w-8"></TableHead>
                <TableHead className="font-semibold text-primary">Veículo</TableHead>
                <TableHead className="font-semibold text-primary">Descrição</TableHead>
                <TableHead className="text-right font-semibold text-primary">Litros</TableHead>
                <TableHead className="text-right font-semibold text-primary">Horas/Km</TableHead>
                <TableHead className="text-right font-semibold text-primary">Consumo Médio</TableHead>
                <TableHead className="text-center font-semibold text-primary">Abast.</TableHead>
                <TableHead className="text-center font-semibold text-primary">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSummaries.map((v) => {
                const status = getDivergenceStatus(v);
                const isExpanded = expandedVehicles.has(v.vehicleCode);
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
                          <TableCell className="w-8">
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </TableCell>
                          <TableCell>
                            <span className="font-bold">{v.vehicleCode}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {v.isEquipment ? (
                                <Gauge className="h-4 w-4 text-amber-500 shrink-0" />
                              ) : (
                                <Truck className="h-4 w-4 text-blue-500 shrink-0" />
                              )}
                              <span className="text-sm">{v.vehicleDescription || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-medium">
                            {formatBR(v.totalLiters, 0)} L
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {v.isEquipment ? `${formatBR(v.totalHours)} h` : `${formatBR(v.totalKm, 0)} km`}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-mono font-bold text-base",
                            status === 'high' && "text-destructive",
                            status === 'low' && "text-emerald-600 dark:text-emerald-400",
                            status === 'normal' && "text-foreground",
                          )}>
                            {v.avgConsumption > 0 ? `${formatBR(v.avgConsumption)} ${v.consumptionUnit}` : '-'}
                          </TableCell>
                          <TableCell className="text-center">{v.recordCount}</TableCell>
                          <TableCell className="text-center">
                            {status === 'high' ? (
                              <Badge variant="destructive" className="text-xs gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Alto
                              </Badge>
                            ) : status === 'low' ? (
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                                Baixo
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Normal</Badge>
                            )}
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
