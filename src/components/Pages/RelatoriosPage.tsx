import { useState, useMemo, useCallback } from 'react';
import { FileText, Download, Loader2, Calendar, Filter, Layers, FileSpreadsheet, MessageCircle, Truck, Fuel, Clock, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ptBR } from 'date-fns/locale';
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderStandardHeader, getLogoBase64 } from '@/lib/pdfHeader';
import { useVehicles, useHorimeterReadings, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useObraSettings } from '@/hooks/useObraSettings';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// ─── Period types ───
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
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function addPageFooters(doc: jsPDF, margin: number) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(148, 163, 184);
    doc.text('AbasTech — Sistema de Gestão de Frotas', margin, pH - 6);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pH - 6, { align: 'right' });
  }
}

// ─── Period Filter Component ───
function PeriodFilter({
  period, setPeriod, startDate, setStartDate, endDate, setEndDate,
}: {
  period: PeriodType; setPeriod: (v: PeriodType) => void;
  startDate?: Date; setStartDate: (d?: Date) => void;
  endDate?: Date; setEndDate: (d?: Date) => void;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Período</label>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
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
                {startDate ? format(startDate, 'dd/MM/yyyy') : 'Selecione'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent mode="single" selected={startDate} onSelect={(d) => { setStartDate(d || undefined); setEndDate(d || undefined); setStartOpen(false); }} locale={ptBR} className="p-3 pointer-events-auto" />
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
                  {startDate ? format(startDate, 'dd/MM/yyyy') : 'Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={startDate} onSelect={(d) => { setStartDate(d || undefined); setStartOpen(false); }} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Até</label>
            <Popover open={endOpen} onOpenChange={setEndOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2 w-[130px]">
                  <Calendar className="w-3.5 h-3.5" />
                  {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={endDate} onSelect={(d) => { setEndDate(d || undefined); setEndOpen(false); }} locale={ptBR} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───
export function RelatoriosPage() {
  const { toast } = useToast();
  const { settings: obraSettings } = useObraSettings();
  const { vehicles } = useVehicles();
  const { readings } = useHorimeterReadings();

  // Shared filters
  const [period, setPeriod] = useState<PeriodType>('mes_atual');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [company, setCompany] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  const dateRange = useMemo(() => computeDateRange(period, startDate, endDate), [period, startDate, endDate]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => { if (v.company) set.add(v.company); });
    return Array.from(set).sort();
  }, [vehicles]);

  const dateInfo = `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`;

  // ─── Horímetros Detalhado ───
  const exportHorimetroDetalhado = useCallback(async () => {
    setIsLoading(true);
    try {
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      const filtered = readings.filter(r => {
        const d = new Date(r.reading_date + 'T12:00:00');
        if (!isWithinInterval(d, dateRange)) return false;
        if (company !== 'all' && r.vehicle?.company !== company) return false;
        return true;
      }).sort((a, b) => {
        const descA = (a.vehicle?.description || '').toLowerCase();
        const descB = (b.vehicle?.description || '').toLowerCase();
        if (descA !== descB) return descA.localeCompare(descB);
        return a.reading_date.localeCompare(b.reading_date);
      });

      if (filtered.length === 0) {
        toast({ title: 'Sem dados', description: 'Nenhum registro encontrado', variant: 'destructive' });
        return;
      }

      const doc = new jsPDF('landscape');
      const margin = 14;
      let y = renderStandardHeader(doc, { reportTitle: 'Relatório de Horímetros/Km', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      const parts = [`Período: ${dateInfo}`];
      if (company !== 'all') parts.push(`Empresa: ${company}`);
      parts.push(`${filtered.length} registro(s)`);
      doc.text(parts.join('  |  '), margin, y); y += 8;

      const tableData = filtered.map(r => {
        const interval = r.current_value - (r.previous_value ?? r.current_value);
        const prevKm = (r as any).previous_km; const currKm = (r as any).current_km;
        const kmInterval = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
        return [format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle?.code || '-', r.vehicle?.description || r.vehicle?.category || '-', r.operator || '-', formatBR(r.previous_value), formatBR(r.current_value), interval > 0 ? formatBR(interval) : '-', formatBR(prevKm), formatBR(currKm), kmInterval && kmInterval > 0 ? formatBR(kmInterval) : '-'];
      });

      let lastDesc = ''; let descIdx = 0;
      autoTable(doc, {
        head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
        body: tableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const desc = tableData[data.row.index]?.[2] || '';
            if (desc !== lastDesc) { descIdx++; lastDesc = desc; }
            data.cell.styles.fillColor = descIdx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          }
        },
        columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'center', cellWidth: 24 }, 5: { halign: 'center', cellWidth: 24 }, 6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 7: { halign: 'center', cellWidth: 24 }, 8: { halign: 'center', cellWidth: 24 }, 9: { halign: 'center', fontStyle: 'bold', cellWidth: 18 } },
      });

      addPageFooters(doc, margin);
      doc.save(`horimetros_detalhado_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF gerado', description: `${filtered.length} registros exportados` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Falha ao gerar relatório', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [readings, dateRange, company, obraSettings, dateInfo, toast]);

  // ─── Abastecimentos Detalhado ───
  const exportAbastecimentoDetalhado = useCallback(async () => {
    setIsLoading(true);
    try {
      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);

      let query = supabase.from('field_fuel_records').select('*').gte('record_date', startStr).lte('record_date', endStr).order('record_date', { ascending: true });
      if (company !== 'all') query = query.eq('company', company);

      const { data: fuelRecords } = await query;
      if (!fuelRecords || fuelRecords.length === 0) {
        toast({ title: 'Sem dados', description: 'Nenhum registro encontrado', variant: 'destructive' });
        return;
      }

      const sorted = [...fuelRecords].sort((a, b) => {
        const descA = (a.vehicle_description || '').toLowerCase();
        const descB = (b.vehicle_description || '').toLowerCase();
        if (descA !== descB) return descA.localeCompare(descB);
        return (a.record_date || '').localeCompare(b.record_date || '');
      });

      const doc = new jsPDF('landscape');
      const margin = 14;
      let y = renderStandardHeader(doc, { reportTitle: 'Registros de Abastecimentos', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      const parts = [`Período: ${dateInfo}`];
      if (company !== 'all') parts.push(`Empresa: ${company}`);
      parts.push(`${sorted.length} registro(s)`);
      doc.text(parts.join('  |  '), margin, y); y += 8;

      const tableData = sorted.map(r => {
        const horInterval = (r.horimeter_current && r.horimeter_previous) ? r.horimeter_current - r.horimeter_previous : null;
        const consumption = (horInterval && horInterval > 0 && r.fuel_quantity > 0) ? (r.fuel_quantity / horInterval) : null;
        return [format(new Date(r.record_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle_code || '-', r.vehicle_description || '-', r.operator_name || '-', formatBR(r.fuel_quantity), consumption ? formatBR(consumption) : '-', formatBR(r.horimeter_previous), formatBR(r.horimeter_current), horInterval && horInterval > 0 ? formatBR(horInterval) : '-', r.location || '-'];
      });

      let lastDesc = ''; let descIdx = 0;
      autoTable(doc, {
        head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Qtd (L)', 'L/h', 'Hor. Ant.', 'Hor. Atual', 'H.T.', 'Local']],
        body: tableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 3 },
        didParseCell: (data) => {
          if (data.section === 'body') {
            const desc = tableData[data.row.index]?.[2] || '';
            if (desc !== lastDesc) { descIdx++; lastDesc = desc; }
            data.cell.styles.fillColor = descIdx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
          }
        },
        columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }, 5: { halign: 'center', cellWidth: 16 }, 6: { halign: 'center', cellWidth: 24 }, 7: { halign: 'center', cellWidth: 24 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 9: { halign: 'center' } },
      });

      addPageFooters(doc, margin);
      doc.save(`abastecimentos_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF gerado', description: `${sorted.length} registros exportados` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Falha ao gerar relatório', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, company, obraSettings, dateInfo, toast]);

  // ─── Combinado por Empresa ───
  const exportCombinado = useCallback(async () => {
    setIsLoading(true);
    try {
      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      const targetCompanies = company === 'all' ? companies : [company];
      let totalGenerated = 0;

      for (const comp of targetCompanies) {
        const horData = readings.filter(r => {
          const d = new Date(r.reading_date + 'T12:00:00');
          return isWithinInterval(d, dateRange) && r.vehicle?.company === comp;
        }).sort((a, b) => {
          const descA = (a.vehicle?.description || '').toLowerCase();
          const descB = (b.vehicle?.description || '').toLowerCase();
          if (descA !== descB) return descA.localeCompare(descB);
          return a.reading_date.localeCompare(b.reading_date);
        });

        const { data: fuelRecords } = await supabase.from('field_fuel_records').select('*').eq('company', comp).gte('record_date', startStr).lte('record_date', endStr).order('record_date', { ascending: true });

        if (horData.length === 0 && (!fuelRecords || fuelRecords.length === 0)) continue;

        const doc = new jsPDF('landscape');
        const margin = 14;

        // Page 1: Horímetros
        let y = renderStandardHeader(doc, { reportTitle: 'Relatório de Horímetros/Km', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
        doc.text(`Empresa: ${comp}  |  Período: ${dateInfo}`, margin, y); y += 8;

        if (horData.length > 0) {
          const horTableData = horData.map(r => {
            const interval = r.current_value - (r.previous_value ?? r.current_value);
            const prevKm = (r as any).previous_km; const currKm = (r as any).current_km;
            const kmInterval = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
            return [format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'), r.vehicle?.code || '-', r.vehicle?.description || r.vehicle?.category || '-', r.operator || '-', formatBR(r.previous_value), formatBR(r.current_value), interval > 0 ? formatBR(interval) : '-', formatBR(prevKm), formatBR(currKm), kmInterval && kmInterval > 0 ? formatBR(kmInterval) : '-'];
          });
          let lastDescH = ''; let descIdxH = 0;
          autoTable(doc, {
            head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
            body: horTableData, startY: y, margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
            headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
            didParseCell: (data) => { if (data.section === 'body') { const desc = horTableData[data.row.index]?.[2] || ''; if (desc !== lastDescH) { descIdxH++; lastDescH = desc; } data.cell.styles.fillColor = descIdxH % 2 === 0 ? [248, 250, 252] : [255, 255, 255]; } },
            columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'center', cellWidth: 24 }, 5: { halign: 'center', cellWidth: 24 }, 6: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 7: { halign: 'center', cellWidth: 24 }, 8: { halign: 'center', cellWidth: 24 }, 9: { halign: 'center', fontStyle: 'bold', cellWidth: 18 } },
          });
        } else {
          doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
          doc.text('Nenhum registro de horímetro encontrado.', margin, y);
        }

        // Page 2: Abastecimentos
        doc.addPage('landscape');
        y = renderStandardHeader(doc, { reportTitle: 'Registros de Abastecimentos', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
        doc.text(`Empresa: ${comp}  |  Período: ${dateInfo}`, margin, y); y += 6;

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
          let lastDescF = ''; let descIdxF = 0;
          autoTable(doc, {
            head: [['Data', 'Veículo', 'Descrição', 'Operador', 'Qtd (L)', 'L/h', 'Hor. Ant.', 'Hor. Atual', 'H.T.', 'Local']],
            body: fuelTableData, startY: y, margin: { left: margin, right: margin },
            styles: { fontSize: 8, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
            headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'center', cellPadding: 3 },
            didParseCell: (data) => { if (data.section === 'body') { const desc = fuelTableData[data.row.index]?.[2] || ''; if (desc !== lastDescF) { descIdxF++; lastDescF = desc; } data.cell.styles.fillColor = descIdxF % 2 === 0 ? [248, 250, 252] : [255, 255, 255]; } },
            columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 2: { halign: 'left' }, 3: { halign: 'left' }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 18 }, 5: { halign: 'center', cellWidth: 16 }, 6: { halign: 'center', cellWidth: 24 }, 7: { halign: 'center', cellWidth: 24 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 16 }, 9: { halign: 'center' } },
          });
        } else {
          doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(120, 120, 120);
          doc.text('Nenhum registro de abastecimento encontrado.', margin, y);
        }

        // Page 3: Detalhamento por Veículo
        const vehicleMap = new Map<string, { code: string; description: string; horInitial: number | null; horFinal: number | null; totalHT: number; kmInitial: number | null; kmFinal: number | null; totalKM: number; totalLiters: number; fuelCount: number; horCount: number; avgConsumption: number | null }>();

        horData.forEach(r => {
          const code = r.vehicle?.code || '-';
          if (!vehicleMap.has(code)) vehicleMap.set(code, { code, description: r.vehicle?.description || '-', horInitial: null, horFinal: null, totalHT: 0, kmInitial: null, kmFinal: null, totalKM: 0, totalLiters: 0, fuelCount: 0, horCount: 0, avgConsumption: null });
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
            if (!vehicleMap.has(code)) vehicleMap.set(code, { code, description: r.vehicle_description || '-', horInitial: null, horFinal: null, totalHT: 0, kmInitial: null, kmFinal: null, totalKM: 0, totalLiters: 0, fuelCount: 0, horCount: 0, avgConsumption: null });
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
          doc.text(`Empresa: ${comp}  |  Período: ${dateInfo}  |  ${vehicleSummaries.length} veículo(s)`, margin, y); y += 8;

          const detailData = vehicleSummaries.map(v => [v.code, v.description, v.horInitial != null ? formatBR(v.horInitial) : '-', v.horFinal != null ? formatBR(v.horFinal) : '-', v.totalHT > 0 ? formatBR(v.totalHT) : '-', v.kmInitial != null ? formatBR(v.kmInitial) : '-', v.kmFinal != null ? formatBR(v.kmFinal) : '-', v.totalKM > 0 ? formatBR(v.totalKM) : '-', v.totalLiters > 0 ? formatBR(v.totalLiters) : '-', v.avgConsumption != null ? formatBR(v.avgConsumption) : '-', `${v.horCount}/${v.fuelCount}`]);

          let lastDescV = ''; let descIdxV = 0;
          autoTable(doc, {
            head: [['Veículo', 'Descrição', 'Hor. Inicial', 'Hor. Final', 'Total H.T.', 'KM Inicial', 'KM Final', 'Total KM', 'Total (L)', 'Consumo (L/h)', 'Lanç. Hor/Abast']],
            body: detailData, startY: y, margin: { left: margin, right: margin },
            styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
            headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
            didParseCell: (data) => { if (data.section === 'body') { const desc = detailData[data.row.index]?.[1] || ''; if (desc !== lastDescV) { descIdxV++; lastDescV = desc; } data.cell.styles.fillColor = descIdxV % 2 === 0 ? [248, 250, 252] : [255, 255, 255]; } },
            columnStyles: { 0: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 1: { halign: 'left' }, 2: { halign: 'center', cellWidth: 22 }, 3: { halign: 'center', cellWidth: 22 }, 4: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, 5: { halign: 'center', cellWidth: 22 }, 6: { halign: 'center', cellWidth: 22 }, 7: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, 8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 }, 9: { halign: 'center', cellWidth: 24 }, 10: { halign: 'center', cellWidth: 24 } },
          });
        }

        addPageFooters(doc, margin);
        const safeName = comp.replace(/\s+/g, '_');
        doc.save(`relatorio_combinado_${safeName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
        totalGenerated++;
      }

      if (totalGenerated === 0) {
        toast({ title: 'Sem dados', description: 'Nenhum registro encontrado', variant: 'destructive' });
      } else {
        toast({ title: 'PDFs gerados', description: `${totalGenerated} relatório(s) gerado(s)` });
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Falha ao gerar relatório', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [readings, dateRange, company, companies, obraSettings, dateInfo, toast]);

  // ─── Ordens de Serviço ───
  const exportOrdensServico = useCallback(async () => {
    setIsLoading(true);
    try {
      const startStr = format(dateRange.start, 'yyyy-MM-dd');
      const endStr = format(dateRange.end, 'yyyy-MM-dd');
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);

      const { data: orders } = await supabase.from('service_orders').select('*').gte('order_date', startStr).lte('order_date', endStr).order('order_date', { ascending: true });

      if (!orders || orders.length === 0) {
        toast({ title: 'Sem dados', description: 'Nenhuma ordem de serviço encontrada', variant: 'destructive' });
        return;
      }

      const doc = new jsPDF('landscape');
      const margin = 14;
      let y = renderStandardHeader(doc, { reportTitle: 'Relatório de Ordens de Serviço', obraSettings, logoBase64, date: format(new Date(), 'dd/MM/yyyy HH:mm'), showTitleUnderline: false });
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(71, 85, 105);
      doc.text(`Período: ${dateInfo}  |  ${orders.length} ordem(ns)`, margin, y); y += 8;

      const tableData = orders.map(o => [
        format(new Date(o.order_date + 'T00:00:00'), 'dd/MM/yyyy'),
        o.order_number || '-',
        o.vehicle_code || '-',
        o.vehicle_description || '-',
        o.order_type || '-',
        o.status || '-',
        o.priority || '-',
        o.mechanic_name || '-',
        o.problem_description?.substring(0, 40) || '-',
      ]);

      autoTable(doc, {
        head: [['Data', 'Nº OS', 'Veículo', 'Descrição', 'Tipo', 'Status', 'Prioridade', 'Mecânico', 'Problema']],
        body: tableData, startY: y, margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 0: { halign: 'center', cellWidth: 22 }, 1: { halign: 'center', cellWidth: 18 }, 2: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }, 3: { halign: 'left' }, 4: { halign: 'center', cellWidth: 22 }, 5: { halign: 'center', cellWidth: 22 }, 6: { halign: 'center', cellWidth: 22 }, 7: { halign: 'left' }, 8: { halign: 'left' } },
      });

      addPageFooters(doc, margin);
      doc.save(`ordens_servico_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF gerado', description: `${orders.length} ordens exportadas` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Erro', description: 'Falha ao gerar relatório', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, obraSettings, dateInfo, toast]);

  const reportCards = [
    { id: 'hor_detalhado', title: 'Horímetros — Detalhado', desc: 'Relatório detalhado de lançamentos de horímetro/km', icon: Clock, color: 'text-primary', bgColor: 'bg-primary/10', action: exportHorimetroDetalhado },
    { id: 'abast_detalhado', title: 'Abastecimentos — Detalhado', desc: 'Todos os registros de abastecimento do período', icon: Fuel, color: 'text-amber-600', bgColor: 'bg-amber-500/10', action: exportAbastecimentoDetalhado },
    { id: 'combinado', title: 'Combinado por Empresa', desc: 'Horímetros + Abastecimentos + Detalhamento por veículo', icon: Layers, color: 'text-emerald-600', bgColor: 'bg-emerald-500/10', action: exportCombinado },
    { id: 'os', title: 'Ordens de Serviço', desc: 'Relatório de ordens de serviço do período', icon: Wrench, color: 'text-destructive', bgColor: 'bg-destructive/10', action: exportOrdensServico },
  ];

  return (
    <div className="flex-1 p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Central de geração de relatórios do sistema</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {format(dateRange.start, 'dd/MM/yyyy')} — {format(dateRange.end, 'dd/MM/yyyy')}
        </Badge>
      </div>

      {/* Shared Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <PeriodFilter
              period={period} setPeriod={setPeriod}
              startDate={startDate} setStartDate={setStartDate}
              endDate={endDate} setEndDate={setEndDate}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Empresa</label>
              <Select value={company} onValueChange={setCompany}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportCards.map(report => (
          <Card key={report.id} className="border hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${report.bgColor} flex items-center justify-center`}>
                  <report.icon className={`w-5 h-5 ${report.color}`} />
                </div>
                <div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription className="text-xs">{report.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <Button onClick={report.action} className="w-full gap-2" variant="outline" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isLoading ? 'Gerando...' : 'Gerar PDF'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
