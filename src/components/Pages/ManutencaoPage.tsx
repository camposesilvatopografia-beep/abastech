import { useState, useMemo, useEffect, useCallback } from 'react';

import { 
  Wrench,
  RefreshCw,
  FileText,
  Plus,
  Search,
  Calendar,
  ClipboardList,
  LayoutGrid,
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle,
  Edit,
  X,
  Save,
  Trash2,
  Printer,
  History,
  Timer,
  CalendarDays,
  Bell,
  MessageCircle,
  Download,
  Upload,
  Cloud,
  FileSpreadsheet,
  CloudOff,
  Play,
  Pause,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrazilianNumberInput } from '@/components/ui/brazilian-number-input';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { VehicleCombobox } from '@/components/ui/vehicle-combobox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format, startOfDay, endOfDay, isWithinInterval, subDays, startOfMonth, parse, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetData, useSheetData as useGoogleSheetData } from '@/hooks/useGoogleSheets';
import { createRow, updateRow, deleteRow, getSheetData } from '@/lib/googleSheets';
import { RecurringProblemsTab } from '@/components/Maintenance/RecurringProblemsTab';
import { MaintenanceRankingTab } from '@/components/Maintenance/MaintenanceRankingTab';
import { OSPhotoUpload } from '@/components/Maintenance/OSPhotoUpload';
import { useObraSettings } from '@/hooks/useObraSettings';

const ORDEM_SERVICO_SHEET = 'Ordem_Servico';

const TABS = [
  { id: 'ordens', label: 'Ordens de Serviço', icon: ClipboardList },
  { id: 'ranking', label: 'Ranking', icon: BarChart3 },
  { id: 'problemas', label: 'Problemas Recorrentes', icon: TrendingUp },
];

interface ServiceOrder {
  id: string;
  order_number: string;
  vehicle_code: string;
  vehicle_description: string | null;
  order_date: string;
  order_type: string;
  priority: string;
  status: string;
  problem_description: string | null;
  solution_description: string | null;
  mechanic_id: string | null;
  mechanic_name: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  parts_used: string | null;
  parts_cost: number | null;
  labor_cost: number | null;
  total_cost: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  entry_date: string | null;
  entry_time: string | null;
  horimeter_current: number | null;
  km_current: number | null;
  interval_days: number | null;
  photo_before_url: string | null;
  photo_after_url: string | null;
  photo_parts_url: string | null;
  photo_4_url: string | null;
  photo_5_url: string | null;
}

interface Mechanic {
  id: string;
  name: string;
  active: boolean;
}

