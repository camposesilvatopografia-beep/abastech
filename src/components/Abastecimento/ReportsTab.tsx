import { useState, useMemo, useCallback } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  Building2, 
  Download, 
  Fuel, 
  Truck, 
  ArrowDownUp,
  Calendar,
  BarChart3,
  Layers,
  Printer,
  Clock,
  Filter,
  Eye,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderStandardHeader, getLogoBase64 } from '@/lib/pdfHeader';
import { useVehicles, useHorimeterReadings, type HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useObraSettings } from '@/hooks/useObraSettings';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type PeriodType = 'data_especifica' | 'ontem' | 'hoje' | 'mes_atual' | 'personalizado';

function computeCombinedDateRange(period: PeriodType, customStart?: Date, customEnd?: Date) {
  const now = new Date();
  switch (period) {
    case 'data_especifica':
      if (customStart) return { start: startOfDay(customStart), end: endOfDay(customStart) };
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'ontem': { const y = subDays(now, 1); return { start: startOfDay(y), end: endOfDay(y) }; }
    case 'hoje': return { start: startOfDay(now), end: endOfDay(now) };
    case 'mes_atual': return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'personalizado':
      if (customStart && customEnd) return { start: startOfDay(customStart), end: endOfDay(customEnd) };
      return { start: startOfMonth(now), end: endOfMonth(now) };
    default: return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

const COMBINED_PERIOD_OPTIONS = [
  { value: 'data_especifica', label: 'Data Específica' },
  { value: 'ontem', label: 'Ontem' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'mes_atual', label: 'Mês' },
  { value: 'personalizado', label: 'Período' },
];

const formatBR = (val: number | null | undefined): string => {
  if (val === null || val === undefined || val === 0) return '-';
  const hasDecimals = val % 1 !== 0;
  return val.toLocaleString('pt-BR', { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 });
};

function addCombinedPageFooters(doc: jsPDF, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text('AbasTech — Sistema de Gestão de Frotas', margin, pH - 6);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pH - 6, { align: 'right' });
  }
}

interface ReportsTabProps {
  isExporting: boolean;
  filteredRowsCount: number;
  startDate: Date | undefined;
  endDate: Date | undefined;
  sortByDescription: boolean;
  availableCategories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onToggleSortByDescription: () => void;
  onExportPDF: () => void;
  onExportXLSX: () => void;
  onExportPDFPorEmpresa: () => void;
  onExportPorEmpresaXLSX: () => void;
  onExportDetailedPDF: () => void;
  onExportTanquesPDF: () => void;
  onExportTanquesXLSX: () => void;
  onExportComboiosPDF: () => void;
  onExportComboiosXLSX: () => void;
  onExportTanquesComboiosPDF: () => void;
  onExportTanquesComboiosXLSX: () => void;
  onPreviewTanquesPDF?: () => void;
  onPreviewComboiosPDF?: () => void;
  onPreviewTanquesComboiosPDF?: () => void;
  onPreviewPDF?: () => void;
  onPreviewPDFPorEmpresa?: () => void;
  onPreviewDetailedPDF?: () => void;
  onExportResumoGeral?: () => void;
}

