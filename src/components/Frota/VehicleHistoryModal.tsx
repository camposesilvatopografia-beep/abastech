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
  Settings,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { getSheetData } from '@/lib/googleSheets';
import { parsePtBRNumber } from '@/lib/ptBRNumber';
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
  const [activeTab, setActiveTab] = useState('abastecimento');
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

      // Helper to normalize vehicle codes for comparison
      const normalizeCode = (code: string) => code.replace(/\s+/g, '').trim().toUpperCase();
      const normalizedVehicleCode = normalizeCode(vehicleCode);

      // Helper to parse sheet dates (dd/MM/yyyy or yyyy-MM-dd)
      const parseSheetDate = (dateVal: any): string | null => {
        if (!dateVal) return null;
        const str = String(dateVal).trim();
        // dd/MM/yyyy
        const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (match) return `${match[3]}-${match[2]}-${match[1]}`;
        // yyyy-MM-dd
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        // Google Sheets serial number
        const num = Number(str);
        if (num > 40000 && num < 60000) {
          const d = new Date((num - 25569) * 86400000);
          return format(d, 'yyyy-MM-dd');
        }
        return null;
      };

      // ─── 1. Fetch from Supabase (DB) ───
      const [fuelDbResult, vehicleDbResult, serviceByEntryResult, serviceByOrderResult] = await Promise.all([
        supabase
          .from('field_fuel_records')
          .select('*')
          .eq('vehicle_code', vehicleCode)
          .gte('record_date', startDate)
          .lte('record_date', endDate)
          .order('record_date', { ascending: false })
          .order('record_time', { ascending: false }),
        supabase
          .from('vehicles')
          .select('id, code')
          .order('code'),
        supabase
          .from('service_orders')
          .select('*')
          .eq('vehicle_code', vehicleCode)
          .gte('entry_date', startDate)
          .lte('entry_date', endDate)
          .order('entry_date', { ascending: false }),
        supabase
          .from('service_orders')
          .select('*')
          .eq('vehicle_code', vehicleCode)
          .is('entry_date', null)
          .gte('order_date', startDate)
          .lte('order_date', endDate)
          .order('order_date', { ascending: false }),
      ]);

      let horimeterDbData: HorimeterReading[] = [];
      // Find vehicle by normalized code match
      const vehicleMatch = (vehicleDbResult.data || []).find(v => 
        v.code.replace(/\s+/g, '').trim().toUpperCase() === normalizedVehicleCode
      );
      if (vehicleMatch?.id) {
        const { data } = await supabase
          .from('horimeter_readings')
          .select('*')
          .eq('vehicle_id', vehicleMatch.id)
          .gte('reading_date', startDate)
          .lte('reading_date', endDate)
          .order('reading_date', { ascending: false });
        horimeterDbData = (data || []) as HorimeterReading[];
      }

      // ─── 2. Fetch from Google Sheets ───
      let sheetFuelRecords: FuelRecord[] = [];
      let sheetHorimeterReadings: HorimeterReading[] = [];

      try {
        const [abastSheet, horSheet] = await Promise.all([
          getSheetData('AbastecimentoCanteiro01', { noCache: true }),
          getSheetData('Horimetros', { noCache: true }),
        ]);

        // Parse AbastecimentoCanteiro01 rows
        const pn = parsePtBRNumber;
        for (const row of (abastSheet.rows || [])) {
          const rowCode = normalizeCode(String(row['VEICULO'] || row['Veiculo'] || row['CODIGO'] || ''));
          if (rowCode !== normalizedVehicleCode) continue;

          const recordDate = parseSheetDate(row['DATA'] || row['Data']);
          if (!recordDate || recordDate < startDate || recordDate > endDate) continue;

          const recordTime = String(row['HORA'] || row['Hora'] || row['HORARIO'] || '').trim().substring(0, 5) || '00:00';
          const tipoOp = String(row['TIPO'] || row['TIPO DE OPERACAO'] || '').toLowerCase();

          sheetFuelRecords.push({
            id: `sheet-fuel-${recordDate}-${recordTime}-${rowCode}`,
            record_date: recordDate,
            record_time: recordTime,
            fuel_quantity: pn(row['QUANTIDADE'] || row['Quantidade'] || 0),
            arla_quantity: pn(row['QUANTIDADE DE ARLA'] || row['ARLA'] || 0) || null,
            horimeter_current: pn(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || 0) || null,
            horimeter_previous: pn(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || 0) || null,
            km_current: pn(row['KM ATUAL'] || row['KM_ATUAL'] || 0) || null,
            km_previous: pn(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0) || null,
            oil_type: String(row['TIPO DE OLEO'] || '').trim() || null,
            oil_quantity: pn(row['QUANTIDADE DE OLEO'] || 0) || null,
            lubricant: String(row['LUBRIFICANTE'] || '').trim() || null,
            filter_blow_quantity: pn(row['SOPRA FILTRO'] || 0) || null,
            operator_name: String(row['MOTORISTA'] || row['OPERADOR'] || '').trim() || null,
            location: String(row['LOCAL'] || '').trim() || null,
            record_type: tipoOp.includes('entrada') ? 'entrada' : 'saida',
          });
        }

        // Parse Horimetros rows
        for (const row of (horSheet.rows || [])) {
          const rowCode = normalizeCode(String(row['VEICULO'] || row['Veiculo'] || row['EQUIPAMENTO'] || ''));
          if (rowCode !== normalizedVehicleCode) continue;

          const readingDate = parseSheetDate(row['DATA'] || row['Data'] || row[' Data']);
          if (!readingDate || readingDate < startDate || readingDate > endDate) continue;

          const getCol = (keys: string[]): any => {
            for (const key of keys) {
              if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
              if (row[key.trim()] !== undefined && row[key.trim()] !== null && row[key.trim()] !== '') return row[key.trim()];
            }
            return null;
          };

          sheetHorimeterReadings.push({
            id: `sheet-hor-${readingDate}-${rowCode}`,
            reading_date: readingDate,
            current_value: pn(getCol(['Hor_Atual', 'HOR_ATUAL', 'Hor. Atual'])),
            previous_value: pn(getCol(['Hor_Anterior', 'HOR_ANTERIOR', 'Hor. Anterior'])) || null,
            current_km: pn(getCol(['Km_Atual', 'KM_ATUAL', 'Km. Atual', 'KM Atual'])) || null,
            previous_km: pn(getCol(['Km_Anterior', 'KM_ANTERIOR', 'Km. Anterior', 'KM Anterior'])) || null,
            operator: String(row['OPERADOR'] || row['Operador'] || '').trim() || null,
            observations: String(row['OBS'] || row['Observacoes'] || '').trim() || null,
          });
        }
      } catch (sheetError) {
        console.warn('Could not fetch Google Sheets data for history, using DB only:', sheetError);
      }

      // ─── 3. Merge & Deduplicate ───
      // For fuel records: merge DB + sheet, dedupe by date+time+code
      const dbFuelRecords = (fuelDbResult.data || []) as FuelRecord[];
      const fuelDedupeMap = new Map<string, FuelRecord>();
      // DB records take priority
      for (const r of dbFuelRecords) {
        fuelDedupeMap.set(`${r.record_date}|${r.record_time}|${r.fuel_quantity}`, r);
      }
      for (const r of sheetFuelRecords) {
        const key = `${r.record_date}|${r.record_time}|${r.fuel_quantity}`;
        if (!fuelDedupeMap.has(key)) {
          fuelDedupeMap.set(key, r);
        }
      }
      const mergedFuel = Array.from(fuelDedupeMap.values())
        .sort((a, b) => b.record_date.localeCompare(a.record_date) || (b.record_time || '').localeCompare(a.record_time || ''));

      // For horimeter readings: merge DB + sheet, dedupe by date
      const horDedupeMap = new Map<string, HorimeterReading>();
      for (const r of horimeterDbData) {
        horDedupeMap.set(r.reading_date, r);
      }
      for (const r of sheetHorimeterReadings) {
        if (!horDedupeMap.has(r.reading_date)) {
          horDedupeMap.set(r.reading_date, r);
        }
      }
      const mergedHorimeters = Array.from(horDedupeMap.values())
        .sort((a, b) => b.reading_date.localeCompare(a.reading_date));

      // Service orders (DB only)
      const allOrders = [...(serviceByEntryResult.data || []), ...(serviceByOrderResult.data || [])];
      const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values());

      setFuelRecords(mergedFuel);
      setHorimeterReadings(mergedHorimeters);
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

  const exportToPDF = async (sections: ('abastecimento' | 'horimetro' | 'manutencao')[]) => {
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

    let isFirstPage = true;

    // ═══════════════════════════════════════════════════
    // PAGE 1: Abastecimentos Detail
    // ═══════════════════════════════════════════════════
    if (sections.includes('abastecimento') && fuelRecords.length > 0) {
      if (!isFirstPage) doc.addPage(); else isFirstPage = false;
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
    // PAGE 2: Horímetros / KM Detail
    // ═══════════════════════════════════════════════════
    if (sections.includes('horimetro') && horimeterReadings.length > 0) {
      if (!isFirstPage) doc.addPage(); else isFirstPage = false;
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
    // PAGE 3: Manutenção Detail
    // ═══════════════════════════════════════════════════
    if (sections.includes('manutencao') && serviceOrders.length > 0) {
      if (!isFirstPage) doc.addPage(); else isFirstPage = false;
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
        <DialogContent className="max-w-6xl max-h-[95vh] flex flex-col overflow-y-auto">
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
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1 bg-background" align="end">
                    <div className="flex flex-col">
                      <Button variant="ghost" size="sm" className="justify-start text-xs" onClick={() => exportToPDF(['abastecimento', 'horimetro', 'manutencao'])}>
                        <FileText className="w-3.5 h-3.5 mr-2" />
                        Todos
                      </Button>
                      <Button variant="ghost" size="sm" className="justify-start text-xs" onClick={() => exportToPDF(['abastecimento'])}>
                        <Fuel className="w-3.5 h-3.5 mr-2" />
                        Abastecimentos
                      </Button>
                      <Button variant="ghost" size="sm" className="justify-start text-xs" onClick={() => exportToPDF(['horimetro'])}>
                        <Gauge className="w-3.5 h-3.5 mr-2" />
                        Horímetros/KM
                      </Button>
                      <Button variant="ghost" size="sm" className="justify-start text-xs" onClick={() => exportToPDF(['manutencao'])}>
                        <Wrench className="w-3.5 h-3.5 mr-2" />
                        Manutenção
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
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
            <TabsList className="shrink-0 grid w-full grid-cols-3">
              <TabsTrigger value="abastecimento" className="gap-2">
                <Fuel className="w-4 h-4" />
                <span className="hidden sm:inline">Abastecimentos</span>
              </TabsTrigger>
              <TabsTrigger value="horimetro" className="gap-2">
                <Gauge className="w-4 h-4" />
                <span className="hidden sm:inline">Horímetros/KM</span>
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
                  {/* Horímetro/KM Tab */}
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
                              <TableHead className="text-right">Hor. Anterior</TableHead>
                              <TableHead className="text-right">Hor. Atual</TableHead>
                              <TableHead className="text-right">H.T.</TableHead>
                              <TableHead className="text-right">KM Anterior</TableHead>
                              <TableHead className="text-right">KM Atual</TableHead>
                              <TableHead className="text-right">Total KM</TableHead>
                              <TableHead>Operador</TableHead>
                              <TableHead>Observações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {horimeterReadings.map((reading) => {
                              const ht = (reading.current_value || 0) - (reading.previous_value || 0);
                              const totalKm = (reading.current_km || 0) - (reading.previous_km || 0);
                              return (
                                <TableRow key={reading.id}>
                                  <TableCell>{format(new Date(reading.reading_date), 'dd/MM/yyyy')}</TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {reading.previous_value != null ? reading.previous_value.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold">
                                    {reading.current_value?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-emerald-600">
                                    {ht > 0 ? ht.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right text-muted-foreground">
                                    {reading.previous_km != null ? reading.previous_km.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-blue-600">
                                    {reading.current_km != null ? reading.current_km.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-blue-600">
                                    {totalKm > 0 ? totalKm.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '-'}
                                  </TableCell>
                                  <TableCell className="max-w-[120px] truncate">{reading.operator || '-'}</TableCell>
                                  <TableCell className="max-w-[150px] truncate text-muted-foreground">
                                    {reading.observations || '-'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
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

                  {/* Manutenção Tab */}
                  <TabsContent value="manutencao" className="m-0">
                    {serviceOrders.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        Nenhuma ordem de serviço no período
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {serviceOrders.map((os) => {
                          const entryDate = os.entry_date ? format(new Date(os.entry_date), 'dd/MM/yyyy') : '-';
                          const endDate = os.end_date ? format(new Date(os.end_date), 'dd/MM/yyyy') : '-';
                          return (
                            <Collapsible key={os.id}>
                              <CollapsibleTrigger className="w-full">
                                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <div className="font-semibold text-sm">OS {os.order_number}</div>
                                    {getStatusBadge(os.status)}
                                    <span className="text-xs text-muted-foreground">{entryDate}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                      {os.problem_description || 'Sem descrição'}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-1 p-4 border rounded-lg bg-muted/30 space-y-3">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                    <div>
                                      <span className="text-muted-foreground text-xs">Tipo</span>
                                      <p className="font-medium">{os.order_type || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Prioridade</span>
                                      <p className="font-medium">{os.priority || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Entrada</span>
                                      <p className="font-medium">{entryDate}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Saída</span>
                                      <p className="font-medium">{endDate}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Mecânico</span>
                                      <p className="font-medium">{os.mechanic_name || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Horímetro</span>
                                      <p className="font-medium">{os.horimeter_current?.toFixed(0) || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">KM</span>
                                      <p className="font-medium">{os.km_current?.toFixed(0) || '-'}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground text-xs">Peças</span>
                                      <p className="font-medium">{os.parts_used || '-'}</p>
                                    </div>
                                  </div>
                                  {os.problem_description && (
                                    <div>
                                      <span className="text-muted-foreground text-xs">Problema</span>
                                      <p className="text-sm mt-0.5">{os.problem_description}</p>
                                    </div>
                                  )}
                                  {os.solution_description && (
                                    <div>
                                      <span className="text-muted-foreground text-xs">Solução</span>
                                      <p className="text-sm mt-0.5">{os.solution_description}</p>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
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
