import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { 
  Fuel, 
  RefreshCw, 
  Printer, 
  FileText, 
  Wifi, 
  Database,
  Search,
  Calendar,
  X,
  BarChart3,
  List,
  Droplet,
  ArrowDownUp,
  FileSpreadsheet,
  MapPin,
  Filter,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Download,
  Building2,
  Eye,
  Image,
  Truck,
  Plus,
  Edit2,
  PenLine,
  ChevronDown,
  ChevronUp,
  Save,
  Trash2,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AdminFuelRecordModal, type AdminPresetMode } from '@/components/Dashboard/AdminFuelRecordModal';
import { AdminServiceOrderModal } from '@/components/Dashboard/AdminServiceOrderModal';
import { DatabaseHorimeterModal } from '@/components/Horimetros/DatabaseHorimeterModal';
import { StockPanelTab } from '@/components/Dashboard/StockPanelTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { MetricCard } from '@/components/Dashboard/MetricCard';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { renderStandardHeader, getLogoBase64, renderKpiBoxes } from '@/lib/pdfHeader';
import { toast } from 'sonner';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const SHEET_NAME = 'AbastecimentoCanteiro01';
const GERAL_SHEET = 'Geral';
const SANEAMENTO_STOCK_SHEET = 'EstoqueObraSaneamento';

import { Package2, Wrench, BarChart, Fuel as FuelIcon, Gauge, Layers } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useObraSettings } from '@/hooks/useObraSettings';
import { HorimeterCorrectionsTab } from '@/components/Abastecimento/HorimeterCorrectionsTab';
import { VehicleConsumptionDetailTab } from '@/components/Abastecimento/VehicleConsumptionDetailTab';
import { GeneralFuelingReport } from '@/components/Abastecimento/GeneralFuelingReport';
import { exportTanquesComboiosPDF, exportTanquesComboiosXLSX, exportTanquesPDF, exportTanquesXLSX, exportComboiosPDF, exportComboiosXLSX, type TanquesComboiosStockData } from '@/components/Abastecimento/TanquesComboiosReport';
import { ReportsTab } from '@/components/Abastecimento/ReportsTab';
import { PdfPreviewModal } from '@/components/Abastecimento/PdfPreviewModal';
import { useReportConfig, type ReportConfig, type ReportStyleConfig } from '@/hooks/useReportConfig';


const TABS = [
  { id: 'painel', label: 'Estoque', icon: Package2 },
  
  { id: 'detalhamento', label: 'Lançamentos', icon: List },
  
  { id: 'consumo', label: 'Consumo', icon: BarChart },
  { id: 'saneamento', label: 'Saneamento', icon: Droplet },
  { id: 'entradas', label: 'Entradas', icon: ArrowDownUp },
  
  { id: 'relatorios', label: 'Relatórios', icon: FileSpreadsheet },
];

const PERIOD_OPTIONS = [
  { value: 'hoje', label: 'Hoje' },
  { value: 'ontem', label: 'Ontem' },
  { value: '7dias', label: 'Últimos 7 dias' },
  { value: '30dias', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'personalizado', label: 'Personalizado' },
];

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Try DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const date = new Date(year, month, day);
    if (isValid(date)) return date;
  }
  
  // Try other formats
  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

