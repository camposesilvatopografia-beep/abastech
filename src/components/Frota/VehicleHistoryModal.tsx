import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Fuel,
  Droplets,
  Activity,
  Wrench,
  Calendar,
  RefreshCw,
  FileText,
  X,
  Clock,
  Gauge,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Car,
  Download,
  List,
  Settings
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ColumnConfigModal } from '@/components/Layout/ColumnConfigModal';
import { useLayoutPreferences, ColumnConfig } from '@/hooks/useLayoutPreferences';
import { useObraSettings } from '@/hooks/useObraSettings';

interface VehicleHistoryModalProps {
  open: boolean;
  onClose: () => void;
  vehicleCode: string;
  vehicleDescription: string;
  vehicleCategory: string;
  vehicleEmpresa: string;
}

interface FuelRecord {
  id: string;
  record_date: string;
  record_time: string;
  fuel_quantity: number;
  arla_quantity: number | null;
  horimeter_current: number | null;
  horimeter_previous: number | null;
  km_current: number | null;
  km_previous: number | null;
  oil_type: string | null;
  oil_quantity: number | null;
  lubricant: string | null;
  filter_blow_quantity: number | null;
  operator_name: string | null;
  location: string | null;
  record_type: string | null;
}

interface HorimeterReading {
  id: string;
  reading_date: string;
  current_value: number;
  previous_value: number | null;
  current_km: number | null;
  previous_km: number | null;
  operator: string | null;
  observations: string | null;
}

interface ServiceOrder {
  id: string;
  order_number: string;
  order_date: string;
  order_type: string;
  status: string;
  priority: string;
  problem_description: string | null;
  solution_description: string | null;
  mechanic_name: string | null;
  entry_date: string | null;
  end_date: string | null;
  horimeter_current: number | null;
  km_current: number | null;
  parts_used: string | null;
}

// Consolidated daily record type
interface DailyRecord {
  date: Date;
  dateStr: string;
  fuelRecords: FuelRecord[];
  horimeterReadings: HorimeterReading[];
  serviceOrders: ServiceOrder[];
  // Aggregated values
  totalDiesel: number;
  totalArla: number;
  totalOil: number;
  horimeterValue: number | null;
  kmValue: number | null;
  horimeterInterval: number;
  dailyConsumption: number | null;
  osCount: number;
  osStatus: string | null;
  hasActivity: boolean;
}

type PeriodFilter = 'today' | 'yesterday' | '7days' | '30days' | '90days' | 'all' | 'month' | 'custom';

const DEFAULT_TIMELINE_COLUMNS: ColumnConfig[] = [
  { key: 'data', label: 'Data', visible: true, order: 0 },
  { key: 'diesel', label: 'Diesel (L)', visible: true, order: 1 },
  { key: 'arla', label: 'ARLA (L)', visible: true, order: 2 },
  { key: 'oleo', label: 'Óleo (L)', visible: true, order: 3 },
  { key: 'horimetro', label: 'Horímetro', visible: true, order: 4 },
  { key: 'km', label: 'KM', visible: true, order: 5 },
  { key: 'intervalo', label: 'Intervalo', visible: true, order: 6 },
  { key: 'os', label: 'OS', visible: true, order: 7 },
  { key: 'manutencao', label: 'Manutenção', visible: true, order: 8 },
  { key: 'operador', label: 'Operador', visible: true, order: 9 },
];

