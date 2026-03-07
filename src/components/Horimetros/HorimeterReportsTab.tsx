import { useState, useMemo } from 'react';
import { FileText, FileSpreadsheet, Download, MessageCircle, Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { ptBR } from 'date-fns/locale';
import { format, startOfMonth, endOfMonth, subMonths, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderStandardHeader, getLogoBase64 } from '@/lib/pdfHeader';
import { HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';

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
  const [detailedPeriod, setDetailedPeriod] = useState<string>('mes_atual');
  const [detailedCompany, setDetailedCompany] = useState<string>('all');
  const [detailedVehicle, setDetailedVehicle] = useState<string>('all');
  const [detailedStartDate, setDetailedStartDate] = useState<Date | undefined>();
  const [detailedEndDate, setDetailedEndDate] = useState<Date | undefined>();
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const companies = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => { if (v.company) set.add(v.company); });
    return Array.from(set).sort();
  }, [vehicles]);

  const vehicleOptions = useMemo(() => {
    let filtered = vehicles;
    if (detailedCompany !== 'all') {
      filtered = filtered.filter(v => v.company === detailedCompany);
    }
    return filtered.sort((a, b) => a.code.localeCompare(b.code));
  }, [vehicles, detailedCompany]);

  const detailedDateRange = useMemo(() => {
    const now = new Date();
    switch (detailedPeriod) {
      case 'hoje': return { start: startOfDay(now), end: endOfDay(now) };
      case '7dias': return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case '15dias': return { start: startOfDay(subDays(now, 14)), end: endOfDay(now) };
      case '30dias': return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
      case 'mes_atual': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'mes_anterior': { const prev = subMonths(now, 1); return { start: startOfMonth(prev), end: endOfMonth(prev) }; }
      case '2meses': return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(now) };
      case '3meses': return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      case 'personalizado':
        if (detailedStartDate && detailedEndDate) return { start: startOfDay(detailedStartDate), end: endOfDay(detailedEndDate) };
        return { start: startOfMonth(now), end: endOfMonth(now) };
      default: return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }, [detailedPeriod, detailedStartDate, detailedEndDate]);

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

  const formatBR = (val: number | null | undefined): string => {
    if (val === null || val === undefined || val === 0) return '-';
    const hasDecimals = val % 1 !== 0;
    return val.toLocaleString('pt-BR', { minimumFractionDigits: hasDecimals ? 2 : 0, maximumFractionDigits: 2 });
  };

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

    let y = renderStandardHeader(doc, {
      reportTitle: 'RELATÓRIO DETALHADO DE HORÍMETROS',
      obraSettings,
      logoBase64,
      date: format(new Date(), 'dd/MM/yyyy HH:mm'),
    });

    // Filter info
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const parts: string[] = [`Período: ${dateInfo}`];
    if (detailedCompany !== 'all') parts.push(`Empresa: ${detailedCompany}`);
    if (detailedVehicle !== 'all') {
      const v = vehicles.find(v => v.id === detailedVehicle);
      parts.push(`Veículo: ${v?.code || ''}`);
    }
    parts.push(`${filteredDetailedReadings.length} registro(s)`);
    doc.text(parts.join('  |  '), margin, y);
    y += 6;

    // KPI boxes
    const kpiW = 70;
    const kpiH = 16;
    const kpiGap = 12;
    const kpiStartX = (pageWidth - (2 * kpiW + kpiGap)) / 2;

    // Compute totals
    const totalHT = filteredDetailedReadings.reduce((s, r) => {
      const interval = r.current_value - (r.previous_value ?? r.current_value);
      return s + (interval > 0 ? interval : 0);
    }, 0);

    // KPI 1 - Registros
    doc.setFillColor(37, 99, 235);
    doc.roundedRect(kpiStartX, y, kpiW, kpiH, 3, 3, 'F');
    doc.setFillColor(29, 78, 216);
    doc.roundedRect(kpiStartX, y, kpiW, 5, 3, 3, 'F');
    doc.rect(kpiStartX, y + 3, kpiW, 2, 'F');
    doc.setTextColor(220, 230, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('REGISTROS', kpiStartX + kpiW / 2, y + 4, { align: 'center' });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text(`${filteredDetailedReadings.length}`, kpiStartX + kpiW / 2, y + 13, { align: 'center' });

    // KPI 2 - Total Horas
    const kpi2X = kpiStartX + kpiW + kpiGap;
    doc.setFillColor(22, 163, 74);
    doc.roundedRect(kpi2X, y, kpiW, kpiH, 3, 3, 'F');
    doc.setFillColor(21, 128, 61);
    doc.roundedRect(kpi2X, y, kpiW, 5, 3, 3, 'F');
    doc.rect(kpi2X, y + 3, kpiW, 2, 'F');
    doc.setTextColor(220, 255, 230);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL HORAS', kpi2X + kpiW / 2, y + 4, { align: 'center' });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text(`${formatBR(totalHT)} h`, kpi2X + kpiW / 2, y + 13, { align: 'center' });

    y += kpiH + 6;

    // Table data
    const tableData = filteredDetailedReadings.map(r => {
      const interval = r.current_value - (r.previous_value ?? r.current_value);
      const prevKm = (r as any).previous_km;
      const currKm = (r as any).current_km;
      const kmInterval = (prevKm && currKm && currKm > 0 && prevKm > 0) ? currKm - prevKm : null;
      return [
        format(new Date(r.reading_date + 'T00:00:00'), 'dd/MM/yyyy'),
        r.vehicle?.code || '-',
        r.operator || '-',
        formatBR(r.previous_value),
        formatBR(r.current_value),
        interval > 0 ? formatBR(interval) : '-',
        formatBR(prevKm),
        formatBR(currKm),
        kmInterval && kmInterval > 0 ? formatBR(kmInterval) : '-',
      ];
    });

    autoTable(doc, {
      head: [['Data', 'Veículo', 'Operador', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM']],
      body: tableData,
      startY: y,
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 2.5, font: 'helvetica', textColor: [30, 30, 30], lineColor: [200, 200, 200], lineWidth: 0.2 },
      headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, halign: 'center', cellPadding: 3 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'left' },
        3: { halign: 'center', cellWidth: 26 },
        4: { halign: 'center', cellWidth: 26 },
        5: { halign: 'center', fontStyle: 'bold', cellWidth: 18 },
        6: { halign: 'center', cellWidth: 26 },
        7: { halign: 'center', cellWidth: 26 },
        8: { halign: 'center', fontStyle: 'bold', cellWidth: 20 },
      },
    });

    // Page footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const pH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('AbasTech — Sistema de Gestão de Frotas', margin, pH - 6);
      doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pH - 6, { align: 'right' });
    }

    const fileName = `horimetros_detalhado_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);
    toast({ title: 'PDF gerado', description: `${filteredDetailedReadings.length} registros exportados` });
  };

  return (
    <div className="space-y-6">
      {/* Relatório Detalhado - with filters */}
      <Card className="border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Filter className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório Detalhado</CardTitle>
              <CardDescription className="text-xs">PDF com todos os lançamentos filtrados por período, empresa e veículo</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Período</label>
              <Select value={detailedPeriod} onValueChange={setDetailedPeriod}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                  <SelectItem value="15dias">Últimos 15 dias</SelectItem>
                  <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                  <SelectItem value="mes_atual">Mês Atual</SelectItem>
                  <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                  <SelectItem value="2meses">Últimos 2 Meses</SelectItem>
                  <SelectItem value="3meses">Últimos 3 Meses</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Veículo</label>
              <Select value={detailedVehicle} onValueChange={setDetailedVehicle}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {vehicleOptions.map(v => <SelectItem key={v.id} value={v.id}>{v.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview info */}
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

      {/* Other reports grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Relatório Resumo PDF */}
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
              PDF com resumo geral e páginas detalhadas por equipamento. Usa filtros da aba Registros ({recordCount} registros).
            </p>
            <Button onClick={onExportPDF} className="w-full gap-2" variant="outline">
              <Download className="w-4 h-4" />
              Exportar PDF Resumo
            </Button>
          </CardContent>
        </Card>

        {/* Excel */}
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
            <p className="text-sm text-muted-foreground mb-3">
              Exporta registros filtrados para Excel (.xlsx).
            </p>
            <Button onClick={onExportExcel} className="w-full gap-2" variant="outline">
              <Download className="w-4 h-4" />
              Exportar Excel
            </Button>
          </CardContent>
        </Card>

        {/* Faltantes PDF */}
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

        {/* WhatsApp */}
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