export function ManutencaoPage() {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const { data: sheetOrdersData, refetch: refetchSheetOrders } = useGoogleSheetData(ORDEM_SERVICO_SHEET);
  const { settings: obraSettings } = useObraSettings();
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('ordens');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('manutencao'); // Default to show equipment in maintenance
  const [companyFilter, setCompanyFilter] = useState('all'); // Company filter
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Quick status change modal
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusChangeOrder, setStatusChangeOrder] = useState<ServiceOrder | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [exitDate, setExitDate] = useState('');
  const [exitTime, setExitTime] = useState('');
  
  // Vehicle history state
  const [vehicleHistory, setVehicleHistory] = useState<{
    totalOrders: number;
    totalHours: number;
    totalDays: number;
    lastOrder: ServiceOrder | null;
    category: string;
    company: string;
    lastHorimeter: number | null;
    lastKm: number | null;
  } | null>(null);
  
  // Horimeter validation state
  const [horimeterWarning, setHorimeterWarning] = useState<string | null>(null);
  const [kmWarning, setKmWarning] = useState<string | null>(null);
  
  // Custom status options
  const DEFAULT_STATUS_OPTIONS = [
    { value: 'Aberta', icon: '📋' },
    { value: 'Em Andamento', icon: '🔧' },
    { value: 'Aguardando Peças', icon: '📦' },
    { value: 'Aguardando Aprovação', icon: '⏳' },
    { value: 'Em Orçamento', icon: '💰' },
    { value: 'Pausada', icon: '⏸️' },
    { value: 'Cancelada', icon: '❌' },
    { value: 'Finalizada', icon: '✅' },
  ];
  
  const [customStatuses, setCustomStatuses] = useState<Array<{ value: string; icon: string }>>(() => {
    const saved = localStorage.getItem('os_custom_statuses');
    return saved ? JSON.parse(saved) : [];
  });
  const [newStatusInput, setNewStatusInput] = useState('');
  const [isAddingStatus, setIsAddingStatus] = useState(false);
  
  const allStatusOptions = [...DEFAULT_STATUS_OPTIONS, ...customStatuses];
  
  const handleAddCustomStatus = () => {
    const trimmed = newStatusInput.trim();
    if (!trimmed) return;
    
    // Check if already exists
    if (allStatusOptions.some(s => s.value.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Este status já existe');
      return;
    }
    
    const newStatus = { value: trimmed, icon: '🔹' };
    const updated = [...customStatuses, newStatus];
    setCustomStatuses(updated);
    localStorage.setItem('os_custom_statuses', JSON.stringify(updated));
    setNewStatusInput('');
    setIsAddingStatus(false);
    setFormData({ ...formData, status: trimmed });
    toast.success(`Status "${trimmed}" adicionado`);
  };
  
  const handleRemoveCustomStatus = (statusValue: string) => {
    const updated = customStatuses.filter(s => s.value !== statusValue);
    setCustomStatuses(updated);
    localStorage.setItem('os_custom_statuses', JSON.stringify(updated));
    toast.success(`Status "${statusValue}" removido`);
  };
  
  // Form state
  const [formData, setFormData] = useState({
    vehicle_code: '',
    vehicle_description: '',
    order_type: 'Corretiva',
    priority: 'Média',
    status: 'Aberta',
    problem_description: '',
    solution_description: '',
    mechanic_id: '',
    mechanic_name: '',
    estimated_hours: '',
    actual_hours: '',
    parts_used: '',
    parts_cost: '',
    labor_cost: '',
    notes: '',
    horimeter_current: '',
    km_current: '',
    entry_date: '',
    entry_time: '',
    exit_date: '',
    exit_time: '',
    interval_days: '90', // Default 90 days for preventive maintenance
    photo_before_url: null as string | null,
    photo_after_url: null as string | null,
    photo_parts_url: null as string | null,
    photo_4_url: null as string | null,
    photo_5_url: null as string | null,
  });

  // Fetch service orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select('*')
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err) {
      console.error('Error fetching orders:', err);
      toast.error('Erro ao carregar ordens de serviço');
    } finally {
      setLoading(false);
    }
  };

  // Fetch mechanics
  const fetchMechanics = async () => {
    try {
      const { data, error } = await supabase
        .from('mechanics')
        .select('id, name, active')
        .eq('active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setMechanics(data || []);
    } catch (err) {
      console.error('Error fetching mechanics:', err);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchMechanics();
  }, []);

  // Real-time subscription for service orders
  useEffect(() => {
    const channel = supabase
      .channel('service-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'service_orders'
        },
        (payload) => {
          console.log('Real-time update:', payload);
          fetchOrders(); // Refetch on any change
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Parse date from Brazilian format (dd/MM/yyyy)
  const parseBrazilianDate = (dateStr: string): string | null => {
    if (!dateStr) return null;
    try {
      // Check if it's already in ISO format
      if (dateStr.includes('-') && dateStr.length >= 10) {
        return dateStr.split('T')[0];
      }
      // Parse dd/MM/yyyy format
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Import historical data from Google Sheets
  const importFromSheet = async () => {
    if (!sheetOrdersData.rows.length) {
      toast.error('Nenhum dado encontrado na planilha');
      return;
    }

    setIsSyncing(true);
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    try {
      // Get existing order IDs to avoid duplicates
      const { data: existingOrders } = await supabase
        .from('service_orders')
        .select('order_number');
      
      const existingNumbers = new Set((existingOrders || []).map(o => o.order_number));

      for (const row of sheetOrdersData.rows) {
        const idOrdem = String(row['IdOrdem'] || '');
        const vehicleCode = String(row['Veiculo'] || '').trim();
        const orderNumber = `OS-HIST-${idOrdem}`;
        
        // Skip rows without vehicle code
        if (!vehicleCode) {
          skipped++;
          continue;
        }
        
        // Skip if already imported
        if (existingNumbers.has(orderNumber)) {
          skipped++;
          continue;
        }

        const orderDate = parseBrazilianDate(String(row['Data'] || ''));
        const entryDate = parseBrazilianDate(String(row['Data_Entrada'] || ''));
        const exitDate = parseBrazilianDate(String(row['Data_Saida'] || ''));

        // Map status
        const sheetStatus = String(row['Status'] || '').toLowerCase();
        let status = 'Aberta';
        if (sheetStatus.includes('finalizado') || sheetStatus.includes('conclu')) {
          status = 'Finalizada';
        } else if (sheetStatus.includes('andamento')) {
          status = 'Em Andamento';
        } else if (sheetStatus.includes('aguardando')) {
          status = 'Aguardando Peças';
        }

        // Determine order type
        const problema = String(row['Problema'] || '').toLowerCase();
        const orderType = problema.includes('preventiva') ? 'Preventiva' : 'Corretiva';

        try {
          const { error } = await supabase
            .from('service_orders')
            .insert({
              order_number: orderNumber,
              order_date: orderDate || new Date().toISOString().split('T')[0],
              vehicle_code: vehicleCode,
              vehicle_description: String(row['Potencia'] || ''),
              order_type: orderType,
              priority: 'Média',
              status: status,
              problem_description: String(row['Problema'] || ''),
              solution_description: String(row['Servico'] || '') || null,
              mechanic_name: String(row['Mecanico'] || '') || null,
              notes: String(row['Observacao'] || '') || null,
              entry_date: entryDate,
              entry_time: String(row['Hora_Entrada'] || '').substring(0, 5) || null,
              start_date: entryDate ? `${entryDate}T${String(row['Hora_Entrada'] || '00:00').substring(0, 5)}:00` : null,
              end_date: exitDate && status === 'Finalizada' ? `${exitDate}T${String(row['Hora_Saida'] || '00:00').substring(0, 5)}:00` : null,
              created_by: String(row['Motorista'] || '') || null,
            });

          if (error) {
            console.error('Error importing row:', error);
            errors++;
          } else {
            imported++;
          }
        } catch (err) {
          console.error('Error importing row:', err);
          errors++;
        }
      }

      toast.success(`Importação concluída: ${imported} novos, ${skipped} já existentes, ${errors} erros`);
      fetchOrders();
    } catch (err) {
      console.error('Error during import:', err);
      toast.error('Erro durante importação');
    } finally {
      setIsSyncing(false);
    }
  };

  // Format helpers for sheet sync
  const formatDateForSheet = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return format(date, 'dd/MM/yyyy');
    } catch {
      return '';
    }
  };

  const formatTimeForSheet = (timeStr: string | null | undefined, dateStr: string | null | undefined): string => {
    if (timeStr) return timeStr.length === 5 ? timeStr : timeStr.substring(0, 5);
    if (dateStr) {
      try {
        const date = new Date(dateStr);
        return format(date, 'HH:mm');
      } catch {
        return '';
      }
    }
    return '';
  };

  // Build row data for sheet
  const buildSheetRowData = (order: {
    order_number: string;
    order_date: string;
    vehicle_code: string;
    vehicle_description?: string | null;
    problem_description?: string | null;
    solution_description?: string | null;
    mechanic_name?: string | null;
    notes?: string | null;
    status: string;
    entry_date?: string | null;
    entry_time?: string | null;
    end_date?: string | null;
    created_by?: string | null;
  }, company?: string): Record<string, string> => {
    const isFinalized = order.status.includes('Finalizada');
    

    return {
      'Data': formatDateForSheet(order.entry_date || order.order_date),
      'Veiculo': order.vehicle_code,
      'Empresa': company || '',
      'Motorista': order.created_by || '',
      'Potencia': order.vehicle_description || '',
      'Problema': order.problem_description || '',
      'Servico': order.solution_description || '',
      'Mecanico': order.mechanic_name || '',
      'Data_Entrada': formatDateForSheet(order.entry_date),
      'Data_Saida': isFinalized ? formatDateForSheet(order.end_date || new Date().toISOString()) : '',
      'Hora_Entrada': formatTimeForSheet(order.entry_time, null),
      'Hora_Saida': isFinalized ? formatTimeForSheet(null, order.end_date) : '',
      'Observacao': order.notes || '',
      'Status': order.status || '',
    };
  };

  // Find sheet row index for an order by matching vehicle code + entry date
  const findSheetRowIndex = async (vehicleCode: string, entryDate: string | null): Promise<number> => {
    try {
      const sheetData = await getSheetData(ORDEM_SERVICO_SHEET, { noCache: true });
      const rows = sheetData.rows || [];
      const formattedDate = formatDateForSheet(entryDate);
      
      const idx = rows.findIndex((row: any) => {
        const rowVehicle = String(row['Veiculo'] || row['VEICULO'] || '').trim();
        const rowDate = String(row['Data_Entrada'] || row['DATA_ENTRADA'] || '').trim();
        return rowVehicle === vehicleCode && rowDate === formattedDate;
      });
      
      return idx >= 0 ? idx + 2 : -1; // +1 header, +1 for 1-based
    } catch {
      return -1;
    }
  };

  // Sync a single order to Google Sheets (CREATE - append new row)
  const syncOrderToSheetCreate = async (order: Parameters<typeof buildSheetRowData>[0], company?: string) => {
    try {
      const rowData = buildSheetRowData(order, company);
      await createRow(ORDEM_SERVICO_SHEET, rowData);
      console.log('Order created in sheet:', order.order_number);
    } catch (err) {
      console.error('Error syncing order to sheet:', err);
    }
  };

  // Sync a single order to Google Sheets (UPDATE - find and update existing row)
  const syncOrderToSheetUpdate = async (order: Parameters<typeof buildSheetRowData>[0], company?: string, oldEntryDate?: string | null) => {
    try {
      const rowData = buildSheetRowData(order, company);
      const sheetRowIndex = await findSheetRowIndex(order.vehicle_code, oldEntryDate || order.entry_date);
      
      if (sheetRowIndex > 0) {
        await updateRow(ORDEM_SERVICO_SHEET, sheetRowIndex, rowData);
        console.log('Order updated in sheet:', order.order_number);
      } else {
        // Row not found - append as new
        await createRow(ORDEM_SERVICO_SHEET, rowData);
        console.log('Order appended to sheet (not found for update):', order.order_number);
      }
    } catch (err) {
      console.error('Error syncing order update to sheet:', err);
    }
  };

  // Sync order deletion to Google Sheets
  const syncOrderDeleteFromSheet = async (vehicleCode: string, entryDate: string | null) => {
    try {
      const sheetRowIndex = await findSheetRowIndex(vehicleCode, entryDate);
      if (sheetRowIndex > 0) {
        await deleteRow(ORDEM_SERVICO_SHEET, sheetRowIndex);
        console.log('Order deleted from sheet');
      }
    } catch (err) {
      console.error('Error deleting order from sheet:', err);
    }
  };

  // Fetch vehicle maintenance history + latest horimeter/KM from ALL sources
  const fetchVehicleHistory = async (vehicleCode: string) => {
    if (!vehicleCode) {
      setVehicleHistory(null);
      setHorimeterWarning(null);
      setKmWarning(null);
      return;
    }
    
    // Get vehicle info from vehicles sheet
    const vehicleInfo = vehiclesData.rows.find(v => String(v['Codigo'] || '') === vehicleCode);
    
    // Get all orders for this vehicle
    const vehicleOrders = orders.filter(o => o.vehicle_code === vehicleCode);
    
    // Calculate total hours
    const totalHours = vehicleOrders.reduce((sum, o) => sum + (o.actual_hours || 0), 0);
    
    // Calculate total days in maintenance
    let totalDays = 0;
    vehicleOrders.forEach(order => {
      if (order.start_date && order.end_date) {
        const start = new Date(order.start_date);
        const end = new Date(order.end_date);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalDays += diffDays;
      } else if (order.start_date && order.status !== 'Finalizada') {
        const start = new Date(order.start_date);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalDays += diffDays;
      }
    });
    
    // Get last order
    const lastOrder = vehicleOrders.length > 0 ? vehicleOrders[0] : null;
    
    // --- Fetch last horimeter/KM from ALL sources (service_orders, field_fuel_records, horimeter_readings) ---
    let lastHorimeter: number | null = null;
    let lastKm: number | null = null;

    try {
      // 1. From service_orders (already loaded)
      const ordersWithHorimeter = vehicleOrders.filter(o => (o as any).horimeter_current);
      const ordersWithKm = vehicleOrders.filter(o => (o as any).km_current);
      const osHorimeter = ordersWithHorimeter.length > 0 ? Number((ordersWithHorimeter[0] as any).horimeter_current) : null;
      const osKm = ordersWithKm.length > 0 ? Number((ordersWithKm[0] as any).km_current) : null;
      const osDate = ordersWithHorimeter.length > 0 ? ((ordersWithHorimeter[0] as any).entry_date || ordersWithHorimeter[0].order_date) : null;
      const osKmDate = ordersWithKm.length > 0 ? ((ordersWithKm[0] as any).entry_date || ordersWithKm[0].order_date) : null;

      // 2. From field_fuel_records - get the most recent record with horimeter or km
      const { data: fuelRecords } = await supabase
        .from('field_fuel_records')
        .select('horimeter_current, km_current, record_date, record_time')
        .eq('vehicle_code', vehicleCode)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(5);

      const fuelWithHorimeter = fuelRecords?.find(r => r.horimeter_current && Number(r.horimeter_current) > 0);
      const fuelWithKm = fuelRecords?.find(r => r.km_current && Number(r.km_current) > 0);
      const fuelHorimeter = fuelWithHorimeter ? Number(fuelWithHorimeter.horimeter_current) : null;
      const fuelKm = fuelWithKm ? Number(fuelWithKm.km_current) : null;
      const fuelHorimeterDate = fuelWithHorimeter?.record_date || null;
      const fuelKmDate = fuelWithKm?.record_date || null;

      // 3. From horimeter_readings - need the vehicle id first
      const { data: vehicleRecord } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      let readingHorimeter: number | null = null;
      let readingKm: number | null = null;
      let readingDate: string | null = null;

      if (vehicleRecord?.id) {
        const { data: readings } = await supabase
          .from('horimeter_readings')
          .select('current_value, current_km, reading_date')
          .eq('vehicle_id', vehicleRecord.id)
          .order('reading_date', { ascending: false })
          .limit(1);

        if (readings && readings.length > 0) {
          readingHorimeter = readings[0].current_value ? Number(readings[0].current_value) : null;
          readingKm = readings[0].current_km ? Number(readings[0].current_km) : null;
          readingDate = readings[0].reading_date;
        }
      }

      // 4. Pick the most recent value across all sources
      // Compare by date, pick the latest
      const horimeterCandidates: { value: number; date: string }[] = [];
      if (osHorimeter && osDate) horimeterCandidates.push({ value: osHorimeter, date: osDate });
      if (fuelHorimeter && fuelHorimeterDate) horimeterCandidates.push({ value: fuelHorimeter, date: fuelHorimeterDate });
      if (readingHorimeter && readingDate) horimeterCandidates.push({ value: readingHorimeter, date: readingDate });

      if (horimeterCandidates.length > 0) {
        horimeterCandidates.sort((a, b) => b.date.localeCompare(a.date));
        lastHorimeter = horimeterCandidates[0].value;
      }

      const kmCandidates: { value: number; date: string }[] = [];
      if (osKm && osKmDate) kmCandidates.push({ value: osKm, date: osKmDate });
      if (fuelKm && fuelKmDate) kmCandidates.push({ value: fuelKm, date: fuelKmDate });
      if (readingKm && readingDate) kmCandidates.push({ value: readingKm, date: readingDate });

      if (kmCandidates.length > 0) {
        kmCandidates.sort((a, b) => b.date.localeCompare(a.date));
        lastKm = kmCandidates[0].value;
      }
    } catch (err) {
      console.error('Error fetching last horimeter/km:', err);
      // Fallback to service_orders only
      const ordersWithHorimeter = vehicleOrders.filter(o => (o as any).horimeter_current);
      const ordersWithKm = vehicleOrders.filter(o => (o as any).km_current);
      lastHorimeter = ordersWithHorimeter.length > 0 ? Number((ordersWithHorimeter[0] as any).horimeter_current) : null;
      lastKm = ordersWithKm.length > 0 ? Number((ordersWithKm[0] as any).km_current) : null;
    }
    
    setVehicleHistory({
      totalOrders: vehicleOrders.length,
      totalHours,
      totalDays,
      lastOrder,
      category: String(vehicleInfo?.['Categoria'] || ''),
      company: String(vehicleInfo?.['Empresa'] || ''),
      lastHorimeter,
      lastKm,
    });
  };

  // Validate horimeter input
  const validateHorimeter = (value: string) => {
    const currentValue = parsePtBRNumber(value);
    if (!currentValue || !vehicleHistory?.lastHorimeter) {
      setHorimeterWarning(null);
      return;
    }
    
    if (currentValue < vehicleHistory.lastHorimeter) {
      setHorimeterWarning(`⚠️ Valor menor que o último registro (${formatPtBRNumber(vehicleHistory.lastHorimeter)}h)`);
    } else if (currentValue - vehicleHistory.lastHorimeter > 500) {
      setHorimeterWarning(`⚠️ Diferença grande: +${formatPtBRNumber(currentValue - vehicleHistory.lastHorimeter)}h desde último registro`);
    } else {
      setHorimeterWarning(null);
    }
  };

  // Validate km input
  const validateKm = (value: string) => {
    const currentValue = parsePtBRNumber(value);
    if (!currentValue || !vehicleHistory?.lastKm) {
      setKmWarning(null);
      return;
    }
    
    if (currentValue < vehicleHistory.lastKm) {
      setKmWarning(`⚠️ Valor menor que o último registro (${formatPtBRNumber(vehicleHistory.lastKm, { decimals: 0 })} km)`);
    } else if (currentValue - vehicleHistory.lastKm > 10000) {
      setKmWarning(`⚠️ Diferença grande: +${formatPtBRNumber(currentValue - vehicleHistory.lastKm, { decimals: 0 })} km desde último registro`);
    } else {
      setKmWarning(null);
    }
  };

  // Generate unique order number - sequential format OS-YYYY-NNNNN
  const generateOrderNumber = useCallback(async () => {
    const year = new Date().getFullYear();
    
    try {
      // Get the highest order number for this year from database
      const { data: existingOrders, error } = await supabase
        .from('service_orders')
        .select('order_number')
        .like('order_number', `OS-${year}-%`)
        .order('order_number', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      
      if (existingOrders && existingOrders.length > 0) {
        const lastOrder = existingOrders[0].order_number;
        const match = lastOrder.match(/OS-\d{4}-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      return `OS-${year}-${String(nextNumber).padStart(5, '0')}`;
    } catch (err) {
      console.error('Error generating order number:', err);
      // Fallback to timestamp-based unique ID
      const timestamp = Date.now().toString().slice(-6);
      return `OS-${year}-${timestamp}`;
    }
  }, []);

  // Apply quick filter
  const applyQuickFilter = (filter: string) => {
    const today = new Date();
    setQuickFilter(filter);
    
    switch (filter) {
      case 'hoje':
        setStartDate(today);
        setEndDate(today);
        break;
      case 'semana':
        const weekStart = subDays(today, 7);
        setStartDate(weekStart);
        setEndDate(today);
        break;
      case 'mes':
        const monthStart = startOfMonth(today);
        setStartDate(monthStart);
        setEndDate(today);
        break;
      case 'todos':
        setStartDate(undefined);
        setEndDate(undefined);
        break;
    }
  };

  const clearDateFilter = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setQuickFilter(null);
  };

  // Get unique companies from vehicles data
  const companies = useMemo(() => {
    const companySet = new Set<string>();
    vehiclesData.rows.forEach(v => {
      const company = String(v['Empresa'] || '').trim();
      if (company) companySet.add(company);
    });
    return Array.from(companySet).sort();
  }, [vehiclesData.rows]);

  // Create a map of vehicle_code to company
  const vehicleCompanyMap = useMemo(() => {
    const map = new Map<string, string>();
    vehiclesData.rows.forEach(v => {
      const code = String(v['Codigo'] || '').trim();
      const company = String(v['Empresa'] || '').trim();
      if (code) map.set(code, company);
    });
    return map;
  }, [vehiclesData.rows]);

  // Filter orders
  const filteredRows = useMemo(() => {
    return orders.filter(row => {
      // Exclude rows without vehicle_code
      if (!row.vehicle_code || row.vehicle_code.trim() === '') {
        return false;
      }
      
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v || '').toLowerCase().includes(search.toLowerCase())
        );
      const status = String(row.status || '').toLowerCase();
      // Custom status matching logic
      let matchesStatus = true;
      if (statusFilter === 'manutencao') {
        // Show orders in maintenance (not finished)
        matchesStatus = !status.includes('finalizada');
      } else if (statusFilter !== 'all') {
        matchesStatus = status.includes(statusFilter);
      }
      
      // Company filter
      let matchesCompany = true;
      if (companyFilter !== 'all') {
        const vehicleCompany = vehicleCompanyMap.get(row.vehicle_code) || '';
        matchesCompany = vehicleCompany.toLowerCase() === companyFilter.toLowerCase();
      }
      
      let matchesDate = true;
      if (startDate || endDate) {
        // Use entry_date as the primary date for filtering
        const dateStr = (row as any).entry_date || row.order_date;
        if (!dateStr) {
          matchesDate = false;
        } else {
          const [year, month, day] = dateStr.split('-').map(Number);
          const rowDate = new Date(year, month - 1, day);
          
          if (startDate && endDate) {
            matchesDate = isWithinInterval(rowDate, {
              start: startOfDay(startDate),
              end: endOfDay(endDate)
            });
          } else if (startDate) {
            matchesDate = rowDate >= startOfDay(startDate);
          } else if (endDate) {
            matchesDate = rowDate <= endOfDay(endDate);
          }
        }
      }
      
      return matchesSearch && matchesStatus && matchesCompany && matchesDate;
    });
  }, [orders, search, statusFilter, companyFilter, vehicleCompanyMap, startDate, endDate]);

  // Calculate metrics
  const metrics = useMemo(() => {
    let emManutencao = 0;
    let aguardandoPecas = 0;
    let urgentes = 0;
    let finalizadas = 0;

    filteredRows.forEach(row => {
      const status = String(row.status || '').toLowerCase();
      const prioridade = String(row.priority || '').toLowerCase();

      if (status.includes('andamento') || status.includes('aberta')) {
        emManutencao++;
      }
      if (status.includes('aguardando')) {
        aguardandoPecas++;
      }
      if (prioridade.includes('alta') || prioridade.includes('urgente')) {
        urgentes++;
      }
      if (status.includes('finalizada') || status.includes('concluída')) {
        finalizadas++;
      }
    });

    return { emManutencao, aguardandoPecas, urgentes, finalizadas };
  }, [filteredRows]);

  // Status badge
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('finalizada') || s.includes('concluída')) {
      return <Badge className="bg-success/20 text-success border-success/30">✅ Finalizada</Badge>;
    }
    if (s.includes('andamento')) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">🔧 Em Andamento</Badge>;
    }
    if (s.includes('aberta')) {
      return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">📋 Aberta</Badge>;
    }
    if (s.includes('aguardando') && s.includes('peças')) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">📦 Aguardando Peças</Badge>;
    }
    if (s.includes('aguardando') && s.includes('aprovação')) {
      return <Badge className="bg-purple-500/20 text-purple-600 border-purple-500/30">⏳ Aguardando Aprovação</Badge>;
    }
    if (s.includes('orçamento')) {
      return <Badge className="bg-cyan-500/20 text-cyan-600 border-cyan-500/30">💰 Em Orçamento</Badge>;
    }
    if (s.includes('pausada')) {
      return <Badge className="bg-slate-500/20 text-slate-600 border-slate-500/30">⏸️ Pausada</Badge>;
    }
    if (s.includes('cancelada')) {
      return <Badge className="bg-red-500/20 text-red-600 border-red-500/30">❌ Cancelada</Badge>;
    }
    if (s.includes('aguardando')) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">📦 Aguardando</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  // Priority badge
  const getPrioridadeBadge = (prioridade: string) => {
    const p = prioridade.toLowerCase();
    if (p.includes('alta') || p.includes('urgente')) {
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Alta</Badge>;
    }
    if (p.includes('média') || p.includes('media')) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">Média</Badge>;
    }
    return <Badge className="bg-muted text-muted-foreground">Baixa</Badge>;
  };

  // Open new order modal
  const handleNewOrder = () => {
    setEditingOrder(null);
    setVehicleHistory(null);
    const now = new Date();
    setFormData({
      vehicle_code: '',
      vehicle_description: '',
      order_type: 'Corretiva',
      priority: 'Média',
      status: 'Aberta',
      problem_description: '',
      solution_description: '',
      mechanic_id: '',
      mechanic_name: '',
      estimated_hours: '',
      actual_hours: '',
      parts_used: '',
      parts_cost: '',
      labor_cost: '',
      notes: '',
      horimeter_current: '',
      km_current: '',
      entry_date: format(now, 'yyyy-MM-dd'),
      entry_time: format(now, 'HH:mm'),
      exit_date: '',
      exit_time: '',
      interval_days: '90',
      photo_before_url: null,
      photo_after_url: null,
      photo_parts_url: null,
      photo_4_url: null,
      photo_5_url: null,
    });
    setIsModalOpen(true);
  };

  // Handle vehicle selection in modal
  const handleVehicleSelect = (vehicleCode: string) => {
    const vehicle = vehicles.find(v => v.code === vehicleCode);
    
    // Auto-fill Motorista from Veiculo sheet
    const vehicleInfo = vehiclesData.rows.find(v => String(v['Codigo'] || '') === vehicleCode);
    const motorista = String(vehicleInfo?.['Motorista'] || vehicleInfo?.['MOTORISTA'] || '').trim();
    
    setFormData({ 
      ...formData, 
      vehicle_code: vehicleCode,
      vehicle_description: vehicle?.description || '',
      notes: formData.notes, // keep existing
    });
    
    // Store motorista for sync (created_by field in DB)
    if (motorista && !editingOrder) {
      // For new orders, we'll pass motorista via the save handler
      (window as any).__osMotorista = motorista;
    }
    
    fetchVehicleHistory(vehicleCode);
  };

  // Open edit order modal
  const handleEditOrder = (order: ServiceOrder) => {
    setEditingOrder(order);
    // Parse exit date and time from end_date if exists
    let exitDateVal = '';
    let exitTimeVal = '';
    if (order.end_date) {
      const endDateTime = new Date(order.end_date);
      exitDateVal = format(endDateTime, 'yyyy-MM-dd');
      exitTimeVal = format(endDateTime, 'HH:mm');
    }
    
    setFormData({
      vehicle_code: order.vehicle_code,
      vehicle_description: order.vehicle_description || '',
      order_type: order.order_type,
      priority: order.priority,
      status: order.status,
      problem_description: order.problem_description || '',
      solution_description: order.solution_description || '',
      mechanic_id: order.mechanic_id || '',
      mechanic_name: order.mechanic_name || '',
      estimated_hours: order.estimated_hours?.toString() || '',
      actual_hours: order.actual_hours?.toString() || '',
      parts_used: order.parts_used || '',
      parts_cost: order.parts_cost?.toString() || '',
      labor_cost: order.labor_cost?.toString() || '',
      notes: order.notes || '',
      horimeter_current: (order as any).horimeter_current?.toString() || '',
      km_current: (order as any).km_current?.toString() || '',
      entry_date: (order as any).entry_date || order.order_date || '',
      entry_time: (order as any).entry_time || '',
      exit_date: exitDateVal,
      exit_time: exitTimeVal,
      interval_days: (order as any).interval_days?.toString() || '90',
      photo_before_url: (order as any).photo_before_url || null,
      photo_after_url: (order as any).photo_after_url || null,
      photo_parts_url: (order as any).photo_parts_url || null,
      photo_4_url: (order as any).photo_4_url || null,
      photo_5_url: (order as any).photo_5_url || null,
    });
    fetchVehicleHistory(order.vehicle_code);
    setIsModalOpen(true);
  };

  // Save order
  const handleSaveOrder = async () => {
    if (!formData.vehicle_code || !formData.problem_description) {
      toast.error('Preencha veículo e descrição do problema');
      return;
    }

    // Validate exit date is after entry date
    if (formData.entry_date && formData.exit_date) {
      const entryDateTime = formData.entry_time 
        ? new Date(`${formData.entry_date}T${formData.entry_time}`)
        : new Date(`${formData.entry_date}T00:00`);
      const exitDateTime = formData.exit_time 
        ? new Date(`${formData.exit_date}T${formData.exit_time}`)
        : new Date(`${formData.exit_date}T00:00`);
      
      if (exitDateTime <= entryDateTime) {
        toast.error('Data/Hora de Saída deve ser posterior à Data/Hora de Entrada');
        return;
      }
    }

    setIsSaving(true);
    try {
      const mechanic = mechanics.find(m => m.id === formData.mechanic_id);
      const partsCost = parseFloat(formData.parts_cost) || 0;
      const laborCost = parseFloat(formData.labor_cost) || 0;
      
      // Build end_date from exit_date and exit_time if provided
      let endDateValue: string | null = editingOrder?.end_date || null;
      if (formData.exit_date) {
        const exitTimeStr = formData.exit_time || '00:00';
        endDateValue = new Date(`${formData.exit_date}T${exitTimeStr}`).toISOString();
      } else if (formData.status.includes('Finalizada') && !editingOrder?.end_date) {
        endDateValue = new Date().toISOString();
      }
      
      const orderData = {
        vehicle_code: formData.vehicle_code,
        vehicle_description: formData.vehicle_description || null,
        order_type: formData.order_type,
        priority: formData.priority,
        status: formData.status,
        problem_description: formData.problem_description,
        solution_description: formData.solution_description || null,
        mechanic_id: formData.mechanic_id || null,
        mechanic_name: mechanic?.name || formData.mechanic_name || null,
        estimated_hours: parseFloat(formData.estimated_hours) || null,
        actual_hours: parseFloat(formData.actual_hours) || null,
        parts_used: formData.parts_used || null,
        parts_cost: partsCost || null,
        labor_cost: laborCost || null,
        total_cost: (partsCost + laborCost) || null,
        notes: formData.notes || null,
        start_date: formData.status === 'Em Andamento' && !editingOrder?.start_date ? new Date().toISOString() : editingOrder?.start_date,
        end_date: endDateValue,
        horimeter_current: parsePtBRNumber(formData.horimeter_current) || null,
        km_current: parsePtBRNumber(formData.km_current) || null,
        entry_date: formData.entry_date || null,
        entry_time: formData.entry_time || null,
        interval_days: formData.order_type === 'Preventiva' ? (parseInt(formData.interval_days) || 90) : null,
        photo_before_url: formData.photo_before_url || null,
        photo_after_url: formData.photo_after_url || null,
        photo_parts_url: formData.photo_parts_url || null,
        photo_4_url: formData.photo_4_url || null,
        photo_5_url: formData.photo_5_url || null,
      };

      let savedOrderNumber = '';
      let savedOrderDate = '';

      if (editingOrder) {
        const { error } = await supabase
          .from('service_orders')
          .update({
            ...orderData,
            order_date: formData.entry_date || editingOrder.order_date, // Use entry_date as primary date
          })
          .eq('id', editingOrder.id);
        
        if (error) throw error;
        savedOrderNumber = editingOrder.order_number;
        savedOrderDate = formData.entry_date || editingOrder.order_date;
        toast.success('Ordem de serviço atualizada!');
        
        // Sync UPDATE to Google Sheets
        const vehicleInfo = vehiclesData.rows.find(v => String(v['Codigo'] || '') === formData.vehicle_code);
        const motorista = String(vehicleInfo?.['Motorista'] || vehicleInfo?.['MOTORISTA'] || '').trim();
        const oldEntryDate = editingOrder.entry_date || editingOrder.order_date;
        syncOrderToSheetUpdate({
          ...orderData,
          order_number: savedOrderNumber,
          order_date: savedOrderDate,
          created_by: motorista || null,
        }, String(vehicleInfo?.['Empresa'] || ''), oldEntryDate);
      } else {
        const newOrderNumber = await generateOrderNumber();
        const newOrderDate = formData.entry_date || new Date().toISOString().split('T')[0];
        
        const { error } = await supabase
          .from('service_orders')
          .insert({
            ...orderData,
            order_number: newOrderNumber,
            order_date: newOrderDate,
          });
        
        if (error) throw error;
        savedOrderNumber = newOrderNumber;
        savedOrderDate = newOrderDate;
        toast.success('Ordem de serviço criada!');
        
        // Sync CREATE to Google Sheets
        const vehicleInfo = vehiclesData.rows.find(v => String(v['Codigo'] || '') === formData.vehicle_code);
        const motorista = String(vehicleInfo?.['Motorista'] || vehicleInfo?.['MOTORISTA'] || '').trim();
        syncOrderToSheetCreate({
          ...orderData,
          order_number: savedOrderNumber,
          order_date: savedOrderDate,
          created_by: motorista || null,
        }, String(vehicleInfo?.['Empresa'] || ''));
      }

      setIsModalOpen(false);
      fetchOrders();
    } catch (err) {
      console.error('Error saving order:', err);
      toast.error('Erro ao salvar ordem de serviço');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete order
  const handleDeleteOrder = async (order: ServiceOrder) => {
    if (!confirm(`Deseja excluir a ${order.order_number}?`)) return;

    try {
      const { error } = await supabase
        .from('service_orders')
        .delete()
        .eq('id', order.id);

      if (error) throw error;
      
      // Sync deletion to Google Sheets
      syncOrderDeleteFromSheet(order.vehicle_code, (order as any).entry_date || order.order_date);
      
      toast.success('Ordem de serviço excluída!');
      fetchOrders();
    } catch (err) {
      console.error('Error deleting order:', err);
      toast.error('Erro ao excluir ordem de serviço');
    }
  };

  // Calculate downtime for an order
  const calculateDowntime = (order: ServiceOrder) => {
    const entryDate = (order as any).entry_date;
    const entryTime = (order as any).entry_time;
    const endDate = order.end_date;
    
    if (!entryDate) return null;
    
    const entryDateTime = entryTime 
      ? new Date(`${entryDate}T${entryTime}`)
      : new Date(`${entryDate}T00:00`);
    
    const endDateTime = endDate 
      ? new Date(endDate) 
      : new Date();
    
    const diffMs = endDateTime.getTime() - entryDateTime.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      return `${diffDays}d ${remainingHours}h`;
    }
    return `${diffHours}h`;
  };

  // Open quick status change modal
  const handleQuickStatusChange = (order: ServiceOrder, status: string) => {
    setStatusChangeOrder(order);
    setNewStatus(status);
    
    // If finalizing, pre-fill with current date/time
    if (status === 'Finalizada') {
      const now = new Date();
      setExitDate(format(now, 'yyyy-MM-dd'));
      setExitTime(format(now, 'HH:mm'));
    }
    
    // If not finalizing, apply immediately without modal
    if (status !== 'Finalizada') {
      applyQuickStatusChange(order, status);
    } else {
      setIsStatusModalOpen(true);
    }
  };

  // Apply quick status change
  const applyQuickStatusChange = async (order: ServiceOrder, status: string, exitDateTime?: { date: string; time: string }) => {
    try {
      const updateData: any = { status };
      
      // If starting work, set start_date
      if (status === 'Em Andamento' && !order.start_date) {
        updateData.start_date = new Date().toISOString();
      }
      
      // If finalizing, set end_date with specified exit date/time
      if (status === 'Finalizada') {
        if (exitDateTime?.date) {
          const exitDateTimeStr = exitDateTime.time 
            ? `${exitDateTime.date}T${exitDateTime.time}:00`
            : `${exitDateTime.date}T${format(new Date(), 'HH:mm')}:00`;
          updateData.end_date = exitDateTimeStr;
        } else {
          updateData.end_date = new Date().toISOString();
        }
      }
      
      const { error } = await supabase
        .from('service_orders')
        .update(updateData)
        .eq('id', order.id);
      
      if (error) throw error;
      
      toast.success(`Status alterado para ${status}!`);
      fetchOrders();
      
      // If preventive OS is finalized, schedule next maintenance in calendar
      // Only create if doesn't already exist for this vehicle and date range
      if (status === 'Finalizada' && order.order_type === 'Preventiva') {
        const intervalDays = (order as any).interval_days || 90;
        const endDateValue = exitDateTime?.date ? new Date(exitDateTime.date) : new Date();
        const nextDate = addDays(endDateValue, intervalDays);
        
        // Check if a scheduled maintenance already exists for this vehicle within the next interval
        const { data: existingMaint } = await supabase
          .from('scheduled_maintenance')
          .select('id')
          .eq('vehicle_code', order.vehicle_code)
          .eq('maintenance_type', 'Preventiva')
          .gte('scheduled_date', format(new Date(), 'yyyy-MM-dd'))
          .limit(1);
        
        if (!existingMaint || existingMaint.length === 0) {
          await supabase
            .from('scheduled_maintenance')
            .insert({
              vehicle_code: order.vehicle_code,
              vehicle_description: order.vehicle_description,
              title: order.problem_description?.slice(0, 100) || 'Revisão Preventiva',
              description: `Próxima revisão após OS ${order.order_number}`,
              scheduled_date: format(nextDate, 'yyyy-MM-dd'),
              interval_days: intervalDays,
              priority: order.priority,
              status: 'Programada',
              maintenance_type: 'Preventiva',
            });
          
          toast.success(`Próxima revisão agendada para ${format(nextDate, 'dd/MM/yyyy')}`);
        }
      }
      
      // Sync status update to sheet
      const vehicleInfo = vehiclesData.rows.find(v => String(v['Codigo'] || '') === order.vehicle_code);
      const motorista = String(vehicleInfo?.['Motorista'] || vehicleInfo?.['MOTORISTA'] || '').trim();
      syncOrderToSheetUpdate({
        ...order,
        ...updateData,
        created_by: motorista || order.created_by || '',
      }, String(vehicleInfo?.['Empresa'] || ''), (order as any).entry_date);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Erro ao alterar status');
    }
  };

  // Confirm finalization with exit date/time
  const confirmFinalization = () => {
    if (!statusChangeOrder) return;
    
    // Validate exit date/time is after entry date/time
    const entryDate = (statusChangeOrder as any).entry_date;
    const entryTime = (statusChangeOrder as any).entry_time;
    
    if (entryDate && exitDate) {
      const entryDateTime = entryTime 
        ? new Date(`${entryDate}T${entryTime}`)
        : new Date(`${entryDate}T00:00`);
      const exitDateTime = exitTime 
        ? new Date(`${exitDate}T${exitTime}`)
        : new Date(`${exitDate}T00:00`);
      
      if (exitDateTime <= entryDateTime) {
        toast.error('Data/Hora de Saída deve ser posterior à Data/Hora de Entrada');
        return;
      }
    }
    
    applyQuickStatusChange(statusChangeOrder, 'Finalizada', { date: exitDate, time: exitTime });
    setIsStatusModalOpen(false);
    setStatusChangeOrder(null);
  };

  // Send WhatsApp message for vehicle release
  const handleWhatsAppRelease = (order: ServiceOrder) => {
    const isFinished = order.status.toLowerCase().includes('finalizada') || order.status.toLowerCase().includes('concluída');
    const downtime = calculateDowntime(order);
    
    const messageLines = [
      `🔧 *MANUTENÇÃO - ${isFinished ? 'VEÍCULO LIBERADO' : 'ATUALIZAÇÃO DE STATUS'}*`,
      ``,
      `📋 *${order.order_number}*`,
      `🚗 Veículo: *${order.vehicle_code}*`,
      order.vehicle_description ? `📝 ${order.vehicle_description}` : '',
      ``,
      `📌 Status: *${order.status}*`,
      `⚙️ Tipo: ${order.order_type}`,
      order.mechanic_name ? `👨‍🔧 Mecânico: ${order.mechanic_name}` : '',
      ``,
      order.problem_description ? `❌ *Problema:*\n${order.problem_description.slice(0, 200)}` : '',
      order.solution_description ? `\n✅ *Solução:*\n${order.solution_description.slice(0, 200)}` : '',
      order.parts_used ? `\n🔩 *Peças utilizadas:*\n${order.parts_used.slice(0, 150)}` : '',
      ``,
      order.actual_hours ? `⏱️ Tempo de serviço: ${order.actual_hours}h` : '',
      downtime ? `⏳ *Tempo parado: ${downtime}*` : '',
      isFinished ? `\n✅ *VEÍCULO LIBERADO PARA OPERAÇÃO*` : '',
      ``,
      `📅 ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
    ].filter(line => line !== '').join('\n');

    const encodedMessage = encodeURIComponent(messageLines);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    toast.success(isFinished ? 'Compartilhando liberação via WhatsApp...' : 'Compartilhando atualização via WhatsApp...');
  };

  // Helper: load image as base64 for PDF embedding
  const loadImageAsBase64 = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  // Export single OS to PDF - Complete Professional Style with Photos
  const exportSingleOSToPDF = async (order: ServiceOrder) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    
    // Navy Blue Theme Colors
    const navy: [number, number, number] = [30, 41, 59];
    const darkNavy: [number, number, number] = [15, 23, 42];
    const accent: [number, number, number] = [59, 130, 246];
    const green: [number, number, number] = [22, 163, 74];
    const red: [number, number, number] = [220, 38, 38];
    const gray: [number, number, number] = [100, 116, 139];
    const lightGray: [number, number, number] = [241, 245, 249];
    const white: [number, number, number] = [255, 255, 255];
    
    // Get current user
    const currentUserStr = localStorage.getItem('currentSystemUser');
    const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
    const userRole = currentUser?.role || 'operador';
    const userName = currentUser?.name || 'Sistema';
    
    let y = 10;
    
    // ========== HEADER ==========
    // Try to load obra logo
    let logoLoaded = false;
    if (obraSettings?.logo_url) {
      try {
        const logoBase64 = await loadImageAsBase64(obraSettings.logo_url);
        if (logoBase64) {
          doc.addImage(logoBase64, 'JPEG', margin, y, 30, 15);
          logoLoaded = true;
        }
      } catch {}
    }
    
    const textStartX = logoLoaded ? margin + 35 : margin;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text((obraSettings?.nome || 'SISTEMA DE GESTÃO').toUpperCase(), textStartX, y + 6);
    
    if (obraSettings?.subtitulo) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...gray);
      doc.text(obraSettings.subtitulo, textStartX, y + 12);
    }
    if (obraSettings?.cidade) {
      doc.setFontSize(7);
      doc.text(obraSettings.cidade, textStartX, y + 16);
    }
    
    y += 20;
    
    // Accent bar
    doc.setFillColor(...accent);
    doc.rect(margin, y, contentWidth, 1.5, 'F');
    y += 5;
    
    // ========== TITLE BAR ==========
    doc.setFillColor(...navy);
    doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...white);
    doc.text('ORDEM DE SERVIÇO', pageWidth / 2, y + 8, { align: 'center' });
    y += 16;
    
    // ========== OS Number + Date Badges ==========
    doc.setFillColor(...lightGray);
    doc.roundedRect(margin, y, 75, 10, 2, 2, 'F');
    doc.roundedRect(pageWidth - margin - 75, y, 75, 10, 2, 2, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text(order.order_number, margin + 37.5, y + 7, { align: 'center' });
    
    const entryDate = (order as any).entry_date || order.order_date;
    const entryTime = (order as any).entry_time || '';
    const dateDisplay = entryDate ? format(new Date(entryDate + 'T12:00:00'), 'dd/MM/yyyy') : '-';
    doc.text(`${dateDisplay}${entryTime ? ' ' + entryTime : ''}`, pageWidth - margin - 37.5, y + 7, { align: 'center' });
    y += 14;
    
    // ========== VEHICLE & STATUS CARDS ==========
    const cardW = (contentWidth - 6) / 2;
    const cardH = 38;
    
    // Left: Vehicle
    doc.setFillColor(...lightGray);
    doc.roundedRect(margin, y, cardW, cardH, 2, 2, 'F');
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text('VEÍCULO / EQUIPAMENTO', margin + 4, y + 6);
    
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text(order.vehicle_code, margin + 4, y + 15);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    const descLines = doc.splitTextToSize(order.vehicle_description || '-', cardW - 8);
    doc.text(descLines.slice(0, 2), margin + 4, y + 21);
    
    const horimeter = (order as any).horimeter_current;
    const km = (order as any).km_current;
    if (horimeter || km) {
      doc.setFontSize(7);
      doc.setTextColor(...accent);
      const parts: string[] = [];
      if (horimeter) parts.push(`Horímetro: ${Number(horimeter).toLocaleString('pt-BR')}h`);
      if (km) parts.push(`KM: ${Number(km).toLocaleString('pt-BR')}`);
      doc.text(parts.join('  |  '), margin + 4, y + 34);
    }
    
    // Right: Status
    const rightX = margin + cardW + 6;
    doc.setFillColor(...lightGray);
    doc.roundedRect(rightX, y, cardW, cardH, 2, 2, 'F');
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...accent);
    doc.text('STATUS E DETALHES', rightX + 4, y + 6);
    
    // Status badge
    const statusLower = order.status.toLowerCase();
    const statusColor: [number, number, number] = statusLower.includes('finalizada') ? green
      : statusLower.includes('andamento') ? accent
      : statusLower.includes('aguardando') ? [234, 179, 8]
      : statusLower.includes('cancelada') ? red
      : navy;
    doc.setFillColor(...statusColor);
    doc.roundedRect(rightX + 4, y + 10, 40, 7, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...white);
    doc.text(order.status.toUpperCase(), rightX + 24, y + 15, { align: 'center' });
    
    // Priority badge
    const prioLower = order.priority.toLowerCase();
    const prioColor: [number, number, number] = prioLower.includes('alta') || prioLower.includes('urgente') ? red
      : prioLower.includes('média') ? [234, 179, 8] : gray;
    doc.setFillColor(...prioColor);
    doc.roundedRect(rightX + 48, y + 10, 30, 7, 2, 2, 'F');
    doc.setTextColor(...white);
    doc.text(order.priority.toUpperCase(), rightX + 63, y + 15, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...gray);
    doc.text(`Tipo: ${order.order_type}`, rightX + 4, y + 25);
    doc.text(`Mecânico: ${order.mechanic_name || '-'}`, rightX + 4, y + 31);
    
    // Downtime
    const downtime = calculateDowntime(order);
    if (downtime) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...red);
      doc.text(`Tempo Parado: ${downtime}`, rightX + 4, y + 37);
    }
    
    y += cardH + 6;
    
    // ========== SECTION HELPER ==========
    const drawSection = (title: string, content: string | null, color: [number, number, number], maxLines = 5) => {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = 15;
      }
      doc.setFillColor(...color);
      doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...white);
      doc.text(title, margin + 4, y + 5);
      y += 10;
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...navy);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(content || 'Não informado', contentWidth - 8);
      const displayLines = lines.slice(0, maxLines);
      doc.text(displayLines, margin + 4, y);
      y += displayLines.length * 4.5 + 5;
    };
    
    // ========== CONTENT SECTIONS ==========
    drawSection('DESCRIÇÃO DO PROBLEMA', order.problem_description, navy);
    drawSection('SOLUÇÃO / SERVIÇO REALIZADO', order.solution_description || 'Pendente', green);
    
    if (order.parts_used) {
      drawSection('PEÇAS / MATERIAIS UTILIZADOS', order.parts_used, accent);
    }
    
    if (order.notes) {
      drawSection('OBSERVAÇÕES', order.notes, gray, 3);
    }
    
    // ========== HOURS INFO ==========
    if (order.estimated_hours || order.actual_hours) {
      doc.setFillColor(...lightGray);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...navy);
      if (order.estimated_hours) {
        doc.text(`Horas Estimadas: ${order.estimated_hours}h`, margin + 8, y + 8);
      }
      if (order.actual_hours) {
        doc.text(`Horas Realizadas: ${order.actual_hours}h`, pageWidth / 2, y + 8);
      }
      y += 16;
    }

    // ========== ENTRY/EXIT DATES ==========
    if (entryDate || order.end_date) {
      doc.setFillColor(...lightGray);
      doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...navy);
      
      if (entryDate) {
        doc.text(`Entrada: ${dateDisplay} ${entryTime || ''}`, margin + 8, y + 8);
      }
      if (order.end_date) {
        const exitDisplay = format(new Date(order.end_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        doc.text(`Saída: ${exitDisplay}`, pageWidth / 2, y + 8);
      }
      y += 16;
    }
    
    // ========== PHOTOS SECTION ==========
    const photoEntries: { label: string; url: string }[] = [];
    const photoUrls = [
      { label: 'Antes', url: (order as any).photo_before_url },
      { label: 'Depois', url: (order as any).photo_after_url },
      { label: 'Peças', url: (order as any).photo_parts_url },
      { label: 'Foto 4', url: (order as any).photo_4_url },
      { label: 'Foto 5', url: (order as any).photo_5_url },
    ];
    photoUrls.forEach(p => { if (p.url) photoEntries.push(p as { label: string; url: string }); });
    
    if (photoEntries.length > 0) {
      // Check if we need a new page for photos
      if (y > pageHeight - 80) {
        doc.addPage();
        y = 15;
      }
      
      doc.setFillColor(...accent);
      doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...white);
      doc.text(`REGISTRO FOTOGRÁFICO (${photoEntries.length} foto${photoEntries.length > 1 ? 's' : ''})`, margin + 4, y + 5);
      y += 10;
      
      // Load all photos
      const loadedPhotos: { label: string; data: string }[] = [];
      for (const photo of photoEntries) {
        try {
          const base64 = await loadImageAsBase64(photo.url);
          if (base64) {
            loadedPhotos.push({ label: photo.label, data: base64 });
          }
        } catch {}
      }
      
      if (loadedPhotos.length > 0) {
        // Layout: up to 3 per row
        const photosPerRow = Math.min(3, loadedPhotos.length);
        const photoW = (contentWidth - (photosPerRow - 1) * 4) / photosPerRow;
        const photoH = photoW * 0.75; // 4:3 aspect
        
        loadedPhotos.forEach((photo, idx) => {
          const col = idx % photosPerRow;
          const row = Math.floor(idx / photosPerRow);
          
          if (row > 0 && col === 0) {
            y += photoH + 12;
          }
          
          // Check page break
          if (y + photoH + 10 > pageHeight - 20) {
            doc.addPage();
            y = 15;
          }
          
          const x = margin + col * (photoW + 4);
          
          // Photo border
          doc.setDrawColor(...navy);
          doc.setLineWidth(0.3);
          doc.rect(x, y, photoW, photoH);
          
          try {
            doc.addImage(photo.data, 'JPEG', x + 0.5, y + 0.5, photoW - 1, photoH - 1);
          } catch {}
          
          // Label below
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...navy);
          doc.text(photo.label, x + photoW / 2, y + photoH + 4, { align: 'center' });
        });
        
        const totalRows = Math.ceil(loadedPhotos.length / photosPerRow);
        if (totalRows === 1) {
          y += photoH + 10;
        } else {
          y += photoH + 12;
        }
      }
    }
    
    // ========== SIGNATURES ==========
    const sigY = Math.max(y + 10, pageHeight - 50);
    
    // If signatures won't fit, add new page
    if (sigY + 35 > pageHeight - 15) {
      doc.addPage();
      const newSigY = pageHeight - 50;
      drawSignatures(doc, newSigY, pageWidth, margin, contentWidth, navy, gray, order, userRole, userName);
    } else {
      drawSignatures(doc, sigY, pageWidth, margin, contentWidth, navy, gray, order, userRole, userName);
    }
    
    // ========== FOOTER ==========
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(...navy);
      doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
      doc.setFontSize(6);
      doc.setTextColor(...white);
      doc.text(
        `Documento gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}  |  Página ${i}/${totalPages}`,
        pageWidth / 2, pageHeight - 4, { align: 'center' }
      );
    }
    
    doc.save(`${order.order_number}.pdf`);
  };

  // Helper function for drawing signature section
  const drawSignatures = (
    doc: jsPDF,
    sigY: number,
    pageWidth: number,
    margin: number,
    contentWidth: number,
    navy: [number, number, number],
    gray: [number, number, number],
    order: ServiceOrder,
    userRole: string,
    userName: string
  ) => {
    const sigWidth = (contentWidth - 20) / 3;
    
    doc.setDrawColor(...gray);
    doc.setLineWidth(0.4);
    
    // Signature 1: Motorista/Operador
    const sig1X = margin;
    doc.line(sig1X, sigY + 15, sig1X + sigWidth, sigY + 15);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('MOTORISTA / OPERADOR', sig1X + sigWidth / 2, sigY + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...gray);
    doc.text('Nome:', sig1X, sigY + 25);
    doc.text('Data: ___/___/______', sig1X, sigY + 29);
    
    // Signature 2: Mecânico
    const sig2X = margin + sigWidth + 10;
    doc.line(sig2X, sigY + 15, sig2X + sigWidth, sigY + 15);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text('MECÂNICO RESPONSÁVEL', sig2X + sigWidth / 2, sigY + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...gray);
    doc.text(`Nome: ${order.mechanic_name || ''}`, sig2X, sigY + 25);
    doc.text('Data: ___/___/______', sig2X, sigY + 29);
    
    // Signature 3: Aprovação
    const sig3X = margin + (sigWidth + 10) * 2;
    doc.line(sig3X, sigY + 15, sig3X + sigWidth, sigY + 15);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    const approvalTitle = userRole === 'admin' ? 'APROVAÇÃO (ADMIN)' : 
                          userRole === 'supervisor' ? 'APROVAÇÃO (SUPERVISOR)' : 
                          'RESPONSÁVEL TÉCNICO';
    doc.text(approvalTitle, sig3X + sigWidth / 2, sigY + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...gray);
    doc.text(`Nome: ${userName}`, sig3X, sigY + 25);
    doc.text('Data: ___/___/______', sig3X, sigY + 29);
  };

  // Export list to PDF
  const exportListToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Navy header bar (matching system theme)
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    const headerTitle = obraSettings?.nome ? `${obraSettings.nome} - ORDENS DE SERVIÇO` : 'RELATÓRIO DE ORDENS DE SERVIÇO';
    doc.text(headerTitle.toUpperCase(), pageWidth / 2, 12, { align: 'center' });
    
    if (obraSettings?.cidade) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(obraSettings.cidade, pageWidth / 2, 20, { align: 'center' });
    }
    
    let y = 35;
    
    // Filters info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    
    const dateRangeText = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    const companyText = companyFilter !== 'all' ? companyFilter : 'Todas';
    const statusText = statusFilter === 'all' ? 'Todos' : statusFilter === 'manutencao' ? 'Em Manutenção' : statusFilter;
    
    doc.text(`Período: ${dateRangeText}`, 14, y);
    doc.text(`Empresa: ${companyText}`, 120, y);
    doc.text(`Status: ${statusText}`, 200, y);
    y += 6;
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, y);
    doc.text(`Total: ${filteredRows.length} ordens`, 120, y);

    y += 10;
    
    // Summary badges
    doc.setFillColor(220, 53, 69);
    doc.roundedRect(14, y, 45, 15, 2, 2, 'F');
    doc.setFillColor(245, 158, 11);
    doc.roundedRect(64, y, 45, 15, 2, 2, 'F');
    doc.setFillColor(239, 68, 68);
    doc.roundedRect(114, y, 45, 15, 2, 2, 'F');
    doc.setFillColor(34, 197, 94);
    doc.roundedRect(164, y, 45, 15, 2, 2, 'F');
    
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Em Manutenção: ${metrics.emManutencao}`, 36.5, y + 10, { align: 'center' });
    doc.text(`Aguardando: ${metrics.aguardandoPecas}`, 86.5, y + 10, { align: 'center' });
    doc.text(`Urgentes: ${metrics.urgentes}`, 136.5, y + 10, { align: 'center' });
    doc.text(`Finalizadas: ${metrics.finalizadas}`, 186.5, y + 10, { align: 'center' });
    
    y += 22;

    const tableData = filteredRows.slice(0, 100).map((row) => {
      const company = vehicleCompanyMap.get(row.vehicle_code) || '-';
      const entryDate = (row as any).entry_date || row.order_date;
      const entryTime = (row as any).entry_time;
      const entryFormatted = entryDate 
        ? format(new Date(entryDate), 'dd/MM/yy') + (entryTime ? ` ${entryTime.slice(0, 5)}` : '')
        : '-';
      const downtime = calculateDowntime(row) || '-';
      
      return [
        row.order_number,
        row.vehicle_code,
        company,
        row.problem_description || '-',
        row.mechanic_name || '-',
        entryFormatted,
        downtime,
        row.status
      ];
    });

    autoTable(doc, {
      head: [['Nº OS', 'Veículo', 'Empresa', 'Problema', 'Mecânico', 'Entrada', 'T. Parado', 'Status']],
      body: tableData,
      startY: y,
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        0: { cellWidth: 18 },  // Nº OS
        1: { cellWidth: 18 },  // Veículo
        2: { cellWidth: 20 },  // Empresa
        3: { cellWidth: 'auto', overflow: 'linebreak' },  // Problema - quebra automática
        4: { cellWidth: 22 },  // Mecânico
        5: { cellWidth: 24 },  // Entrada
        6: { cellWidth: 18 },  // T. Parado
        7: { cellWidth: 22 },  // Status
      },
    });

    const fileName = companyFilter !== 'all' 
      ? `ordens_servico_${companyFilter.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`
      : `ordens_servico_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`;
    
    doc.save(fileName);
  };

  // Export list to XLSX
  const exportListToXLSX = () => {
    const xlsxData = filteredRows.map((row) => {
      const company = vehicleCompanyMap.get(row.vehicle_code) || '-';
      const entryDate = (row as any).entry_date || row.order_date;
      const entryTime = (row as any).entry_time;
      const entryFormatted = entryDate 
        ? format(new Date(entryDate), 'dd/MM/yyyy') + (entryTime ? ` ${entryTime.slice(0, 5)}` : '')
        : '-';
      const downtime = calculateDowntime(row) || '-';
      
      return {
        'Nº OS': row.order_number,
        'Veículo': row.vehicle_code,
        'Descrição': row.vehicle_description || '-',
        'Empresa': company,
        'Tipo': row.order_type,
        'Prioridade': row.priority,
        'Problema': row.problem_description || '-',
        'Solução': row.solution_description || '-',
        'Mecânico': row.mechanic_name || '-',
        'Data de Entrada': entryFormatted,
        'T. Parado': downtime,
        'Status': row.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(xlsxData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ordens de Serviço');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Nº OS
      { wch: 12 }, // Veículo
      { wch: 25 }, // Descrição
      { wch: 15 }, // Empresa
      { wch: 12 }, // Tipo
      { wch: 12 }, // Prioridade
      { wch: 40 }, // Problema
      { wch: 40 }, // Solução
      { wch: 20 }, // Mecânico
      { wch: 18 }, // Data de Entrada
      { wch: 12 }, // T. Parado
      { wch: 15 }, // Status
    ];

    const fileName = companyFilter !== 'all' 
      ? `ordens_servico_${companyFilter.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`
      : `ordens_servico_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
    toast.success('Relatório Excel exportado!');
  };

  // Vehicles from sheet
  const vehicles = useMemo(() => {
    return vehiclesData.rows.map(v => ({
      code: String(v['Codigo'] || ''),
      description: String(v['Descricao'] || ''),
    })).filter(v => v.code);
  }, [vehiclesData.rows]);

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Wrench className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Ordens de Serviço</h1>
              <p className="text-sm text-muted-foreground">Manutenção preventiva e corretiva</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={importFromSheet} 
              disabled={isSyncing}
              title="Importar histórico da planilha"
            >
              <Download className={cn("w-4 h-4 sm:mr-2", isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">{isSyncing ? 'Importando...' : 'Importar Histórico'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportListToPDF}>
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportListToXLSX}>
              <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button className="bg-primary hover:bg-primary/90" onClick={handleNewOrder}>
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Nova O.S.</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title="EM MANUTENÇÃO"
            value={metrics.emManutencao.toString()}
            subtitle="Abertas + Em andamento"
            variant="blue"
            icon={Wrench}
          />
          <MetricCard
            title="AGUARDANDO PEÇAS"
            value={metrics.aguardandoPecas.toString()}
            subtitle="Paradas"
            variant="yellow"
            icon={Clock}
          />
          <MetricCard
            title="URGENTES"
            value={metrics.urgentes.toString()}
            subtitle="Prioridade alta"
            variant="red"
            icon={AlertTriangle}
          />
          <MetricCard
            title="FINALIZADAS"
            value={metrics.finalizadas.toString()}
            subtitle="Total no período"
            variant="green"
            icon={CheckCircle}
          />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-foreground bg-muted/50"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar veículo, nº OS, mecânico..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manutencao">🔧 Em Manutenção</SelectItem>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="aberta">📋 Aberta</SelectItem>
                <SelectItem value="andamento">🔧 Em Andamento</SelectItem>
                <SelectItem value="aguardando">📦 Aguardando Peças</SelectItem>
                <SelectItem value="aprovação">⏳ Aguardando Aprovação</SelectItem>
                <SelectItem value="orçamento">💰 Em Orçamento</SelectItem>
                <SelectItem value="pausada">⏸️ Pausada</SelectItem>
                <SelectItem value="cancelada">❌ Cancelada</SelectItem>
                <SelectItem value="finalizada">✅ Finalizada</SelectItem>
                {customStatuses.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1">
                      Personalizados
                    </div>
                    {customStatuses.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toLowerCase()}>
                        {opt.icon} {opt.value}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>

            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🏢 Todas Empresas</SelectItem>
                {companies.map(company => (
                  <SelectItem key={company} value={company}>
                    {company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {startDate ? format(startDate, 'dd/MM/yyyy') : 'Data início'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => {
                      setStartDate(date);
                      setQuickFilter(null);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              
              <span className="text-sm text-muted-foreground">até</span>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {endDate ? format(endDate, 'dd/MM/yyyy') : 'Data fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => {
                      setEndDate(date);
                      setQuickFilter(null);
                    }}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant={quickFilter === 'hoje' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('hoje')}
              >
                Hoje
              </Button>
              <Button
                variant={quickFilter === 'semana' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('semana')}
              >
                7 dias
              </Button>
              <Button
                variant={quickFilter === 'mes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('mes')}
              >
                Mês
              </Button>
              <Button
                variant={quickFilter === 'todos' ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyQuickFilter('todos')}
              >
                Todos
              </Button>
            </div>

            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={clearDateFilter}>
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Período:</span>
            <span className="font-medium">
              {startDate && endDate 
                ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
                : 'Todo período'}
            </span>
            <span className="text-muted-foreground">• {filteredRows.length} ordens</span>
          </div>
        </div>

        {/* Table */}
        {activeTab === 'ordens' && (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="py-2 px-2 whitespace-nowrap">Nº OS</TableHead>
                  <TableHead className="py-2 px-2 whitespace-nowrap">Veículo</TableHead>
                  <TableHead className="py-2 px-2 whitespace-nowrap">Tipo</TableHead>
                  <TableHead className="py-2 px-2 hidden md:table-cell">Problema</TableHead>
                  <TableHead className="py-2 px-2 hidden lg:table-cell whitespace-nowrap">Mecânico</TableHead>
                  <TableHead className="py-2 px-2 whitespace-nowrap">Prioridade</TableHead>
                  <TableHead className="py-2 px-2 whitespace-nowrap">Status</TableHead>
                  <TableHead className="py-2 px-2 whitespace-nowrap">Entrada</TableHead>
                  <TableHead className="py-2 px-2 hidden sm:table-cell whitespace-nowrap">T. Parado</TableHead>
                  <TableHead className="py-2 px-2 text-right whitespace-nowrap">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Nenhuma ordem de serviço encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const downtime = calculateDowntime(row);
                    const isFinished = row.status.toLowerCase().includes('finalizada');
                    
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/30">
                        <TableCell className="py-2 px-2 font-mono font-medium text-xs">{row.order_number}</TableCell>
                        <TableCell className="py-2 px-2 font-medium text-xs">{row.vehicle_code}</TableCell>
                        <TableCell className="py-2 px-2">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={row.order_type === 'Preventiva' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                              {row.order_type === 'Preventiva' ? 'Prev.' : 'Corr.'}
                            </Badge>
                            {row.order_type === 'Preventiva' && isFinished && (row as any).interval_days && (
                              (() => {
                                const endDate = row.end_date ? new Date(row.end_date) : new Date(row.order_date);
                                const nextDate = addDays(endDate, (row as any).interval_days);
                                const daysUntil = differenceInDays(nextDate, new Date());
                                return (
                                  <span className={cn(
                                    "text-[9px] font-medium",
                                    daysUntil <= 7 ? "text-red-600" : daysUntil <= 30 ? "text-amber-600" : "text-green-600"
                                  )}>
                                    🔄 {format(nextDate, 'dd/MM')}
                                  </span>
                                );
                              })()
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 px-2 hidden md:table-cell max-w-[150px] truncate text-xs">
                          {row.problem_description || '-'}
                        </TableCell>
                        <TableCell className="py-2 px-2 hidden lg:table-cell text-xs">{row.mechanic_name || '-'}</TableCell>
                        <TableCell className="py-2 px-2">{getPrioridadeBadge(row.priority)}</TableCell>
                        <TableCell className="py-2 px-2">
                          {getStatusBadge(row.status)}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-xs whitespace-nowrap">
                          {((row as any).entry_date || row.order_date) ? (
                            <span className="font-mono">
                              {format(new Date((row as any).entry_date || row.order_date), 'dd/MM/yy')}
                              {(row as any).entry_time && (
                                <span className="text-muted-foreground ml-1">{(row as any).entry_time.slice(0, 5)}</span>
                              )}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="py-2 px-2 hidden sm:table-cell">
                          {downtime ? (
                            <Badge className={cn(
                              "font-mono text-[10px] px-1.5 py-0",
                              isFinished 
                                ? "bg-green-500/20 text-green-600 border-green-500/30" 
                                : "bg-amber-500/20 text-amber-600 border-amber-500/30"
                            )}>
                              <Timer className="w-2.5 h-2.5 mr-0.5" />
                              {downtime}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="py-2 px-2 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleWhatsAppRelease(row)}
                              title={row.status.toLowerCase().includes('finalizada') ? 'WhatsApp: Veículo liberado' : 'WhatsApp: Atualização'}
                              className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/50"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => exportSingleOSToPDF(row)}
                              title="Exportar PDF"
                              className="h-7 w-7"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditOrder(row)}
                              className="h-7 w-7"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteOrder(row)}
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Problemas Recorrentes Tab */}
        {activeTab === 'problemas' && (
          <RecurringProblemsTab orders={orders} />
        )}

        {/* Ranking Tab */}
        {activeTab === 'ranking' && (
          <MaintenanceRankingTab orders={orders} />
        )}
      </div>

      {/* Order Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              {editingOrder ? `Editar ${editingOrder.order_number}` : 'Nova Ordem de Serviço'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Vehicle and Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Veículo *</Label>
                <VehicleCombobox
                  vehicles={vehicles}
                  value={formData.vehicle_code}
                  onValueChange={handleVehicleSelect}
                  placeholder="Pesquisar veículo..."
                  emptyMessage="Nenhum veículo encontrado."
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Manutenção</Label>
                <Select value={formData.order_type} onValueChange={(v) => setFormData({ ...formData, order_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corretiva">Corretiva</SelectItem>
                    <SelectItem value="Preventiva">Preventiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Interval Days for Preventive Maintenance */}
            {formData.order_type === 'Preventiva' && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-blue-700 dark:text-blue-300">Programação de Revisão</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Intervalo (dias)</Label>
                    <Select 
                      value={formData.interval_days} 
                      onValueChange={(v) => setFormData({ ...formData, interval_days: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 dias</SelectItem>
                        <SelectItem value="60">60 dias</SelectItem>
                        <SelectItem value="90">90 dias</SelectItem>
                        <SelectItem value="120">120 dias</SelectItem>
                        <SelectItem value="180">180 dias (6 meses)</SelectItem>
                        <SelectItem value="365">365 dias (1 ano)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Próxima Revisão</Label>
                    <div className="h-10 px-3 py-2 bg-white dark:bg-slate-800 border border-input rounded-md flex items-center">
                      <span className="text-sm font-medium">
                        {formData.entry_date 
                          ? format(addDays(new Date(formData.entry_date), parseInt(formData.interval_days) || 90), 'dd/MM/yyyy')
                          : format(addDays(new Date(), parseInt(formData.interval_days) || 90), 'dd/MM/yyyy')
                        }
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                  A próxima revisão será agendada automaticamente no Calendário de Manutenções ao finalizar esta OS.
                </p>
              </div>
            )}

            {/* Vehicle History - shown when vehicle is selected */}
            {vehicleHistory && formData.vehicle_code && (
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <History className="w-5 h-5" />
                  <span className="font-semibold">Histórico do Veículo: {formData.vehicle_code}</span>
                </div>
                
                {vehicleHistory.category && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded">
                      <span className="text-muted-foreground">Categoria:</span>
                      <p className="font-medium">{vehicleHistory.category}</p>
                    </div>
                    <div className="bg-white/50 dark:bg-slate-800/50 p-2 rounded">
                      <span className="text-muted-foreground">Empresa:</span>
                      <p className="font-medium">{vehicleHistory.company || '-'}</p>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-blue-600 dark:text-blue-400 mb-1">
                      <ClipboardList className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{vehicleHistory.totalOrders}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">Ordens Total</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-amber-600 dark:text-amber-400 mb-1">
                      <Timer className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{vehicleHistory.totalHours}h</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Horas Total</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-center">
                    <div className="flex items-center justify-center gap-1 text-purple-600 dark:text-purple-400 mb-1">
                      <CalendarDays className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{vehicleHistory.totalDays}</p>
                    <p className="text-xs text-purple-600 dark:text-purple-400">Dias Parado</p>
                  </div>
                </div>
                
                {vehicleHistory.lastOrder && (
                  <div className="bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground mb-2">Última Manutenção:</p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{vehicleHistory.lastOrder.order_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(vehicleHistory.lastOrder.order_date), 'dd/MM/yyyy')}
                      </span>
                      {getStatusBadge(vehicleHistory.lastOrder.status)}
                    </div>
                    
                    {/* Horimeter/KM from last maintenance */}
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-slate-600">
                      <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <div>
                          <p className="text-xs text-muted-foreground">Horímetro na OS</p>
                          <p className="font-bold text-amber-700 dark:text-amber-400">
                            {vehicleHistory.lastHorimeter 
                              ? `${vehicleHistory.lastHorimeter.toLocaleString('pt-BR')}h`
                              : '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/30 rounded p-2">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="text-xs text-muted-foreground">KM na OS</p>
                          <p className="font-bold text-blue-700 dark:text-blue-400">
                            {vehicleHistory.lastKm 
                              ? `${vehicleHistory.lastKm.toLocaleString('pt-BR')} km`
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {vehicleHistory.lastOrder.problem_description && (
                      <p className="text-xs text-muted-foreground mt-2 truncate">
                        <span className="font-medium">Problema:</span> {vehicleHistory.lastOrder.problem_description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Entry Date is now the primary date - Order Date section removed */}

            {/* Entry Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Data de Entrada
                </Label>
                <Input
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Hora de Entrada
                </Label>
                <Input
                  type="time"
                  value={formData.entry_time}
                  onChange={(e) => setFormData({ ...formData, entry_time: e.target.value })}
                />
              </div>
            </div>

            {/* Exit Date and Time - editable */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-600" />
                  Data de Saída
                </Label>
                <Input
                  type="date"
                  value={formData.exit_date}
                  onChange={(e) => setFormData({ ...formData, exit_date: e.target.value })}
                  className="border-green-300 dark:border-green-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-green-600" />
                  Hora de Saída
                </Label>
                <Input
                  type="time"
                  value={formData.exit_time}
                  onChange={(e) => setFormData({ ...formData, exit_time: e.target.value })}
                  className="border-green-300 dark:border-green-700"
                />
              </div>
            </div>

            {/* Downtime display - show when entry and exit dates exist */}
            {formData.entry_date && formData.exit_date && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                  <Timer className="w-5 h-5" />
                  <span className="font-semibold">Tempo Total Parado</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {(() => {
                    const entryDateTime = formData.entry_time 
                      ? new Date(`${formData.entry_date}T${formData.entry_time}`)
                      : new Date(`${formData.entry_date}T00:00`);
                    const exitDateTime = formData.exit_time 
                      ? new Date(`${formData.exit_date}T${formData.exit_time}`)
                      : new Date(`${formData.exit_date}T00:00`);
                    
                    const diffMs = exitDateTime.getTime() - entryDateTime.getTime();
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffDays = Math.floor(diffHours / 24);
                    const remainingHours = diffHours % 24;
                    
                    return (
                      <>
                        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                          <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                            {diffDays > 0 ? diffDays : diffHours}
                          </p>
                          <p className="text-sm text-green-600 dark:text-green-400">
                            {diffDays > 0 ? 'dias' : 'horas'}
                          </p>
                        </div>
                        <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
                            {diffDays > 0 ? remainingHours : Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))}
                          </p>
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            {diffDays > 0 ? 'horas' : 'minutos'}
                          </p>
                        </div>
                      </>
                    );
                  })()}
                </div>
                <p className="text-xs text-green-600 dark:text-green-400 mt-2 text-center">
                  De {format(new Date(`${formData.entry_date}T00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                  {formData.entry_time && ` às ${formData.entry_time}`}
                  {' até '}
                  {format(new Date(`${formData.exit_date}T00:00`), 'dd/MM/yyyy', { locale: ptBR })}
                  {formData.exit_time && ` às ${formData.exit_time}`}
                </p>
              </div>
            )}

            {/* Priority and Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                    <SelectItem value="Urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>Status</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-primary"
                    onClick={() => setIsAddingStatus(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Novo Status
                  </Button>
                </Label>
                
                {isAddingStatus ? (
                  <div className="flex gap-2">
                    <Input
                      value={newStatusInput}
                      onChange={(e) => setNewStatusInput(e.target.value)}
                      placeholder="Nome do novo status..."
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomStatus();
                        }
                        if (e.key === 'Escape') {
                          setIsAddingStatus(false);
                          setNewStatusInput('');
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddCustomStatus}
                      disabled={!newStatusInput.trim()}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsAddingStatus(false);
                        setNewStatusInput('');
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Default status options */}
                      {DEFAULT_STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.icon} {opt.value}
                        </SelectItem>
                      ))}
                      
                      {/* Custom status options */}
                      {customStatuses.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1">
                            Status Personalizados
                          </div>
                          {customStatuses.map(opt => (
                            <div key={opt.value} className="flex items-center justify-between group">
                              <SelectItem value={opt.value} className="flex-1">
                                {opt.icon} {opt.value}
                              </SelectItem>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveCustomStatus(opt.value);
                                }}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Horimeter / KM */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Horímetro Atual
                  {vehicleHistory?.lastHorimeter && (
                    <span className="text-xs text-muted-foreground font-normal">
                      (último: {formatPtBRNumber(vehicleHistory.lastHorimeter)}h)
                    </span>
                  )}
                </Label>
                <BrazilianNumberInput
                  placeholder="Ex: 4500,50"
                  value={formData.horimeter_current}
                  onChange={(val) => {
                    setFormData({ ...formData, horimeter_current: val });
                    validateHorimeter(val);
                  }}
                  decimals={2}
                  className={horimeterWarning ? 'border-amber-500' : ''}
                />
                {horimeterWarning && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {horimeterWarning}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  KM Atual
                  {vehicleHistory?.lastKm && (
                    <span className="text-xs text-muted-foreground font-normal">
                      (último: {formatPtBRNumber(vehicleHistory.lastKm, { decimals: 0 })} km)
                    </span>
                  )}
                </Label>
                <BrazilianNumberInput
                  placeholder="Ex: 120000"
                  value={formData.km_current}
                  onChange={(val) => {
                    setFormData({ ...formData, km_current: val });
                    validateKm(val);
                  }}
                  decimals={0}
                  className={kmWarning ? 'border-amber-500' : ''}
                />
                {kmWarning && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {kmWarning}
                  </p>
                )}
              </div>
            </div>

            {/* Mechanic */}
            <div className="space-y-2">
              <Label>Mecânico Responsável</Label>
              <Select value={formData.mechanic_id} onValueChange={(v) => setFormData({ ...formData, mechanic_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o mecânico" />
                </SelectTrigger>
                <SelectContent>
                  {mechanics.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mechanics.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Cadastre mecânicos em Cadastros → Mecânicos
                </p>
              )}
            </div>

            {/* Problem Description */}
            <div className="space-y-2">
              <Label>Descrição do Problema *</Label>
              <Textarea
                placeholder="Descreva o problema detalhadamente..."
                value={formData.problem_description}
                onChange={(e) => setFormData({ ...formData, problem_description: e.target.value })}
                rows={3}
              />
            </div>

            {/* Solution Description */}
            <div className="space-y-2">
              <Label>Solução / Serviço Realizado</Label>
              <Textarea
                placeholder="Descreva a solução ou serviço realizado..."
                value={formData.solution_description}
                onChange={(e) => setFormData({ ...formData, solution_description: e.target.value })}
                rows={3}
              />
            </div>

            {/* Hours */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horas Estimadas</Label>
                <BrazilianNumberInput
                  placeholder="Ex: 4,5"
                  value={formData.estimated_hours}
                  onChange={(val) => setFormData({ ...formData, estimated_hours: val })}
                  decimals={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Horas Realizadas</Label>
                <BrazilianNumberInput
                  placeholder="Ex: 5,5"
                  value={formData.actual_hours}
                  onChange={(val) => setFormData({ ...formData, actual_hours: val })}
                  decimals={1}
                />
              </div>
            </div>

            {/* Parts */}
            <div className="space-y-2">
              <Label>Peças Utilizadas</Label>
              <Textarea
                placeholder="Liste as peças utilizadas..."
                value={formData.parts_used}
                onChange={(e) => setFormData({ ...formData, parts_used: e.target.value })}
                rows={2}
              />
            </div>

            {/* Costs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Custo Peças (R$)</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={formData.parts_cost}
                  onChange={(e) => setFormData({ ...formData, parts_cost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Custo Mão de Obra (R$)</Label>
                <Input
                  type="number"
                  placeholder="0,00"
                  value={formData.labor_cost}
                  onChange={(e) => setFormData({ ...formData, labor_cost: e.target.value })}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações adicionais..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>

            {/* Photos */}
            <OSPhotoUpload
              photos={{
                before: formData.photo_before_url,
                after: formData.photo_after_url,
                parts: formData.photo_parts_url,
                photo4: formData.photo_4_url,
                photo5: formData.photo_5_url,
              }}
              onPhotoChange={(key, url) => {
                const fieldMap: Record<string, string> = {
                  before: 'photo_before_url',
                  after: 'photo_after_url',
                  parts: 'photo_parts_url',
                  photo4: 'photo_4_url',
                  photo5: 'photo_5_url',
                };
                setFormData({ ...formData, [fieldMap[key]]: url });
              }}
              orderNumber={editingOrder?.order_number}
              vehicleCode={formData.vehicle_code}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSaveOrder} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Status Change Modal for Finalization */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Finalizar Ordem de Serviço
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {statusChangeOrder && (
              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <p className="font-medium">{statusChangeOrder.order_number}</p>
                <p className="text-sm text-muted-foreground">
                  {statusChangeOrder.vehicle_code} - {statusChangeOrder.vehicle_description}
                </p>
              </div>
            )}
            
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Informe a data e hora de saída para calcular corretamente o tempo de parada:
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-green-600" />
                    Data de Saída *
                  </Label>
                  <Input
                    type="date"
                    value={exitDate}
                    onChange={(e) => setExitDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-green-600" />
                    Hora de Saída *
                  </Label>
                  <Input
                    type="time"
                    value={exitTime}
                    onChange={(e) => setExitTime(e.target.value)}
                  />
                </div>
              </div>
              
              {/* Preview downtime calculation */}
              {statusChangeOrder && (statusChangeOrder as any).entry_date && exitDate && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300 mb-2">
                    <Timer className="w-4 h-4" />
                    <span className="font-semibold text-sm">Tempo Total Parado</span>
                  </div>
                  {(() => {
                    const entryDate = (statusChangeOrder as any).entry_date;
                    const entryTime = (statusChangeOrder as any).entry_time;
                    const entryDateTime = entryTime 
                      ? new Date(`${entryDate}T${entryTime}`)
                      : new Date(`${entryDate}T00:00`);
                    const exitDateTime = new Date(`${exitDate}T${exitTime || '00:00'}`);
                    
                    const diffMs = exitDateTime.getTime() - entryDateTime.getTime();
                    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                    const diffDays = Math.floor(diffHours / 24);
                    const remainingHours = diffHours % 24;
                    
                    return (
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                            {diffDays > 0 ? `${diffDays}d ${remainingHours}h` : `${diffHours}h`}
                          </p>
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400">
                          <p>Entrada: {format(entryDateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                          <p>Saída: {format(exitDateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button 
              onClick={confirmFinalization} 
              disabled={!exitDate || !exitTime}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Confirmar Finalização
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