export function VehicleHistoryModal({
  open,
  onClose,
  vehicleCode,
  vehicleDescription,
  vehicleCategory,
  vehicleEmpresa
}: VehicleHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [horimeterReadings, setHorimeterReadings] = useState<HorimeterReading[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [activeTab, setActiveTab] = useState('timeline');
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const { settings: obraSettings } = useObraSettings();
  
  // Layout preferences for timeline columns
  const { 
    columnConfig: timelineColumns, 
    savePreferences: saveTimelinePrefs,
    resetToDefaults: resetTimelinePrefs 
  } = useLayoutPreferences('vehicle-history-timeline', DEFAULT_TIMELINE_COLUMNS);
  
  // Period filter
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('90days');
  const [customDateStart, setCustomDateStart] = useState<Date | undefined>();
  const [customDateEnd, setCustomDateEnd] = useState<Date | undefined>();

  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (periodFilter) {
      case 'today':
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return { start: todayStart, end: today };
      case 'yesterday':
        const yesterdayStart = subDays(today, 1);
        yesterdayStart.setHours(0, 0, 0, 0);
        const yesterdayEnd = subDays(today, 1);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { start: yesterdayStart, end: yesterdayEnd };
      case '7days':
        return { start: subDays(today, 7), end: today };
      case '30days':
        return { start: subDays(today, 30), end: today };
      case '90days':
        return { start: subDays(today, 90), end: today };
      case 'all':
        return { start: new Date('2020-01-01'), end: today };
      case 'month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'custom':
        return {
          start: customDateStart || subDays(today, 30),
          end: customDateEnd || today
        };
      default:
        return { start: subDays(today, 30), end: today };
    }
  }, [periodFilter, customDateStart, customDateEnd]);

  const fetchAllData = async () => {
    if (!vehicleCode) return;
    
    setLoading(true);
    try {
      const startDate = format(dateRange.start, 'yyyy-MM-dd');
      const endDate = format(dateRange.end, 'yyyy-MM-dd');

      // Fetch fuel records
      const { data: fuelData } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('vehicle_code', vehicleCode)
        .gte('record_date', startDate)
        .lte('record_date', endDate)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false });

      // Fetch horimeter readings - need to find vehicle_id first
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      let horimeterData: HorimeterReading[] = [];
      if (vehicleData?.id) {
        const { data } = await supabase
          .from('horimeter_readings')
          .select('*')
          .eq('vehicle_id', vehicleData.id)
          .gte('reading_date', startDate)
          .lte('reading_date', endDate)
          .order('reading_date', { ascending: false });
        horimeterData = (data || []) as HorimeterReading[];
      }

      // Fetch service orders - by entry_date (primary) OR order_date
      const { data: serviceByEntry } = await supabase
        .from('service_orders')
        .select('*')
        .eq('vehicle_code', vehicleCode)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date', { ascending: false });

      // Also fetch by order_date for those without entry_date
      const { data: serviceByOrder } = await supabase
        .from('service_orders')
        .select('*')
        .eq('vehicle_code', vehicleCode)
        .is('entry_date', null)
        .gte('order_date', startDate)
        .lte('order_date', endDate)
        .order('order_date', { ascending: false });

      // Merge and deduplicate
      const allOrders = [...(serviceByEntry || []), ...(serviceByOrder || [])];
      const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values());

      setFuelRecords(fuelData || []);
      setHorimeterReadings(horimeterData);
      setServiceOrders(uniqueOrders as ServiceOrder[]);
    } catch (error) {
      console.error('Error fetching vehicle history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && vehicleCode) {
      fetchAllData();
    }
  }, [open, vehicleCode, dateRange]);

  // Build consolidated daily timeline
  const dailyTimeline = useMemo((): DailyRecord[] => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Filter records for this day
      const dayFuelRecords = fuelRecords.filter(r => r.record_date === dateStr);
      const dayHorimeterReadings = horimeterReadings.filter(r => r.reading_date === dateStr);
      const dayServiceOrders = serviceOrders.filter(r => (r.entry_date || r.order_date) === dateStr);
      
      // Aggregate fuel data
      const totalDiesel = dayFuelRecords
        .filter(r => r.record_type === 'saida')
        .reduce((sum, r) => sum + (r.fuel_quantity || 0), 0);
      
      const totalArla = dayFuelRecords
        .filter(r => r.record_type === 'saida')
        .reduce((sum, r) => sum + (r.arla_quantity || 0), 0);
      
      const totalOil = dayFuelRecords
        .filter(r => r.record_type === 'saida')
        .reduce((sum, r) => sum + (r.oil_quantity || 0), 0);
      
      // Get horimeter/km from readings or fuel records
      const horimeterValue = dayHorimeterReadings[0]?.current_value || 
        dayFuelRecords.find(r => r.horimeter_current)?.horimeter_current || null;
      
      const kmValue = (dayHorimeterReadings[0] as any)?.current_km || 
        dayFuelRecords.find(r => r.km_current)?.km_current || null;
      
      // Calculate interval
      const prevHorimeter = dayHorimeterReadings[0]?.previous_value || 
        dayFuelRecords.find(r => r.horimeter_previous)?.horimeter_previous || 0;
      const horimeterInterval = horimeterValue ? horimeterValue - prevHorimeter : 0;
      
      // Daily consumption (L/h)
      const dailyConsumption = (horimeterInterval > 0 && totalDiesel > 0) 
        ? totalDiesel / horimeterInterval 
        : null;
      
      // OS info
      const osCount = dayServiceOrders.length;
      const osStatus = dayServiceOrders[0]?.status || null;
      
      const hasActivity = dayFuelRecords.length > 0 || dayHorimeterReadings.length > 0 || dayServiceOrders.length > 0;
      
      return {
        date: day,
        dateStr,
        fuelRecords: dayFuelRecords,
        horimeterReadings: dayHorimeterReadings,
        serviceOrders: dayServiceOrders,
        totalDiesel,
        totalArla,
        totalOil,
        horimeterValue,
        kmValue,
        horimeterInterval,
        dailyConsumption,
        osCount,
        osStatus,
        hasActivity,
      };
    }).reverse(); // Most recent first
  }, [dateRange, fuelRecords, horimeterReadings, serviceOrders]);

  // Filter to show only days with activity
  const activeDays = useMemo(() => {
    return dailyTimeline.filter(d => d.hasActivity);
  }, [dailyTimeline]);

  // Calculate summaries
  const summary = useMemo(() => {
    const totalDiesel = fuelRecords
      .filter(r => r.record_type === 'saida')
      .reduce((sum, r) => sum + (r.fuel_quantity || 0), 0);
    
    const totalArla = fuelRecords
      .filter(r => r.record_type === 'saida')
      .reduce((sum, r) => sum + (r.arla_quantity || 0), 0);
    
    const totalOil = fuelRecords
      .filter(r => r.record_type === 'saida')
      .reduce((sum, r) => sum + (r.oil_quantity || 0), 0);
    
    const lubricantRecords = fuelRecords.filter(r => r.lubricant && r.record_type === 'saida');
    const filterBlowRecords = fuelRecords.filter(r => r.filter_blow_quantity && r.filter_blow_quantity > 0);
    
    const latestHorimeter = horimeterReadings[0]?.current_value || 
      fuelRecords.find(r => r.horimeter_current)?.horimeter_current || 0;
    
    const oldestHorimeter = horimeterReadings[horimeterReadings.length - 1]?.current_value ||
      fuelRecords.filter(r => r.horimeter_current).pop()?.horimeter_current || 0;
    
    const horimeterInterval = latestHorimeter - oldestHorimeter;

    const osCount = serviceOrders.length;
    const osCompleted = serviceOrders.filter(o => o.status === 'Finalizada').length;
    const osInProgress = serviceOrders.filter(o => ['Aberta', 'Em Andamento', 'Aguardando Peças'].includes(o.status)).length;

    // Calculate consumption (L/h or km/L)
    let consumption = 0;
    if (horimeterInterval > 0 && totalDiesel > 0) {
      consumption = totalDiesel / horimeterInterval;
    }

    return {
      totalDiesel,
      totalArla,
      totalOil,
      lubricantCount: lubricantRecords.length,
      filterBlowCount: filterBlowRecords.length,
      latestHorimeter,
      horimeterInterval,
      consumption,
      osCount,
      osCompleted,
      osInProgress,
      fuelRecordCount: fuelRecords.filter(r => r.record_type === 'saida').length,
      horimeterReadingCount: horimeterReadings.length,
      daysWithActivity: activeDays.length,
    };
  }, [fuelRecords, horimeterReadings, serviceOrders, activeDays]);

  const visibleColumns = timelineColumns.filter(c => c.visible).sort((a, b) => a.order - b.order);

  const loadImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const exportToPDF = async () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;

    // Load logos
    let obraLogoBase64: string | null = null;
    let abastechLogoBase64: string | null = null;
    try {
      const [obraRes, abastechRes] = await Promise.all([
        obraSettings?.logo_url ? loadImageAsBase64(obraSettings.logo_url) : Promise.resolve(null),
        loadImageAsBase64('/logo-consorcio-header.png'),
      ]);
      obraLogoBase64 = obraRes;
      abastechLogoBase64 = abastechRes;
    } catch { /* ignore */ }

    // ═══════════════════════════════════════════════════
    // HELPER: Draw page header
    // ═══════════════════════════════════════════════════
    const drawPageHeader = (title: string, subtitle?: string) => {
      // Navy gradient header
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 32, 'F');
      // Accent line
      doc.setFillColor(220, 38, 38);
      doc.rect(0, 32, pageWidth, 1.5, 'F');

      // Logos
      let logoX = margin;
      if (obraLogoBase64) {
        try { doc.addImage(obraLogoBase64, 'PNG', logoX, 4, 24, 24); logoX += 28; } catch { /* skip */ }
      }

      // Title
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, logoX, 14);
      
      if (subtitle) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(203, 213, 225);
        doc.text(subtitle, logoX, 22);
      }

      // Right side info
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.setFont('helvetica', 'normal');
      const rightX = pageWidth - margin;
      doc.text(`Período: ${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`, rightX, 12, { align: 'right' });
      doc.text(`Gerado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, rightX, 18, { align: 'right' });

      // Abastech logo bottom-right
      if (abastechLogoBase64) {
        try { doc.addImage(abastechLogoBase64, 'PNG', pageWidth - margin - 20, 22, 20, 8); } catch { /* skip */ }
      }

      return 38; // Y position after header
    };

    // ═══════════════════════════════════════════════════
    // HELPER: Draw section title bar
    // ═══════════════════════════════════════════════════
    const drawSectionTitle = (yPos: number, title: string, color: [number, number, number], count?: number) => {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(margin, yPos, contentWidth, 8, 1, 1, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin + 4, yPos + 5.5);
      if (count !== undefined) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`(${count} registros)`, margin + doc.getTextWidth(title) + 8, yPos + 5.5);
      }
      return yPos + 10;
    };

    // ═══════════════════════════════════════════════════
    // PAGE 1: Cover + Summary + Timeline
    // ═══════════════════════════════════════════════════
    let yPos = drawPageHeader(
      obraSettings?.nome ? `${obraSettings.nome.toUpperCase()}` : 'HISTÓRICO DO EQUIPAMENTO',
      `${vehicleCode} — ${vehicleDescription}`
    );

    // Vehicle info card
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos, contentWidth, 14, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, yPos, contentWidth, 14, 2, 2, 'S');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);

    const infoItems = [
      { label: 'Código', value: vehicleCode },
      { label: 'Descrição', value: vehicleDescription },
      { label: 'Categoria', value: vehicleCategory },
      { label: 'Empresa', value: vehicleEmpresa },
    ];
    const infoColW = contentWidth / infoItems.length;
    infoItems.forEach((item, i) => {
      const x = margin + infoColW * i + 4;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(item.label.toUpperCase(), x, yPos + 5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(9);
      doc.text(item.value || '-', x, yPos + 11);
    });

    yPos += 18;

    // ─── KPI Summary Cards ───
    yPos = drawSectionTitle(yPos, 'RESUMO DO PERÍODO', [30, 41, 59]);

    const kpiCards = [
      { label: 'Diesel', value: `${summary.totalDiesel.toFixed(1)} L`, sub: `${summary.fuelRecordCount} abast.`, color: [220, 38, 38] as [number, number, number] },
      { label: 'ARLA', value: `${summary.totalArla.toFixed(1)} L`, sub: '', color: [234, 179, 8] as [number, number, number] },
      { label: 'Óleo', value: `${summary.totalOil.toFixed(1)} L`, sub: `${summary.lubricantCount} lubrif.`, color: [217, 119, 6] as [number, number, number] },
      { label: 'Horímetro', value: `${summary.latestHorimeter.toFixed(0)} h`, sub: `+${summary.horimeterInterval.toFixed(0)} h período`, color: [37, 99, 235] as [number, number, number] },
      { label: 'Consumo', value: `${summary.consumption.toFixed(2)} L/h`, sub: '', color: [22, 163, 74] as [number, number, number] },
      { label: 'OS', value: `${summary.osCount}`, sub: `${summary.osCompleted} finalizadas`, color: [147, 51, 234] as [number, number, number] },
      { label: 'Dias Ativos', value: `${summary.daysWithActivity}`, sub: 'com atividade', color: [20, 184, 166] as [number, number, number] },
      { label: 'Leituras', value: `${summary.horimeterReadingCount}`, sub: 'horímetros', color: [100, 116, 139] as [number, number, number] },
    ];

    const cardW = (contentWidth - 7 * 3) / 8; // 8 cards, 3px gap
    const cardH = 18;
    kpiCards.forEach((card, i) => {
      const x = margin + i * (cardW + 3);
      // Card background
      doc.setFillColor(card.color[0], card.color[1], card.color[2]);
      doc.roundedRect(x, yPos, cardW, cardH, 1.5, 1.5, 'F');
      // Label
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text(card.label.toUpperCase(), x + 2.5, yPos + 4.5);
      // Value
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(card.value, x + 2.5, yPos + 11);
      // Sub
      if (card.sub) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'normal');
        doc.text(card.sub, x + 2.5, yPos + 15.5);
      }
    });

    yPos += cardH + 6;

    // ─── Timeline Table ───
    yPos = drawSectionTitle(yPos, `LINHA DO TEMPO — DIA A DIA`, [15, 23, 42], activeDays.length);

    const timelineHeaders = ['Data', 'Diesel (L)', 'ARLA (L)', 'Óleo (L)', 'Horímetro', 'KM', 'H.T.', 'OS', 'Status OS', 'Operador'];
    
    const timelineData = activeDays.map(day => {
      const operators = [...new Set([
        ...day.fuelRecords.map(r => r.operator_name).filter(Boolean),
        ...day.horimeterReadings.map(r => r.operator).filter(Boolean),
      ])];
      return [
        format(day.date, 'dd/MM/yyyy'),
        day.totalDiesel > 0 ? day.totalDiesel.toFixed(1) : '-',
        day.totalArla > 0 ? day.totalArla.toFixed(1) : '-',
        day.totalOil > 0 ? day.totalOil.toFixed(1) : '-',
        day.horimeterValue ? day.horimeterValue.toFixed(0) : '-',
        day.kmValue ? day.kmValue.toFixed(0) : '-',
        day.horimeterInterval > 0 ? `${day.horimeterInterval.toFixed(0)}` : '-',
        day.osCount > 0 ? day.osCount.toString() : '-',
        day.osStatus || '-',
        (operators[0] || '-').substring(0, 18),
      ];
    });

    autoTable(doc, {
      head: [timelineHeaders],
      body: timelineData,
      startY: yPos,
      styles: { fontSize: 6.5, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.2 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { halign: 'right', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 16 },
        4: { halign: 'right', cellWidth: 22 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'center', cellWidth: 16 },
        7: { halign: 'center', cellWidth: 12 },
        8: { cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        // Diesel in red
        if (data.column.index === 1 && data.cell.text[0] !== '-') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
        // H.T. in green
        if (data.column.index === 6 && data.cell.text[0] !== '-') {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        }
        // OS count in purple
        if (data.column.index === 7 && data.cell.text[0] !== '-') {
          data.cell.styles.textColor = [147, 51, 234];
          data.cell.styles.fontStyle = 'bold';
        }
        // Status colors
        if (data.column.index === 8) {
          const status = data.cell.text[0];
          if (status === 'Finalizada') data.cell.styles.textColor = [22, 163, 74];
          else if (['Aberta', 'Em Andamento', 'Aguardando Peças'].includes(status)) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    // ═══════════════════════════════════════════════════
    // PAGE 2: Abastecimentos Detail
    // ═══════════════════════════════════════════════════
    if (fuelRecords.length > 0) {
      doc.addPage();
      let fuelY = drawPageHeader(
        'RELATÓRIO DE ABASTECIMENTOS',
        `${vehicleCode} — ${vehicleDescription}`
      );

      // Quick stats bar
      doc.setFillColor(254, 242, 242);
      doc.roundedRect(margin, fuelY, contentWidth, 10, 1.5, 1.5, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(127, 29, 29);
      const fuelStats = [
        `Total Diesel: ${summary.totalDiesel.toFixed(1)} L`,
        `Total ARLA: ${summary.totalArla.toFixed(1)} L`,
        `Total Óleo: ${summary.totalOil.toFixed(1)} L`,
        `Abastecimentos: ${summary.fuelRecordCount}`,
        `Consumo: ${summary.consumption.toFixed(2)} L/h`,
      ];
      const statW = contentWidth / fuelStats.length;
      fuelStats.forEach((stat, i) => {
        doc.text(stat, margin + statW * i + 3, fuelY + 6.5);
      });
      fuelY += 14;

      fuelY = drawSectionTitle(fuelY, 'DETALHAMENTO DE ABASTECIMENTOS', [220, 38, 38], fuelRecords.length);

      const fuelHeaders = ['Data', 'Hora', 'Tipo', 'Diesel (L)', 'ARLA (L)', 'Óleo (L)', 'Horímetro', 'KM', 'Operador', 'Local'];
      const fuelData = fuelRecords.map(r => [
        format(new Date(r.record_date), 'dd/MM/yyyy'),
        r.record_time?.substring(0, 5) || '-',
        r.record_type === 'saida' ? 'Saída' : 'Entrada',
        r.fuel_quantity?.toFixed(1) || '-',
        r.arla_quantity?.toFixed(1) || '-',
        r.oil_quantity?.toFixed(1) || '-',
        r.horimeter_current?.toFixed(0) || '-',
        r.km_current?.toFixed(0) || '-',
        (r.operator_name || '-').substring(0, 18),
        (r.location || '-').substring(0, 18),
      ]);

      // Totals row
      const totalFuelQty = fuelRecords.filter(r => r.record_type === 'saida').reduce((s, r) => s + (r.fuel_quantity || 0), 0);
      const totalArlaQty = fuelRecords.filter(r => r.record_type === 'saida').reduce((s, r) => s + (r.arla_quantity || 0), 0);
      const totalOilQty = fuelRecords.filter(r => r.record_type === 'saida').reduce((s, r) => s + (r.oil_quantity || 0), 0);
      fuelData.push(['TOTAL', '', '', totalFuelQty.toFixed(1), totalArlaQty.toFixed(1), totalOilQty.toFixed(1), '', '', '', '']);

      autoTable(doc, {
        head: [fuelHeaders],
        body: fuelData,
        startY: fuelY,
        styles: { fontSize: 6.5, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 14 },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
          4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 16, halign: 'right' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 20, halign: 'right' },
        },
        didParseCell: (data) => {
          // Bold totals row
          if (data.section === 'body' && data.row.index === fuelData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [254, 226, 226];
            data.cell.styles.textColor = [127, 29, 29];
          }
          // Tipo color
          if (data.column.index === 2 && data.section === 'body') {
            if (data.cell.text[0] === 'Entrada') data.cell.styles.textColor = [22, 163, 74];
            else if (data.cell.text[0] === 'Saída') data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // PAGE 3: Horímetros Detail
    // ═══════════════════════════════════════════════════
    if (horimeterReadings.length > 0) {
      doc.addPage();
      let horY = drawPageHeader(
        'RELATÓRIO DE HORÍMETROS',
        `${vehicleCode} — ${vehicleDescription}`
      );

      // Stats bar
      doc.setFillColor(239, 246, 255);
      doc.roundedRect(margin, horY, contentWidth, 10, 1.5, 1.5, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 64, 175);
      const horStats = [
        `Horímetro Atual: ${summary.latestHorimeter.toFixed(0)} h`,
        `Intervalo Período: +${summary.horimeterInterval.toFixed(0)} h`,
        `Total Leituras: ${summary.horimeterReadingCount}`,
      ];
      horStats.forEach((stat, i) => {
        doc.text(stat, margin + (contentWidth / horStats.length) * i + 3, horY + 6.5);
      });
      horY += 14;

      horY = drawSectionTitle(horY, 'DETALHAMENTO DE LEITURAS', [37, 99, 235], horimeterReadings.length);

      const horHeaders = ['Data', 'Hor. Anterior', 'Hor. Atual', 'H.T.', 'KM Anterior', 'KM Atual', 'Total KM', 'Operador', 'Observações'];
      const horData = horimeterReadings.map(r => {
        const ht = (r.current_value || 0) - (r.previous_value || 0);
        const totalKm = (r.current_km || 0) - (r.previous_km || 0);
        return [
          format(new Date(r.reading_date), 'dd/MM/yyyy'),
          r.previous_value?.toFixed(0) || '-',
          r.current_value?.toFixed(0) || '-',
          ht > 0 ? ht.toFixed(0) : '-',
          r.previous_km?.toFixed(0) || '-',
          r.current_km?.toFixed(0) || '-',
          totalKm > 0 ? totalKm.toFixed(0) : '-',
          (r.operator || '-').substring(0, 18),
          (r.observations || '-').substring(0, 30),
        ];
      });

      autoTable(doc, {
        head: [horHeaders],
        body: horData,
        startY: horY,
        styles: { fontSize: 6.5, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [239, 246, 255] },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 24, halign: 'right' },
          2: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 18, halign: 'center' },
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          // H.T. green
          if (data.column.index === 3 && data.cell.text[0] !== '-') {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = 'bold';
          }
          // Total KM blue
          if (data.column.index === 6 && data.cell.text[0] !== '-') {
            data.cell.styles.textColor = [37, 99, 235];
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // PAGE 4: Manutenção Detail
    // ═══════════════════════════════════════════════════
    if (serviceOrders.length > 0) {
      doc.addPage();
      let osY = drawPageHeader(
        'RELATÓRIO DE MANUTENÇÃO',
        `${vehicleCode} — ${vehicleDescription}`
      );

      // Stats bar
      doc.setFillColor(255, 251, 235);
      doc.roundedRect(margin, osY, contentWidth, 10, 1.5, 1.5, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(146, 64, 14);
      const osStats = [
        `Total OS: ${summary.osCount}`,
        `Finalizadas: ${summary.osCompleted}`,
        `Em Andamento: ${summary.osInProgress}`,
      ];
      osStats.forEach((stat, i) => {
        doc.text(stat, margin + (contentWidth / osStats.length) * i + 3, osY + 6.5);
      });
      osY += 14;

      osY = drawSectionTitle(osY, 'ORDENS DE SERVIÇO', [245, 158, 11], serviceOrders.length);

      const osHeaders = ['OS', 'Entrada', 'Saída', 'Tipo', 'Prioridade', 'Status', 'Problema', 'Solução', 'Mecânico', 'Hor./KM'];
      const osData = serviceOrders.map(o => {
        const entryDate = o.entry_date ? format(new Date(o.entry_date), 'dd/MM/yyyy') : '-';
        const endDate = o.end_date ? format(new Date(o.end_date), 'dd/MM/yyyy') : '-';
        return [
          o.order_number,
          entryDate,
          endDate,
          o.order_type || '-',
          o.priority || '-',
          o.status,
          (o.problem_description || '-').substring(0, 30),
          (o.solution_description || '-').substring(0, 30),
          o.mechanic_name || '-',
          o.horimeter_current?.toFixed(0) || o.km_current?.toFixed(0) || '-',
        ];
      });

      autoTable(doc, {
        head: [osHeaders],
        body: osData,
        startY: osY,
        styles: { fontSize: 6.5, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.2 },
        headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [255, 251, 235] },
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 18, fontStyle: 'bold' },
          1: { cellWidth: 22 },
          2: { cellWidth: 22 },
          3: { cellWidth: 22 },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 22 },
          6: { cellWidth: 45 },
          7: { cellWidth: 45 },
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          // Status colors
          if (data.column.index === 5) {
            const status = data.cell.text[0];
            if (status === 'Finalizada') {
              data.cell.styles.textColor = [22, 163, 74];
              data.cell.styles.fontStyle = 'bold';
            } else if (['Aberta', 'Em Andamento', 'Aguardando Peças'].includes(status)) {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Priority colors
          if (data.column.index === 4) {
            const priority = data.cell.text[0];
            if (priority === 'Urgente') { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = 'bold'; }
            else if (priority === 'Alta') { data.cell.styles.textColor = [234, 88, 12]; }
          }
        },
      });
    }

    // ═══════════════════════════════════════════════════
    // Footer on all pages
    // ═══════════════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      // Footer line
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      // Left text
      doc.setTextColor(148, 163, 184);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text('Sistema Abastech — Gestão de Equipamentos', margin, pageHeight - 7);
      // Center
      doc.text('Desenvolvido por Jean Campos', pageWidth / 2, pageHeight - 7, { align: 'center' });
      // Right
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
    }

    doc.save(`historico_${vehicleCode}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; icon: React.ReactNode }> = {
      'Aberta': { color: 'bg-blue-100 text-blue-700', icon: <Clock className="w-3 h-3" /> },
      'Em Andamento': { color: 'bg-amber-100 text-amber-700', icon: <RefreshCw className="w-3 h-3" /> },
      'Aguardando Peças': { color: 'bg-yellow-100 text-yellow-700', icon: <AlertTriangle className="w-3 h-3" /> },
      'Finalizada': { color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    };
    const info = statusMap[status] || statusMap['Aberta'];
    return (
      <Badge variant="secondary" className={cn("gap-1", info.color)}>
        {info.icon}
        {status}
      </Badge>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center">
                  <Car className="w-5 h-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">
                    {vehicleCode} - {vehicleDescription}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {vehicleCategory} • {vehicleEmpresa}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowColumnConfig(true)} className="gap-2">
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Colunas</span>
                </Button>
                <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-2">
                  <Download className="w-4 h-4" />
                  PDF
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Period Filter */}
          <div className="flex flex-wrap items-center gap-3 py-3 border-b shrink-0">
            <span className="text-sm font-medium text-muted-foreground">Período:</span>
            <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7days">Últimos 7 dias</SelectItem>
                <SelectItem value="30days">Últimos 30 dias</SelectItem>
                <SelectItem value="90days">Últimos 90 dias</SelectItem>
                <SelectItem value="month">Mês atual</SelectItem>
                <SelectItem value="all">Todo Período</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {periodFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Calendar className="w-4 h-4" />
                      {customDateStart ? format(customDateStart, 'dd/MM/yyyy') : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={customDateStart}
                      onSelect={setCustomDateStart}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">até</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Calendar className="w-4 h-4" />
                      {customDateEnd ? format(customDateEnd, 'dd/MM/yyyy') : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={customDateEnd}
                      onSelect={setCustomDateEnd}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={fetchAllData} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>

          {/* Content */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="shrink-0 grid w-full grid-cols-5">
              <TabsTrigger value="timeline" className="gap-2">
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">Linha do Tempo</span>
              </TabsTrigger>
              <TabsTrigger value="resumo" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                <span className="hidden sm:inline">Resumo</span>
              </TabsTrigger>
              <TabsTrigger value="abastecimento" className="gap-2">
                <Fuel className="w-4 h-4" />
                <span className="hidden sm:inline">Abastecimentos</span>
              </TabsTrigger>
              <TabsTrigger value="horimetro" className="gap-2">
                <Gauge className="w-4 h-4" />
                <span className="hidden sm:inline">Horímetros</span>
              </TabsTrigger>
              <TabsTrigger value="manutencao" className="gap-2">
                <Wrench className="w-4 h-4" />
                <span className="hidden sm:inline">Manutenção</span>
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 mt-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Timeline Tab - DETAILED DAY-BY-DAY VIEW */}
                  <TabsContent value="timeline" className="m-0">
                    {activeDays.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        Nenhuma atividade registrada no período
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeDays.map((day) => (
                          <div key={day.dateStr} className="border rounded-lg overflow-hidden">
                            {/* Day Header */}
                            <div className={cn(
                              "flex items-center justify-between px-4 py-2 font-medium text-sm",
                              day.osCount > 0 
                                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200" 
                                : "bg-muted/60"
                            )}>
                              <div className="flex items-center gap-3">
                                <Calendar className="w-4 h-4" />
                                <span className="font-bold">{format(day.date, "EEEE, dd/MM/yyyy", { locale: ptBR })}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                {day.totalDiesel > 0 && (
                                  <span className="flex items-center gap-1 text-red-600">
                                    <Fuel className="w-3 h-3" /> {day.totalDiesel.toFixed(1)} L
                                  </span>
                                )}
                                {day.horimeterInterval > 0 && (
                                  <span className="flex items-center gap-1 text-emerald-600">
                                    <Gauge className="w-3 h-3" /> +{day.horimeterInterval.toFixed(0)} h
                                  </span>
                                )}
                                {day.dailyConsumption != null && (
                                  <span className="flex items-center gap-1 text-green-700 dark:text-green-400 font-semibold bg-green-100 dark:bg-green-950/40 px-1.5 py-0.5 rounded">
                                    <TrendingUp className="w-3 h-3" /> {day.dailyConsumption.toFixed(2)} L/h
                                  </span>
                                )}
                                {day.osCount > 0 && (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <Wrench className="w-3 h-3" /> {day.osCount} OS
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Day Content - Individual Records */}
                            <div className="divide-y">
                              {/* Fuel Records */}
                              {day.fuelRecords.map((record) => (
                                <div key={record.id} className="px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm hover:bg-muted/30">
                                  <div className="flex items-center gap-2 min-w-[90px]">
                                    <Fuel className="w-3.5 h-3.5 text-red-500" />
                                    <span className="text-xs text-muted-foreground">{record.record_time?.substring(0, 5) || '--:--'}</span>
                                    <Badge variant={record.record_type === 'saida' ? 'destructive' : 'default'} className="text-[10px] h-5">
                                      {record.record_type === 'saida' ? 'Saída' : 'Entrada'}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Diesel:</span>
                                    <span className="font-semibold text-red-600">{record.fuel_quantity?.toFixed(1) || '-'} L</span>
                                  </div>
                                  {(record.arla_quantity ?? 0) > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">ARLA:</span>
                                      <span className="font-medium">{record.arla_quantity?.toFixed(1)} L</span>
                                    </div>
                                  )}
                                  {(record.oil_quantity ?? 0) > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Óleo:</span>
                                      <span className="font-medium">{record.oil_quantity?.toFixed(1)} L</span>
                                    </div>
                                  )}
                                  {record.horimeter_previous != null && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Hor:</span>
                                      <span className="text-muted-foreground">{record.horimeter_previous?.toFixed(0)}</span>
                                      <span className="text-xs">→</span>
                                      <span className="font-medium">{record.horimeter_current?.toFixed(0)}</span>
                                      {record.horimeter_current && record.horimeter_previous && (
                                        <span className="text-emerald-600 text-xs font-medium">
                                          (+{(record.horimeter_current - record.horimeter_previous).toFixed(0)})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {record.km_previous != null && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">KM:</span>
                                      <span className="text-muted-foreground">{record.km_previous?.toFixed(0)}</span>
                                      <span className="text-xs">→</span>
                                      <span className="font-medium">{record.km_current?.toFixed(0)}</span>
                                      {record.km_current && record.km_previous && (
                                        <span className="text-blue-600 text-xs font-medium">
                                          (+{(record.km_current - record.km_previous).toFixed(0)})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {record.operator_name && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Op:</span>
                                      <span className="text-xs truncate max-w-[100px]">{record.operator_name}</span>
                                    </div>
                                  )}
                                  {record.location && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Local:</span>
                                      <span className="text-xs truncate max-w-[80px]">{record.location}</span>
                                    </div>
                                  )}
                                </div>
                              ))}

                              {/* Horimeter Readings (not from fuel) */}
                              {day.horimeterReadings.map((reading) => (
                                <div key={reading.id} className="px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm hover:bg-muted/30 bg-blue-50/30 dark:bg-blue-950/10">
                                  <div className="flex items-center gap-2 min-w-[90px]">
                                    <Gauge className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Leitura</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Hor:</span>
                                    <span className="text-muted-foreground">{reading.previous_value?.toFixed(0) || '-'}</span>
                                    <span className="text-xs">→</span>
                                    <span className="font-semibold">{reading.current_value?.toFixed(0)}</span>
                                    {reading.previous_value != null && (
                                      <span className="text-emerald-600 text-xs font-medium">
                                        (+{(reading.current_value - (reading.previous_value || 0)).toFixed(0)})
                                      </span>
                                    )}
                                  </div>
                                  {reading.current_km != null && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">KM:</span>
                                      <span className="text-muted-foreground">{reading.previous_km?.toFixed(0) || '-'}</span>
                                      <span className="text-xs">→</span>
                                      <span className="font-medium">{reading.current_km?.toFixed(0)}</span>
                                      {reading.previous_km != null && (
                                        <span className="text-blue-600 text-xs font-medium">
                                          (+{(reading.current_km - (reading.previous_km || 0)).toFixed(0)})
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {reading.operator && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Op:</span>
                                      <span className="text-xs">{reading.operator}</span>
                                    </div>
                                  )}
                                  {reading.observations && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Obs:</span>
                                      <span className="text-xs truncate max-w-[150px]">{reading.observations}</span>
                                    </div>
                                  )}
                                </div>
                              ))}

                              {/* Service Orders */}
                              {day.serviceOrders.map((order) => (
                                <div key={order.id} className="px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm hover:bg-muted/30 bg-amber-50/30 dark:bg-amber-950/10">
                                  <div className="flex items-center gap-2 min-w-[90px]">
                                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="font-bold text-xs">{order.order_number}</span>
                                  </div>
                                  {getStatusBadge(order.status)}
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-muted-foreground">Tipo:</span>
                                    <span className="text-xs">{order.order_type}</span>
                                  </div>
                                  {order.problem_description && (
                                    <div className="flex items-center gap-1 flex-1 min-w-[150px]">
                                      <span className="text-xs text-muted-foreground">Problema:</span>
                                      <span className="text-xs truncate">{order.problem_description}</span>
                                    </div>
                                  )}
                                  {order.mechanic_name && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Mecânico:</span>
                                      <span className="text-xs">{order.mechanic_name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Resumo Tab */}
                  <TabsContent value="resumo" className="m-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Diesel */}
                      <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-red-100 text-xs font-medium uppercase">
                          <Fuel className="w-4 h-4" />
                          Total Diesel
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.totalDiesel.toFixed(1)} L</p>
                        <p className="text-xs text-red-200 mt-1">{summary.fuelRecordCount} abastecimentos</p>
                      </div>

                      {/* ARLA */}
                      <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-yellow-100 text-xs font-medium uppercase">
                          <Droplets className="w-4 h-4" />
                          Total ARLA
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.totalArla.toFixed(1)} L</p>
                      </div>

                      {/* Óleo */}
                      <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-amber-100 text-xs font-medium uppercase">
                          <Droplets className="w-4 h-4" />
                          Total Óleo
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.totalOil.toFixed(1)} L</p>
                        <p className="text-xs text-amber-200 mt-1">+ {summary.lubricantCount} lubrificações</p>
                      </div>

                      {/* Horímetro */}
                      <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-blue-100 text-xs font-medium uppercase">
                          <Gauge className="w-4 h-4" />
                          Horímetro Atual
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.latestHorimeter.toFixed(0)} h</p>
                        <p className="text-xs text-blue-200 mt-1">+{summary.horimeterInterval.toFixed(0)} h no período</p>
                      </div>

                      {/* Consumo */}
                      <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium uppercase">
                          <Activity className="w-4 h-4" />
                          Consumo Médio
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.consumption.toFixed(2)} L/h</p>
                      </div>

                      {/* OS Total */}
                      <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-purple-100 text-xs font-medium uppercase">
                          <Wrench className="w-4 h-4" />
                          Ordens Serviço
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.osCount}</p>
                        <p className="text-xs text-purple-200 mt-1">{summary.osCompleted} finalizadas</p>
                      </div>

                      {/* Dias Ativos */}
                      <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-teal-100 text-xs font-medium uppercase">
                          <Calendar className="w-4 h-4" />
                          Dias Ativos
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.daysWithActivity}</p>
                        <p className="text-xs text-teal-200 mt-1">com atividade</p>
                      </div>

                      {/* Leituras */}
                      <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-4 text-white">
                        <div className="flex items-center gap-2 text-gray-100 text-xs font-medium uppercase">
                          <Clock className="w-4 h-4" />
                          Leituras Hor.
                        </div>
                        <p className="text-2xl font-bold mt-2">{summary.horimeterReadingCount}</p>
                        <p className="text-xs text-gray-200 mt-1">registros</p>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Abastecimento Tab */}
                  <TabsContent value="abastecimento" className="m-0">
                    {fuelRecords.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        Nenhum registro de abastecimento no período
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Data</TableHead>
                              <TableHead>Hora</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead className="text-right">Diesel (L)</TableHead>
                              <TableHead className="text-right">ARLA (L)</TableHead>
                              <TableHead className="text-right">Óleo (L)</TableHead>
                              <TableHead className="text-right">Horímetro</TableHead>
                              <TableHead>Operador</TableHead>
                              <TableHead>Local</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fuelRecords.map((record) => (
                              <TableRow key={record.id}>
                                <TableCell>{format(new Date(record.record_date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{record.record_time?.substring(0, 5)}</TableCell>
                                <TableCell>
                                  <Badge variant={record.record_type === 'saida' ? 'destructive' : 'default'}>
                                    {record.record_type === 'saida' ? 'Saída' : 'Entrada'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {record.fuel_quantity?.toFixed(1) || '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {record.arla_quantity?.toFixed(1) || '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {record.oil_quantity?.toFixed(1) || '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {record.horimeter_current?.toFixed(0) || record.km_current?.toFixed(0) || '-'}
                                </TableCell>
                                <TableCell className="max-w-[100px] truncate">
                                  {record.operator_name || '-'}
                                </TableCell>
                                <TableCell className="max-w-[100px] truncate">
                                  {record.location || '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Horímetro Tab */}
                  <TabsContent value="horimetro" className="m-0">
                    {horimeterReadings.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        Nenhuma leitura de horímetro no período
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Data</TableHead>
                              <TableHead className="text-right">Anterior</TableHead>
                              <TableHead className="text-right">Atual</TableHead>
                              <TableHead className="text-right">Intervalo</TableHead>
                              <TableHead className="text-right">KM Anterior</TableHead>
                              <TableHead className="text-right">KM Atual</TableHead>
                              <TableHead>Operador</TableHead>
                              <TableHead>Observações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {horimeterReadings.map((reading) => (
                              <TableRow key={reading.id}>
                                <TableCell>{format(new Date(reading.reading_date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell className="text-right">
                                  {reading.previous_value?.toFixed(0) || '-'}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {reading.current_value?.toFixed(0)}
                                </TableCell>
                                <TableCell className="text-right text-emerald-600 font-medium">
                                  +{((reading.current_value || 0) - (reading.previous_value || 0)).toFixed(0)}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {reading.previous_km?.toFixed(0) || '-'}
                                </TableCell>
                                <TableCell className="text-right font-medium text-blue-600">
                                  {reading.current_km?.toFixed(0) || '-'}
                                </TableCell>
                                <TableCell>{reading.operator || '-'}</TableCell>
                                <TableCell className="max-w-[150px] truncate">
                                  {reading.observations || '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* Manutenção Tab */}
                  <TabsContent value="manutencao" className="m-0">
                    {serviceOrders.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        Nenhuma ordem de serviço no período
                      </div>
                    ) : (
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>OS</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Problema</TableHead>
                              <TableHead>Mecânico</TableHead>
                              <TableHead className="text-right">Hor./KM</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {serviceOrders.map((order) => (
                              <TableRow key={order.id}>
                                <TableCell className="font-medium">{order.order_number}</TableCell>
                                <TableCell>{format(new Date(order.order_date), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{order.order_type}</TableCell>
                                <TableCell>{getStatusBadge(order.status)}</TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {order.problem_description || '-'}
                                </TableCell>
                                <TableCell>{order.mechanic_name || '-'}</TableCell>
                                <TableCell className="text-right">
                                  {order.horimeter_current?.toFixed(0) || order.km_current?.toFixed(0) || '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                </>
              )}
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Column Configuration Modal */}
      <ColumnConfigModal
        open={showColumnConfig}
        onClose={() => setShowColumnConfig(false)}
        columns={timelineColumns}
        onSave={saveTimelinePrefs}
        onReset={resetTimelinePrefs}
        moduleName="Linha do Tempo"
      />
    </>
  );
}