export function AbastecimentoPage() {
  const { user } = useAuth();
  // Polling de 10s como fallback para edições feitas diretamente na planilha
  const POLL_MS = 10000;
  const { data, setData, loading, refetch } = useSheetData(SHEET_NAME, { pollingInterval: POLL_MS });
  const { settings: obraSettings } = useObraSettings();
  const { config: lancTanquesConfig } = useReportConfig('lancamentos_tanques');

  const {
    data: geralData,
    refetch: refetchGeral,
    loading: geralLoading,
    lastUpdatedAt: geralUpdatedAt,
  } = useSheetData(GERAL_SHEET, { pollingInterval: POLL_MS });

  const { data: saneamentoStockData } = useSheetData(SANEAMENTO_STOCK_SHEET, { suppressErrors: true });

  // Stock sheets — polling de 10s + atualização por evento Supabase Realtime
  const {
    data: estoqueComboio01Data,
    refetch: refetchComboio01,
    loading: comboio01Loading,
    lastUpdatedAt: comboio01UpdatedAt,
  } = useSheetData('EstoqueComboio01', { pollingInterval: POLL_MS, suppressErrors: true });

  const {
    data: estoqueComboio02Data,
    refetch: refetchComboio02,
    loading: comboio02Loading,
    lastUpdatedAt: comboio02UpdatedAt,
  } = useSheetData('EstoqueComboio02', { pollingInterval: POLL_MS, suppressErrors: true });

  const {
    data: estoqueComboio03Data,
    refetch: refetchComboio03,
    loading: comboio03Loading,
    lastUpdatedAt: comboio03UpdatedAt,
  } = useSheetData('EstoqueComboio03', { pollingInterval: POLL_MS, suppressErrors: true });

  const {
    data: estoqueCanteiro01Data,
    refetch: refetchCanteiro01,
    loading: canteiro01Loading,
    lastUpdatedAt: canteiro01UpdatedAt,
  } = useSheetData('EstoqueCanteiro01', { pollingInterval: POLL_MS, suppressErrors: true });

  const {
    data: estoqueCanteiro02Data,
    refetch: refetchCanteiro02,
    loading: canteiro02Loading,
    lastUpdatedAt: canteiro02UpdatedAt,
  } = useSheetData('EstoqueCanteiro02', { pollingInterval: POLL_MS, suppressErrors: true });
  const [activeTab, setActiveTab] = useState('painel');
  const [search, setSearch] = useState('');
  const [localFilter, setLocalFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [combustivelFilter, setCombustivelFilter] = useState('all');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('hoje');
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [isExporting, setIsExporting] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showAdminRecordModal, setShowAdminRecordModal] = useState(false);
  const [adminPresetMode, setAdminPresetMode] = useState<AdminPresetMode>('normal');
  const [adminPresetLocation, setAdminPresetLocation] = useState<string>('');
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [previousRecords, setPreviousRecords] = useState<any[]>([]);
  const [showPreviousRecord, setShowPreviousRecord] = useState(false);
  const [selectedPreviousIdx, setSelectedPreviousIdx] = useState<number | null>(null);
  const [showHorimeterModal, setShowHorimeterModal] = useState(false);
  const [showOSModal, setShowOSModal] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [sortByDescription, setSortByDescription] = useState(false);
  const [reportCategoryFilter, setReportCategoryFilter] = useState('all');
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [previewPdfName, setPreviewPdfName] = useState('relatorio.pdf');
  
  // Inline editing state for expanded rows
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
  const [inlineEditData, setInlineEditData] = useState<any>(null);
  const [isSavingInline, setIsSavingInline] = useState(false);

  // Delete confirmation state
  const [deletingRecord, setDeletingRecord] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  
  // Pending sync state
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  
  
  // Correction filter state for Lançamentos tab
  const [correctionFilter, setCorrectionFilter] = useState<'all' | 'zero_interval' | 'high_interval' | 'zero_consumption' | 'all_issues'>('all');
  const [detalhamentoSubTab, setDetalhamentoSubTab] = useState<'saidas' | 'carregamentos' | 'entradas'>('saidas');

  // Find previous record when editing a record
  useEffect(() => {
    if (!editingRecord || !showEditModal) {
      setPreviousRecords([]);
      setShowPreviousRecord(false);
      setSelectedPreviousIdx(null);
      return;
    }
    const vehicleCode = String(editingRecord['VEICULO'] || '').trim().toUpperCase();
    if (!vehicleCode) { setPreviousRecords([]); return; }

    const editDate = parseDate(String(editingRecord['DATA'] || ''));
    const editTime = String(editingRecord['HORA'] || '').trim();
    const editRowIndex = editingRecord._rowIndex ?? Infinity;

    // Find all records for same vehicle, sorted by date desc
    const vehicleRows = data.rows
      .filter(row => {
        const code = String(row['VEICULO'] || '').trim().toUpperCase();
        return code === vehicleCode;
      })
      .map(row => {
        const d = parseDate(String(row['DATA'] || ''));
        const t = String(row['HORA'] || '').trim();
        return { row, date: d, time: t, rowIndex: row._rowIndex ?? 0 };
      })
      .filter(r => r.date)
      .sort((a, b) => {
        const diff = (b.date!.getTime()) - (a.date!.getTime());
        if (diff !== 0) return diff;
        if (b.time && a.time) return b.time.localeCompare(a.time);
        return (b.rowIndex as number) - (a.rowIndex as number);
      });

    // Find current record index then get the ones after it (previous chronologically)
    const currentIdx = vehicleRows.findIndex(r => {
      if (r.rowIndex === editRowIndex) return true;
      if (editDate && r.date && r.date.getTime() === editDate.getTime() && r.time === editTime) return true;
      return false;
    });

    if (currentIdx >= 0 && currentIdx < vehicleRows.length - 1) {
      const prev = vehicleRows.slice(currentIdx + 1, currentIdx + 6).map(r => r.row);
      setPreviousRecords(prev);
    } else {
      setPreviousRecords([]);
    }
  }, [editingRecord, showEditModal, data.rows]);

  // Check pending records count on mount and after refetch
  const checkPendingSync = useCallback(async () => {
    try {
      const { count } = await supabase
        .from('field_fuel_records')
        .select('*', { count: 'exact', head: true })
        .eq('synced_to_sheet', false);
      setPendingSyncCount(count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { checkPendingSync(); }, [checkPendingSync]);

  // Retry sync for all unsynced records via edge function
  const syncPendingToSheet = useCallback(async () => {
    if (isSyncingPending) return;
    setIsSyncingPending(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-pending-fuel', {});
      if (error) throw error;
      if (data?.synced > 0) {
        toast.success(`✅ ${data.synced} registro(s) sincronizado(s) com a planilha!`);
        // Refetch sheet data to show the newly synced records
        await Promise.all([refetch(), refetchGeral()]);
      } else {
        toast.info('Nenhum registro pendente para sincronizar.');
      }
      await checkPendingSync();
    } catch (err) {
      console.error('Sync pending failed:', err);
      toast.error('Erro ao sincronizar registros pendentes');
    } finally {
      setIsSyncingPending(false);
    }
  }, [isSyncingPending, refetch, refetchGeral, checkPendingSync]);

  // Store field users for location responsibility mapping
  const [fieldUsers, setFieldUsers] = useState<Array<{ id: string; name: string; assigned_locations: string[] | null }>>([]);
  
  // Fetch field users to get responsible person for each location
  useEffect(() => {
    const fetchFieldUsers = async () => {
      const { data: users } = await supabase
        .from('field_users')
        .select('id, name, assigned_locations')
        .eq('active', true);
      
      if (users) {
        setFieldUsers(users);
      }
    };
    
    fetchFieldUsers();
  }, []);

  // Real-time sync: refresh data ONLY when Supabase detects a change from field
  const handleRealtimeRefresh = useCallback(() => {
    console.log('[Abastecimento] Realtime sync event received, refreshing all data...');
    refetch();
    refetchGeral();
    refetchComboio01();
    refetchComboio02();
    refetchComboio03();
    refetchCanteiro01();
    refetchCanteiro02();
    toast.success('📡 Dados atualizados automaticamente!');
  }, [refetch, refetchGeral, refetchComboio01, refetchComboio02, refetchComboio03, refetchCanteiro01, refetchCanteiro02]);

  // Subscribe to Supabase realtime changes - auto-refresh when field sends data
  const { broadcast } = useRealtimeSync({
    onSyncEvent: (event) => {
      console.log('[Abastecimento] Received sync event:', event.type);
      if (['fuel_record_created', 'fuel_record_updated', 'fuel_record_deleted', 'stock_updated'].includes(event.type)) {
        handleRealtimeRefresh();
      }
    },
  });
  
  // Helper function to get responsible user name for a location
  const getResponsibleForLocation = useCallback((location: string): string => {
    // Find user whose assigned_locations includes this location
    const responsible = fieldUsers.find(user => 
      user.assigned_locations?.some(loc => 
        loc.toLowerCase().includes(location.toLowerCase()) || 
        location.toLowerCase().includes(loc.toLowerCase())
      )
    );
    return responsible?.name || 'Não atribuído';
  }, [fieldUsers]);
  
  const canCreateRecords = useMemo(() => {
    if (!user) return false;
    const username = user.username?.toLowerCase() || '';
    return username === 'jeanallbuquerque@gmail.com' || 
           username === 'samarakelle' || 
           user.role === 'admin';
  }, [user]);

  const openAdminModal = useCallback((mode: AdminPresetMode = 'normal', location?: string) => {
    setAdminPresetMode(mode);
    setAdminPresetLocation(location || '');
    setShowAdminRecordModal(true);
  }, []);

  // Handle inline edit save
  const handleSaveInlineEdit = useCallback(async () => {
    if (!inlineEditData || inlineEditData._rowIndex == null) {
      toast.error('Não foi possível identificar o registro para edição');
      return;
    }
    
    setIsSavingInline(true);
    
    try {
      const rowData: Record<string, any> = {};
      
      // Map the editable fields
      rowData['QUANTIDADE'] = inlineEditData['QUANTIDADE'];
      rowData['HORIMETRO ANTERIOR'] = inlineEditData['HORIMETRO ANTERIOR'];
      rowData['HORIMETRO ATUAL'] = inlineEditData['HORIMETRO ATUAL'];
      rowData['MOTORISTA'] = inlineEditData['MOTORISTA'];
      rowData['KM ANTERIOR'] = inlineEditData['KM ANTERIOR'];
      rowData['KM ATUAL'] = inlineEditData['KM ATUAL'];
      rowData['QUANTIDADE DE ARLA'] = inlineEditData['QUANTIDADE DE ARLA'];
      rowData['LOCAL DE SAIDA'] = inlineEditData['LOCAL DE SAIDA'] || inlineEditData['LOCAL'];
      rowData['OBSERVAÇÃO'] = inlineEditData['OBSERVAÇÃO'];
      
      // Copy all original fields to maintain data integrity
      Object.keys(inlineEditData).forEach(key => {
        if (key !== '_rowIndex' && !(key in rowData)) {
          rowData[key] = inlineEditData[key];
        }
      });
      
      // Update Google Sheets
      const { data: sheetResp, error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'update',
          sheetName: SHEET_NAME,
          rowIndex: inlineEditData._rowIndex,
          data: rowData
        }
      });
      
      if (error) throw error;
      if (sheetResp?.error) throw new Error(sheetResp.error);
      
      // Also update corresponding record in field_fuel_records database
      const vehicleCode = String(inlineEditData['VEICULO'] || '').trim();
      const recordDate = String(inlineEditData['DATA'] || '').trim();
      const recordTime = String(inlineEditData['HORA'] || '').trim();
      
      if (vehicleCode && recordDate) {
        // Parse numbers correctly (handle Brazilian format)
        const parseNum = (val: any) => {
          if (!val || val === '') return null;
          const str = String(val).replace(/\./g, '').replace(',', '.');
          const num = parseFloat(str);
          return isNaN(num) ? null : num;
        };
        
        // Find matching record in database
        let query = supabase
          .from('field_fuel_records')
          .select('id')
          .eq('vehicle_code', vehicleCode);
        
        // Parse date for matching (support both DD/MM/YYYY and YYYY-MM-DD)
        let formattedDate = recordDate;
        if (recordDate.includes('/')) {
          const [day, month, year] = recordDate.split('/');
          formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        query = query.eq('record_date', formattedDate);
        
        // Add time filter if available
        if (recordTime) {
          query = query.eq('record_time', recordTime);
        }
        
        const { data: matchingRecords } = await query.limit(1);
        
        if (matchingRecords && matchingRecords.length > 0) {
          const dbRecordId = matchingRecords[0].id;
          
          // Update the database record
          const updateData: Record<string, any> = {
            fuel_quantity: parseNum(inlineEditData['QUANTIDADE']) || 0,
            horimeter_previous: parseNum(inlineEditData['HORIMETRO ANTERIOR']),
            horimeter_current: parseNum(inlineEditData['HORIMETRO ATUAL']),
            km_previous: parseNum(inlineEditData['KM ANTERIOR']),
            km_current: parseNum(inlineEditData['KM ATUAL']),
            arla_quantity: parseNum(inlineEditData['QUANTIDADE DE ARLA']),
            operator_name: inlineEditData['MOTORISTA'] || null,
            location: inlineEditData['LOCAL DE SAIDA'] || inlineEditData['LOCAL'] || null,
            observations: inlineEditData['OBSERVAÇÃO'] || null,
            updated_at: new Date().toISOString()
          };
          
          const { error: dbError } = await supabase
            .from('field_fuel_records')
            .update(updateData)
            .eq('id', dbRecordId);
          
          if (dbError) {
            console.warn('Aviso: Planilha atualizada, mas falha ao sincronizar com banco:', dbError);
          } else {
            console.log('Registro sincronizado com banco de dados:', dbRecordId);
          }
        }
      }
      
      toast.success('Registro atualizado com sucesso!');
      
      // Optimistic update: immediately update local data so UI reflects changes
      setData(prev => ({
        ...prev,
        rows: prev.rows.map(r => {
          if (r._rowIndex === inlineEditData._rowIndex) {
            return { ...r, ...rowData, _rowIndex: r._rowIndex };
          }
          return r;
        }),
      }));
      
      setExpandedRowId(null);
      setInlineEditData(null);
      broadcast('fuel_record_updated', { vehicleCode });
      
      // Delayed refetch to sync with actual sheet data
      setTimeout(() => refetch(true, true), 2000);
    } catch (err) {
      console.error('Error updating record:', err);
      toast.error('Erro ao atualizar registro');
    } finally {
      setIsSavingInline(false);
    }
  }, [inlineEditData, refetch, setData]);

  // Handle record deletion with Google Sheets sync
  const handleDeleteRecord = useCallback(async () => {
    if (!deletingRecord || deletingRecord._rowIndex == null) {
      toast.error('Não foi possível identificar o registro para exclusão');
      return;
    }
    
    setIsDeletingRecord(true);
    try {
      // Delete from Google Sheets
      const { error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'delete',
          sheetName: SHEET_NAME,
          rowIndex: deletingRecord._rowIndex,
        }
      });
      
      if (error) throw error;
      
      // Also delete from field_fuel_records if matching record exists
      const vehicleCode = String(deletingRecord['VEICULO'] || '').trim();
      const recordDate = String(deletingRecord['DATA'] || '').trim();
      const recordTime = String(deletingRecord['HORA'] || '').trim();
      
      if (vehicleCode && recordDate) {
        let formattedDate = recordDate;
        if (recordDate.includes('/')) {
          const [day, month, year] = recordDate.split('/');
          formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
        
        // Find matching DB record to also delete related requests
        let query = supabase.from('field_fuel_records').select('id').eq('vehicle_code', vehicleCode).eq('record_date', formattedDate);
        if (recordTime) query = query.eq('record_time', recordTime);
        const { data: matchingRecords } = await query;
        
        if (matchingRecords && matchingRecords.length > 0) {
          // Delete related requests first
          for (const rec of matchingRecords) {
            await supabase.from('field_record_requests').delete().eq('record_id', rec.id);
          }
        }
        
        let deleteQuery = supabase.from('field_fuel_records').delete().eq('vehicle_code', vehicleCode).eq('record_date', formattedDate);
        if (recordTime) deleteQuery = deleteQuery.eq('record_time', recordTime);
        const { error: dbError } = await deleteQuery;
        if (dbError) console.warn('Aviso: Planilha excluída, mas falha ao remover do banco:', dbError);
      }
      
      toast.success('Registro excluído com sucesso!');
      setShowDeleteConfirm(false);
      setDeletingRecord(null);
      broadcast('fuel_record_deleted', { vehicleCode });
      refetch(false, true);
    } catch (err) {
      console.error('Error deleting record:', err);
      toast.error('Erro ao excluir registro');
    } finally {
      setIsDeletingRecord(false);
    }
  }, [deletingRecord, refetch]);

  // Get saneamento stock from estoqueobrasaneamento sheet (column H)
  const estoqueSaneamento = useMemo(() => {
    if (!saneamentoStockData.rows.length) return 0;
    const lastRow = saneamentoStockData.rows[saneamentoStockData.rows.length - 1];
    // Column H is typically index 7 (0-based), or look for specific column name
    const headers = saneamentoStockData.headers;
    const colHIndex = headers.length > 7 ? headers[7] : null;
    const estoqueValue = colHIndex ? lastRow?.[colHIndex] : lastRow?.['EstoqueAtual'] || lastRow?.['Estoque'] || 0;
    return parseNumber(estoqueValue);
  }, [saneamentoStockData.rows, saneamentoStockData.headers]);

  // Get date range based on period filter
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    
    switch (periodFilter) {
      case 'hoje':
        return { start: today, end: endOfDay(today) };
      case 'ontem':
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: endOfDay(yesterday) };
      case '7dias':
        return { start: subDays(today, 7), end: endOfDay(today) };
      case '30dias':
        return { start: subDays(today, 30), end: endOfDay(today) };
      case 'mes':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'personalizado':
        return { 
          start: startDate ? startOfDay(startDate) : subDays(today, 30), 
          end: endDate ? endOfDay(endDate) : endOfDay(today) 
        };
      default:
        return { start: today, end: endOfDay(today) };
    }
  }, [periodFilter, startDate, endDate]);

  // Filter rows by date and other filters
  const filteredRows = useMemo(() => {
    let rows = data.rows.filter(row => {
      const rowDate = parseDate(String(row['DATA'] || ''));
      
      // Date filter
      if (rowDate) {
        if (!isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
          return false;
        }
      }
      
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matches = Object.values(row).some(v => 
          String(v).toLowerCase().includes(searchLower)
        );
        if (!matches) return false;
      }
      
      // Local filter
      if (localFilter !== 'all' && (row['LOCAL DE SAIDA'] || row['LOCAL']) !== localFilter) return false;
      
      // Tipo filter
      if (tipoFilter !== 'all' && row['TIPO'] !== tipoFilter) return false;
      
      // Combustivel filter
      if (combustivelFilter !== 'all' && row['TIPO DE COMBUSTIVEL'] !== combustivelFilter) return false;
      
      // Empresa filter
      if (empresaFilter !== 'all') {
        const empresa = String(row['EMPRESA'] || row['Empresa'] || '').trim();
        if (empresa !== empresaFilter) return false;
      }
      
      return true;
    });

    // Sort by description if enabled
    if (sortByDescription) {
      rows = [...rows].sort((a, b) => {
        const descA = String(a['DESCRICAO'] || a['DESCRIÇÃO'] || a['Descricao'] || '').toLowerCase();
        const descB = String(b['DESCRICAO'] || b['DESCRIÇÃO'] || b['Descricao'] || '').toLowerCase();
        return descA.localeCompare(descB, 'pt-BR');
      });
    }

    return rows;
  }, [data.rows, dateRange, search, localFilter, tipoFilter, combustivelFilter, empresaFilter, sortByDescription]);

  // Calculate metrics from GERAL sheet based on date filter
  // IMPORTANT: Estoque Atual should be CALCULATED using the formula:
  // (Estoque Anterior + Entrada) - (Saída Comboios + Saída Equipamentos)
  const metricsFromGeral = useMemo(() => {
    if (!geralData.rows.length) {
      return {
        estoqueAnterior: 0,
        entrada: 0,
        saidaComboios: 0,
        saidaEquipamentos: 0,
        estoqueAtual: 0
      };
    }
    
    // For single day filter, find the exact date row
    const isSingleDay = periodFilter === 'hoje' || periodFilter === 'ontem' || 
      (periodFilter === 'personalizado' && startDate && endDate && 
        format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd'));
    
    if (isSingleDay) {
      const targetDate = periodFilter === 'ontem' 
        ? format(subDays(new Date(), 1), 'dd/MM/yyyy')
        : startDate 
          ? format(startDate, 'dd/MM/yyyy')
          : format(new Date(), 'dd/MM/yyyy');
      
      const matchingRow = geralData.rows.find(row => {
        const rowDate = String(row['Data'] || row['DATA'] || '').trim();
        return rowDate === targetDate;
      });
      
      if (matchingRow) {
        const estoqueAnterior = parseNumber(matchingRow['Estoque Anterior'] || matchingRow['ESTOQUE ANTERIOR'] || 0);
        const entrada = parseNumber(matchingRow['Entrada'] || matchingRow['ENTRADA'] || 0);
        const saidaComboios = parseNumber(matchingRow['Saida para Comboios'] || matchingRow['SAIDA PARA COMBOIOS'] || 0);
        const saidaEquipamentos = parseNumber(matchingRow['Saida para Equipamentos'] || matchingRow['SAIDA PARA EQUIPAMENTOS'] || 0);
        
        // CALCULATE Estoque Atual using the formula: (Anterior + Entrada) - Saídas
        const estoqueCalculado = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
        
        return {
          estoqueAnterior,
          entrada,
          saidaComboios,
          saidaEquipamentos,
          estoqueAtual: estoqueCalculado
        };
      }
    }
    
    // For period filters, sum values for all matching dates
    let totalEntrada = 0;
    let totalSaidaComboios = 0;
    let totalSaidaEquipamentos = 0;
    let firstEstoqueAnterior = 0;
    let foundFirst = false;
    
    geralData.rows.forEach(row => {
      const rowDateStr = String(row['Data'] || row['DATA'] || '').trim();
      const rowDate = parseDate(rowDateStr);
      
      if (rowDate && isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
        if (!foundFirst) {
          firstEstoqueAnterior = parseNumber(row['Estoque Anterior'] || row['ESTOQUE ANTERIOR'] || 0);
          foundFirst = true;
        }
        
        totalEntrada += parseNumber(row['Entrada'] || row['ENTRADA'] || 0);
        totalSaidaComboios += parseNumber(row['Saida para Comboios'] || row['SAIDA PARA COMBOIOS'] || 0);
        totalSaidaEquipamentos += parseNumber(row['Saida para Equipamentos'] || row['SAIDA PARA EQUIPAMENTOS'] || 0);
      }
    });
    
    // CALCULATE Estoque Atual using the formula: (Anterior + Entrada) - Saídas
    const estoqueCalculado = (firstEstoqueAnterior + totalEntrada) - (totalSaidaComboios + totalSaidaEquipamentos);
    
    return {
      estoqueAnterior: firstEstoqueAnterior,
      entrada: totalEntrada,
      saidaComboios: totalSaidaComboios,
      saidaEquipamentos: totalSaidaEquipamentos,
      estoqueAtual: estoqueCalculado
    };
  }, [geralData.rows, periodFilter, startDate, endDate, dateRange]);

  // Validate stock: calculate expected vs actual from spreadsheet
  const stockValidation = useMemo(() => {
    const { estoqueAnterior, entrada, saidaComboios, saidaEquipamentos, estoqueAtual } = metricsFromGeral;
    
    // Expected = (Estoque Anterior + Entrada) - (Saída Comboios + Saída Equipamentos)
    const estoqueCalculado = (estoqueAnterior + entrada) - (saidaComboios + saidaEquipamentos);
    const divergencia = estoqueAtual - estoqueCalculado;
    const hasDivergence = Math.abs(divergencia) > 0.01; // Tolerance for floating point
    
    return {
      estoqueCalculado,
      estoqueAtualPlanilha: estoqueAtual,
      divergencia,
      hasDivergence,
      percentDivergence: estoqueCalculado > 0 ? (divergencia / estoqueCalculado) * 100 : 0
    };
  }, [metricsFromGeral]);

  // Calculate additional metrics from filtered rows (registros, arla, valor)
  const additionalMetrics = useMemo(() => {
    let totalArla = 0;
    let totalValor = 0;
    let registros = filteredRows.length;

    filteredRows.forEach(row => {
      const arla = parseNumber(row['QUANTIDADE DE ARLA']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      totalArla += arla;
      totalValor += valor;
    });

    return {
      registros,
      totalArla,
      totalValor
    };
  }, [filteredRows]);

  // ── Correction detection for Lançamentos KPIs ──
  const correctionAnalysis = useMemo(() => {
    const MAX_INTERVAL_HOURS = 500;
    const MAX_INTERVAL_KM = 5000;
    const zeroInterval: any[] = [];
    const highInterval: any[] = [];
    const zeroConsumption: any[] = [];
    filteredRows.forEach(row => {
      const tipo = String(row['TIPO'] || row['TIPO DE OPERACAO'] || '').toLowerCase();
      if (tipo === 'entrada' || tipo === 'carregamento') return;
      // Exclude comboio/tanque records — only flag saidas to vehicles/equipment
      const desc = String(row['DESCRICAO'] || row['Descricao'] || row['DESCRIÇÃO'] || '').toLowerCase();
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').toLowerCase();
      const localSaida = String(row['LOCAL DE SAIDA'] || row['LOCAL'] || '').toLowerCase();
      if (desc.includes('comboio') || veiculo.startsWith('cb-') || localSaida.includes('tanque canteiro')) return;
      const cat = String(row['CATEGORIA'] || row['Categoria'] || '').toLowerCase();
      const isEquip = cat.includes('equipamento') || cat.includes('máquina') || cat.includes('maquina') ||
        cat.includes('escavadeira') || cat.includes('retro') || cat.includes('pá carregadeira') ||
        cat.includes('pa carregadeira') || cat.includes('trator') || cat.includes('rolo') ||
        cat.includes('motoniveladora') || cat.includes('gerador');
      const obs = String(row['OBSERVAÇÃO'] || row['OBSERVACAO'] || '').toUpperCase();
      if (obs.includes('QUEBRADO')) return;
      const anterior = isEquip
        ? parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || 0)
        : parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0);
      const atual = isEquip
        ? parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || 0)
        : parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || 0);
      const intervalo = atual > 0 && anterior > 0 ? atual - anterior : 0;
      const qty = parseNumber(row['QUANTIDADE']);
      if ((anterior > 0 || atual > 0) && intervalo <= 0) {
        zeroInterval.push(row);
      } else if (intervalo > 0 && intervalo > (isEquip ? MAX_INTERVAL_HOURS : MAX_INTERVAL_KM)) {
        highInterval.push(row);
      }
      if (qty > 0 && anterior === 0 && atual === 0) {
        zeroConsumption.push(row);
      }
    });
    const allIssues = [...new Set([...zeroInterval, ...highInterval, ...zeroConsumption])];
    return { zeroInterval, highInterval, zeroConsumption, allIssues };
  }, [filteredRows]);

  const displayRows = useMemo(() => {
    if (correctionFilter === 'all') return filteredRows;
    const issueSet = correctionFilter === 'zero_interval' ? correctionAnalysis.zeroInterval
      : correctionFilter === 'high_interval' ? correctionAnalysis.highInterval
      : correctionFilter === 'zero_consumption' ? correctionAnalysis.zeroConsumption
      : correctionAnalysis.allIssues;
    return filteredRows.filter(row => issueSet.includes(row));
  }, [filteredRows, correctionFilter, correctionAnalysis]);

  // Sub-tab filtered rows for detalhamento
  const detalhamentoRows = useMemo(() => {
    const classifyRow = (row: any) => {
      const tipo = String(row['TIPO'] || row['TIPO DE OPERACAO'] || '').toLowerCase().trim();
      const veiculo = String(row['VEICULO'] || '').toUpperCase().trim();
      const fornecedor = String(row['FORNECEDOR'] || '').trim();
      const localEntrada = String(row['LOCAL DE ENTRADA'] || '').trim().toLowerCase();
      const local = String(row['LOCAL'] || row['LOCAL DE SAIDA'] || '').toLowerCase().trim();

      const isComboioVehicle = veiculo.startsWith('CC') || veiculo.includes('COMBOIO');
      const isTanqueVehicle = veiculo.includes('TANQUE') || veiculo.includes('CANTEIRO');
      const hasFornecedor = fornecedor.length > 0;
      const hasLocalEntradaTanque = localEntrada.includes('tanque') || localEntrada.includes('canteiro');

      // ENTRADAS: External supplier deliveries to tanks
      // - Vehicle is a Tanque/Canteiro AND has a fornecedor (supplier)
      // - OR tipo is 'entrada' AND has a fornecedor
      if (isTanqueVehicle && hasFornecedor) return 'entradas';
      if ((tipo === 'entrada' || tipo === 'recebimento') && hasFornecedor) return 'entradas';

      // CARREGAMENTOS: Transfers from tanks to comboios
      // - Vehicle is a Comboio (CC-xx) AND tipo is entrada/carregamento (loading from tank)
      // - OR vehicle is a Comboio AND localEntrada references a tanque
      // - OR tipo is 'carregamento' explicitly
      if (isComboioVehicle && (tipo === 'entrada' || tipo === 'carregamento' || hasLocalEntradaTanque)) return 'carregamentos';
      if (tipo === 'carregamento') return 'carregamentos';
      // Also: saida from tanque TO comboio (tank user dispatching fuel to comboio)
      if (isTanqueVehicle && !hasFornecedor && (tipo === 'entrada' || tipo === 'carregamento')) return 'carregamentos';
      if (isComboioVehicle && local.includes('tanque')) return 'carregamentos';

      // Default: saidas (consumption by equipment/vehicles)
      return 'saidas';
    };

    const saidas: any[] = [];
    const carregamentos: any[] = [];
    const entradas: any[] = [];

    const baseRows = correctionFilter === 'all' ? filteredRows :
      filteredRows.filter(row => {
        const issueSet = correctionFilter === 'zero_interval' ? correctionAnalysis.zeroInterval
          : correctionFilter === 'high_interval' ? correctionAnalysis.highInterval
          : correctionFilter === 'zero_consumption' ? correctionAnalysis.zeroConsumption
          : correctionAnalysis.allIssues;
        return issueSet.includes(row);
      });

    baseRows.forEach(row => {
      const cat = classifyRow(row);
      if (cat === 'entradas') entradas.push(row);
      else if (cat === 'carregamentos') carregamentos.push(row);
      else saidas.push(row);
    });

    return { saidas, carregamentos, entradas };
  }, [filteredRows, correctionFilter, correctionAnalysis]);

  // Get unique values for filters
  const locais = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const local = String(row['LOCAL DE SAIDA'] || row['LOCAL'] || '').trim();
      if (local) unique.add(local);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const tipos = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const tipo = String(row['TIPO'] || '').trim();
      if (tipo) unique.add(tipo);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const combustiveis = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const comb = String(row['TIPO DE COMBUSTIVEL'] || '').trim();
      if (comb) unique.add(comb);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  // Get unique empresas
  const empresas = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const empresa = String(row['EMPRESA'] || row['Empresa'] || '').trim();
      if (empresa) unique.add(empresa);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  // Summary by location with detailed records
  const resumoPorLocal = useMemo(() => {
    const summary: Record<string, { abastecimentos: number; diesel: number; arla: number; valor: number }> = {};
    
    // Detailed records per location
    const recordsByLocal: Record<string, Array<{
      data: string;
      codigo: string;
      veiculo: string;
      descricao: string;
      motorista: string;
      quantidade: number;
      categoria: string;
      empresa: string;
      horAnterior: number;
      horAtual: number;
      kmAnterior: number;
      kmAtual: number;
      tipo: string;
      fornecedor: string;
    }>> = {};
    
    filteredRows.forEach(row => {
      const tipo = String(row['TIPO'] || row['TIPO DE OPERACAO'] || '').toLowerCase();
      const fornecedor = String(row['FORNECEDOR'] || '').trim();
      
      // For Carregamento, use LOCAL DO CARREGAMENTO as the grouping key
      let local: string;
      if (tipo === 'carregamento') {
        local = String(row['LOCAL DO CARREGAMENTO'] || row['LOCAL'] || 'Não informado').trim() || 'Não informado';
      } else {
        local = String(row['LOCAL DE SAIDA'] || row['LOCAL'] || 'Não informado').trim() || 'Não informado';
      }
      
      const quantidade = parseNumber(row['QUANTIDADE']);
      const arlaQtd = parseNumber(row['QUANTIDADE DE ARLA']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      if (!summary[local]) {
        summary[local] = { abastecimentos: 0, diesel: 0, arla: 0, valor: 0 };
        recordsByLocal[local] = [];
      }
      
      summary[local].abastecimentos++;
      summary[local].diesel += quantidade;
      summary[local].arla += arlaQtd;
      summary[local].valor += valor;

      // Add detailed record with anterior/atual values - use exact column names from sheet
      // LOCAL DE ENTRADA comes from column AB in AbastecimentoCanteiro01
      const localEntrada = String(row['LOCAL DE ENTRADA'] || row['LOCAL_DE_ENTRADA'] || '').trim();
      
      recordsByLocal[local].push({
        data: String(row['DATA'] || ''),
        codigo: String(row['VEICULO'] || row['Veiculo'] || row['CODIGO'] || ''),
        veiculo: String(row['VEICULO'] || row['Veiculo'] || ''),
        descricao: String(row['DESCRICAO'] || row['DESCRIÇÃO'] || row['Descricao'] || row['TIPO'] || ''),
        motorista: String(row['MOTORISTA'] || row['Motorista'] || row['OPERADOR'] || row['Operador'] || ''),
        quantidade,
        categoria: String(row['CATEGORIA'] || row['Categoria'] || row['TIPO'] || ''),
        empresa: String(row['EMPRESA'] || row['Empresa'] || row['COMPANY'] || ''),
        horAnterior: parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || row['HORIMETRO_ANTERIOR'] || 0),
        horAtual: parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || row['HORIMETRO'] || row['Horimetro'] || 0),
        kmAnterior: parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0),
        kmAtual: parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || row['KM'] || row['Km'] || 0),
        tipo,
        fornecedor,
        localEntrada, // Column AB - LOCAL DE ENTRADA (e.g., Comboio 01, Comboio 02)
      } as any);
    });

    const entries = Object.entries(summary).sort((a, b) => b[1].diesel - a[1].diesel);
    const total = entries.reduce((acc, [, v]) => ({
      abastecimentos: acc.abastecimentos + v.abastecimentos,
      diesel: acc.diesel + v.diesel,
      arla: acc.arla + v.arla,
      valor: acc.valor + v.valor
    }), { abastecimentos: 0, diesel: 0, arla: 0, valor: 0 });

    return { entries, total, recordsByLocal };
  }, [filteredRows]);
  
  // Group data by company for the company report
  const resumoPorEmpresa = useMemo(() => {
    const empresaMap: Record<string, {
      categorias: Record<string, Array<{
        codigo: string;
        descricao: string;
        motorista: string;
        quantidade: number;
        horAnterior: number;
        horAtual: number;
        kmAnterior: number;
        kmAtual: number;
      }>>;
      totalDiesel: number;
    }> = {};
    
    // Collect all records and group by company then category
    Object.values(resumoPorLocal.recordsByLocal).flat().forEach(record => {
      const empresa = record.empresa || 'Não informado';
      const categoria = record.categoria || 'Outros';
      
      if (!empresaMap[empresa]) {
        empresaMap[empresa] = { categorias: {}, totalDiesel: 0 };
      }
      
      if (!empresaMap[empresa].categorias[categoria]) {
        empresaMap[empresa].categorias[categoria] = [];
      }
      
      empresaMap[empresa].categorias[categoria].push({
        codigo: record.codigo,
        descricao: record.descricao,
        motorista: record.motorista,
        quantidade: record.quantidade,
        horAnterior: record.horAnterior,
        horAtual: record.horAtual,
        kmAnterior: record.kmAnterior,
        kmAtual: record.kmAtual,
      });
      
      empresaMap[empresa].totalDiesel += record.quantidade;
    });
    
    return empresaMap;
  }, [resumoPorLocal.recordsByLocal]);

  // Calculate average consumption per vehicle (based on horimetro or km difference)
  const consumoMedioVeiculo = useMemo(() => {
    const veiculoMap = new Map<string, { 
      totalLitros: number; 
      totalHorasTrabalhadas: number; 
      totalKmRodados: number; 
      isEquipamento: boolean;
      registros: number;
    }>();
    
    filteredRows.forEach(row => {
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || '').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      
      // Get horimeter/km ANTERIOR and ATUAL values
      const horAnterior = parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || row['HORIMETRO_ANTERIOR'] || 0);
      const horAtual = parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || row['HORIMETRO'] || row['Horimetro'] || 0);
      const kmAnterior = parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0);
      const kmAtual = parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || row['KM'] || row['Km'] || 0);
      
      const categoria = String(row['CATEGORIA'] || row['Categoria'] || '').toLowerCase();
      
      if (!veiculo || quantidade <= 0) return;
      
      // Calculate differences
      const horasTrabalhadas = horAtual > horAnterior ? horAtual - horAnterior : 0;
      const kmRodados = kmAtual > kmAnterior ? kmAtual - kmAnterior : 0;
      
      const existing = veiculoMap.get(veiculo) || { 
        totalLitros: 0, 
        totalHorasTrabalhadas: 0, 
        totalKmRodados: 0, 
        isEquipamento: false,
        registros: 0
      };
      
      // Determine if it's an Equipment (uses L/h) or Vehicle (uses km/L)
      // Equipamento = uses horimeter (L/h)
      // Veículo = uses km (km/L)
      const isEquipamento = categoria.includes('equipamento') || 
                            categoria.includes('máquina') || categoria.includes('maquina') ||
                            categoria.includes('escavadeira') || categoria.includes('retro') ||
                            categoria.includes('pá carregadeira') || categoria.includes('pa carregadeira') ||
                            categoria.includes('trator') || categoria.includes('rolo') ||
                            categoria.includes('motoniveladora') || categoria.includes('gerador');
      
      veiculoMap.set(veiculo, {
        totalLitros: existing.totalLitros + quantidade,
        totalHorasTrabalhadas: existing.totalHorasTrabalhadas + horasTrabalhadas,
        totalKmRodados: existing.totalKmRodados + kmRodados,
        isEquipamento: existing.isEquipamento || isEquipamento,
        registros: existing.registros + 1
      });
    });
    
    return veiculoMap;
  }, [filteredRows]);

  // Saneamento data - filter for "Obra Saneamento" checking multiple columns
  const saneamentoFilteredData = useMemo(() => {
    return data.rows.filter(row => {
      const obra = String(row['OBRA'] || row['Obra'] || '').toLowerCase();
      const local = String(row['LOCAL DE SAIDA'] || row['LOCAL'] || '').toLowerCase();
      const empresa = String(row['EMPRESA'] || '').toLowerCase();
      const observacao = String(row['OBSERVAÇÃO'] || row['OBSERVACAO'] || '').toLowerCase();
      const isSaneamento = obra.includes('saneamento') || local.includes('saneamento') || empresa.includes('saneamento') || observacao.includes('saneamento');
      if (!isSaneamento) return false;

      // Apply date filter
      const dateStr = String(row['DATA'] || '');
      if (!dateStr) return true;
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        if (isValid(d) && dateRange) {
          return isWithinInterval(d, { start: startOfDay(dateRange.start), end: endOfDay(dateRange.end) });
        }
      }
      return true;
    });
  }, [data.rows, dateRange]);

  // Saneamento summary by vehicle
  const saneamentoSummary = useMemo(() => {
    const summary: Record<string, { abastecimentos: number; diesel: number; arla: number }> = {};
    
    saneamentoFilteredData.forEach(row => {
      const veiculo = String(row['VEICULO'] || row['Veiculo'] || 'Não informado').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      const arlaQtd = parseNumber(row['QUANTIDADE DE ARLA']);
      
      if (!summary[veiculo]) {
        summary[veiculo] = { abastecimentos: 0, diesel: 0, arla: 0 };
      }
      
      summary[veiculo].abastecimentos++;
      summary[veiculo].diesel += quantidade;
      summary[veiculo].arla += arlaQtd;
    });

    const entries = Object.entries(summary).sort((a, b) => b[1].diesel - a[1].diesel);
    const total = entries.reduce((acc, [, v]) => ({
      abastecimentos: acc.abastecimentos + v.abastecimentos,
      diesel: acc.diesel + v.diesel,
      arla: acc.arla + v.arla
    }), { abastecimentos: 0, diesel: 0, arla: 0 });

    return { entries, total };
  }, [saneamentoFilteredData]);

  // Entries data - filter ONLY external supplier entries (Cavalo Marinho, Ipiranga, etc.)
  // Exclude Carregamento records (internal comboio loading)
  const entradasData = useMemo(() => {
    const internalKeywords = ['comboio', 'transferencia', 'transferência', 'interno', 'interna'];
    const entries = data.rows.filter(row => {
      // Exclude Carregamento type (internal comboio loading)
      const tipo = String(row['TIPO'] || '').toLowerCase();
      if (tipo === 'carregamento') return false;
      
      const fornecedor = String(row['FORNECEDOR'] || '').trim();
      if (!fornecedor) return false;
      const fornecedorLower = fornecedor.toLowerCase();
      // Exclude internal/comboio transfers
      if (internalKeywords.some(kw => fornecedorLower.includes(kw))) return false;
      return true;
    });

    // Group by supplier
    const byLocation: Record<string, { registros: any[]; total: number }> = {};
    
    entries.forEach(row => {
      const local = String(row['LOCAL DE SAIDA'] || row['LOCAL'] || row['TANQUE'] || 'Não informado').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      
      if (!byLocation[local]) {
        byLocation[local] = { registros: [], total: 0 };
      }
      byLocation[local].registros.push(row);
      byLocation[local].total += quantidade;
    });

    return { entries, byLocation };
  }, [data.rows]);

  // Summary of supplier entries
  const entradasPorFornecedor = useMemo(() => {
    const summary: Record<string, { quantidade: number; valor: number; registros: number }> = {};
    
    entradasData.entries.forEach(row => {
      const fornecedor = String(row['FORNECEDOR'] || 'Não informado').trim();
      const quantidade = parseNumber(row['QUANTIDADE']);
      const valor = parseNumber(row['VALOR TOTAL']);
      
      if (!summary[fornecedor]) {
        summary[fornecedor] = { quantidade: 0, valor: 0, registros: 0 };
      }
      
      summary[fornecedor].quantidade += quantidade;
      summary[fornecedor].valor += valor;
      summary[fornecedor].registros++;
    });

    return Object.entries(summary).sort((a, b) => b[1].quantidade - a[1].quantidade);
  }, [entradasData.entries]);

  // Clear period filter
  const clearPeriod = useCallback(() => {
    setPeriodFilter('hoje');
    setStartDate(new Date());
    setEndDate(new Date());
  }, []);

  // Export to XLSX (Excel)
  const exportToXLSX = useCallback(() => {
    setIsExporting(true);
    
    try {
      // Apply sorting if enabled
      let rowsToExport = [...filteredRows];
      if (sortByDescription) {
        rowsToExport = rowsToExport.sort((a, b) => {
          const descA = String(a['DESCRICAO'] || a['DESCRIÇÃO'] || '').toLowerCase();
          const descB = String(b['DESCRICAO'] || b['DESCRIÇÃO'] || '').toLowerCase();
          return descA.localeCompare(descB, 'pt-BR');
        });
      }

      const xlsxData = rowsToExport.map((row) => ({
        'Data': String(row['DATA'] || ''),
        'Hora': String(row['HORA'] || ''),
        'Veículo': String(row['VEICULO'] || ''),
        'Descrição': String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
        'Motorista': String(row['MOTORISTA'] || ''),
        'Categoria': String(row['CATEGORIA'] || ''),
        'Empresa': String(row['EMPRESA'] || ''),
        'Local': String(row['LOCAL DE SAIDA'] || row['LOCAL'] || ''),
        'Hor. Anterior': parseNumber(row['HORIMETRO ANTERIOR']),
        'Hor. Atual': parseNumber(row['HORIMETRO ATUAL']),
        'Km Anterior': parseNumber(row['KM ANTERIOR']),
        'Km Atual': parseNumber(row['KM ATUAL']),
        'Diesel (L)': parseNumber(row['QUANTIDADE']),
        'Arla (L)': parseNumber(row['QUANTIDADE DE ARLA']),
        'Valor Total': parseNumber(row['VALOR TOTAL']),
        'Observação': String(row['OBSERVAÇÃO'] || ''),
      }));

      const ws = XLSX.utils.json_to_sheet(xlsxData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Abastecimentos');
      
      // Set column widths
      ws['!cols'] = [
        { wch: 12 }, // Data
        { wch: 8 },  // Hora
        { wch: 12 }, // Veículo
        { wch: 30 }, // Descrição
        { wch: 20 }, // Motorista
        { wch: 15 }, // Categoria
        { wch: 15 }, // Empresa
        { wch: 18 }, // Local
        { wch: 14 }, // Hor. Anterior
        { wch: 12 }, // Hor. Atual
        { wch: 12 }, // Km Anterior
        { wch: 10 }, // Km Atual
        { wch: 12 }, // Diesel
        { wch: 10 }, // Arla
        { wch: 12 }, // Valor Total
        { wch: 30 }, // Observação
      ];

      const dateStr = format(new Date(), 'yyyyMMdd_HHmmss');
      const localSuffix = localFilter !== 'all' ? `_${localFilter.replace(/\s+/g, '_')}` : '';
      const fileName = `abastecimentos${localSuffix}_${dateStr}.xlsx`;
      
      XLSX.writeFile(wb, fileName);
      toast.success('Relatório Excel exportado!');
    } catch (err) {
      console.error('Erro ao exportar XLSX:', err);
      toast.error('Erro ao exportar Excel');
    } finally {
      setIsExporting(false);
    }
  }, [filteredRows, localFilter, sortByDescription]);

  // Export by Company to XLSX
  const exportPorEmpresaToXLSX = useCallback(() => {
    setIsExporting(true);
    
    try {
      const allRecords: Array<{
        empresa: string;
        codigo: string;
        descricao: string;
        motorista: string;
        horAnterior: number;
        horAtual: number;
        kmAnterior: number;
        kmAtual: number;
        consumo: number;
        quantidade: number;
      }> = [];

      Object.entries(resumoPorEmpresa).forEach(([empresa, empresaData]) => {
        Object.values(empresaData.categorias).forEach((records) => {
          records.forEach((record: any) => {
            allRecords.push({
              empresa,
              codigo: record.codigo,
              descricao: record.descricao,
              motorista: record.motorista,
              horAnterior: record.horAnterior,
              horAtual: record.horAtual,
              kmAnterior: record.kmAnterior,
              kmAtual: record.kmAtual,
              consumo: record.consumo,
              quantidade: record.quantidade,
            });
          });
        });
      });

      // Sort by description
      const sortedRecords = allRecords.sort((a, b) => 
        (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR')
      );

      const xlsxData = sortedRecords.map((record) => ({
        'Empresa': record.empresa,
        'Código': record.codigo,
        'Descrição': record.descricao,
        'Motorista/Operador': record.motorista,
        'Hor./Km Anterior': record.horAnterior > 0 ? record.horAnterior : record.kmAnterior,
        'Hor./Km Atual': record.horAtual > 0 ? record.horAtual : record.kmAtual,
        'Intervalo': (record.horAtual || record.kmAtual) - (record.horAnterior || record.kmAnterior),
        'Consumo': record.consumo,
        'Qtd. Diesel': record.quantidade,
      }));

      const ws = XLSX.utils.json_to_sheet(xlsxData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Por Empresa');
      
      ws['!cols'] = [
        { wch: 15 },
        { wch: 12 },
        { wch: 30 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
      ];

      const fileName = `abastecimentos_por_empresa_${format(new Date(), 'yyyyMMdd')}.xlsx`;
      
      XLSX.writeFile(wb, fileName);
      toast.success('Relatório por Empresa exportado!');
    } catch (err) {
      console.error('Erro ao exportar XLSX:', err);
      toast.error('Erro ao exportar Excel');
    } finally {
      setIsExporting(false);
    }
  }, [resumoPorEmpresa]);

  // Export detailed PDF with filters - grouped by location (Tanques) WITH SIGNATURE
  const exportDetailedPDF = useCallback(async () => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      
      // Helper to classify location into unified groups (same as Geral tab)
      const classifyLoc = (loc: string): string => {
        const l = loc.toLowerCase();
        if (l.includes('tanque') || l.includes('canteiro')) return 'Tanques';
        if (l.includes('comboio')) return 'Comboios';
        return loc;
      };
      
      // Helper to check equipment category
      const isEquipCat = (cat: string): boolean => {
        const c = cat?.toLowerCase() || '';
        return c.includes('equipamento') || c.includes('máquina') || c.includes('maquina') ||
          c.includes('trator') || c.includes('retroescavadeira') || c.includes('escavadeira') ||
          c.includes('pá carregadeira') || c.includes('rolo') || c.includes('motoniveladora') ||
          c.includes('compactador') || c.includes('gerador');
      };
      
      const fmtBR = (v: number, dec = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      
      // Group filtered rows by unified location (Tanques, Comboios, etc.)
      const groups: Record<string, { rows: Record<string, any>[]; totalLiters: number }> = {};
      
      filteredRows.forEach(row => {
        const tipo = String(row['TIPO'] || '').toLowerCase();
        if (tipo.includes('entrada') || tipo.includes('recebimento') || tipo === 'carregamento') return;
        
        const rawLocal = String(row['LOCAL DE SAIDA'] || row['LOCAL'] || 'Não informado').trim();
        const group = classifyLoc(rawLocal);
        const qty = parseNumber(row['QUANTIDADE']);
        
        if (!groups[group]) groups[group] = { rows: [], totalLiters: 0 };
        groups[group].rows.push(row);
        groups[group].totalLiters += qty;
      });
      
      // Order: Tanques first, then Comboios, then others
      const orderedGroups: [string, typeof groups[string]][] = [];
      if (groups['Tanques']) orderedGroups.push(['Tanques', groups['Tanques']]);
      if (groups['Comboios']) orderedGroups.push(['Comboios', groups['Comboios']]);
      Object.entries(groups).forEach(([k, v]) => {
        if (k !== 'Tanques' && k !== 'Comboios') orderedGroups.push([k, v]);
      });
      
      let isFirstPage = true;
      
      orderedGroups.forEach(([location, groupData]) => {
        if (!isFirstPage) doc.addPage();
        isFirstPage = false;
        
        let startY = renderStandardHeader(doc, {
          reportTitle: `LANÇAMENTOS — ${location.toUpperCase()}`,
          obraSettings,
          logoBase64,
          date: `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`,
        });
        
        // KPI boxes
        startY = renderKpiBoxes(doc, {
          y: startY,
          recordCount: groupData.rows.length,
          totalLiters: groupData.totalLiters,
          fmtBR,
        });
        
        // Build table body sorted by description
        const sortedRows = [...groupData.rows].sort((a, b) => {
          const descA = String(a['DESCRICAO'] || a['DESCRIÇÃO'] || '');
          const descB = String(b['DESCRICAO'] || b['DESCRIÇÃO'] || '');
          return descA.localeCompare(descB, 'pt-BR');
        });

        // Build description-to-color index for alternating group backgrounds
        const uniqueDescs: string[] = [];
        sortedRows.forEach(row => {
          const desc = String(row['DESCRICAO'] || row['DESCRIÇÃO'] || '');
          if (!uniqueDescs.includes(desc)) uniqueDescs.push(desc);
        });
        const descColorMap: Record<string, number> = {};
        uniqueDescs.forEach((d, i) => { descColorMap[d] = i % 2; });

        // Two alternating light fills for description groups
        const groupFills: [number, number, number][] = [
          [255, 255, 255],   // white
          [235, 240, 250],   // light blue-gray
        ];

        const body = sortedRows.map(row => {
          const cat = String(row['CATEGORIA'] || '').toLowerCase();
          const isEquip = isEquipCat(cat);
          const horPrev = parseNumber(row['HORIMETRO ANTERIOR']);
          const horCurr = parseNumber(row['HORIMETRO ATUAL']);
          const kmPrev = parseNumber(row['KM ANTERIOR']);
          const kmCurr = parseNumber(row['KM ATUAL']);
          const qty = parseNumber(row['QUANTIDADE']);
          const desc = String(row['DESCRICAO'] || row['DESCRIÇÃO'] || '-');

          const horInterval = (horPrev > 0 && horCurr > horPrev) ? horCurr - horPrev : 0;
          const kmInterval = (kmPrev > 0 && kmCurr > kmPrev) ? kmCurr - kmPrev : 0;
          const interval = isEquip ? horInterval : kmInterval;
          const intervalUnit = isEquip ? 'h' : 'km';

          let consumption = 0;
          if (isEquip && horInterval > 0 && qty > 0) consumption = qty / horInterval;
          else if (!isEquip && kmInterval > 0 && qty > 0) consumption = kmInterval / qty;
          const consumptionUnit = isEquip ? 'L/h' : 'km/L';

          return [
            row['DATA'], row['HORA'], row['VEICULO'],
            row['POTENCIA'] || row['Potencia'] || '-',
            desc,
            row['MOTORISTA'] || '-', row['EMPRESA'] || '-',
            fmtBR(qty, 0),
            isEquip
              ? (horPrev > 0 ? fmtBR(horPrev, 1) : '-')
              : (kmPrev > 0 ? fmtBR(kmPrev, 0) : '-'),
            isEquip
              ? (horCurr > 0 ? fmtBR(horCurr, 1) : '-')
              : (kmCurr > 0 ? fmtBR(kmCurr, 0) : '-'),
            interval > 0 ? `${fmtBR(interval, isEquip ? 2 : 0)} ${intervalUnit}` : '-',
            consumption > 0 ? `${fmtBR(consumption)} ${consumptionUnit}` : '-',
          ];
        });
        
        // Apply report config
        const rc = lancTanquesConfig;
        const visibleCols = [...rc.columns].filter(c => c.visible).sort((a, b) => a.order - b.order);
        const colKeyToDataIdx: Record<string, number> = {
          data: 0, hora: 1, veiculo: 2, potencia: 3, descricao: 4, motorista: 5,
          empresa: 6, quantidade: 7, hor_ant: 8, hor_atual: 9, intervalo: 10, consumo: 11,
        };

        // Build head and filtered body based on visible columns
        const headRow = visibleCols.map(c => c.label);
        const filteredBody = body.map(row => visibleCols.map(c => row[colKeyToDataIdx[c.key]] ?? ''));

        // Parse hex color to RGB tuple
        const hexToRgb = (hex: string): [number, number, number] => {
          const h = hex.replace('#', '');
          return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        };

        const hdrBg = hexToRgb(rc.style.headerBgColor);
        const hdrTxt = hexToRgb(rc.style.headerTextColor);
        const altColor1 = hexToRgb(rc.style.alternateRowColor1);
        const altColor2 = hexToRgb(rc.style.alternateRowColor2);

        // Build columnStyles from config (including per-column overrides)
        const colStyles: Record<number, any> = {};
        visibleCols.forEach((c, idx) => {
          const style: any = { halign: c.halign || 'center' };
          if (c.width) style.cellWidth = c.width;
          if (c.key === 'descricao' || c.key === 'motorista') {
            style.overflow = 'linebreak';
            if (!c.width) style.cellWidth = 'auto';
          }
          if (c.key === 'quantidade' || c.bold) style.fontStyle = 'bold';
          if (c.fontSize) style.fontSize = c.fontSize;
          if (c.fontColor) style.textColor = hexToRgb(c.fontColor);
          if (c.bgColor) style.fillColor = hexToRgb(c.bgColor);
          colStyles[idx] = style;
        });

        // Find descricao column index in filtered body
        const descColIdx = visibleCols.findIndex(c => c.key === 'descricao');

        autoTable(doc, {
          startY: startY + 6,
          head: [headRow],
          body: filteredBody,
          theme: 'grid',
          styles: {
            fontSize: rc.style.bodyFontSize,
            cellPadding: 2.5,
            lineColor: [30, 30, 30],
            lineWidth: 0.25,
            overflow: 'linebreak',
            halign: 'center',
            valign: 'middle',
            fontStyle: rc.style.bodyBold ? 'bold' : 'normal',
          },
          headStyles: {
            fillColor: hdrBg,
            textColor: hdrTxt,
            fontStyle: 'bold',
            fontSize: rc.style.headerFontSize,
            halign: 'center',
            valign: 'middle',
            minCellHeight: 11,
          },
          columnStyles: colStyles,
          margin: { left: 10, right: 10 },
          didParseCell: (data) => {
            if (data.section === 'body') {
              const desc = descColIdx >= 0 ? String(filteredBody[data.row.index]?.[descColIdx] || '') : '';
              const colorIdx = descColorMap[desc] ?? 0;
              data.cell.styles.fillColor = colorIdx === 0 ? altColor1 : altColor2;
            }
          },
        });
      });
      
      doc.save(`lancamentos-abastecimento-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [filteredRows, dateRange, obraSettings, lancTanquesConfig]);

  // Export to PDF (simple) - same format as detailed, grouped by location WITH SIGNATURE
  // Now includes stock summary at top and separates exits/entries
  const exportPDF = useCallback(async () => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      let currentY = 15;
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      
      // Iterate through each location (Tanque 01, Tanque 02, etc.)
      const locations = Object.keys(resumoPorLocal.recordsByLocal).sort();
      
      locations.forEach((local, locationIndex) => {
        const records = resumoPorLocal.recordsByLocal[local];
        if (!records || records.length === 0) return;
        
        // Separate entries, exits, and carregamentos
        const saidasRecords = records.filter(r => !r.fornecedor && !r.tipo.includes('entrada') && r.tipo !== 'carregamento');
        const carregamentoRecords = records.filter(r => r.tipo === 'carregamento');
        const entradasRecords = records.filter(r => (r.fornecedor || r.tipo.includes('entrada')) && r.tipo !== 'carregamento');
        
        // Sort records by description for better organization
        const sortedSaidas = [...saidasRecords].sort((a, b) => 
          (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR')
        );
        const sortedEntradas = [...entradasRecords].sort((a, b) => 
          (a.fornecedor || '').localeCompare(b.fornecedor || '', 'pt-BR')
        );
        
        // Calculate LOCAL stock summary from records
        const totalSaidasLocal = saidasRecords.reduce((sum, r) => sum + r.quantidade, 0);
        const totalEntradasLocal = entradasRecords.reduce((sum, r) => sum + r.quantidade, 0);
        
        // Add new page for each location after the first
        if (locationIndex > 0) {
          doc.addPage();
          currentY = 15;
        }
        
        // Standard Header
        const startY = renderStandardHeader(doc, {
          reportTitle: `ABASTECIMENTO — ${local.toUpperCase()}`,
          obraSettings,
          logoBase64,
          date: `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`,
        });
        
        doc.setTextColor(0, 0, 0);
        const totalRecordsLocal = saidasRecords.length + carregamentoRecords.length + entradasRecords.length;
        const totalLitersLocal = records.reduce((s, r) => s + r.quantidade, 0);
        currentY = renderKpiBoxes(doc, { y: startY, recordCount: totalRecordsLocal, totalLiters: totalLitersLocal });
        
        // ========== SAÍDAS TABLE ==========
        if (sortedSaidas.length > 0) {
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(180, 50, 50);
          doc.text('SAÍDAS (Abastecimentos)', 14, currentY + 4);
          currentY += 8;
          
          let totalDieselSaidas = 0;
          let totalConsumo = 0;
          let countConsumo = 0;
          
          const saidasTableData = sortedSaidas.map((record, index) => {
            const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
            const anterior = usaKm ? record.kmAnterior : record.horAnterior;
            const atual = usaKm ? record.kmAtual : record.horAtual;
            const intervalo = atual - anterior;
            
            let consumo = 0;
            if (record.quantidade > 0 && intervalo > 0) {
              if (usaKm) {
                consumo = intervalo / record.quantidade;
              } else {
                consumo = record.quantidade / intervalo;
              }
              totalConsumo += consumo;
              countConsumo++;
            }
            
            totalDieselSaidas += record.quantidade;
            
            return [
              (index + 1).toString() + '.',
              record.codigo,
              record.descricao,
              record.motorista,
              anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
              atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
              intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
              consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00',
              record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
            ];
          });
          
          const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
          saidasTableData.push([
            '',
            '',
            '',
            'TOTAL SAÍDAS',
            '',
            '',
            '',
            mediaConsumo > 0 ? `Média: ${mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-',
            totalDieselSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
          ]);
          
          autoTable(doc, {
            startY: currentY,
            head: [[
              '#', 
              'Código', 
              'Descrição', 
              'Motorista/Operador', 
              'Hor/Km\nAnterior', 
              'Hor/Km\nAtual', 
              'Intervalo\n(h/km)', 
              'Consumo\n(L/h ou km/L)', 
              'Qtd Diesel\n(Litros)'
            ]],
            body: saidasTableData,
            theme: 'grid',
            styles: {
              fontSize: 9,
              cellPadding: 3,
              lineColor: [200, 200, 210],
              lineWidth: 0.25,
              overflow: 'linebreak',
              halign: 'center',
              valign: 'middle',
            },
            headStyles: {
              fillColor: [220, 220, 225],
              textColor: [30, 30, 30],
              fontStyle: 'bold',
              fontSize: 9,
              halign: 'center',
              valign: 'middle',
              minCellHeight: 11,
            },
            columnStyles: {
              0: { cellWidth: 12, halign: 'center' },
              1: { cellWidth: 28, halign: 'center' },
              2: { cellWidth: 58, halign: 'center', overflow: 'linebreak' },
              3: { cellWidth: 52, halign: 'center', overflow: 'linebreak' },
              4: { cellWidth: 28, halign: 'center' },
              5: { cellWidth: 28, halign: 'center' },
              6: { cellWidth: 25, halign: 'center' },
              7: { cellWidth: 25, halign: 'center' },
              8: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
            },
            alternateRowStyles: { fillColor: [245, 245, 248] },
            margin: { left: 10, right: 10 },
            didParseCell: (data) => {
              if (data.row.index === saidasTableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 220, 220];
              }
            },
          });
          
          currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
        }
        
        // ========== ENTRADAS TABLE ==========
        if (sortedEntradas.length > 0) {
          // Check if need new page
          if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = 20;
          }
          
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(34, 139, 34);
          doc.text('ENTRADAS (Recebimentos)', 14, currentY + 4);
          currentY += 8;
          
          let totalDieselEntradas = 0;
          
          // Determine if this is a Tanque location (shows Fornecedor) or Comboio (shows Local de Entrada)
          const isTanqueLocation = local.toLowerCase().includes('tanque');
          const isComboioLocation = local.toLowerCase().includes('comboio');
          
          const entradasTableData = sortedEntradas.map((record, index) => {
            totalDieselEntradas += record.quantidade;
            
            if (isTanqueLocation) {
              // For Tanque Canteiro 01/02: show Fornecedor
              const fornecedor = record.fornecedor || 'N/I';
              return [
                (index + 1).toString() + '.',
                record.data,
                fornecedor,
                record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L'
              ];
            } else if (isComboioLocation) {
              // For Comboios: show Local de Entrada (Tanque 01 or Tanque 02)
              const entryLocation = (record as any).localEntrada || 'N/I';
              return [
                (index + 1).toString() + '.',
                record.data,
                entryLocation,
                record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L'
              ];
            } else {
              // Default: show Local de Entrada
              const entryLocation = (record as any).localEntrada || 'N/I';
              return [
                (index + 1).toString() + '.',
                record.data,
                entryLocation,
                record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L'
              ];
            }
          });
          
          entradasTableData.push([
            '',
            '',
            'TOTAL ENTRADAS',
            totalDieselEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L'
          ]);
          
          // Dynamic header based on location type
          const thirdColumnHeader = isTanqueLocation ? 'Fornecedor' : 'Local de Entrada';
          
          autoTable(doc, {
            startY: currentY,
            head: [['#', 'Data', thirdColumnHeader, 'Quantidade\n(Litros)']],
            body: entradasTableData,
            theme: 'grid',
            styles: {
              fontSize: 9,
              cellPadding: 3,
              lineColor: [200, 200, 210],
              lineWidth: 0.25,
              overflow: 'linebreak',
              halign: 'center',
              valign: 'middle',
            },
            headStyles: {
              fillColor: [220, 220, 225],
              textColor: [30, 30, 30],
              fontStyle: 'bold',
              fontSize: 9,
              halign: 'center',
              valign: 'middle',
              minCellHeight: 11,
            },
            columnStyles: {
              0: { cellWidth: 15, halign: 'center' },
              1: { cellWidth: 30, halign: 'center' },
              2: { cellWidth: 80, halign: 'center', overflow: 'linebreak' },
              3: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
            },
            alternateRowStyles: { fillColor: [240, 253, 244] },
            margin: { left: 10, right: 10 },
            didParseCell: (data) => {
              if (data.row.index === entradasTableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [200, 235, 210];
              }
            },
          });
          
          currentY = (doc as any).lastAutoTable?.finalY + 10 || currentY + 50;
        }
        
        // Get final Y position after tables
        const finalY = currentY;
        
        // Add responsible person section at bottom of each location page
        const signatureY = Math.max(finalY + 10, pageHeight - 35);
        
        // Get the responsible person for this location
        const responsibleName = getResponsibleForLocation(local);
        
        // Responsible person label - centered, no signature line
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`Responsável: ${responsibleName}`, pageWidth / 2, signatureY, { align: 'center' });
        
        // Location label below
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(`(${local})`, pageWidth / 2, signatureY + 6, { align: 'center' });
      });
      
      doc.save(`relatorio_abastecimento_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [resumoPorLocal, dateRange, obraSettings, getResponsibleForLocation]);

  // Export PDF by Company (Empresa) - unified table without category separation
  const exportPDFPorEmpresa = useCallback(async () => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const empresas = Object.keys(resumoPorEmpresa).sort();
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      
      empresas.forEach((empresa, empresaIndex) => {
        const empresaData = resumoPorEmpresa[empresa];
        if (!empresaData) return;
        
        // Merge all records from all categories into one array
        const allRecords: Array<{
          codigo: string;
          descricao: string;
          motorista: string;
          quantidade: number;
          horAnterior: number;
          horAtual: number;
          kmAnterior: number;
          kmAtual: number;
        }> = [];
        
        Object.values(empresaData.categorias).forEach((records) => {
          allRecords.push(...records);
        });
        
        if (allRecords.length === 0) return;
        
        // Sort all records by description for better organization
        const sortedRecords = [...allRecords].sort((a, b) => 
          (a.descricao || '').localeCompare(b.descricao || '', 'pt-BR')
        );
        
        // Add new page for each company after the first
        if (empresaIndex > 0) {
          doc.addPage();
        }
        
        let currentY = 20;
        
        // Standard Header
        const startY = renderStandardHeader(doc, {
          reportTitle: `RELATÓRIO — ${empresa.toUpperCase()}`,
          obraSettings,
          logoBase64,
          date: `${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`,
        });
        
        doc.setTextColor(0, 0, 0);
        currentY = renderKpiBoxes(doc, { y: startY, recordCount: allRecords.length, totalLiters: empresaData.totalLitros });
        
        // Prepare table data with consumption calculation - unified table
        let totalDiesel = 0;
        let totalConsumo = 0;
        let countConsumo = 0;
        
        const tableData = sortedRecords.map((record, index) => {
          // Determine if using km or hours based on data
          const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
          const anterior = usaKm ? record.kmAnterior : record.horAnterior;
          const atual = usaKm ? record.kmAtual : record.horAtual;
          const intervalo = atual - anterior;
          
          // Calculate consumption (km/l or l/h)
          let consumo = 0;
          if (record.quantidade > 0 && intervalo > 0) {
            if (usaKm) {
              consumo = intervalo / record.quantidade;
            } else {
              consumo = record.quantidade / intervalo;
            }
            totalConsumo += consumo;
            countConsumo++;
          }
          
          totalDiesel += record.quantidade;
          
          return [
            (index + 1).toString() + '.',
            record.codigo,
            record.descricao.length > 22 ? record.descricao.substring(0, 19) + '...' : record.descricao,
            record.motorista.length > 22 ? record.motorista.substring(0, 19) + '...' : record.motorista,
            anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
            atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
            intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-',
            consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00',
            record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
          ];
        });
        
        // Add totals row
        const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
        tableData.push([
          '',
          '',
          '',
          'TOTAL',
          '',
          '',
          '',
          mediaConsumo > 0 ? `Média: ${mediaConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-',
          totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
        ]);
        
        autoTable(doc, {
          startY: currentY,
          head: [[
            '#', 
            'Código', 
            'Descrição', 
            'Motorista/Operador', 
            'Hor/Km\nAnterior', 
            'Hor/Km\nAtual', 
            'Intervalo\n(h/km)', 
            'Consumo\n(L/h ou km/L)', 
            'Qtd Diesel\n(Litros)'
          ]],
          body: tableData,
          theme: 'grid',
          styles: {
            fontSize: 9,
            cellPadding: 3,
            lineColor: [200, 200, 210],
            lineWidth: 0.25,
            overflow: 'linebreak',
            halign: 'center',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [220, 220, 225],
            textColor: [30, 30, 30],
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center',
            valign: 'middle',
            minCellHeight: 11,
          },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 28, halign: 'center' },
            2: { cellWidth: 58, halign: 'center', overflow: 'linebreak' },
            3: { cellWidth: 52, halign: 'center', overflow: 'linebreak' },
            4: { cellWidth: 28, halign: 'center' },
            5: { cellWidth: 28, halign: 'center' },
            6: { cellWidth: 25, halign: 'center' },
            7: { cellWidth: 25, halign: 'center' },
            8: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
          },
          alternateRowStyles: { fillColor: [245, 245, 248] },
          margin: { left: 10, right: 10 },
          didParseCell: (data) => {
            // Style the totals row (last row)
            if (data.row.index === tableData.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [230, 230, 230];
            }
          },
        });
      });
      
      doc.save(`relatorio_por_empresa_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  }, [resumoPorEmpresa, dateRange, obraSettings]);

  // Normalize column name (remove accents, lowercase, trim)
  const normalizeCol = useCallback((s: string) => 
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  , []);

  // Find value in a row by fuzzy column name matching
  const findColValue = useCallback((row: Record<string, any>, ...candidates: string[]) => {
    // Try exact matches first
    for (const c of candidates) {
      if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c];
    }
    // Try normalized matching against all row keys
    const normalizedCandidates = candidates.map(c => normalizeCol(c));
    for (const key of Object.keys(row)) {
      const nk = normalizeCol(key);
      for (const nc of normalizedCandidates) {
        if (nk === nc || nk.includes(nc) || nc.includes(nk)) return row[key];
      }
    }
    return 0;
  }, [normalizeCol]);

  // Helper to get stock data for a location from its sheet
  const getStockDataFromSheet = useCallback((sheetData: { rows: any[] }, targetDate: string) => {
    if (!sheetData.rows.length) {
      return { estoqueAnterior: 0, entrada: 0, saidaComboios: 0, saidaEquipamentos: 0, total: 0, estoqueAtual: 0 };
    }
    
    // Find row matching target date
    const matchingRow = sheetData.rows.find(row => {
      const rowDate = String(findColValue(row, 'Data', 'DATA', 'data') || '').trim();
      return rowDate === targetDate;
    });
    
    const row = matchingRow || sheetData.rows[sheetData.rows.length - 1];
    
    const estoqueAnterior = parseNumber(findColValue(row, 'Estoque Anterior', 'ESTOQUE ANTERIOR'));
    const entrada = parseNumber(findColValue(row, 'Entrada', 'ENTRADA'));
    
    // Comboio sheets have a single "Saida" column; Tanque sheets have "Saida para Comboios" + "Saida para Equipamentos"
    // Try specific columns first, then fall back to generic "Saida"
    const saidaComboiosRaw = row['Saida para Comboios'] ?? row['Saída para Comboios'] ?? row['SAIDA PARA COMBOIOS'] ?? row['Saida Comboios'] ?? row['SAIDA COMBOIOS'];
    const saidaEquipamentosRaw = row['Saida para Equipamentos'] ?? row['Saída para Equipamentos'] ?? row['SAIDA PARA EQUIPAMENTOS'] ?? row['Saida Equipamentos'] ?? row['SAIDA EQUIPAMENTOS'];
    const saidaGenericRaw = row['Saida'] ?? row['SAIDA'] ?? row['Saída'];
    
    let saidaComboios = 0;
    let saidaEquipamentos = 0;
    let total = 0;
    
    if (saidaComboiosRaw !== undefined || saidaEquipamentosRaw !== undefined) {
      // Tanque sheet with specific columns
      saidaComboios = parseNumber(saidaComboiosRaw);
      saidaEquipamentos = parseNumber(saidaEquipamentosRaw);
      total = saidaComboios + saidaEquipamentos;
    } else if (saidaGenericRaw !== undefined) {
      // Comboio sheet with single "Saida" column
      total = parseNumber(saidaGenericRaw);
    }
    
    const estoqueAtual = parseNumber(findColValue(row, 'Estoque Atual', 'ESTOQUE ATUAL'));
    
    return { estoqueAnterior, entrada, saidaComboios, saidaEquipamentos, total, estoqueAtual };
  }, [findColValue]);

  // Build stock data object for Tanques/Comboios report
  const buildStockData = useCallback((): TanquesComboiosStockData => {
    const targetDate = format(startDate || new Date(), 'dd/MM/yyyy');
    return {
      canteiro01: getStockDataFromSheet(estoqueCanteiro01Data, targetDate),
      canteiro02: getStockDataFromSheet(estoqueCanteiro02Data, targetDate),
      comboio01: getStockDataFromSheet(estoqueComboio01Data, targetDate),
      comboio02: getStockDataFromSheet(estoqueComboio02Data, targetDate),
      comboio03: getStockDataFromSheet(estoqueComboio03Data, targetDate),
    };
  }, [getStockDataFromSheet, estoqueCanteiro01Data, estoqueCanteiro02Data, estoqueComboio01Data, estoqueComboio02Data, estoqueComboio03Data, startDate]);

  // Export General PDF with Summary (Resumo Geral) - Format like the reference image
  const exportPDFResumoGeral = useCallback(async () => {
    setIsExporting(true);
    
    try {
      const doc = new jsPDF('landscape');
      const pageWidth = doc.internal.pageSize.getWidth();
      const targetDate = format(new Date(), 'dd/MM/yyyy');
      const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
      
      const startY = renderStandardHeader(doc, {
        reportTitle: 'RESUMO GERAL DE ESTOQUES',
        obraSettings,
        logoBase64,
        date: targetDate,
      });
      
      doc.setTextColor(0, 0, 0);
      let currentY = startY;
      
      // Collect stock data for all locations
      const canteiro01 = getStockDataFromSheet(estoqueCanteiro01Data, targetDate);
      const canteiro02 = getStockDataFromSheet(estoqueCanteiro02Data, targetDate);
      const comboio01 = getStockDataFromSheet(estoqueComboio01Data, targetDate);
      const comboio02 = getStockDataFromSheet(estoqueComboio02Data, targetDate);
      const comboio03 = getStockDataFromSheet(estoqueComboio03Data, targetDate);
      
      // Summary table data
      const summaryData = [
        ['Canteiro 01', canteiro01.estoqueAnterior, canteiro01.entrada, canteiro01.saidaComboios, canteiro01.saidaEquipamentos, canteiro01.total, canteiro01.estoqueAtual],
        ['Canteiro 02', canteiro02.estoqueAnterior, canteiro02.entrada, canteiro02.saidaComboios, canteiro02.saidaEquipamentos, canteiro02.total, canteiro02.estoqueAtual],
        ['Comboio 01', comboio01.estoqueAnterior, comboio01.entrada, comboio01.saidaComboios, comboio01.saidaEquipamentos, comboio01.total, comboio01.estoqueAtual],
        ['Comboio 02', comboio02.estoqueAnterior, comboio02.entrada, comboio02.saidaComboios, comboio02.saidaEquipamentos, comboio02.total, comboio02.estoqueAtual],
        ['Comboio 03', comboio03.estoqueAnterior, comboio03.entrada, comboio03.saidaComboios, comboio03.saidaEquipamentos, comboio03.total, comboio03.estoqueAtual],
      ];
      
      // Calculate totals
      const totalGeralRow = summaryData.reduce((acc, row) => {
        return [
          'Total geral',
          (acc[1] as number) + (row[1] as number),
          (acc[2] as number) + (row[2] as number),
          (acc[3] as number) + (row[3] as number),
          (acc[4] as number) + (row[4] as number),
          (acc[5] as number) + (row[5] as number),
          (acc[6] as number) + (row[6] as number),
        ];
      }, ['Total geral', 0, 0, 0, 0, 0, 0] as any[]);
      
      summaryData.push(totalGeralRow);
      
      // Format numbers for display
      const formattedSummaryData = summaryData.map(row => [
        row[0],
        typeof row[1] === 'number' ? row[1].toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : row[1],
        typeof row[2] === 'number' ? row[2].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : row[2],
        typeof row[3] === 'number' ? row[3].toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : row[3],
        typeof row[4] === 'number' ? row[4].toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : row[4],
        typeof row[5] === 'number' ? row[5].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : row[5],
        typeof row[6] === 'number' ? row[6].toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : row[6],
      ]);
      
      // Draw summary table
      autoTable(doc, {
        startY: currentY,
        head: [[
          'Descrição',
          'Estoque\nAnterior',
          'Entrada',
          'Saída para\nComboios',
          'Saída para\nEquipamentos',
          'Total',
          'Estoque Atual'
        ]],
        body: formattedSummaryData,
        styles: { 
          fontSize: 9,
          cellPadding: 3,
        },
        headStyles: { 
          fillColor: [200, 200, 200],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 30, halign: 'right' },
          2: { cellWidth: 25, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 35, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' },
          6: { cellWidth: 35, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255]
        },
        theme: 'grid',
        didParseCell: (data) => {
          // Style the totals row (last row)
          if (data.row.index === formattedSummaryData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [230, 230, 230];
          }
        },
      });
      
      currentY = (doc as any).lastAutoTable?.finalY + 20 || currentY + 80;
      
      // Section: Tanques 01 e 02 - Detailed records
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 0, 0);
      doc.text('Tanques 01 e 02', pageWidth / 2, currentY, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      currentY += 8;
      
      // Get all records and calculate consumption
      let totalDiesel = 0;
      let totalConsumo = 0;
      let countConsumo = 0;
      
      const allRecords = Object.values(resumoPorLocal.recordsByLocal).flat();
      
      const tableData = allRecords.map((record, index) => {
        const usaKm = record.kmAtual > 0 || record.kmAnterior > 0;
        const anterior = usaKm ? record.kmAnterior : record.horAnterior;
        const atual = usaKm ? record.kmAtual : record.horAtual;
        const intervalo = atual - anterior;
        
        let consumo = 0;
        if (record.quantidade > 0 && intervalo > 0) {
          if (usaKm) {
            consumo = intervalo / record.quantidade;
          } else {
            consumo = record.quantidade / intervalo;
          }
          totalConsumo += consumo;
          countConsumo++;
        }
        
        totalDiesel += record.quantidade;
        
        return [
          (index + 1).toString() + '.',
          record.codigo,
          record.descricao,
          record.motorista,
          anterior > 0 ? anterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
          atual > 0 ? atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
          intervalo > 0 ? intervalo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
          consumo > 0 ? consumo.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00',
          record.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0 })
        ];
      });
      
      // Check if we need a new page
      if (currentY > 150) {
        doc.addPage();
        currentY = 20;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(180, 0, 0);
        doc.text('Tanques 01 e 02', pageWidth / 2, currentY, { align: 'center' });
        doc.setTextColor(0, 0, 0);
        currentY += 8;
      }
      
      // Draw detailed table
      autoTable(doc, {
        startY: currentY,
        head: [[
          '',
          'Código',
          'Descrição',
          'Motorista/Operador',
          'Hor/Km\nAnterior',
          'Hor/Km\nAtual',
          'Intervalo\n(h/km)',
          'Consumo',
          'Qtd Diesel'
        ]],
        body: tableData,
        styles: { 
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: { 
          fillColor: [200, 200, 200],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 45 },
          3: { cellWidth: 45 },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
          6: { cellWidth: 28, halign: 'right' },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 22, halign: 'right' },
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255]
        },
        theme: 'grid',
      });
      
      doc.save(`resumo_geral_abastecimento_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    } finally {
      setIsExporting(false);
    }
  }, [getStockDataFromSheet, estoqueCanteiro01Data, estoqueCanteiro02Data, estoqueComboio01Data, estoqueComboio02Data, estoqueComboio03Data, resumoPorLocal]);

  // Print function
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // One-time correction removed: LOCAL column now correctly tracks fuel source location
  // (user's assigned tanque/comboio) and no longer needs vehicle-based mapping
  const fixComboioLocalColumn = useCallback(async () => {
    toast.info('A coluna LOCAL agora é preenchida automaticamente com o local de origem do combustível.');
  }, []);

  // One-time correction: fix MOTORISTA column for tank operator records
  const fixTankOperatorNames = useCallback(async () => {
    try {
      toast.info('Corrigindo coluna MOTORISTA para lançamentos de tanque...');
      
      // 1. Load vehicle sheet to get correct drivers
      const { data: vehicleSheet } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Veiculo', noCache: true },
      });
      const vehicleRows = vehicleSheet?.rows || [];
      const driverByCode = new Map<string, string>();
      for (const v of vehicleRows) {
        const code = String(v['Codigo'] || '').trim().toUpperCase().replace(/\s+/g, '');
        const driver = String(v['Motorista'] || '').trim();
        if (code && driver) driverByCode.set(code, driver);
      }
      console.log('[fixMotorista] Drivers from Veiculo sheet:', Object.fromEntries(driverByCode));

      // 2. Get tank operator names from field_users
      const { data: tankUsers } = await supabase
        .from('field_users')
        .select('name, assigned_locations')
        .eq('active', true);
      const tankOperatorNames = new Set<string>();
      if (tankUsers) {
        for (const u of tankUsers) {
          const locs = u.assigned_locations || [];
          const isTank = locs.some((l: string) => l.toLowerCase().includes('tanque') || l.toLowerCase().includes('canteiro'));
          if (isTank) tankOperatorNames.add(u.name.toLowerCase().trim());
        }
      }
      console.log('[fixMotorista] Tank operator names:', [...tankOperatorNames]);

      // 3. Load fuel sheet data
      const { data: sheetData } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'AbastecimentoCanteiro01', noCache: true },
      });
      const rows = sheetData?.rows || [];
      
      // 3b. Build a fallback map: for each vehicle, find the most recent non-tank-operator name from the sheet itself
      const recentDriverByCode = new Map<string, string>();
      for (const row of rows) {
        const vCode = String(row['VEICULO'] || '').trim().toUpperCase().replace(/\s+/g, '');
        const mot = String(row['MOTORISTA'] || '').trim();
        if (!vCode || !mot) continue;
        // Only consider non-tank-operator entries as "correct" driver source
        if (tankOperatorNames.has(mot.toLowerCase().trim())) continue;
        // Keep the last one found (rows are in order, so last = most recent)
        recentDriverByCode.set(vCode, mot);
      }
      console.log('[fixMotorista] Recent non-tank drivers from sheet:', Object.fromEntries(recentDriverByCode));

      let fixed = 0;

      for (const row of rows) {
        const tipo = String(row['TIPO'] || '').toLowerCase();
        if (tipo === 'entrada' || tipo === 'carregamento') continue;
        
        const motorista = String(row['MOTORISTA'] || '').trim();
        const veiculoCode = String(row['VEICULO'] || '').trim().toUpperCase().replace(/\s+/g, '');
        
        // Skip if MOTORISTA is not a tank operator
        const isTankOperator = tankOperatorNames.has(motorista.toLowerCase().trim());
        if (!isTankOperator) continue;
        
        // Look up correct driver: priority 1 = Veiculo sheet, priority 2 = recent non-tank driver
        const correctDriver = driverByCode.get(veiculoCode) || recentDriverByCode.get(veiculoCode);
        if (correctDriver && correctDriver.toLowerCase() !== motorista.toLowerCase() && row._rowIndex) {
          console.log(`[fixMotorista] Fixing row ${row._rowIndex}: ${veiculoCode} "${motorista}" -> "${correctDriver}"`);
          const rowData: Record<string, string> = {};
          for (const [key, val] of Object.entries(row)) {
            if (key === '_rowIndex') continue;
            rowData[key] = String(val ?? '');
          }
          rowData['MOTORISTA'] = correctDriver;

          await supabase.functions.invoke('google-sheets', {
            body: { action: 'update', sheetName: 'AbastecimentoCanteiro01', rowIndex: row._rowIndex, data: rowData },
          });
          fixed++;
          if (fixed % 5 === 0) await new Promise(r => setTimeout(r, 500));
        }
      }

      // 4. Also fix in Supabase DB
      if (tankOperatorNames.size > 0) {
        const { data: dbRecords } = await supabase
          .from('field_fuel_records')
          .select('id, vehicle_code, operator_name')
          .or('record_type.eq.Saida,record_type.eq.saida');
        
        if (dbRecords?.length) {
          for (const rec of dbRecords) {
            const opName = (rec.operator_name || '').toLowerCase().trim();
            if (!tankOperatorNames.has(opName)) continue;
            const code = rec.vehicle_code.toUpperCase().replace(/\s+/g, '');
            const correctDriver = driverByCode.get(code) || recentDriverByCode.get(code);
            if (correctDriver && correctDriver.toLowerCase() !== opName) {
              await supabase.from('field_fuel_records').update({ operator_name: correctDriver }).eq('id', rec.id);
            }
          }
        }
      }

      console.log(`[fixMotorista] Done! Fixed ${fixed} rows in sheet.`);
      toast.success(`Correção de MOTORISTA concluída! ${fixed} linha(s) corrigida(s).`);
      refetchGeral();
    } catch (error) {
      console.error('Error fixing tank operator names:', error);
      toast.error('Erro ao corrigir coluna MOTORISTA');
    }
  }, [refetchGeral]);

  // Auto-run corrections once
  useEffect(() => {
    const correctionKey = 'comboio_local_fix_v4';
    if (!localStorage.getItem(correctionKey)) {
      localStorage.setItem(correctionKey, 'running');
      fixComboioLocalColumn().then(() => {
        localStorage.setItem(correctionKey, 'done');
      });
    }
    const motoristKey = 'tank_motorista_fix_v2';
    if (!localStorage.getItem(motoristKey)) {
      localStorage.setItem(motoristKey, 'running');
      fixTankOperatorNames().then(() => {
        localStorage.setItem(motoristKey, 'done');
      });
    }
  }, [fixComboioLocalColumn, fixTankOperatorNames]);

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Fuel className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Abastecimento</h1>
              <p className="text-sm text-muted-foreground">Resumo em tempo real</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {canCreateRecords && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700">
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">Novo Lançamento</span>
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => openAdminModal('normal')} className="gap-2 cursor-pointer">
                    <FuelIcon className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="font-medium">Abastecer (Saída)</div>
                      <div className="text-xs text-muted-foreground">Saída de combustível para equipamento</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => openAdminModal('comboio')} className="gap-2 cursor-pointer">
                    <Truck className="w-4 h-4 text-orange-600" />
                    <div>
                      <div className="font-medium">Carregar Comboio</div>
                      <div className="text-xs text-muted-foreground">Carregamento de diesel para comboio</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openAdminModal('tanque_diesel')} className="gap-2 cursor-pointer">
                    <Package2 className="w-4 h-4 text-blue-600" />
                    <div>
                      <div className="font-medium">Carregar Tanque Diesel</div>
                      <div className="text-xs text-muted-foreground">Entrada de diesel para tanque</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openAdminModal('tanque_arla')} className="gap-2 cursor-pointer">
                    <Droplet className="w-4 h-4 text-cyan-600" />
                    <div>
                      <div className="font-medium">Carregar Tanque Arla</div>
                      <div className="text-xs text-muted-foreground">Entrada de arla para tanque</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {pendingSyncCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={syncPendingToSheet}
                disabled={isSyncingPending}
                className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950/30"
                title={`${pendingSyncCount} registro(s) não sincronizado(s) com a planilha`}
              >
                <RefreshCw className={cn("w-4 h-4 sm:mr-2", isSyncingPending && "animate-spin")} />
                <span className="hidden sm:inline">{isSyncingPending ? 'Sincronizando...' : `Sync Pendentes (${pendingSyncCount})`}</span>
                <span className="sm:hidden">{pendingSyncCount}</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Imprimir</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF} disabled={isExporting} className="gap-1.5">
              <FileText className={cn("w-4 h-4", isExporting && "animate-spin")} />
              <span className="hidden sm:inline">{isExporting ? 'Exportando...' : 'Exportar Relatório Geral'}</span>
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className={cn("w-2 h-2 rounded-full shrink-0", loading ? "bg-warning animate-pulse" : "bg-success")} />
            <span className={cn("font-medium", loading ? "text-warning" : "text-success")}>
              {loading ? 'Sincronizando...' : 'Conectado'}
            </span>
            <span className="text-muted-foreground">• {filteredRows.length} registros</span>
          </div>
        </div>

        {/* Metric Cards - Responsive Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            title="REGISTROS NO PERÍODO"
            value={additionalMetrics.registros.toString()}
            subtitle={`${PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label || 'Período'}`}
            variant="white"
            icon={Fuel}
          />
          <MetricCard
            title="SAÍDA P/ EQUIPAMENTOS"
            value={`${metricsFromGeral.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Diesel consumido"
            variant="red"
            icon={TrendingDown}
          />
        </div>


        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                activeTab === tab.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-card rounded-lg border border-border p-3 md:p-4 space-y-3 md:space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={localFilter} onValueChange={setLocalFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Local" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Locais</SelectItem>
                  {locais.map(local => (
                    <SelectItem key={local} value={local}>{local}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Tipos</SelectItem>
                  {tipos.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={combustivelFilter} onValueChange={setCombustivelFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Combustível" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Comb.</SelectItem>
                  {combustiveis.map(comb => (
                    <SelectItem key={comb} value={comb}>{comb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Empresas</SelectItem>
                  {empresas.map(emp => (
                    <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Período:</span>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger className="w-36 sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {periodFilter === 'personalizado' && (
              <>
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
                      onSelect={setStartDate}
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
                      onSelect={setEndDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <span className="filter-badge">
              {PERIOD_OPTIONS.find(p => p.value === periodFilter)?.label}
              <X className="w-3 h-3 cursor-pointer ml-1" onClick={clearPeriod} />
            </span>
          </div>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'painel' && (
          <StockPanelTab 
            geralData={geralData}
            estoqueCanteiro01Data={estoqueCanteiro01Data}
            estoqueCanteiro02Data={estoqueCanteiro02Data}
            estoqueComboio01Data={estoqueComboio01Data}
            estoqueComboio02Data={estoqueComboio02Data}
            estoqueComboio03Data={estoqueComboio03Data}
            dateRange={dateRange}
            onRefreshNow={async () => {
              await Promise.all([
                refetchGeral(false, true),
                refetchCanteiro01(false, true),
                refetchCanteiro02(false, true),
                refetchComboio01(false, true),
                refetchComboio02(false, true),
                refetchComboio03(false, true),
              ]);
            }}
            refreshing={
              geralLoading ||
              canteiro01Loading ||
              canteiro02Loading ||
              comboio01Loading ||
              comboio02Loading ||
              comboio03Loading
            }
            lastUpdatedAt={{
              geral: geralUpdatedAt,
              tanque01: canteiro01UpdatedAt,
              tanque02: canteiro02UpdatedAt,
              comboio01: comboio01UpdatedAt,
              comboio02: comboio02UpdatedAt,
              comboio03: comboio03UpdatedAt,
            }}
          />
        )}


        {activeTab === 'detalhamento' && (
          <div className="space-y-4">

            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold bg-primary/10 px-4 py-2 rounded-lg">Detalhamento de Abastecimentos</h2>
              <div className="flex items-center gap-2">
                <Button onClick={exportDetailedPDF} disabled={isExporting} variant="outline" size="sm" className="gap-2">
                  <Download className="w-4 h-4" />
                  {isExporting ? 'Exportando...' : 'PDF'}
                </Button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <button
                onClick={() => setDetalhamentoSubTab('saidas')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  detalhamentoSubTab === 'saidas'
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TrendingDown className="w-4 h-4" />
                Saídas
                <Badge variant="secondary" className="ml-1 text-xs">{detalhamentoRows.saidas.length}</Badge>
              </button>
              <button
                onClick={() => setDetalhamentoSubTab('carregamentos')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  detalhamentoSubTab === 'carregamentos'
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Truck className="w-4 h-4" />
                Carregamentos
                <Badge variant="secondary" className="ml-1 text-xs">{detalhamentoRows.carregamentos.length}</Badge>
              </button>
              <button
                onClick={() => setDetalhamentoSubTab('entradas')}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  detalhamentoSubTab === 'entradas'
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Package2 className="w-4 h-4" />
                Entradas
                <Badge variant="secondary" className="ml-1 text-xs">{detalhamentoRows.entradas.length}</Badge>
              </button>
            </div>
            
            {/* Table for current sub-tab */}
            {(() => {
              const activeRows = detalhamentoSubTab === 'saidas' ? detalhamentoRows.saidas
                : detalhamentoSubTab === 'carregamentos' ? detalhamentoRows.carregamentos
                : detalhamentoRows.entradas;

              const isEntradas = detalhamentoSubTab === 'entradas';
              const isCarregamentos = detalhamentoSubTab === 'carregamentos';

              return (
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-semibold text-primary text-xs">Data</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">Hora</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">Veículo</TableHead>
                        <TableHead className="font-semibold text-primary text-xs">
                          {isEntradas ? 'Fornecedor' : 'Motorista'}
                        </TableHead>
                        <TableHead className="text-right font-semibold text-primary text-xs">Qtd (L)</TableHead>
                        {!isEntradas && !isCarregamentos && (
                          <>
                            <TableHead className="text-right font-semibold text-primary text-xs">Hor/Km Ant.</TableHead>
                            <TableHead className="text-right font-semibold text-primary text-xs">Hor/Km Atual</TableHead>
                            <TableHead className="text-right font-semibold text-primary text-xs">Intervalo</TableHead>
                            <TableHead className="text-right font-semibold text-primary text-xs">Consumo</TableHead>
                          </>
                        )}
                        {isEntradas && (
                          <>
                            <TableHead className="font-semibold text-primary text-xs">Nota Fiscal</TableHead>
                            <TableHead className="font-semibold text-primary text-xs">Local Entrada</TableHead>
                          </>
                        )}
                        {isCarregamentos && (
                          <TableHead className="font-semibold text-primary text-xs">Destino</TableHead>
                        )}
                        <TableHead className="font-semibold text-primary text-xs">Local</TableHead>
                        {canCreateRecords && <TableHead className="w-20 text-center font-semibold text-primary text-xs">Ações</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={15} className="text-center py-8">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                            Carregando dados...
                          </TableCell>
                        </TableRow>
                      ) : activeRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                            Nenhum registro encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        activeRows.slice(0, 100).map((row, index) => {
                          const hasIssue = correctionAnalysis.allIssues.includes(row);
                          return (
                            <TableRow key={row._rowIndex || index} className={cn(
                              hasIssue && 'bg-destructive/10 hover:bg-destructive/15 border-l-2 border-l-destructive'
                            )}>
                              <TableCell className="text-xs">{row['DATA']}</TableCell>
                              <TableCell className="text-xs">{row['HORA']}</TableCell>
                              <TableCell className="text-xs font-bold text-primary">
                                <span className="flex items-center gap-1">
                                  {hasIssue && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                                  {row['VEICULO']}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs">
                                {isEntradas ? String(row['FORNECEDOR'] || '-') : row['MOTORISTA']}
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono font-medium">
                                {parseNumber(row['QUANTIDADE']).toLocaleString('pt-BR')}
                              </TableCell>
                              {!isEntradas && !isCarregamentos && (() => {
                                const cat = String(row['CATEGORIA'] || row['Categoria'] || '').toLowerCase();
                                const isEquip = cat.includes('equipamento') || cat.includes('máquina') || cat.includes('maquina') ||
                                  cat.includes('escavadeira') || cat.includes('retro') || cat.includes('pá carregadeira') ||
                                  cat.includes('pa carregadeira') || cat.includes('trator') || cat.includes('rolo') ||
                                  cat.includes('motoniveladora') || cat.includes('gerador');
                                const anterior = isEquip
                                  ? parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || 0)
                                  : parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0);
                                const atual = isEquip
                                  ? parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || 0)
                                  : parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || 0);
                                const suffix = isEquip ? 'h' : ' km';
                                const intervalo = atual > 0 && anterior > 0 ? atual - anterior : 0;
                                const qtd = parseNumber(row['QUANTIDADE']);
                                let consumo = '';
                                if (intervalo > 0 && qtd > 0) {
                                  if (isEquip) {
                                    consumo = (qtd / intervalo).toFixed(2) + ' L/h';
                                  } else {
                                    consumo = (intervalo / qtd).toFixed(2) + ' km/L';
                                  }
                                }
                                return (
                                  <>
                                    <TableCell className="text-right text-xs font-mono text-muted-foreground">
                                      {anterior > 0 ? `${anterior.toLocaleString('pt-BR')}${suffix}` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono">
                                      {atual > 0 ? `${atual.toLocaleString('pt-BR')}${suffix}` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono">
                                      {intervalo > 0 ? `${intervalo.toLocaleString('pt-BR', { minimumFractionDigits: isEquip ? 2 : 0 })} ${isEquip ? 'h' : 'km'}` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-mono font-bold text-primary">
                                      {consumo || '-'}
                                    </TableCell>
                                  </>
                                );
                              })()}
                              {isEntradas && (
                                <>
                                  <TableCell className="text-xs">{String(row['NOTA FISCAL'] || row['NF'] || '-')}</TableCell>
                                  <TableCell className="text-xs">{String(row['LOCAL DE ENTRADA'] || '-')}</TableCell>
                                </>
                              )}
                              {isCarregamentos && (
                                <TableCell className="text-xs">{String(row['LOCAL DE SAIDA'] || row['LOCAL'] || '-')}</TableCell>
                              )}
                              <TableCell className="text-xs">{row['LOCAL DE SAIDA'] || row['LOCAL']}</TableCell>
                              {canCreateRecords && (
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar"
                                      onClick={() => { setEditingRecord(row); setShowEditModal(true); }}>
                                      <Edit2 className="h-4 w-4 text-blue-500" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir"
                                      onClick={() => { setDeletingRecord(row); setShowDeleteConfirm(true); }}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                  {activeRows.length > 100 && (
                    <div className="p-4 text-center text-sm text-muted-foreground border-t">
                      Mostrando 100 de {activeRows.length} registros
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'saneamento' && (
          <div className="space-y-4">
            {/* Saneamento KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="ESTOQUE OBRA SANEAMENTO"
                value={`${estoqueSaneamento.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
                subtitle="Estoque atual"
                variant="primary"
                icon={Droplet}
                className="border-l-4 border-l-blue-500"
              />
              <MetricCard
                title="ABASTECIMENTOS SANEAMENTO"
                value={saneamentoFilteredData.length.toString()}
                subtitle="Total de registros"
                variant="primary"
                icon={Fuel}
                className="border-l-4 border-l-amber-500"
              />
              <MetricCard
                title="VEÍCULOS ATENDIDOS"
                value={saneamentoSummary.entries.length.toString()}
                subtitle="Veículos únicos"
                variant="primary"
                icon={TrendingUp}
                className="border-l-4 border-l-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplet className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Abastecimentos - Obra Saneamento</h2>
                <Badge variant="outline">{saneamentoFilteredData.length} registros</Badge>
              </div>
              <Button size="sm" onClick={() => openAdminModal('normal')} className="gap-2 bg-green-600 hover:bg-green-700">
                <Plus className="w-4 h-4" />
                Novo
              </Button>
            </div>

            {saneamentoFilteredData.length === 0 ? (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <Droplet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Nenhum registro encontrado</h3>
                <p className="text-muted-foreground">Não há registros de abastecimento para Obra Saneamento no período selecionado.</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Data</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Motorista</TableHead>
                      <TableHead className="text-center">Diesel (L)</TableHead>
                      <TableHead className="text-center">Arla (L)</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead className="w-20 text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saneamentoFilteredData.map((row, index) => (
                      <TableRow key={row._rowIndex || index}>
                        <TableCell>{String(row['DATA'] || '-')}</TableCell>
                        <TableCell>{String(row['HORA'] || '-')}</TableCell>
                        <TableCell className="font-medium">{String(row['VEICULO'] || '-')}</TableCell>
                        <TableCell>{String(row['MOTORISTA'] || row['OPERADOR'] || '-')}</TableCell>
                        <TableCell className="text-center font-medium">
                          {parseNumber(row['QUANTIDADE']).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {parseNumber(row['QUANTIDADE DE ARLA']) > 0 ? parseNumber(row['QUANTIDADE DE ARLA']).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                        </TableCell>
                        <TableCell>{String(row['LOCAL DE SAIDA'] || row['LOCAL'] || '-')}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar"
                              onClick={() => { setEditingRecord(row); setShowEditModal(true); }}>
                              <Edit2 className="h-4 w-4 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Excluir"
                              onClick={() => { setDeletingRecord(row); setShowDeleteConfirm(true); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'entradas' && (() => {
          const totalEntradas = entradasData.entries.length;
          const totalQuantidade = entradasData.entries.reduce((sum, row) => sum + parseNumber(row['QUANTIDADE']), 0);
          const totalValor = entradasData.entries.reduce((sum, row) => sum + parseNumber(row['VALOR TOTAL']), 0);

          const exportEntradasPDF = async () => {
            try {
              const doc = new jsPDF('landscape');
              const pageWidth = doc.internal.pageSize.getWidth();
              const logoBase64 = await getLogoBase64(obraSettings?.logo_url);
              const periodLabel = startDate && endDate
                ? `${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`
                : startDate ? `A partir de ${format(startDate, 'dd/MM/yyyy')}` : endDate ? `Até ${format(endDate!, 'dd/MM/yyyy')}` : format(new Date(), 'dd/MM/yyyy');
              
              const startY = renderStandardHeader(doc, {
                reportTitle: 'ENTRADAS DE COMBUSTÍVEL',
                obraSettings,
                logoBase64,
                date: periodLabel,
              });

              doc.setTextColor(0, 0, 0);
              doc.setFontSize(10);
              doc.setFont('helvetica', 'bold');
              doc.text(`Total de Entradas: ${totalEntradas}`, 14, startY);
              doc.text(`Quantidade Total: ${totalQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`, 14, startY + 6);
              doc.text(`Valor Total: R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, startY + 12);

              const tableRows = entradasData.entries.map(row => {
                const qtd = parseNumber(row['QUANTIDADE']);
                const valorUnit = parseNumber(row['VALOR UNITARIO'] || row['VALOR_UNITARIO'] || row['PRECO'] || 0);
                const valorTotal = parseNumber(row['VALOR TOTAL'] || 0);
                return [
                  String(row['DATA'] || ''),
                  String(row['HORA'] || ''),
                  String(row['FORNECEDOR'] || '-'),
                  String(row['LOCAL DE SAIDA'] || row['LOCAL'] || row['TANQUE'] || '-'),
                  qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                  String(row['NOTA FISCAL'] || '-'),
                  valorUnit > 0 ? `R$ ${valorUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
                  valorTotal > 0 ? `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-',
                ];
              });

              autoTable(doc, {
                startY: startY + 18,
                head: [['Data', 'Hora', 'Fornecedor', 'Local', 'Quantidade (L)', 'NF', 'Valor Unit.', 'Valor Total']],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185], fontSize: 8, halign: 'center' },
                bodyStyles: { fontSize: 7 },
                columnStyles: {
                  4: { halign: 'right' },
                  6: { halign: 'right' },
                  7: { halign: 'right' },
                },
              });

              doc.save(`entradas_combustivel_${format(new Date(), 'yyyyMMdd')}.pdf`);
              toast.success('PDF exportado com sucesso!');
            } catch (error) {
              console.error('Error exporting PDF:', error);
              toast.error('Erro ao exportar PDF');
            }
          };

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold bg-primary/10 px-4 py-2 rounded-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-success" />
                  Entradas de Combustível
                </h2>
                <Button size="sm" variant="outline" className="gap-1" onClick={exportEntradasPDF}>
                  <FileSpreadsheet className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-card rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Total de Entradas</p>
                  <p className="text-2xl font-bold text-foreground">{totalEntradas}</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Quantidade Total</p>
                  <p className="text-2xl font-bold text-success">+{totalQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="text-2xl font-bold text-primary">R$ {totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Detailed Table */}
              {totalEntradas === 0 ? (
                <div className="bg-card rounded-lg border border-border p-8 text-center">
                  <ArrowDownUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Nenhuma entrada encontrada</h3>
                  <p className="text-muted-foreground">Não há registros de entrada no período selecionado.</p>
                </div>
              ) : (
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-primary/10">
                        <TableHead className="font-semibold text-primary">Data</TableHead>
                        <TableHead className="font-semibold text-primary">Hora</TableHead>
                        <TableHead className="font-semibold text-primary">Fornecedor</TableHead>
                        <TableHead className="font-semibold text-primary">Local</TableHead>
                        <TableHead className="text-right font-semibold text-primary">Quantidade (L)</TableHead>
                        <TableHead className="font-semibold text-primary">NF</TableHead>
                        <TableHead className="text-right font-semibold text-primary">Valor Unit.</TableHead>
                        <TableHead className="text-right font-semibold text-primary">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entradasData.entries.map((row, index) => {
                        const qtd = parseNumber(row['QUANTIDADE']);
                        const valorUnit = parseNumber(row['VALOR UNITARIO'] || row['VALOR_UNITARIO'] || row['PRECO'] || 0);
                        const valorTotal = parseNumber(row['VALOR TOTAL'] || 0);
                        return (
                          <TableRow key={row._rowIndex || index}>
                            <TableCell>{row['DATA']}</TableCell>
                            <TableCell>{row['HORA'] || '-'}</TableCell>
                            <TableCell>{row['FORNECEDOR'] || '-'}</TableCell>
                            <TableCell>{row['LOCAL DE SAIDA'] || row['LOCAL'] || row['TANQUE'] || '-'}</TableCell>
                            <TableCell className="text-right font-medium text-success">
                              +{qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>{row['NOTA FISCAL'] || '-'}</TableCell>
                            <TableCell className="text-right">
                              {valorUnit > 0 ? `R$ ${valorUnit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {valorTotal > 0 ? `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })()}


        {activeTab === 'consumo' && (
          <VehicleConsumptionDetailTab
            data={data}
            refetch={refetch}
            loading={loading}
          />
        )}


        {activeTab === 'relatorios' && (() => {
          const availableCategories = Array.from(new Set(
            filteredRows
              .map(r => String(r['CATEGORIA'] || r['Categoria'] || '').trim())
              .filter(c => c.length > 0)
          )).sort((a, b) => a.localeCompare(b, 'pt-BR'));
          
          const reportRows = reportCategoryFilter === 'all'
            ? filteredRows
            : filteredRows.filter(r => {
                const cat = String(r['CATEGORIA'] || r['Categoria'] || '').trim();
                return cat === reportCategoryFilter;
              });

          return (
            <ReportsTab
              isExporting={isExporting}
              filteredRowsCount={reportRows.length}
              startDate={startDate}
              endDate={endDate}
              sortByDescription={sortByDescription}
              availableCategories={availableCategories}
              selectedCategory={reportCategoryFilter}
              onCategoryChange={setReportCategoryFilter}
              onToggleSortByDescription={() => setSortByDescription(!sortByDescription)}
              onExportPDF={() => exportPDF()}
              onExportXLSX={() => exportToXLSX()}
              onExportPDFPorEmpresa={() => exportPDFPorEmpresa()}
              onExportPorEmpresaXLSX={() => exportPorEmpresaToXLSX()}
              onExportDetailedPDF={() => exportDetailedPDF()}
              onExportTanquesPDF={() => exportTanquesPDF(reportRows, startDate || new Date(), buildStockData(), obraSettings, sortByDescription)}
              onExportTanquesXLSX={() => exportTanquesXLSX(reportRows, startDate || new Date(), sortByDescription)}
              onExportComboiosPDF={() => exportComboiosPDF(reportRows, startDate || new Date(), buildStockData(), obraSettings, sortByDescription)}
              onExportComboiosXLSX={() => exportComboiosXLSX(reportRows, startDate || new Date(), sortByDescription)}
              onExportTanquesComboiosPDF={() => exportTanquesComboiosPDF(reportRows, startDate || new Date(), buildStockData(), obraSettings, sortByDescription)}
              onExportTanquesComboiosXLSX={() => exportTanquesComboiosXLSX(reportRows, startDate || new Date(), sortByDescription)}
              onPreviewTanquesPDF={async () => {
                const url = await exportTanquesPDF(reportRows, startDate || new Date(), buildStockData(), obraSettings, sortByDescription, true);
                if (url) { setPreviewPdfUrl(url as string); setPreviewPdfName('Relatorio_Tanques.pdf'); setShowPdfPreview(true); }
              }}
              onPreviewComboiosPDF={async () => {
                const url = await exportComboiosPDF(reportRows, startDate || new Date(), buildStockData(), obraSettings, sortByDescription, true);
                if (url) { setPreviewPdfUrl(url as string); setPreviewPdfName('Relatorio_Comboios.pdf'); setShowPdfPreview(true); }
              }}
              onPreviewTanquesComboiosPDF={async () => {
                const url = await exportTanquesComboiosPDF(reportRows, startDate || new Date(), buildStockData(), obraSettings, sortByDescription, true);
                if (url) { setPreviewPdfUrl(url as string); setPreviewPdfName('Tanques_Comboios.pdf'); setShowPdfPreview(true); }
              }}
            />
          );
        })()}
      </div>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-primary" />
              Detalhes do Abastecimento
            </DialogTitle>
          </DialogHeader>
          
          {selectedRecord && (
            <div className="space-y-6">
              {/* Main Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Data</span>
                  <p className="font-medium">{String(selectedRecord['DATA'] || '-')}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Hora</span>
                  <p className="font-medium">{String(selectedRecord['HORA'] || '-')}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Tipo</span>
                  <Badge variant="outline">{String(selectedRecord['TIPO'] || '-')}</Badge>
                </div>
              </div>

              {/* Vehicle Info */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Veículo</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Código</span>
                    <p className="font-medium">{String(selectedRecord['VEICULO'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Descrição</span>
                    <p className="font-medium">{String(selectedRecord['DESCRICAO'] || selectedRecord['DESCRIÇÃO'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Categoria</span>
                    <p className="font-medium">{String(selectedRecord['CATEGORIA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Motorista</span>
                    <p className="font-medium">{String(selectedRecord['MOTORISTA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Empresa</span>
                    <p className="font-medium">{String(selectedRecord['EMPRESA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Obra</span>
                    <p className="font-medium">{String(selectedRecord['OBRA'] || '-')}</p>
                  </div>
                </div>
              </div>

              {/* Fuel Info */}
              <div className="bg-primary/5 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Combustível</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Tipo</span>
                    <p className="font-medium">{String(selectedRecord['TIPO DE COMBUSTIVEL'] || 'Diesel')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Quantidade</span>
                    <p className="font-medium text-lg text-primary">
                      {parseNumber(selectedRecord['QUANTIDADE']).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Arla</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['QUANTIDADE DE ARLA']) > 0 
                        ? `${parseNumber(selectedRecord['QUANTIDADE DE ARLA']).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L` 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Local</span>
                    <p className="font-medium">{String(selectedRecord['LOCAL'] || '-')}</p>
                  </div>
                </div>
              </div>

              {/* Horimeter/KM Info */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Horímetro / Quilometragem</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Horímetro Anterior</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['HORIMETRO ANTERIOR']) > 0 
                        ? parseNumber(selectedRecord['HORIMETRO ANTERIOR']).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Horímetro Atual</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['HORIMETRO ATUAL']) > 0 
                        ? parseNumber(selectedRecord['HORIMETRO ATUAL']).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">KM Anterior</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['KM ANTERIOR']) > 0 
                        ? parseNumber(selectedRecord['KM ANTERIOR']).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) 
                        : '-'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">KM Atual</span>
                    <p className="font-medium">
                      {parseNumber(selectedRecord['KM ATUAL']) > 0 
                        ? parseNumber(selectedRecord['KM ATUAL']).toLocaleString('pt-BR', { minimumFractionDigits: 0 }) 
                        : '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Photos Section - Always show */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  Fotos
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Foto Bomba */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Foto Bomba</span>
                    {selectedRecord['FOTO BOMBA'] && String(selectedRecord['FOTO BOMBA']).trim() ? (
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => setFullscreenImage(String(selectedRecord['FOTO BOMBA']))}
                      >
                        <img 
                          src={String(selectedRecord['FOTO BOMBA'])} 
                          alt="Foto Bomba" 
                          className="w-full h-48 object-cover rounded-lg border border-border group-hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            (e.target as HTMLImageElement).parentElement!.innerHTML = `
                              <div class="w-full h-48 bg-muted/30 rounded-lg border border-border flex items-center justify-center">
                                <span class="text-muted-foreground text-sm">Erro ao carregar imagem</span>
                              </div>
                            `;
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-muted/30 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                        <Image className="w-8 h-8 text-muted-foreground/50" />
                        <span className="text-muted-foreground text-sm">Sem foto</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Foto Horímetro */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Foto Horímetro</span>
                    {selectedRecord['FOTO HORIMETRO'] && String(selectedRecord['FOTO HORIMETRO']).trim() ? (
                      <div 
                        className="relative group cursor-pointer"
                        onClick={() => setFullscreenImage(String(selectedRecord['FOTO HORIMETRO']))}
                      >
                        <img 
                          src={String(selectedRecord['FOTO HORIMETRO'])} 
                          alt="Foto Horímetro" 
                          className="w-full h-48 object-cover rounded-lg border border-border group-hover:opacity-90 transition-opacity"
                          onError={(e) => {
                            (e.target as HTMLImageElement).parentElement!.innerHTML = `
                              <div class="w-full h-48 bg-muted/30 rounded-lg border border-border flex items-center justify-center">
                                <span class="text-muted-foreground text-sm">Erro ao carregar imagem</span>
                              </div>
                            `;
                          }}
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                          <Eye className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-48 bg-muted/30 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2">
                        <Image className="w-8 h-8 text-muted-foreground/50" />
                        <span className="text-muted-foreground text-sm">Sem foto</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Observations */}
              {selectedRecord['OBSERVAÇÃO'] && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Observações</h4>
                  <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                    {String(selectedRecord['OBSERVAÇÃO'])}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen Image Modal */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setFullscreenImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Foto em tela cheia" 
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro?
              {deletingRecord && (
                <span className="block mt-2 font-medium text-foreground">
                  {String(deletingRecord['DATA'] || '')} — Veículo: {String(deletingRecord['VEICULO'] || '')} — {parseNumber(deletingRecord['QUANTIDADE']).toLocaleString('pt-BR')} L
                </span>
              )}
              <span className="block mt-2 text-destructive font-medium">Esta ação não pode ser desfeita e o registro será removido da planilha imediatamente.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteConfirm(false); setDeletingRecord(null); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecord}
              disabled={isDeletingRecord}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingRecord ? (
                <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Excluindo...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Excluir</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Fuel Record Modal */}
      {canCreateRecords && (
        <AdminFuelRecordModal
          open={showAdminRecordModal}
          onOpenChange={setShowAdminRecordModal}
          onSuccess={() => refetch()}
          presetMode={adminPresetMode}
          presetLocation={adminPresetLocation}
        />
      )}

      {/* Admin Horimeter Modal */}
      {canCreateRecords && (
        <DatabaseHorimeterModal
          open={showHorimeterModal}
          onOpenChange={setShowHorimeterModal}
          onSuccess={() => refetch()}
        />
      )}

      {/* Admin Service Order Modal */}
      {canCreateRecords && (
        <AdminServiceOrderModal
          open={showOSModal}
          onOpenChange={setShowOSModal}
          onSuccess={() => refetch()}
        />
      )}

      {/* Edit Record Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-blue-500" />
              Editar Registro de Abastecimento
            </DialogTitle>
          </DialogHeader>
          
          {editingRecord && (
            <div className="space-y-6">
              {/* Vehicle Info - Read Only */}
              <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm">Veículo (somente leitura)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Data</span>
                    <p className="font-medium">{String(editingRecord['DATA'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Código</span>
                    <p className="font-medium">{String(editingRecord['VEICULO'] || '-')}</p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Descrição</span>
                    <p className="font-medium">{String(editingRecord['DESCRICAO'] || editingRecord['DESCRIÇÃO'] || '-')}</p>
                  </div>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 space-y-4 border border-blue-200 dark:border-blue-800">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <PenLine className="w-4 h-4 text-blue-500" />
                  Campos Editáveis
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Quantidade (L)</label>
                    <Input
                      type="text"
                      value={String(editingRecord['QUANTIDADE'] ?? '')}
                      onChange={(e) => setEditingRecord({
                        ...editingRecord,
                        'QUANTIDADE': e.target.value
                      })}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Horímetro Anterior</label>
                    <CurrencyInput
                      value={parseNumber(editingRecord['HORIMETRO ANTERIOR'])}
                      onChange={(v) => setEditingRecord({
                        ...editingRecord,
                        'HORIMETRO ANTERIOR': v !== null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''
                      })}
                      decimals={1}
                      minDecimals={1}
                      className="h-10"
                      placeholder="Ex: 8.403,5"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Horímetro Atual</label>
                    <CurrencyInput
                      value={parseNumber(editingRecord['HORIMETRO ATUAL'])}
                      onChange={(v) => setEditingRecord({
                        ...editingRecord,
                        'HORIMETRO ATUAL': v !== null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''
                      })}
                      decimals={1}
                      minDecimals={1}
                      className="h-10"
                      placeholder="Ex: 8.403,5"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Motorista</label>
                    <Input
                      type="text"
                      value={String(editingRecord['MOTORISTA'] ?? '')}
                      onChange={(e) => setEditingRecord({
                        ...editingRecord,
                        'MOTORISTA': e.target.value
                      })}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">KM Anterior</label>
                    <CurrencyInput
                      value={parseNumber(editingRecord['KM ANTERIOR'])}
                      onChange={(v) => setEditingRecord({
                        ...editingRecord,
                        'KM ANTERIOR': v !== null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''
                      })}
                      decimals={1}
                      minDecimals={1}
                      className="h-10"
                      placeholder="Ex: 364.281,0"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">KM Atual</label>
                    <CurrencyInput
                      value={parseNumber(editingRecord['KM ATUAL'])}
                      onChange={(v) => setEditingRecord({
                        ...editingRecord,
                        'KM ATUAL': v !== null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : ''
                      })}
                      decimals={1}
                      minDecimals={1}
                      className="h-10"
                      placeholder="Ex: 364.312,5"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Quantidade ARLA</label>
                    <Input
                      type="text"
                      value={String(editingRecord['QUANTIDADE DE ARLA'] ?? '')}
                      onChange={(e) => setEditingRecord({
                        ...editingRecord,
                        'QUANTIDADE DE ARLA': e.target.value
                      })}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Local</label>
                    <Select
                      value={String(editingRecord['LOCAL DE SAIDA'] ?? editingRecord['LOCAL'] ?? '')}
                      onValueChange={(value) => setEditingRecord({
                        ...editingRecord,
                        'LOCAL DE SAIDA': value
                      })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {locais.map(local => (
                          <SelectItem key={local} value={local}>{local}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Observation field */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Observações</label>
                <Input
                  type="text"
                  value={String(editingRecord['OBSERVAÇÃO'] || '')}
                  onChange={(e) => setEditingRecord({
                    ...editingRecord,
                    'OBSERVAÇÃO': e.target.value
                  })}
                  placeholder="Adicionar observação..."
                />
              </div>

              {/* Photos Section */}
              {(editingRecord['FOTO BOMBA'] || editingRecord['FOTO HORIMETRO']) && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Fotos
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {editingRecord['FOTO BOMBA'] && String(editingRecord['FOTO BOMBA']).trim() && (
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground">Foto Bomba</span>
                        <img
                          src={String(editingRecord['FOTO BOMBA'])}
                          alt="Foto Bomba"
                          className="w-full h-48 object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setFullscreenImage(String(editingRecord['FOTO BOMBA']))}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                    {editingRecord['FOTO HORIMETRO'] && String(editingRecord['FOTO HORIMETRO']).trim() && (
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground">Foto Horímetro</span>
                        <img
                          src={String(editingRecord['FOTO HORIMETRO'])}
                          alt="Foto Horímetro"
                          className="w-full h-48 object-cover rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setFullscreenImage(String(editingRecord['FOTO HORIMETRO']))}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Previous Records List */}
              {previousRecords.length > 0 && (
                <div className="border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                    onClick={() => { setShowPreviousRecord(!showPreviousRecord); if (showPreviousRecord) setSelectedPreviousIdx(null); }}
                  >
                    <span className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-400">
                      <Eye className="w-4 h-4" />
                      Abastecimentos Anteriores do Veículo ({previousRecords.length})
                    </span>
                    {showPreviousRecord ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
                  </button>
                  {showPreviousRecord && (
                    <div className="bg-amber-50/50 dark:bg-amber-950/10 divide-y divide-amber-200 dark:divide-amber-800">
                      {previousRecords.map((rec, idx) => (
                        <div key={idx}>
                          <button
                            type="button"
                            className={cn(
                              "w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors text-sm",
                              selectedPreviousIdx === idx && "bg-amber-100 dark:bg-amber-900/40"
                            )}
                            onClick={() => setSelectedPreviousIdx(selectedPreviousIdx === idx ? null : idx)}
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-mono text-muted-foreground w-4">{idx + 1}.</span>
                              <span className="font-medium">{String(rec['DATA'] || '-')}</span>
                              <span className="text-muted-foreground">{String(rec['HORA'] || '')}</span>
                              <span className="text-amber-700 dark:text-amber-400 font-semibold">{String(rec['QUANTIDADE'] || '-')}L</span>
                              <span className="text-muted-foreground text-xs">Hor: {String(rec['HORIMETRO ATUAL'] || '-')}</span>
                            </div>
                            {selectedPreviousIdx === idx ? <ChevronUp className="w-3.5 h-3.5 text-amber-600 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                          </button>

                          {selectedPreviousIdx === idx && (
                            <div className="p-4 space-y-4 border-t border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/20">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Data</span>
                                  <p className="text-sm font-medium">{String(rec['DATA'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Hora</span>
                                  <p className="text-sm font-medium">{String(rec['HORA'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Motorista</span>
                                  <p className="text-sm font-medium">{String(rec['MOTORISTA'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Quantidade (L)</span>
                                  <p className="text-sm font-medium">{String(rec['QUANTIDADE'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Horímetro Anterior</span>
                                  <p className="text-sm font-medium">{String(rec['HORIMETRO ANTERIOR'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Horímetro Atual</span>
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{String(rec['HORIMETRO ATUAL'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">KM Anterior</span>
                                  <p className="text-sm font-medium">{String(rec['KM ANTERIOR'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">KM Atual</span>
                                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">{String(rec['KM ATUAL'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Local</span>
                                  <p className="text-sm font-medium">{String(rec['LOCAL DE SAIDA'] || rec['LOCAL'] || '-')}</p>
                                </div>
                                <div className="space-y-1">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">ARLA</span>
                                  <p className="text-sm font-medium">{String(rec['QUANTIDADE DE ARLA'] || '-')}</p>
                                </div>
                                {rec['OBSERVAÇÃO'] && String(rec['OBSERVAÇÃO']).trim() && (
                                  <div className="space-y-1 col-span-2">
                                    <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Observações</span>
                                    <p className="text-sm font-medium">{String(rec['OBSERVAÇÃO'])}</p>
                                  </div>
                                )}
                              </div>
                              {(rec['FOTO BOMBA'] || rec['FOTO HORIMETRO']) && (
                                <div className="space-y-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                    <Image className="w-3 h-3" /> Fotos
                                  </span>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {rec['FOTO BOMBA'] && String(rec['FOTO BOMBA']).trim() && (
                                      <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Foto Bomba</span>
                                        <img src={String(rec['FOTO BOMBA'])} alt="Foto Bomba" className="w-full h-44 object-cover rounded-lg border border-amber-300 dark:border-amber-700 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenImage(String(rec['FOTO BOMBA']))} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      </div>
                                    )}
                                    {rec['FOTO HORIMETRO'] && String(rec['FOTO HORIMETRO']).trim() && (
                                      <div className="space-y-1">
                                        <span className="text-xs text-muted-foreground">Foto Horímetro</span>
                                        <img src={String(rec['FOTO HORIMETRO'])} alt="Foto Horímetro" className="w-full h-44 object-cover rounded-lg border border-amber-300 dark:border-amber-700 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setFullscreenImage(String(rec['FOTO HORIMETRO']))} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingRecord(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  disabled={isSavingEdit}
                  onClick={async () => {
                    if (!editingRecord || editingRecord._rowIndex == null) {
                      toast.error('Não foi possível identificar o registro para edição');
                      return;
                    }
                    
                    setIsSavingEdit(true);
                    
                    try {
                      // Parse helper for Brazilian numbers
                      const parseNum = (val: any) => {
                        if (!val || val === '') return null;
                        const str = String(val).replace(/\./g, '').replace(',', '.');
                        const num = parseFloat(str);
                        return isNaN(num) ? null : num;
                      };
                      const fmtNum = (v: number | null) => {
                        if (v === null || v === 0) return '';
                        return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      };

                      // Prepare the row data for update
                      const rowData: Record<string, any> = {};
                      
                      // Copy all original fields first to maintain data integrity
                      Object.keys(editingRecord).forEach(key => {
                        if (key !== '_rowIndex') {
                          rowData[key] = editingRecord[key];
                        }
                      });

                      // Override editable fields explicitly
                      rowData['QUANTIDADE'] = editingRecord['QUANTIDADE'];
                      rowData['HORIMETRO ANTERIOR'] = editingRecord['HORIMETRO ANTERIOR'];
                      rowData['HORIMETRO ATUAL'] = editingRecord['HORIMETRO ATUAL'];
                      rowData['MOTORISTA'] = editingRecord['MOTORISTA'];
                      rowData['KM ANTERIOR'] = editingRecord['KM ANTERIOR'];
                      rowData['KM ATUAL'] = editingRecord['KM ATUAL'];
                      rowData['QUANTIDADE DE ARLA'] = editingRecord['QUANTIDADE DE ARLA'];
                      rowData['LOCAL'] = editingRecord['LOCAL DE SAIDA'] || editingRecord['LOCAL'] || '';
                      rowData['LOCAL DE SAIDA'] = editingRecord['LOCAL DE SAIDA'] || editingRecord['LOCAL'] || '';
                      rowData['OBSERVAÇÃO'] = editingRecord['OBSERVAÇÃO'];

                      // Recalculate computed interval columns
                      const horPrev = parseNum(editingRecord['HORIMETRO ANTERIOR']) || 0;
                      const horCurr = parseNum(editingRecord['HORIMETRO ATUAL']) || 0;
                      const kmPrev = parseNum(editingRecord['KM ANTERIOR']) || 0;
                      const kmCurr = parseNum(editingRecord['KM ATUAL']) || 0;
                      rowData['INTERVALO HORAS'] = horCurr > horPrev ? fmtNum(horCurr - horPrev) : '';
                      rowData['INTERVALO KM'] = kmCurr > kmPrev ? fmtNum(kmCurr - kmPrev) : '';
                      
                      console.log('[EditModal] Saving update for row', editingRecord._rowIndex, rowData);
                      
                      // Update Google Sheets
                      const { data: sheetResp, error } = await supabase.functions.invoke('google-sheets', {
                        body: {
                          action: 'update',
                          sheetName: SHEET_NAME,
                          rowIndex: editingRecord._rowIndex,
                          data: rowData
                        }
                      });
                      
                      if (error) throw error;
                      if (sheetResp?.error) throw new Error(sheetResp.error);
                      
                      // Also update corresponding record in field_fuel_records database
                      const vehicleCode = String(editingRecord['VEICULO'] || '').trim();
                      const recordDate = String(editingRecord['DATA'] || '').trim();
                      const recordTime = String(editingRecord['HORA'] || '').trim();
                      
                      if (vehicleCode && recordDate) {
                        // Find matching record in database
                        let query = supabase
                          .from('field_fuel_records')
                          .select('id')
                          .eq('vehicle_code', vehicleCode);
                        
                        // Parse date for matching (support both DD/MM/YYYY and YYYY-MM-DD)
                        let formattedDate = recordDate;
                        if (recordDate.includes('/')) {
                          const [day, month, year] = recordDate.split('/');
                          formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                        }
                        query = query.eq('record_date', formattedDate);
                        
                        // Add time filter if available
                        if (recordTime) {
                          query = query.eq('record_time', recordTime);
                        }
                        
                        const { data: matchingRecords } = await query.limit(1);
                        
                        if (matchingRecords && matchingRecords.length > 0) {
                          const dbRecordId = matchingRecords[0].id;
                          
                          // Update the database record
                          const updateData: Record<string, any> = {
                            fuel_quantity: parseNum(editingRecord['QUANTIDADE']) || 0,
                            horimeter_previous: parseNum(editingRecord['HORIMETRO ANTERIOR']),
                            horimeter_current: parseNum(editingRecord['HORIMETRO ATUAL']),
                            km_previous: parseNum(editingRecord['KM ANTERIOR']),
                            km_current: parseNum(editingRecord['KM ATUAL']),
                            arla_quantity: parseNum(editingRecord['QUANTIDADE DE ARLA']),
                            operator_name: editingRecord['MOTORISTA'] || null,
                            location: editingRecord['LOCAL'] || null,
                            observations: editingRecord['OBSERVAÇÃO'] || null,
                            updated_at: new Date().toISOString()
                          };
                          
                          const { error: dbError } = await supabase
                            .from('field_fuel_records')
                            .update(updateData)
                            .eq('id', dbRecordId);
                          
                          if (dbError) {
                            console.warn('Aviso: Planilha atualizada, mas falha ao sincronizar com banco:', dbError);
                          } else {
                            console.log('Registro sincronizado com banco de dados:', dbRecordId);
                          }
                        }
                      }
                      
                      toast.success('Registro atualizado com sucesso!');
                      broadcast('fuel_record_updated', { vehicleCode });
                      
                      // Optimistic update: immediately update local data
                      const savedRowIndex = editingRecord._rowIndex;
                      setData(prev => ({
                        ...prev,
                        rows: prev.rows.map(r => {
                          if (r._rowIndex === savedRowIndex) {
                            return { ...r, ...rowData, _rowIndex: r._rowIndex };
                          }
                          return r;
                        }),
                      }));
                      
                      setShowEditModal(false);
                      setEditingRecord(null);
                      // Delayed background refetch to sync with actual sheet
                      setTimeout(() => refetch(true, true), 2000);
                    } catch (err) {
                      console.error('Error updating record:', err);
                      toast.error('Erro ao atualizar registro');
                    } finally {
                      setIsSavingEdit(false);
                    }
                  }}
                  className="gap-2"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Edit2 className="w-4 h-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        open={showPdfPreview}
        onClose={() => { setShowPdfPreview(false); setPreviewPdfUrl(null); }}
        pdfUrl={previewPdfUrl}
        fileName={previewPdfName}
      />

    </div>
  );
}
