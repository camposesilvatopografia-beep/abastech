import { useState, useMemo, useCallback } from 'react';
import { FileText, FileSpreadsheet, Download, MessageCircle, Calendar, Filter, Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ptBR } from 'date-fns/locale';
import { format, startOfMonth, endOfMonth, subMonths, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderStandardHeader, getLogoBase64 } from '@/lib/pdfHeader';
import { HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Vehicle {
  id: string;
  code: string;
  name: string;
  category: string | null;
  company: string | null;
}

interface ObraSettings {
  nome?: string;
  cidade?: string;
  logo_url?: string | null;
}

interface HorimeterReportsTabProps {
  onExportPDF: () => void;
  onExportExcel: () => void;
  onExportMissingPDF: () => void;
  onExportMissingWhatsApp: () => void;
  recordCount: number;
  missingCount: number;
  readings: HorimeterWithVehicle[];
  vehicles: Vehicle[];
  obraSettings?: ObraSettings | null;
}

type PeriodType = 'data_especifica' | 'ontem' | 'hoje' | 'mes_atual' | 'personalizado';

function computeDateRange(period: PeriodType, customStart?: Date, customEnd?: Date) {
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

const PERIOD_OPTIONS = [
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

function renderKpiPair(doc: jsPDF, y: number, pageWidth: number, kpi1: { label: string; value: string }, kpi2: { label: string; value: string }) {
  const kpiW = 70, kpiH = 16, kpiGap = 12;
  const kpiStartX = (pageWidth - (2 * kpiW + kpiGap)) / 2;

  doc.setFillColor(37, 99, 235);
  doc.roundedRect(kpiStartX, y, kpiW, kpiH, 3, 3, 'F');
  doc.setFillColor(29, 78, 216);
  doc.roundedRect(kpiStartX, y, kpiW, 5, 3, 3, 'F');
  doc.rect(kpiStartX, y + 3, kpiW, 2, 'F');
  doc.setTextColor(220, 230, 255);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text(kpi1.label, kpiStartX + kpiW / 2, y + 4, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(kpi1.value, kpiStartX + kpiW / 2, y + 13, { align: 'center' });

  const kpi2X = kpiStartX + kpiW + kpiGap;
  doc.setFillColor(22, 163, 74);
  doc.roundedRect(kpi2X, y, kpiW, kpiH, 3, 3, 'F');
  doc.setFillColor(21, 128, 61);
  doc.roundedRect(kpi2X, y, kpiW, 5, 3, 3, 'F');
  doc.rect(kpi2X, y + 3, kpiW, 2, 'F');
  doc.setTextColor(220, 255, 230);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text(kpi2.label, kpi2X + kpiW / 2, y + 4, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(kpi2.value, kpi2X + kpiW / 2, y + 13, { align: 'center' });

  return y + kpiH + 6;
}

function addPageFooters(doc: jsPDF, margin: number) {
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

export function HorimeterReportsTab({
  onExportPDF,
  onExportExcel,
  onExportMissingPDF,
  onExportMissingWhatsApp,
  recordCount,
  missingCount,
  readings,
  vehicles,
  obraSettings,
}: HorimeterReportsTabProps) {
  const { toast } = useToast();

  // Detailed report filters
  const [detailedPeriod, setDetailedPeriod] = useState<PeriodType>('mes_atual');
  const [detailedCompany, setDetailedCompany] = useState<string>('all');
  const [detailedVehicle, setDetailedVehicle] = useState<string>('all');
  const [detailedStartDate, setDetailedStartDate] = useState<Date | undefined>();
  const [detailedEndDate, setDetailedEndDate] = useState<Date | undefined>();
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  // Combined report filters
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

  const vehicleOptions = useMemo(() => {
    let filtered = vehicles;
    if (detailedCompany !== 'all') filtered = filtered.filter(v => v.company === detailedCompany);
    return filtered.sort((a, b) => a.code.localeCompare(b.code));
  }, [vehicles, detailedCompany]);

  const detailedDateRange = useMemo(() => computeDateRange(detailedPeriod, detailedStartDate, detailedEndDate), [detailedPeriod, detailedStartDate, detailedEndDate]);
  const combinedDateRange = useMemo(() => computeDateRange(combinedPeriod, combinedStartDate, combinedEndDate), [combinedPeriod, combinedStartDate, combinedEndDate]);

  const filteredDetailedReadings = useMemo(() => {
    return readings.filter(r => {
      const d = new Date(r.reading_date + 'T12:00:00');
      if (!isWithinInterval(d, detailedDateRange)) return false;
      if (detailedCompany !== 'all' && r.vehicle?.company !== detailedCompany) return false;
      if (detailedVehicle !== 'all' && r.vehicle_id !== detailedVehicle) return false;
      return true;
    }).sort((a, b) => {
      const dateCmp = a.reading_date.localeCompare(b.reading_date);
      if (dateCmp !== 0) return dateCmp;
      return (a.vehicle?.code || '').localeCompare(b.vehicle?.code || '');
    });
  }, [readings, detailedDateRange, detailedCompany, detailedVehicle]);


  const exportDetailedPDF = async () => {
    if (filteredDetailedReadings.length === 0) {
      toast({ title: 'Sem dados', description: 'Nenhum registro encontrado com os filtros selecionados', variant: 'destructive' });
      return;
    }

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
    const dateInfo = `${format(detailedDateRange.start, 'dd/MM/yyyy')} a ${format(detailedDateRange.end, 'dd/MM/yyyy')}`;

    let y = renderStandardHeader(doc, { reportTitle: 'Relatório de Horímetros/Km', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });

    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    const parts: string[] = [`Período: ${dateInfo}`];
    if (detailedCompany !== 'all') parts.push(`Empresa: ${detailedCompany}`);
    if (detailedVehicle !== 'all') { const v = vehicles.find(v => v.id === detailedVehicle); parts.push(`Veículo: ${v?.code || ''}`); }
    parts.push(`${filteredDetailedReadings.length} registro(s)`);
    doc.text(parts.join('  |  '), margin, y);
    y += 8;

    const tableData = filteredDetailedReadings.map(r => {
      const interval = r.current_value - (r.previous_value ?? r.current_value);
      const prevKm = (r as any).previous_km;
      const currKm = (r as any).current_km;
      const kmInterval = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
      return [
        format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
        r.vehicle?.code || '-', r.operator || '-',
        formatBR(r.previous_value), formatBR(r.current_value),
        interval > 0 ? formatBR(interval) : '-',
        formatBR(prevKm), formatBR(currKm),
        kmInterval && kmInterval > 0 ? formatBR(kmInterval) : '-',
      ];
    });

    autoTable(doc, {
      head: [['Data', 'Veículo', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
      body: tableData, startY: y, margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'center', cellWidth: 26 }, 4: { halign: 'center', cellWidth: 26 }, 5: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }, 6: { halign: 'center', cellWidth: 26 }, 7: { halign: 'center', cellWidth: 26 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 } },
    });

    addPageFooters(doc, margin);
    doc.save(`horimetros_detalhado_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast({ title: 'PDF gerado', description: `${filteredDetailedReadings.length} registros exportados` });
  };

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
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ====== HORÍMETROS ======
    let y = renderStandardHeader(doc, { reportTitle: `Relatório de Horímetros/Km`, obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
    doc.text(`Empresa: ${company}  |  Período: ${dateInfo}`, margin, y); y += 8;
    if (horimeterData.length > 0) {
      const horTableData = horimeterData.map(r => {
        const interval = r.current_value - (r.previous_value ?? r.current_value);
        const prevKm = (r as any).previous_km; const currKm = (r as any).current_km;
        const kmInterval = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
        return [ format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle?.code || '-', r.operator || '-', formatBR(r.previous_value), formatBR(r.current_value), interval > 0 ? formatBR(interval) : '-', formatBR(prevKm), formatBR(currKm), kmInterval && kmInterval > 0 ? formatBR(kmInterval) : '-' ];
      });
      autoTable(doc, {
        head: [['Data', 'Veículo', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
        body: horTableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'center', cellWidth: 26 }, 4: { halign: 'center', cellWidth: 26 }, 5: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }, 6: { halign: 'center', cellWidth: 26 }, 7: { halign: 'center', cellWidth: 26 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 } },
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
      // Sort by description (vehicle type) then date
      const sortedFuel = [...fuelRecords].sort((a, b) => {
        const descA = (a.vehicle_description || '').toLowerCase();
        const descB = (b.vehicle_description || '').toLowerCase();
        if (descA !== descB) return descA.localeCompare(descB);
        return (a.record_date || '').localeCompare(b.record_date || '');
      });

      const fuelTableData = sortedFuel.map(r => {
        const horInterval = (r.horimeter_current && r.horimeter_previous) ? r.horimeter_current - r.horimeter_previous : null;
        const consumption = (horInterval && horInterval > 0 && r.fuel_quantity > 0) ? (r.fuel_quantity / horInterval) : null;
        return [ format(new Date(r.record_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle_code || '-', r.vehicle_description || '-', r.operator_name || '-', formatBR(r.fuel_quantity), consumption ? formatBR(consumption) : '-', formatBR(r.horimeter_previous), formatBR(r.horimeter_current), horInterval && horInterval > 0 ? formatBR(horInterval) : '-', r.location || '-' ];
      });

      // Track description groups for alternating fills
      let lastDesc = '';
      let descColorIdx = 0;

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

    addPageFooters(doc, margin);
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

  return (
    <div className="space-y-6">
      {/* Relatório Detalhado */}
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Filter className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório Detalhado</CardTitle>
              <CardDescription className="text-xs">PDF com todos os lançamentos de horímetro filtrados</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={detailedPeriod} onValueChange={(v) => setDetailedPeriod(v as PeriodType)}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {detailedPeriod === 'data_especifica' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Data</label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                      <Calendar className="w-3.5 h-3.5" />
                      {detailedStartDate ? format(detailedStartDate, 'dd/MM/yyyy') : 'Selecione'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={detailedStartDate} onSelect={(d) => { setDetailedStartDate(d || undefined); setDetailedEndDate(d || undefined); setStartDateOpen(false); }} locale={ptBR} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            {detailedPeriod === 'personalizado' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">De</label>
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                        <Calendar className="w-3.5 h-3.5" />
                        {detailedStartDate ? format(detailedStartDate, 'dd/MM/yyyy') : 'Início'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={detailedStartDate} onSelect={(d) => { setDetailedStartDate(d || undefined); setStartDateOpen(false); }} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Até</label>
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                        <Calendar className="w-3.5 h-3.5" />
                        {detailedEndDate ? format(detailedEndDate, 'dd/MM/yyyy') : 'Fim'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={detailedEndDate} onSelect={(d) => { setDetailedEndDate(d || undefined); setEndDateOpen(false); }} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Empresa</label>
              <Select value={detailedCompany} onValueChange={(v) => { setDetailedCompany(v); setDetailedVehicle('all'); }}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Veículo</label>
              <Select value={detailedVehicle} onValueChange={setDetailedVehicle}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {vehicleOptions.map(v => <SelectItem key={v.id} value={v.id}>{v.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">
              <strong>{filteredDetailedReadings.length}</strong> registro(s) no período{' '}
              <span className="text-xs">({format(detailedDateRange.start, 'dd/MM/yyyy')} — {format(detailedDateRange.end, 'dd/MM/yyyy')})</span>
            </span>
            <Button onClick={exportDetailedPDF} className="gap-2">
              <Download className="w-4 h-4" />
              Gerar PDF Detalhado
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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

      {/* Other reports grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <CardTitle className="text-base">Relatório Resumo</CardTitle>
                <CardDescription className="text-xs">Resumo + histórico por veículo (PDF)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-3">
              PDF com resumo geral e páginas detalhadas por equipamento ({recordCount} registros).
            </p>
            <Button onClick={onExportPDF} className="w-full gap-2" variant="outline">
              <Download className="w-4 h-4" />
              Exportar PDF Resumo
            </Button>
          </CardContent>
        </Card>

        <Card className="border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base">Exportar Excel</CardTitle>
                <CardDescription className="text-xs">Planilha com todos os lançamentos</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-3">Exporta registros filtrados para Excel (.xlsx).</p>
            <Button onClick={onExportExcel} className="w-full gap-2" variant="outline">
              <Download className="w-4 h-4" />
              Exportar Excel
            </Button>
          </CardContent>
        </Card>

        <Card className="border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-base">Relatório de Faltantes</CardTitle>
                <CardDescription className="text-xs">Veículos sem leitura ({missingCount})</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Button onClick={onExportMissingPDF} className="w-full gap-2" variant="outline">
              <Download className="w-4 h-4" />
              Exportar PDF Faltantes
            </Button>
          </CardContent>
        </Card>

        <Card className="border hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-base">Faltantes via WhatsApp</CardTitle>
                <CardDescription className="text-xs">Envia lista por WhatsApp ({missingCount})</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <Button onClick={onExportMissingWhatsApp} className="w-full gap-2" variant="outline">
              <MessageCircle className="w-4 h-4" />
              Enviar WhatsApp
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