// ====== Relatório de Horímetros/KM por Empresa (dia a dia por veículo) ======
function HorimeterByCompanyReport({ vehicles, readings, obraSettings, companies }: {
  vehicles: any[];
  readings: HorimeterWithVehicle[];
  obraSettings: any;
  companies: string[];
}) {
  const { toast } = useToast();
  const [period, setPeriod] = useState<PeriodType>('mes_atual');
  const [company, setCompany] = useState<string>(companies[0] || 'all');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const dateRange = useMemo(() => computeCombinedDateRange(period, customStart, customEnd), [period, customStart, customEnd]);

  const exportPDF = useCallback(async () => {
    if (!company || company === 'all') {
      toast({ title: 'Selecione uma empresa', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      const dateInfo = `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`;

      // Filter readings for the company and date range
      const filtered = readings.filter(r => {
        const d = new Date(r.reading_date + 'T12:00:00');
        if (!isWithinInterval(d, dateRange)) return false;
        return r.vehicle?.company === company;
      });

      if (filtered.length === 0) {
        toast({ title: 'Sem dados', description: 'Nenhum registro de horímetro encontrado', variant: 'destructive' });
        return;
      }

      // Sort by vehicle code first, then by date
      const sorted = [...filtered].sort((a, b) => {
        const codeA = (a.vehicle?.code || '').localeCompare(b.vehicle?.code || '');
        if (codeA !== 0) return codeA;
        return a.reading_date.localeCompare(b.reading_date);
      });

      const doc = new jsPDF('landscape');
      const margin = 14;

      let y = renderStandardHeader(doc, {
        reportTitle: 'RELATÓRIO DE HORÍMETROS/KM',
        obraSettings,
        logoBase64,
        date: format(new Date(), 'dd/MM/yyyy HH:mm'),
        showTitleUnderline: false,
      });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(`Período: ${dateInfo}  |  Empresa: ${company}  |  ${sorted.length} registro(s)`, margin, y);
      y += 8;

      // Build table data grouped by vehicle
      const tableData = sorted.map(r => {
        const interval = r.current_value - (r.previous_value ?? r.current_value);
        const prevKm = (r as any).previous_km;
        const currKm = (r as any).current_km;
        const kmTotal = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
        return [
          format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
          r.vehicle?.code || '-',
          r.vehicle?.description || r.vehicle?.category || '-',
          r.operator || '-',
          formatBR(r.previous_value),
          formatBR(r.current_value),
          interval > 0 ? formatBR(interval) : '-',
          formatBR(prevKm),
          formatBR(currKm),
          kmTotal && kmTotal > 0 ? formatBR(kmTotal) : '-',
        ];
      });

      let lastVehicle = '';
      let colorIdx = 0;

      autoTable(doc, {
        head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
        body: tableData,
        startY: y,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const vehicle = tableData[data.row.index]?.[1] || '';
            if (vehicle !== lastVehicle) { colorIdx++; lastVehicle = vehicle; }
            data.cell.styles.fillColor = colorIdx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          }
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 22 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
          2: { halign: 'left' },
          3: { halign: 'left' },
          4: { halign: 'center', cellWidth: 24 },
          5: { halign: 'center', cellWidth: 24 },
          6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
          7: { halign: 'center', cellWidth: 24 },
          8: { halign: 'center', cellWidth: 24 },
          9: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
        },
      });

      addCombinedPageFooters(doc, margin);
      doc.save(`horimetros_km_${company.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF gerado', description: `Relatório de Horímetros/KM — ${company}` });
    } catch (err) {
      console.error('Error generating horimeter report:', err);
      toast({ title: 'Erro', description: 'Falha ao gerar relatório', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [company, dateRange, readings, obraSettings, toast]);

  return (
    <Card className="border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-base">Relatório de Horímetros/KM por Empresa</CardTitle>
            <CardDescription className="text-xs">Histórico dia a dia de cada veículo/equipamento, agrupado por código</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Período</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMBINED_PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {period === 'data_especifica' && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data</label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                    <Calendar className="w-3.5 h-3.5" />
                    {customStart ? format(customStart, 'dd/MM/yyyy') : 'Selecione'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent mode="single" selected={customStart} onSelect={(d) => { setCustomStart(d || undefined); setCustomEnd(d || undefined); setStartOpen(false); }} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>
          )}
          {period === 'personalizado' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">De</label>
                <Popover open={startOpen} onOpenChange={setStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                      <Calendar className="w-3.5 h-3.5" />
                      {customStart ? format(customStart, 'dd/MM/yyyy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={customStart} onSelect={(d) => { setCustomStart(d || undefined); setStartOpen(false); }} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Até</label>
                <Popover open={endOpen} onOpenChange={setEndOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                      <Calendar className="w-3.5 h-3.5" />
                      {customEnd ? format(customEnd, 'dd/MM/yyyy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={customEnd} onSelect={(d) => { setCustomEnd(d || undefined); setEndOpen(false); }} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Empresa</label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2">
          <span className="text-sm text-muted-foreground">
            <strong>{company || '—'}</strong> — Horímetros dia a dia por veículo
            {' '}
            <span className="text-xs">({format(dateRange.start, 'dd/MM/yyyy')} — {format(dateRange.end, 'dd/MM/yyyy')})</span>
          </span>
          <Button onClick={exportPDF} className="gap-2" disabled={loading || !company || company === 'all'}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? 'Gerando...' : 'Gerar PDF'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


  isExporting,
  filteredRowsCount,
  startDate,
  endDate,
  sortByDescription,
  availableCategories,
  selectedCategory,
  onCategoryChange,
  onToggleSortByDescription,
  onExportPDF,
  onExportXLSX,
  onExportPDFPorEmpresa,
  onExportPorEmpresaXLSX,
  onExportDetailedPDF,
  onExportTanquesPDF,
  onExportTanquesXLSX,
  onExportComboiosPDF,
  onExportComboiosXLSX,
  onExportTanquesComboiosPDF,
  onExportTanquesComboiosXLSX,
  onPreviewTanquesPDF,
  onPreviewComboiosPDF,
  onPreviewTanquesComboiosPDF,
  onPreviewPDF,
  onPreviewPDFPorEmpresa,
  onPreviewDetailedPDF,
  onExportResumoGeral,
}: ReportsTabProps) {
  const { toast } = useToast();
  const { vehicles } = useVehicles();
  const { readings } = useHorimeterReadings();
  const { settings: obraSettings } = useObraSettings();

  // Combined report state
  const [combinedPeriod, setCombinedPeriod] = useState<PeriodType>('mes_atual');
  const [combinedCompany, setCombinedCompany] = useState<string>('all');
  const [combinedStartDate, setCombinedStartDate] = useState<Date | undefined>();
  const [combinedEndDate, setCombinedEndDate] = useState<Date | undefined>();
  const [combinedStartOpen, setCombinedStartOpen] = useState(false);
  const [combinedEndOpen, setCombinedEndOpen] = useState(false);
  const [isCombinedLoading, setIsCombinedLoading] = useState(false);

  const companies = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => { if (v.company) set.add(v.company); });
    return Array.from(set).sort();
  }, [vehicles]);

  const combinedDateRange = useMemo(() => computeCombinedDateRange(combinedPeriod, combinedStartDate, combinedEndDate), [combinedPeriod, combinedStartDate, combinedEndDate]);

  const buildCombinedPDFForCompany = async (
    company: string, logoBase64: string | null, dateInfo: string, startStr: string, endStr: string
  ): Promise<{ doc: jsPDF; horCount: number; fuelCount: number } | null> => {
    const horimeterData = readings.filter(r => {
      const d = new Date(r.reading_date + 'T12:00:00');
      if (!isWithinInterval(d, combinedDateRange)) return false;
      return r.vehicle?.company === company;
    }).sort((a, b) => a.reading_date.localeCompare(b.reading_date) || (a.vehicle?.code || '').localeCompare(b.vehicle?.code || ''));

    const { data: fuelRecords } = await supabase
      .from('field_fuel_records')
      .select('*')
      .eq('company', company)
      .gte('record_date', startStr)
      .lte('record_date', endStr)
      .order('record_date', { ascending: true });

    if (horimeterData.length === 0 && (!fuelRecords || fuelRecords.length === 0)) return null;

    const doc = new jsPDF('landscape');
    const margin = 14;

    // ====== HORÍMETROS ======
    let y = renderStandardHeader(doc, { reportTitle: `Relatório de Horímetros/Km`, obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(`Empresa: ${company}  |  Período: ${dateInfo}`, margin, y); y += 8;
    if (horimeterData.length > 0) {
      const sortedHor = [...horimeterData].sort((a, b) => {
        const descA = (a.vehicle?.description || a.vehicle?.category || '').toLowerCase();
        const descB = (b.vehicle?.description || b.vehicle?.category || '').toLowerCase();
        if (descA !== descB) return descA.localeCompare(descB);
        return a.reading_date.localeCompare(b.reading_date);
      });
      const horTableData = sortedHor.map(r => {
        const interval = r.current_value - (r.previous_value ?? r.current_value);
        const prevKm = (r as any).previous_km; const currKm = (r as any).current_km;
        const kmInterval = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
        return [format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle?.code || '-', r.vehicle?.description || r.vehicle?.category || '-', r.operator || '-', formatBR(r.previous_value), formatBR(r.current_value), interval > 0 ? formatBR(interval) : '-', formatBR(prevKm), formatBR(currKm), kmInterval && kmInterval > 0 ? formatBR(kmInterval) : '-'];
      });
      let lastDescH = ''; let descColorIdxH = 0;
      autoTable(doc, {
        head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
        body: horTableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const desc = horTableData[data.row.index]?.[2] || '';
            if (desc !== lastDescH) { descColorIdxH++; lastDescH = desc; }
            data.cell.styles.fillColor = descColorIdxH % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          }
        },
        columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'center', cellWidth: 24 }, 5: { halign: 'center', cellWidth: 24 }, 6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 7: { halign: 'center', cellWidth: 24 }, 8: { halign: 'center', cellWidth: 24 }, 9: { halign: 'center', fontStyle: 'bold', cellWidth: 18 } },
      });
    } else {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
      doc.text('Nenhum registro de horímetro encontrado para esta empresa no período.', margin, y);
    }

    // ====== ABASTECIMENTOS ======
    doc.addPage('landscape');
    y = renderStandardHeader(doc, { reportTitle: `Registros de Abastecimentos`, obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(`Empresa: ${company}  |  Período: ${dateInfo}`, margin, y); y += 6;

    if (fuelRecords && fuelRecords.length > 0) {
      const sortedFuel = [...fuelRecords].sort((a, b) => {
        const descA = (a.vehicle_description || '').toLowerCase();
        const descB = (b.vehicle_description || '').toLowerCase();
        if (descA !== descB) return descA.localeCompare(descB);
        return (a.record_date || '').localeCompare(b.record_date || '');
      });
      const fuelTableData = sortedFuel.map(r => {
        const horInterval = (r.horimeter_current && r.horimeter_previous) ? r.horimeter_current - r.horimeter_previous : null;
        const consumption = (horInterval && horInterval > 0 && r.fuel_quantity > 0) ? (r.fuel_quantity / horInterval) : null;
        return [format(new Date(r.record_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle_code || '-', r.vehicle_description || '-', r.operator_name || '-', formatBR(r.fuel_quantity), consumption ? formatBR(consumption) : '-', formatBR(r.horimeter_previous), formatBR(r.horimeter_current), horInterval && horInterval > 0 ? formatBR(horInterval) : '-', r.location || '-'];
      });
      let lastDesc = ''; let descColorIdx = 0;
      autoTable(doc, {
        head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Qtd (L)', 'L/h', 'Hor. Ant.', 'Hor. Atual', 'H.T.', 'Local']],
        body: fuelTableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const desc = fuelTableData[data.row.index]?.[2] || '';
            if (desc !== lastDesc) { descColorIdx++; lastDesc = desc; }
            data.cell.styles.fillColor = descColorIdx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          }
        },
        columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }, 5: { halign: 'center', cellWidth: 16 }, 6: { halign: 'center', cellWidth: 24 }, 7: { halign: 'center', cellWidth: 24 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 9: { halign: 'center' } },
      });
    } else {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
      doc.text('Nenhum registro de abastecimento encontrado para esta empresa no período.', margin, y);
    }

    // ====== DETALHAMENTO POR VEÍCULO ======
    const vehicleMap = new Map<string, {
      code: string; description: string;
      horInitial: number | null; horFinal: number | null; totalHT: number;
      kmInitial: number | null; kmFinal: number | null; totalKM: number;
      totalLiters: number; fuelCount: number; horCount: number;
      avgConsumption: number | null;
    }>();

    horimeterData.forEach(r => {
      const code = r.vehicle?.code || '-';
      if (!vehicleMap.has(code)) {
        vehicleMap.set(code, { code, description: r.vehicle?.description || r.vehicle?.category || '-', horInitial: null, horFinal: null, totalHT: 0, kmInitial: null, kmFinal: null, totalKM: 0, totalLiters: 0, fuelCount: 0, horCount: 0, avgConsumption: null });
      }
      const v = vehicleMap.get(code)!;
      v.horCount++;
      if (v.horInitial === null || (r.previous_value != null && r.previous_value < v.horInitial)) v.horInitial = r.previous_value;
      if (v.horFinal === null || r.current_value > v.horFinal) v.horFinal = r.current_value;
      const prevKm = (r as any).previous_km; const currKm = (r as any).current_km;
      if (prevKm && (v.kmInitial === null || prevKm < v.kmInitial)) v.kmInitial = prevKm;
      if (currKm && (v.kmFinal === null || currKm > v.kmFinal)) v.kmFinal = currKm;
    });

    if (fuelRecords) {
      fuelRecords.forEach(r => {
        const code = r.vehicle_code || '-';
        if (!vehicleMap.has(code)) {
          vehicleMap.set(code, { code, description: r.vehicle_description || '-', horInitial: null, horFinal: null, totalHT: 0, kmInitial: null, kmFinal: null, totalKM: 0, totalLiters: 0, fuelCount: 0, horCount: 0, avgConsumption: null });
        }
        const v = vehicleMap.get(code)!;
        v.fuelCount++;
        v.totalLiters += r.fuel_quantity || 0;
      });
    }

    vehicleMap.forEach(v => {
      v.totalHT = (v.horInitial != null && v.horFinal != null && v.horFinal > v.horInitial) ? v.horFinal - v.horInitial : 0;
      v.totalKM = (v.kmInitial != null && v.kmFinal != null && v.kmFinal > v.kmInitial) ? v.kmFinal - v.kmInitial : 0;
      v.avgConsumption = (v.totalHT > 0 && v.totalLiters > 0) ? v.totalLiters / v.totalHT : null;
    });

    const vehicleSummaries = Array.from(vehicleMap.values()).sort((a, b) => a.description.localeCompare(b.description));

    if (vehicleSummaries.length > 0) {
      doc.addPage('landscape');
      y = renderStandardHeader(doc, { reportTitle: 'Detalhamento por Veículo', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      doc.text(`Empresa: ${company}  |  Período: ${dateInfo}  |  ${vehicleSummaries.length} veículo(s)`, margin, y); y += 8;

      const detailTableData = vehicleSummaries.map(v => [
        v.code, v.description,
        v.horInitial != null ? formatBR(v.horInitial) : '-', v.horFinal != null ? formatBR(v.horFinal) : '-',
        v.totalHT > 0 ? formatBR(v.totalHT) : '-', v.kmInitial != null ? formatBR(v.kmInitial) : '-',
        v.kmFinal != null ? formatBR(v.kmFinal) : '-', v.totalKM > 0 ? formatBR(v.totalKM) : '-',
        v.totalLiters > 0 ? formatBR(v.totalLiters) : '-', v.avgConsumption != null ? formatBR(v.avgConsumption) : '-',
        `${v.horCount}/${v.fuelCount}`,
      ]);

      let lastDescV = ''; let descColorIdxV = 0;
      autoTable(doc, {
        head: [['Veículo', 'Descrição', 'Hor. Inicial', 'Hor. Final', 'Total H.T.', 'KM Inicial', 'KM Final', 'Total KM', 'Total (L)', 'Consumo (L/h)', 'Lanç. Hor/Abast']],
        body: detailTableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const desc = detailTableData[data.row.index]?.[1] || '';
            if (desc !== lastDescV) { descColorIdxV++; lastDescV = desc; }
            data.cell.styles.fillColor = descColorIdxV % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          }
        },
        columnStyles: { 0: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 1: { halign: 'left' }, 2: { halign: 'center', cellWidth: 22 }, 3: { halign: 'center', cellWidth: 22 }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, 5: { halign: 'center', cellWidth: 22 }, 6: { halign: 'center', cellWidth: 22 }, 7: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, 9: { halign: 'center', cellWidth: 24 }, 10: { halign: 'center', cellWidth: 24 } },
      });
    }

    addCombinedPageFooters(doc, margin);
    return { doc, horCount: horimeterData.length, fuelCount: fuelRecords?.length || 0 };
  };

  const exportCombinedPDF = useCallback(async () => {
    setIsCombinedLoading(true);
    try {
      const startStr = format(combinedDateRange.start, 'yyyy-MM-dd');
      const endStr = format(combinedDateRange.end, 'yyyy-MM-dd');
      const dateInfo = `${format(combinedDateRange.start, 'dd/MM/yyyy')} a ${format(combinedDateRange.end, 'dd/MM/yyyy')}`;
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);

      const targetCompanies = combinedCompany === 'all' ? companies : [combinedCompany];
      let totalGenerated = 0;

      for (const company of targetCompanies) {
        const result = await buildCombinedPDFForCompany(company, logoBase64, dateInfo, startStr, endStr);
        if (result) {
          const safeCompany = company.replace(/\s+/g, '_');
          result.doc.save(`relatorio_combinado_${safeCompany}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
          totalGenerated++;
        }
      }

      if (totalGenerated === 0) {
        toast({ title: 'Sem dados', description: 'Nenhum registro encontrado no período', variant: 'destructive' });
      } else {
        toast({ title: 'PDFs gerados', description: `${totalGenerated} relatório(s) combinado(s) gerado(s)` });
      }
    } catch (err) {
      console.error('Error generating combined PDF:', err);
      toast({ title: 'Erro', description: 'Falha ao gerar relatório combinado', variant: 'destructive' });
    } finally {
      setIsCombinedLoading(false);
    }
  }, [combinedCompany, combinedDateRange, companies, obraSettings, readings, toast]);

  const dateLabel = startDate && endDate
    ? `${format(startDate, 'dd/MM/yyyy', { locale: ptBR })} — ${format(endDate, 'dd/MM/yyyy', { locale: ptBR })}`
    : startDate
      ? `A partir de ${format(startDate, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Printer className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Relatórios de Abastecimento</h2>
              <p className="text-sm text-muted-foreground">Gere relatórios detalhados de Tanques e Comboios</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
              <Calendar className="w-3.5 h-3.5" />
              {dateLabel}
            </Badge>
            <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
              <FileText className="w-3.5 h-3.5" />
              {filteredRowsCount.toLocaleString('pt-BR')} registros
            </Badge>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Ordenação:</span>
            <Button
              variant={sortByDescription ? 'default' : 'outline'}
              size="sm"
              onClick={onToggleSortByDescription}
              className="gap-2 h-8"
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
              {sortByDescription ? 'Alfabética por Descrição ✓' : 'Padrão (por data)'}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Categoria:</span>
            <Select value={selectedCategory} onValueChange={onCategoryChange}>
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <Filter className="w-3.5 h-3.5 mr-1.5" />
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCategory !== 'all' && (
              <Badge variant="destructive" className="text-[10px] py-0.5 px-2 cursor-pointer" onClick={() => onCategoryChange('all')}>
                Limpar filtro
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Main reports: Tanques & Comboios side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tanques Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
                <Fuel className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Tanques</h3>
                <p className="text-blue-100 text-xs">Canteiro 01 e 02 — Estoque + Abastecimentos</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Relatório com resumo de estoque dos tanques fixos, tabela de saídas (abastecimentos realizados) e entradas (recebimentos de fornecedores).
            </p>
            <div className="flex items-center gap-2">
              {onPreviewTanquesPDF && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onPreviewTanquesPDF} disabled={isExporting}>
                  <Eye className="w-3.5 h-3.5" />
                  Visualizar
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700"
                onClick={onExportTanquesPDF}
                disabled={isExporting}
              >
                <FileText className="w-3.5 h-3.5" />
                Gerar PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={onExportTanquesXLSX}
                disabled={isExporting}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </Button>
            </div>
          </div>
        </div>

        {/* Comboios Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Comboios</h3>
                <p className="text-emerald-100 text-xs">Comboios 01, 02 e 03 — Estoque + Abastecimentos</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Relatório com resumo de estoque dos comboios móveis, tabela de saídas (abastecimentos em campo) e entradas (carregamentos nos tanques).
            </p>
            <div className="flex items-center gap-2">
              {onPreviewComboiosPDF && (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onPreviewComboiosPDF} disabled={isExporting}>
                  <Eye className="w-3.5 h-3.5" />
                  Visualizar
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={onExportComboiosPDF}
                disabled={isExporting}
              >
                <FileText className="w-3.5 h-3.5" />
                Gerar PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={onExportComboiosXLSX}
                disabled={isExporting}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Combined Report — Tanques + Comboios */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-white font-semibold text-sm">Relatório Combinado — Tanques + Comboios</h3>
              <p className="text-slate-300 text-xs">Ambos os relatórios em um único documento, em páginas separadas</p>
            </div>
          </div>
        </div>
        <div className="p-4 flex items-center gap-2">
          {onPreviewTanquesComboiosPDF && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onPreviewTanquesComboiosPDF} disabled={isExporting}>
              <Eye className="w-3.5 h-3.5" />
              Visualizar
            </Button>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onExportTanquesComboiosPDF}
            disabled={isExporting}
          >
            <FileText className="w-3.5 h-3.5" />
            PDF Combinado
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onExportTanquesComboiosXLSX}
            disabled={isExporting}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Combinado
          </Button>
        </div>
      </div>

      {/* Relatório Combinado por Empresa */}
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório Combinado por Empresa</CardTitle>
              <CardDescription className="text-xs">Horímetros + Abastecimentos em um único PDF por empresa</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={combinedPeriod} onValueChange={(v) => setCombinedPeriod(v as PeriodType)}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMBINED_PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {combinedPeriod === 'data_especifica' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <Popover open={combinedStartOpen} onOpenChange={setCombinedStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                      <Calendar className="w-3.5 h-3.5" />
                      {combinedStartDate ? format(combinedStartDate, 'dd/MM/yyyy') : 'Selecione'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={combinedStartDate} onSelect={(d) => { setCombinedStartDate(d || undefined); setCombinedEndDate(d || undefined); setCombinedStartOpen(false); }} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {combinedPeriod === 'personalizado' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">De</label>
                  <Popover open={combinedStartOpen} onOpenChange={setCombinedStartOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                        <Calendar className="w-3.5 h-3.5" />
                        {combinedStartDate ? format(combinedStartDate, 'dd/MM/yyyy') : 'Início'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={combinedStartDate} onSelect={(d) => { setCombinedStartDate(d || undefined); setCombinedStartOpen(false); }} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Até</label>
                  <Popover open={combinedEndOpen} onOpenChange={setCombinedEndOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                        <Calendar className="w-3.5 h-3.5" />
                        {combinedEndDate ? format(combinedEndDate, 'dd/MM/yyyy') : 'Fim'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={combinedEndDate} onSelect={(d) => { setCombinedEndDate(d || undefined); setCombinedEndOpen(false); }} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Empresa</label>
              <Select value={combinedCompany} onValueChange={setCombinedCompany}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas (separado)</SelectItem>
                  {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">
              {combinedCompany === 'all'
                ? <><strong>{companies.length}</strong> empresa(s) — gera 1 PDF por empresa</>
                : <><strong>{combinedCompany}</strong> — 1 PDF combinado</>
              }
              {' '}
              <span className="text-xs">({format(combinedDateRange.start, 'dd/MM/yyyy')} — {format(combinedDateRange.end, 'dd/MM/yyyy')})</span>
            </span>
            <Button onClick={exportCombinedPDF} className="gap-2" disabled={isCombinedLoading}>
              {isCombinedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isCombinedLoading ? 'Gerando...' : 'Gerar PDF Combinado'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Relatório de Horímetros/KM por Empresa */}
      <HorimeterByCompanyReport
        vehicles={vehicles}
        readings={readings}
        obraSettings={obraSettings}
        companies={companies}
      />

      {/* Other exports */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Download className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Outros Relatórios</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {onExportResumoGeral && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
              <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-xs">Relatório Geral</h4>
                <p className="text-[10px] text-muted-foreground">Resumo completo</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={onExportResumoGeral} disabled={isExporting}>PDF</Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs">Rel. Completo</h4>
              <p className="text-[10px] text-muted-foreground">Todos os locais</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {onPreviewPDF && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onPreviewPDF} disabled={isExporting} title="Visualizar"><Eye className="w-3 h-3" /></Button>}
              <Button size="sm" className="h-7 px-2 text-xs" onClick={onExportPDF} disabled={isExporting}>PDF</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onExportXLSX} disabled={isExporting}>XLS</Button>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs">Por Empresa</h4>
              <p className="text-[10px] text-muted-foreground">Agrupado</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {onPreviewPDFPorEmpresa && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onPreviewPDFPorEmpresa} disabled={isExporting} title="Visualizar"><Eye className="w-3 h-3" /></Button>}
              <Button size="sm" className="h-7 px-2 text-xs bg-orange-600 hover:bg-orange-700" onClick={onExportPDFPorEmpresa} disabled={isExporting}>PDF</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onExportPorEmpresaXLSX} disabled={isExporting}>XLS</Button>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <BarChart3 className="w-4 h-4 text-violet-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs">Detalhado</h4>
              <p className="text-[10px] text-muted-foreground">Filtros ativos</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              {onPreviewDetailedPDF && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onPreviewDetailedPDF} disabled={isExporting} title="Visualizar"><Eye className="w-3 h-3" /></Button>}
              <Button size="sm" className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-700" onClick={onExportDetailedPDF} disabled={isExporting}>PDF</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
