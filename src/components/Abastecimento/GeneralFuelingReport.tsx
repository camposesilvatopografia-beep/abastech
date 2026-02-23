import { useState, useMemo } from 'react';
import { format, isValid, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Fuel,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { renderStandardHeader, getLogoBase64 } from '@/lib/pdfHeader';

interface GeneralFuelingReportProps {
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

const isEquipmentCategory = (category: string): boolean => {
  const cat = category?.toLowerCase() || '';
  return cat.includes('equipamento') || cat.includes('máquina') || cat.includes('maquina') ||
    cat.includes('trator') || cat.includes('retroescavadeira') || cat.includes('escavadeira') ||
    cat.includes('pá carregadeira') || cat.includes('rolo') || cat.includes('motoniveladora') ||
    cat.includes('compactador') || cat.includes('gerador');
};

interface FuelingRecord {
  date: string;
  time: string;
  dateObj: Date;
  vehicleCode: string;
  description: string;
  operator: string;
  company: string;
  category: string;
  fuelQuantity: number;
  horimeterPrevious: number;
  horimeterCurrent: number;
  kmPrevious: number;
  kmCurrent: number;
  interval: number;
  intervalUnit: string;
  consumption: number;
  consumptionUnit: string;
  isEquipment: boolean;
  location: string;
}

type DateFilterType = 'all' | 'today' | 'week' | 'month' | 'period';

export function GeneralFuelingReport({ data, refetch, loading }: GeneralFuelingReportProps) {
  const { settings } = useObraSettings();
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('month');
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [collapsedLocations, setCollapsedLocations] = useState<Set<string>>(new Set());

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

  // Classify location into unified groups
  const classifyLocation = (loc: string): string => {
    const l = loc.toLowerCase();
    if (l.includes('tanque') || l.includes('canteiro')) return 'Tanques';
    if (l.includes('comboio')) return 'Comboios';
    return loc;
  };

  // Group records by unified location category
  const groupedByLocation = useMemo(() => {
    const groups: Record<string, { records: FuelingRecord[]; totalLiters: number }> = {};

    data.rows.forEach(row => {
      const vehicleCode = String(row['VEICULO'] || '').trim();
      if (!vehicleCode) return;
      const dateStr = String(row['DATA'] || '');
      const dateObj = parseDate(dateStr);
      if (!dateObj) return;

      if (dateRange.start && dateRange.end) {
        if (!isWithinInterval(dateObj, { start: startOfDay(dateRange.start), end: endOfDay(dateRange.end) })) return;
      }

      const tipo = String(row['TIPO'] || '').toLowerCase();
      if (tipo.includes('entrada') || tipo.includes('recebimento')) return;

      const rawLocation = String(row['LOCAL'] || 'Não informado').trim();
      const location = classifyLocation(rawLocation);
      const category = String(row['CATEGORIA'] || '').toUpperCase();
      const isEquipment = isEquipmentCategory(category);
      const horimeterPrevious = parseNumber(row['HORIMETRO ANTERIOR']);
      const horimeterCurrent = parseNumber(row['HORIMETRO ATUAL']);
      const kmPrevious = parseNumber(row['KM ANTERIOR']);
      const kmCurrent = parseNumber(row['KM ATUAL']);
      const fuelQuantity = parseNumber(row['QUANTIDADE']);

      const horimeterInterval = (horimeterPrevious > 0 && horimeterCurrent > horimeterPrevious) ? horimeterCurrent - horimeterPrevious : 0;
      const kmInterval = (kmPrevious > 0 && kmCurrent > kmPrevious) ? kmCurrent - kmPrevious : 0;

      const interval = isEquipment ? horimeterInterval : kmInterval;
      const intervalUnit = isEquipment ? 'h' : 'km';

      let consumption = 0;
      if (isEquipment && horimeterInterval > 0 && fuelQuantity > 0) consumption = fuelQuantity / horimeterInterval;
      else if (!isEquipment && kmInterval > 0 && fuelQuantity > 0) consumption = kmInterval / fuelQuantity;

      const consumptionUnit = isEquipment ? 'L/h' : 'km/L';

      const record: FuelingRecord = {
        date: dateStr,
        time: String(row['HORA'] || ''),
        dateObj,
        vehicleCode,
        description: String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
        operator: String(row['MOTORISTA'] || row['OPERADOR'] || ''),
        company: String(row['EMPRESA'] || ''),
        category,
        fuelQuantity,
        horimeterPrevious, horimeterCurrent,
        kmPrevious, kmCurrent,
        interval, intervalUnit,
        consumption, consumptionUnit,
        isEquipment,
        location: rawLocation,
      };

      if (!groups[location]) {
        groups[location] = { records: [], totalLiters: 0 };
      }
      groups[location].records.push(record);
      groups[location].totalLiters += fuelQuantity;
    });

    Object.values(groups).forEach(g => {
      g.records.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    });

    return groups;
  }, [data.rows, dateRange]);

  // Separate into Tanques, Comboios and Others
  const locationGroups = useMemo(() => {
    const tanques: [string, typeof groupedByLocation[string]][] = [];
    const comboios: [string, typeof groupedByLocation[string]][] = [];
    const others: [string, typeof groupedByLocation[string]][] = [];

    Object.entries(groupedByLocation).forEach(([loc, data]) => {
      if (loc === 'Tanques') tanques.push([loc, data]);
      else if (loc === 'Comboios') comboios.push([loc, data]);
      else others.push([loc, data]);
    });

    others.sort((a, b) => a[0].localeCompare(b[0]));

    return { tanques, comboios, others };
  }, [groupedByLocation]);

  const totalRecords = Object.values(groupedByLocation).reduce((s, g) => s + g.records.length, 0);
  const totalLiters = Object.values(groupedByLocation).reduce((s, g) => s + g.totalLiters, 0);

  const toggleLocation = (loc: string) => {
    setCollapsedLocations(prev => {
      const next = new Set(prev);
      next.has(loc) ? next.delete(loc) : next.add(loc);
      return next;
    });
  };

  const exportPDF = async () => {
    const doc = new jsPDF('landscape');
    const pw = doc.internal.pageSize.getWidth();
    let isFirstPage = true;

    const logoBase64 = await getLogoBase64(settings?.logo_url);

    const allGroups = [
      ...locationGroups.tanques,
      ...locationGroups.comboios,
      ...locationGroups.others,
    ];

    allGroups.forEach(([location, groupData]) => {
      if (!isFirstPage) doc.addPage();
      isFirstPage = false;

      const startY = renderStandardHeader(doc, {
        reportTitle: `RELATÓRIO GERAL — ${location.toUpperCase()}`,
        obraSettings: settings,
        logoBase64,
        date: dateRange.start && dateRange.end
          ? `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`
          : format(new Date(), 'dd/MM/yyyy'),
      });

      doc.setTextColor(60, 60, 60);
      doc.setFontSize(9);
      doc.text(`${groupData.records.length} registros | Total: ${formatBR(groupData.totalLiters, 0)} L`, 14, startY);

      autoTable(doc, {
        startY: startY + 6,
        head: [['Data', 'Hora', 'Veículo', 'Motorista', 'Empresa', 'Qtd (L)', 'Hor/Km Ant.', 'Hor/Km Atual', 'Intervalo', 'Consumo']],
        body: groupData.records
          .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
          .map(r => [
            r.date, r.time, r.vehicleCode,
            r.operator || '-', r.company || '-',
            formatBR(r.fuelQuantity, 0),
            r.isEquipment
              ? (r.horimeterPrevious > 0 ? formatBR(r.horimeterPrevious, 1) : '-')
              : (r.kmPrevious > 0 ? formatBR(r.kmPrevious, 0) : '-'),
            r.isEquipment
              ? (r.horimeterCurrent > 0 ? formatBR(r.horimeterCurrent, 1) : '-')
              : (r.kmCurrent > 0 ? formatBR(r.kmCurrent, 0) : '-'),
            r.interval > 0 ? `${formatBR(r.interval, r.isEquipment ? 2 : 0)} ${r.intervalUnit}` : '-',
            r.consumption > 0 ? `${formatBR(r.consumption)} ${r.consumptionUnit}` : '-',
          ]),
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7, halign: 'center' },
        styles: { fontSize: 6.5 },
        columnStyles: {
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right' },
          9: { halign: 'right' },
        },
      });
    });

    doc.save(`relatorio-geral-abastecimento-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const dateButtons: { key: DateFilterType; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'today', label: 'Hoje' },
    { key: 'week', label: '7 Dias' },
    { key: 'month', label: '30 Dias' },
    { key: 'period', label: 'Período' },
  ];

  const renderLocationGroup = (title: string, color: string, groups: [string, { records: FuelingRecord[]; totalLiters: number }][]) => {
    if (groups.length === 0) return null;
    return (
      <div className="space-y-3">
        <h3 className={cn("text-sm font-bold uppercase tracking-wider px-3 py-2 rounded-lg", color)}>
          {title}
        </h3>
        {groups.map(([location, groupData]) => {
          const isCollapsed = collapsedLocations.has(location);
          return (
            <div key={location} className="bg-card rounded-lg border border-border overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                onClick={() => toggleLocation(location)}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">{location}</span>
                  <Badge variant="secondary" className="text-xs">
                    {groupData.records.length} registros
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {formatBR(groupData.totalLiters, 0)} L
                  </Badge>
                </div>
                {isCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
              </button>
              {!isCollapsed && (
                <div className="border-t border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-semibold text-primary text-xs">Data</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">Hora</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">Veículo</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">Motorista</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">Empresa</TableHead>
                        <TableHead className="text-right font-semibold text-primary text-xs">Qtd (L)</TableHead>
                        <TableHead className="text-right font-semibold text-primary text-xs">Hor/Km Ant.</TableHead>
                        <TableHead className="text-right font-semibold text-primary text-xs">Hor/Km Atual</TableHead>
                        <TableHead className="text-right font-semibold text-primary text-xs">Intervalo</TableHead>
                        <TableHead className="text-right font-semibold text-primary text-xs">Consumo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupData.records.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell className="text-xs">{r.time}</TableCell>
                          <TableCell className="text-xs font-bold text-primary">{r.vehicleCode}</TableCell>
                          <TableCell className="text-xs">{r.operator || '-'}</TableCell>
                          <TableCell className="text-xs">{r.company || '-'}</TableCell>
                          <TableCell className="text-right text-xs font-mono font-medium">{formatBR(r.fuelQuantity, 0)}</TableCell>
                          <TableCell className="text-right text-xs font-mono text-muted-foreground">
                            {r.isEquipment
                              ? (r.horimeterPrevious > 0 ? formatBR(r.horimeterPrevious, 1) : '-')
                              : (r.kmPrevious > 0 ? formatBR(r.kmPrevious, 0) : '-')
                            }
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {r.isEquipment
                              ? (r.horimeterCurrent > 0 ? formatBR(r.horimeterCurrent, 1) : '-')
                              : (r.kmCurrent > 0 ? formatBR(r.kmCurrent, 0) : '-')
                            }
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">
                            {r.interval > 0 ? `${formatBR(r.interval, r.isEquipment ? 2 : 0)} ${r.intervalUnit}` : '-'}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right text-xs font-mono font-bold",
                            r.consumption > 0 ? "text-primary" : ""
                          )}>
                            {r.consumption > 0 ? `${formatBR(r.consumption)} ${r.consumptionUnit}` : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold bg-primary/10 px-4 py-2 rounded-lg flex items-center gap-2">
          <Fuel className="w-5 h-5 text-primary" />
          Relatório Geral de Abastecimento
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{totalRecords} registros</Badge>
          <Badge variant="outline">{formatBR(totalLiters, 0)} L total</Badge>
        </div>
      </div>

      {/* Filters */}
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

        <div className="flex-1" />

        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportPDF}>
          <Download className="h-3.5 w-3.5" />
          Exportar PDF
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Location Groups */}
      {totalRecords === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center">
          <Fuel className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">Ajuste o período para visualizar os abastecimentos.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {renderLocationGroup('Tanques', 'bg-blue-600/10 text-blue-700 dark:text-blue-400', locationGroups.tanques)}
          {renderLocationGroup('Comboios', 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400', locationGroups.comboios)}
          {renderLocationGroup('Outros Locais', 'bg-muted text-muted-foreground', locationGroups.others)}
        </div>
      )}
    </div>
  );
}
