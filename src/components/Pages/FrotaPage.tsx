import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Truck,
  RefreshCw,
  FileText,
  Search,
  Building2,
  Settings,
  ChevronDown,
  ChevronRight,
  Calendar,
  X,
  FileSpreadsheet,
  Cog,
  Car,
  Activity,
  History,
  Plus,
  Edit,
  Trash2,
  Settings2,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Minus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSheetData } from '@/hooks/useGoogleSheets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VehicleHistoryModal } from '@/components/Frota/VehicleHistoryModal';
import { VehicleFormModal } from '@/components/Frota/VehicleFormModal';
import { MobilizedEquipmentsView } from '@/components/Frota/MobilizedEquipmentsView';
import { exportMobilizacaoPDF, exportEfetivoPDF, exportMobilizadosPDF, exportDesmobilizadosPDF } from '@/components/Frota/FrotaReportGenerators';
import { EfetivoColumnSelectorModal, type EfetivoColumn } from '@/components/Frota/EfetivoColumnSelectorModal';
import { useObraSettings } from '@/hooks/useObraSettings';
import { ColumnConfigModal } from '@/components/Layout/ColumnConfigModal';
import { useLayoutPreferences, ColumnConfig } from '@/hooks/useLayoutPreferences';
import { FrotaKpiDetailModal, type KpiType } from '@/components/Frota/FrotaKpiDetailModal';
import { BatchStatusModal } from '@/components/Frota/BatchStatusModal';
import { Checkbox } from '@/components/ui/checkbox';

const SHEET_NAME = 'Veiculo';

const CUSTOM_STATUSES_KEY = 'frota-custom-statuses';

const DEFAULT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ativo: { label: 'Ativo', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  inativo: { label: 'Inativo', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  manutencao: { label: 'Manutenção', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  mobilizado: { label: 'Mobilizado', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  desmobilizado: { label: 'Desmobilizado', color: 'bg-red-100 text-red-700 border-red-300' },
  'em transito': { label: 'Em Trânsito', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  reserva: { label: 'Reserva', color: 'bg-purple-100 text-purple-700 border-purple-300' },
};

function loadCustomStatuses(): Record<string, { label: string; color: string }> {
  try {
    const saved = localStorage.getItem(CUSTOM_STATUSES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

function saveCustomStatuses(statuses: Record<string, { label: string; color: string }>) {
  localStorage.setItem(CUSTOM_STATUSES_KEY, JSON.stringify(statuses));
}

function getAllStatusLabels(): Record<string, { label: string; color: string }> {
  return { ...DEFAULT_STATUS_LABELS, ...loadCustomStatuses() };
}

// Default columns configuration
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'codigo', label: 'Código', visible: true, order: 0 },
  { key: 'descricao', label: 'Descrição', visible: true, order: 1 },
  { key: 'categoria', label: 'Categoria', visible: true, order: 2 },
  { key: 'empresa', label: 'Empresa', visible: true, order: 3 },
  { key: 'status', label: 'Status', visible: true, order: 4 },
  { key: 'acoes', label: 'Ações', visible: true, order: 5 },
];

interface VehicleGroup {
  name: string;
  empresas: number;
  veiculos: number;
  items: Array<{
    codigo: string;
    motorista: string;
    potencia: string;
    descricao: string;
    empresa: string;
    categoria: string;
    obra: string;
    status: string;
  }>;
}

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

export function FrotaPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [descricaoFilter, setDescricaoFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [groupBy, setGroupBy] = useState<'categoria' | 'empresa' | 'descricao'>('categoria');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'mobilized' | 'historico' | 'relatorios'>('list');
  const { settings: obraSettings } = useObraSettings();
  
  // Layout preferences
  const { columnConfig, visibleColumns, savePreferences, resetToDefaults, saving: savingLayout } = 
    useLayoutPreferences('frota', DEFAULT_COLUMNS);
  const [columnConfigModalOpen, setColumnConfigModalOpen] = useState(false);
  const [efetivoColumnModalOpen, setEfetivoColumnModalOpen] = useState(false);
  
  // Maintenance KPI - real-time from service_orders
  const [maintenanceCount, setMaintenanceCount] = useState(0);
  const [maintenanceOrders, setMaintenanceOrders] = useState<Array<{
    vehicle_code: string;
    vehicle_description: string | null;
    problem_description: string | null;
    status: string;
    entry_date: string | null;
    mechanic_name: string | null;
  }>>([]);
  
  // Custom statuses management
  const [customStatuses, setCustomStatuses] = useState<Record<string, { label: string; color: string }>>(loadCustomStatuses());
  const [showAddStatus, setShowAddStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');

  // Fetch maintenance orders for KPI - linked to service_orders real-time
  const fetchMaintenance = useCallback(async () => {
    const { data: orders } = await supabase
      .from('service_orders')
      .select('vehicle_code, vehicle_description, problem_description, status, entry_date, mechanic_name')
      .in('status', ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças']);
    
    if (orders) {
      setMaintenanceOrders(orders);
      // Count unique vehicles in maintenance (OS + sheet status)
      const osVehicleCodes = new Set(orders.map(o => o.vehicle_code));
      // Also count vehicles with status "manutenção" from sheet data
      const sheetMaintenanceCount = data.rows.filter(row => {
        const status = (getRowValue(row as any, ['STATUS', 'Status', 'status']) || '').toLowerCase();
        const code = getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']);
        return (status === 'manutencao' || status === 'manutenção') && !osVehicleCodes.has(code);
      }).length;
      setMaintenanceCount(osVehicleCodes.size + sheetMaintenanceCount);
    }
  }, [data.rows]);

  useEffect(() => {
    fetchMaintenance();

    // Subscribe to real-time changes on service_orders
    const channel = supabase
      .channel('frota-maintenance')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_orders',
      }, () => {
        fetchMaintenance();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchMaintenance]);

  const addCustomStatus = useCallback(() => {
    if (!newStatusName.trim()) return;
    const key = newStatusName.trim().toLowerCase();
    const label = newStatusName.trim();
    const newStatus = { label, color: 'bg-indigo-100 text-indigo-700 border-indigo-300' };
    const updated = { ...customStatuses, [key]: newStatus };
    setCustomStatuses(updated);
    saveCustomStatuses(updated);
    setNewStatusName('');
    setShowAddStatus(false);
  }, [newStatusName, customStatuses]);
  
  // Vehicle form modal state
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [vehicleFormMode, setVehicleFormMode] = useState<'create' | 'edit'>('create');
  const [editingVehicle, setEditingVehicle] = useState<{
    codigo: string;
    motorista: string;
    potencia: string;
    descricao: string;
    categoria: string;
    empresa: string;
    obra: string;
    status: string;
  } | null>(null);
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Vehicle history modal state
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<{
    codigo: string;
    descricao: string;
    categoria: string;
    empresa: string;
  } | null>(null);

  // KPI detail modal state
  const [kpiDetailOpen, setKpiDetailOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KpiType>('total');

  // Batch selection state
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [batchStatusOpen, setBatchStatusOpen] = useState(false);

  const toggleSelectVehicle = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allCodes = filteredRows.map(row => getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']));
    if (selectedCodes.size === allCodes.length) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(allCodes));
    }
  };

  const toggleSelectGroup = (items: Array<{ codigo: string }>) => {
    const groupCodes = items.map(i => i.codigo);
    const allSelected = groupCodes.every(c => selectedCodes.has(c));
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (allSelected) {
        groupCodes.forEach(c => next.delete(c));
      } else {
        groupCodes.forEach(c => next.add(c));
      }
      return next;
    });
  };

  const handleKpiClick = (kpi: KpiType) => {
    setSelectedKpi(kpi);
    setKpiDetailOpen(true);
  };

  // Build vehicle items for KPI modal
  const allVehicleItems = useMemo(() => {
    return data.rows.map(row => ({
      codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
      descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
      empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
      categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
      status: getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo',
    }));
  }, [data.rows]);

  const openVehicleHistory = (vehicle: { codigo: string; descricao: string; categoria: string; empresa: string }) => {
    setSelectedVehicle(vehicle);
    setHistoryModalOpen(true);
  };

  const openCreateVehicle = () => {
    setVehicleFormMode('create');
    setEditingVehicle(null);
    setVehicleFormOpen(true);
  };

  const openEditVehicle = (vehicle: { codigo: string; motorista: string; potencia: string; descricao: string; categoria: string; empresa: string; obra: string; status: string }) => {
    setVehicleFormMode('edit');
    setEditingVehicle(vehicle);
    setVehicleFormOpen(true);
  };

  const openDeleteConfirm = (codigo: string) => {
    setVehicleToDelete(codigo);
    setDeleteDialogOpen(true);
  };

  const handleDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    
    setDeleting(true);
    try {
      // First find the rowIndex for the vehicle
      const { data: sheetData, error: fetchError } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Veiculo', noCache: true },
      });
      if (fetchError) throw fetchError;

      const rows = sheetData?.rows || [];
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s/g, '');
      const targetCode = normalize(vehicleToDelete);
      const matchedRow = rows.find((r: any) => {
        const code = normalize(String(r.CODIGO || r['CÓDIGO'] || r['Codigo'] || ''));
        return code === targetCode;
      });

      if (!matchedRow?._rowIndex) {
        throw new Error('Veículo não encontrado na planilha');
      }

      const { error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'delete',
          sheetName: 'Veiculo',
          rowIndex: matchedRow._rowIndex,
        },
      });

      if (error) throw error;
      
      // Also sync deletion to Supabase vehicles table
      await supabase.from('vehicles').delete().eq('code', vehicleToDelete);
      
      toast.success('Veículo excluído com sucesso!');
      refetch();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      toast.error('Erro ao excluir veículo');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setVehicleToDelete(null);
    }
  };

  const empresas = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']).trim();
      if (empresa) unique.add(empresa);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const descricoes = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const desc = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']).trim();
      if (desc) unique.add(desc);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const categorias = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const cat = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']).trim();
      if (cat) unique.add(cat);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  // Descriptions excluded from fleet/efetivo counts
  const EXCLUDED_DESCRIPTIONS = ['aferição comboio', 'ajuste'];

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );

      const empresaValue = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']);
      const descricaoValue = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']);
      const statusValue = getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo';

      // Exclude "Aferição Comboio" and "AJUSTE" from all counts
      const isExcludedDesc = EXCLUDED_DESCRIPTIONS.includes(descricaoValue.trim().toLowerCase());
      if (isExcludedDesc) return false;

      const matchesEmpresa = empresaFilter === 'all' || empresaValue === empresaFilter;
      const matchesDescricao = descricaoFilter === 'all' || descricaoValue === descricaoFilter;
      const matchesStatus = statusFilter === 'all' || statusValue.toLowerCase() === statusFilter;

      return matchesSearch && matchesEmpresa && matchesDescricao && matchesStatus;
    });
  }, [data.rows, search, empresaFilter, descricaoFilter, statusFilter]);

  const metrics = useMemo(() => {
    const empresasSet = new Set<string>();
    const categorias = new Set<string>();
    let equipamentos = 0;
    let veiculos = 0;
    let ativos = 0;
    let inativos = 0;
    let emManutencao = 0;
    let mobilizados = 0;
    let desmobilizados = 0;
    let obraSaneamento = 0;
    
    filteredRows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']).trim();
      const obra = getRowValue(row as any, ['OBRA', 'Obra', 'obra']).trim();
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']).trim().toLowerCase();
      const status = (getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo').toLowerCase();
      
      if (empresa) empresasSet.add(empresa);
      if (categoria) categorias.add(categoria);
      
      if (categoria.includes('equipamento') || categoria.includes('máquina') || categoria.includes('maquina')) {
        equipamentos++;
      } else {
        veiculos++;
      }

      // Apenas categorias "Veiculo" e "Equipamento" entram na contagem principal de Mob/Desmob
      const isValidCategory = categoria.includes('veiculo') || categoria.includes('veículo') || categoria.includes('equipamento');
      const isObraSaneamento = empresa.toLowerCase().includes('obra saneamento') || obra.toLowerCase().includes('obra saneamento');
      const isExcluded = !isValidCategory || isObraSaneamento;
      
      if (isExcluded && (status === 'mobilizado' || status === 'desmobilizado' || status === 'ativo')) {
        obraSaneamento++;
      } else if (status === 'ativo') ativos++;
      else if (status === 'inativo') inativos++;
      else if (status === 'manutencao' || status === 'manutenção') emManutencao++;
      else if (status === 'mobilizado') mobilizados++;
      else if (status === 'desmobilizado') desmobilizados++;
    });

    return {
      totalAtivos: filteredRows.length,
      equipamentos,
      veiculos,
      empresas: empresasSet.size,
      categorias: categorias.size,
      ativos,
      inativos,
      emManutencao,
      mobilizados,
      desmobilizados,
      obraSaneamento,
    };
  }, [filteredRows]);

  const groupedVehicles = useMemo(() => {
    const groups: Record<string, VehicleGroup> = {};
    
    filteredRows.forEach(row => {
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']) || 'Outros';
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']) || 'Não informada';
      const codigo = getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']);
      const motorista = getRowValue(row as any, ['MOTORISTA', 'Motorista', 'motorista']);
      const potencia = getRowValue(row as any, ['POTENCIA', 'Potencia', 'potencia', 'POTÊNCIA']);
      const descricao = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']) || 'Sem descrição';
      const obra = getRowValue(row as any, ['OBRA', 'Obra', 'obra']);
      const status = getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo';

      let groupKey: string;
      switch (groupBy) {
        case 'empresa':
          groupKey = empresa;
          break;
        case 'descricao':
          groupKey = descricao;
          break;
        case 'categoria':
        default:
          groupKey = categoria;
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { name: groupKey, empresas: 0, veiculos: 0, items: [] };
      }

      groups[groupKey].veiculos++;
      groups[groupKey].items.push({ codigo, motorista, potencia, descricao, empresa, categoria, obra, status });
    });

    Object.values(groups).forEach(group => {
      const uniqueEmpresas = new Set(group.items.map(i => i.empresa));
      group.empresas = uniqueEmpresas.size;
    });

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows, groupBy]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => 
      prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
    );
  };

  // PDF Report - Organized by Company then Description
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Organize data by company, then by description
    const dataByCompany: Record<string, Record<string, Array<{
      codigo: string;
      descricao: string;
      categoria: string;
      status: string;
    }>>> = {};
    
    filteredRows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']) || 'Não informada';
      const descricao = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']) || 'Sem descrição';
      const codigo = getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']);
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']) || 'Outros';
      const status = getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo';
      
      if (!dataByCompany[empresa]) {
        dataByCompany[empresa] = {};
      }
      if (!dataByCompany[empresa][descricao]) {
        dataByCompany[empresa][descricao] = [];
      }
      dataByCompany[empresa][descricao].push({ codigo, descricao, categoria, status });
    });
    
    // Sort companies and descriptions alphabetically
    const sortedCompanies = Object.keys(dataByCompany).sort();
    
    // Header with navy blue theme
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE FROTA - EQUIPAMENTOS ATIVOS', 14, 16);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Report info
    doc.text(`Data de Referência: ${format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}`, 14, 35);
    if (empresaFilter !== 'all') {
      doc.text(`Empresa: ${empresaFilter}`, 14, 41);
    }
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth - 70, 35);
    
    // Summary
    const summaryY = empresaFilter !== 'all' ? 50 : 45;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO:', 14, summaryY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total de Ativos: ${metrics.totalAtivos}`, 14, summaryY + 6);
    doc.text(`Equipamentos: ${metrics.equipamentos}`, 80, summaryY + 6);
    doc.text(`Veículos: ${metrics.veiculos}`, 140, summaryY + 6);
    doc.text(`Empresas: ${sortedCompanies.length}`, 200, summaryY + 6);

    let startY = summaryY + 16;
    
    // Iterate by company
    sortedCompanies.forEach((empresa, empresaIndex) => {
      const descricoes = dataByCompany[empresa];
      const sortedDescricoes = Object.keys(descricoes).sort();
      
      // Count total vehicles for this company
      const totalVehiclesInCompany = Object.values(descricoes).reduce((sum, arr) => sum + arr.length, 0);
      
      // Check if need new page for company header
      if (startY > 170) {
        doc.addPage();
        startY = 20;
      }

      // Company header with navy blue background
      doc.setFillColor(30, 41, 59);
      doc.rect(14, startY - 5, pageWidth - 28, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(`${empresa.toUpperCase()} (${totalVehiclesInCompany} unidades)`, 16, startY + 1);
      doc.setTextColor(0, 0, 0);
      
      startY += 10;
      
      // Iterate by description within company
      sortedDescricoes.forEach((descricao, descIndex) => {
        const vehicles = descricoes[descricao];
        
        // Check if need new page
        if (startY > 175) {
          doc.addPage();
          startY = 20;
        }

        // Description sub-header with gray background
        doc.setFillColor(100, 116, 139);
        doc.rect(14, startY - 3, pageWidth - 28, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${descricao} (${vehicles.length})`, 18, startY + 2);
        doc.setTextColor(0, 0, 0);
        
        startY += 6;

        const tableData = vehicles
          .sort((a, b) => a.codigo.localeCompare(b.codigo))
          .map(item => [
            item.codigo,
            item.categoria,
            getAllStatusLabels()[item.status?.toLowerCase() || 'ativo']?.label || 'Ativo'
          ]);

        autoTable(doc, {
          head: [['Código', 'Categoria', 'Status']],
          body: tableData,
          startY: startY,
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [148, 163, 184], textColor: 0 },
          alternateRowStyles: { fillColor: [249, 250, 251] },
          margin: { left: 18, right: 18 }
        });

        startY = (doc as any).lastAutoTable.finalY + 6;
      });
      
      startY += 4;
    });

    // Footer with totals
    if (startY > 180) {
      doc.addPage();
      startY = 20;
    }
    
    doc.setFillColor(30, 41, 59);
    doc.rect(14, startY, pageWidth - 28, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL GERAL: ${metrics.totalAtivos} ativos | ${sortedCompanies.length} empresas`, 16, startY + 7);

    doc.save(`frota_${format(selectedDate, 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const excelData = filteredRows.map(row => ({
      'Código': getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
      'Descrição': getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
      'Categoria': getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
      'Empresa': getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
      'Status': getAllStatusLabels()[(getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo').toLowerCase()]?.label || 'Ativo',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 25 }, { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Frota');
    XLSX.writeFile(workbook, `frota_${format(selectedDate, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
              <Truck className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Gestão de Frota</h1>
              <p className="text-sm text-muted-foreground">Equipamentos e veículos ativos</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <Button 
                variant={viewMode === 'list' ? 'default' : 'ghost'} 
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Lista</span>
              </Button>
              <Button 
                variant={viewMode === 'mobilized' ? 'default' : 'ghost'} 
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode('mobilized')}
              >
                <LayoutGrid className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Mobilizados</span>
              </Button>
              <Button 
                variant={viewMode === 'historico' ? 'default' : 'ghost'} 
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode('historico')}
              >
                <History className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Histórico</span>
              </Button>
              <Button 
                variant={viewMode === 'relatorios' ? 'default' : 'ghost'} 
                size="sm"
                className="rounded-none"
                onClick={() => setViewMode('relatorios')}
              >
                <FileText className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Relatórios</span>
              </Button>
            </div>
            
            <Button onClick={openCreateVehicle} size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Novo</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            {viewMode === 'list' && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportToPDF}
                  className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                >
                  <FileText className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">PDF</span>
                </Button>
                <Button variant="outline" size="sm" onClick={exportToExcel}>
                  <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Excel</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setColumnConfigModalOpen(true)}
                  className="gap-2"
                >
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Colunas</span>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3">
          {/* Total - Blue */}
          <div 
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105"
            onClick={() => handleKpiClick('total')}
          >
            <p className="text-[10px] font-semibold text-blue-100 uppercase tracking-wide">TOTAL</p>
            <p className="text-2xl font-bold mt-0.5">{metrics.totalAtivos}</p>
            <p className="text-[10px] text-blue-200">Cadastrados</p>
          </div>

          {/* Ativos - Green */}
          <div 
            className={cn(
              "bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105",
              statusFilter === 'ativo' && "ring-2 ring-white ring-offset-2 ring-offset-emerald-500"
            )}
            onClick={() => handleKpiClick('ativos')}
          >
            <p className="text-[10px] font-semibold text-emerald-100 uppercase tracking-wide">ATIVOS</p>
            <p className="text-2xl font-bold mt-0.5">{metrics.ativos}</p>
            <p className="text-[10px] text-emerald-200">Em operação</p>
          </div>

          {/* Inativos - Gray */}
          <div 
            className={cn(
              "bg-gradient-to-br from-gray-400 to-gray-500 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105",
              statusFilter === 'inativo' && "ring-2 ring-white ring-offset-2 ring-offset-gray-400"
            )}
            onClick={() => handleKpiClick('inativos')}
          >
            <p className="text-[10px] font-semibold text-gray-100 uppercase tracking-wide">INATIVOS</p>
            <p className="text-2xl font-bold mt-0.5">{metrics.inativos}</p>
            <p className="text-[10px] text-gray-200">Parados</p>
          </div>

          {/* Em Manutenção - Amber */}
          <div 
            className={cn(
              "bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105",
              statusFilter === 'manutencao' && "ring-2 ring-white ring-offset-2 ring-offset-amber-500"
            )}
            onClick={() => handleKpiClick('manutencao')}
          >
            <p className="text-[10px] font-semibold text-amber-100 uppercase tracking-wide">MANUTENÇÃO</p>
            <p className="text-2xl font-bold mt-0.5">{maintenanceCount}</p>
            <p className="text-[10px] text-amber-200">OS ativas</p>
          </div>

          {/* Mobilizados - Blue */}
          <div 
            className={cn(
              "bg-gradient-to-br from-blue-400 to-blue-500 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105",
              statusFilter === 'mobilizado' && "ring-2 ring-white ring-offset-2 ring-offset-blue-400"
            )}
            onClick={() => handleKpiClick('mobilizados')}
          >
            <p className="text-[10px] font-semibold text-blue-100 uppercase tracking-wide">MOBILIZADOS</p>
            <p className="text-2xl font-bold mt-0.5">{metrics.mobilizados}</p>
            <p className="text-[10px] text-blue-200">Em campo</p>
          </div>

          {/* Desmobilizados - Red */}
          <div 
            className={cn(
              "bg-gradient-to-br from-red-400 to-red-500 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105",
              statusFilter === 'desmobilizado' && "ring-2 ring-white ring-offset-2 ring-offset-red-400"
            )}
            onClick={() => handleKpiClick('desmobilizados')}
          >
            <p className="text-[10px] font-semibold text-red-100 uppercase tracking-wide">DESMOB.</p>
            <p className="text-2xl font-bold mt-0.5">{metrics.desmobilizados}</p>
            <p className="text-[10px] text-red-200">Retirados</p>
          </div>

          {/* Obra Saneamento - Purple */}
          <div 
            className={cn(
              "bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-3 text-white shadow-lg cursor-pointer transition-transform hover:scale-105",
              statusFilter === 'obra_saneamento' && "ring-2 ring-white ring-offset-2 ring-offset-purple-500"
            )}
            onClick={() => handleKpiClick('obra_saneamento')}
          >
            <p className="text-[10px] font-semibold text-purple-100 uppercase tracking-wide">SANEAMENTO</p>
            <p className="text-2xl font-bold mt-0.5">{metrics.obraSaneamento}</p>
            <p className="text-[10px] text-purple-200">Obra Saneamento</p>
          </div>
        </div>

        {/* Mobilized View Mode */}
        {viewMode === 'mobilized' && (
          <MobilizedEquipmentsView
            vehicles={filteredRows.map(row => ({
              codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
              descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
              empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
              categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
              status: getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo',
            }))}
            selectedDate={selectedDate}
            onVehicleClick={(vehicle) => {
              setSelectedVehicle({
                codigo: vehicle.codigo,
                descricao: vehicle.descricao,
                categoria: vehicle.categoria,
                empresa: vehicle.empresa
              });
              setHistoryModalOpen(true);
            }}
          />
        )}

        {/* List View Mode - Filters */}
        {viewMode === 'list' && (
          <>
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-wrap">
                {/* Date Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Data:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Calendar className="w-4 h-4" />
                        {format(selectedDate, 'dd/MM/yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-background" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                  <Button
                    variant={format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedDate(new Date())}
                  >
                    Hoje
                  </Button>
                </div>

                {/* Empresa Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Empresa:</span>
                  <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Todas Empresas" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="all">Todas Empresas</SelectItem>
                      {empresas.map(empresa => (
                        <SelectItem key={empresa} value={empresa}>{empresa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Descrição Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Descrição:</span>
                  <Select value={descricaoFilter} onValueChange={setDescricaoFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Todas Descrições" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="all">Todas Descrições</SelectItem>
                      {descricoes.map(desc => (
                        <SelectItem key={desc} value={desc}>{desc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Status:</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Todos Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="all">Todos Status</SelectItem>
                      {Object.entries(getAllStatusLabels()).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(empresaFilter !== 'all' || descricaoFilter !== 'all' || statusFilter !== 'all') && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setEmpresaFilter('all');
                      setDescricaoFilter('all');
                      setStatusFilter('all');
                    }}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>

              {/* Search */}
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar código ou descrição..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Group By and Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Agrupar por:</span>
                  <div className="flex gap-1">
                    <Button 
                      variant={groupBy === 'categoria' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setGroupBy('categoria')}
                    >
                      Categoria
                    </Button>
                    <Button 
                      variant={groupBy === 'empresa' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setGroupBy('empresa')}
                    >
                      Empresa
                    </Button>
                    <Button 
                      variant={groupBy === 'descricao' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setGroupBy('descricao')}
                    >
                      Descrição
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setExpandedGroups(groupedVehicles.map(g => g.name))}>
                    Expandir
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setExpandedGroups([])}>
                    Recolher
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Exibindo <span className="font-semibold text-foreground">{filteredRows.length}</span> de {data.rows.length} ativos
              </p>

              {/* Batch Action Bar */}
              {selectedCodes.size > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <span className="text-sm font-medium">
                    {selectedCodes.size} selecionado(s)
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setBatchStatusOpen(true)} className="gap-1">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Alterar Status
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedCodes(new Set())}>
                    Limpar seleção
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Content - Grouped View (List Mode Only) */}
        {viewMode === 'list' && (loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {groupedVehicles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum equipamento encontrado com os filtros aplicados
              </div>
            ) : (
              groupedVehicles.map(group => (
                <div key={group.name} className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
                  <div className="flex items-center w-full p-4 hover:bg-muted/50 transition-colors">
                    <div className="mr-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={group.items.every(i => selectedCodes.has(i.codigo))}
                        onCheckedChange={() => toggleSelectGroup(group.items)}
                      />
                    </div>
                    <button
                      onClick={() => toggleGroup(group.name)}
                      className="flex-1 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {expandedGroups.includes(group.name) ? (
                          <ChevronDown className="w-5 h-5 text-primary" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                        <div className="text-left">
                          <span className="font-semibold text-lg">{group.name}</span>
                          <span className="text-sm text-muted-foreground ml-3">
                            {group.empresas} empresa{group.empresas !== 1 ? 's' : ''} • {group.veiculos} unidade{group.veiculos !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                          {group.veiculos}
                        </span>
                      </div>
                    </button>
                  </div>
                  
                  {expandedGroups.includes(group.name) && (
                    <div className="border-t border-border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="w-10">
                              <Checkbox
                                checked={group.items.every(i => selectedCodes.has(i.codigo))}
                                onCheckedChange={() => toggleSelectGroup(group.items)}
                              />
                            </TableHead>
                            {visibleColumns.map((col) => (
                              <TableHead key={col.key} className={col.key === 'acoes' ? 'text-center' : ''}>
                                {col.label}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((item, idx) => {
                            const allStatuses = getAllStatusLabels();
                            const statusInfo = allStatuses[item.status?.toLowerCase() || 'ativo'] || allStatuses.ativo;
                            return (
                              <TableRow key={idx} className={cn("hover:bg-muted/30", selectedCodes.has(item.codigo) && "bg-primary/5")}>
                                <TableCell className="w-10">
                                  <Checkbox
                                    checked={selectedCodes.has(item.codigo)}
                                    onCheckedChange={() => toggleSelectVehicle(item.codigo)}
                                  />
                                </TableCell>
                                {visibleColumns.map((col) => {
                                  switch (col.key) {
                                    case 'codigo':
                                      return (
                                        <TableCell key={col.key} className="font-medium">
                                          {item.codigo}
                                        </TableCell>
                                      );
                                    case 'descricao':
                                      return <TableCell key={col.key}>{item.descricao}</TableCell>;
                                    case 'categoria':
                                      return <TableCell key={col.key}>{item.categoria}</TableCell>;
                                    case 'empresa':
                                      return <TableCell key={col.key}>{item.empresa}</TableCell>;
                                    case 'status':
                                      return (
                                        <TableCell key={col.key}>
                                          <span className={cn("px-2 py-1 rounded-full text-xs font-medium border", statusInfo.color)}>
                                            {statusInfo.label}
                                          </span>
                                        </TableCell>
                                      );
                                    case 'acoes':
                                      return (
                                        <TableCell key={col.key} className="text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <Button 
                                              variant="ghost" 
                                              size="icon"
                                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                              onClick={() => openVehicleHistory(item)}
                                              title="Histórico"
                                            >
                                              <History className="w-4 h-4" />
                                            </Button>
                                            <Button 
                                              variant="ghost" 
                                              size="icon"
                                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                                              onClick={() => openEditVehicle(item)}
                                              title="Editar"
                                            >
                                              <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button 
                                              variant="ghost" 
                                              size="icon"
                                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                                              onClick={() => openDeleteConfirm(item.codigo)}
                                              title="Excluir"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      );
                                    default:
                                      return <TableCell key={col.key}>-</TableCell>;
                                  }
                                })}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ))}

        {/* Histórico View Mode */}
        {viewMode === 'historico' && (
          <div className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                <History className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Histórico de Veículos / Equipamentos</h2>
                <p className="text-sm text-muted-foreground">Selecione um veículo para visualizar seu histórico completo dia a dia</p>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código, descrição ou empresa..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Vehicle Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {allVehicleItems
                .filter(v => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  return v.codigo.toLowerCase().includes(q) || 
                    v.descricao.toLowerCase().includes(q) || 
                    v.empresa.toLowerCase().includes(q) ||
                    v.categoria.toLowerCase().includes(q);
                })
                .sort((a, b) => a.codigo.localeCompare(b.codigo))
                .map(vehicle => {
                  const allStatuses = getAllStatusLabels();
                  const statusInfo = allStatuses[vehicle.status?.toLowerCase() || 'ativo'] || allStatuses.ativo;
                  return (
                    <button
                      key={vehicle.codigo}
                      onClick={() => openVehicleHistory(vehicle)}
                      className="bg-background border border-border rounded-lg p-4 text-left hover:border-primary hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-primary text-lg">{vehicle.codigo}</p>
                          <p className="text-sm text-foreground truncate mt-0.5">{vehicle.descricao}</p>
                          <p className="text-xs text-muted-foreground mt-1">{vehicle.empresa} • {vehicle.categoria}</p>
                        </div>
                        <History className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-2" />
                      </div>
                      <div className="mt-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium border", statusInfo.color)}>
                          {statusInfo.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
            </div>

            {allVehicleItems.filter(v => {
              if (!search) return true;
              const q = search.toLowerCase();
              return v.codigo.toLowerCase().includes(q) || v.descricao.toLowerCase().includes(q) || v.empresa.toLowerCase().includes(q);
            }).length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum veículo encontrado
              </div>
            )}
          </div>
        )}

        {/* Relatórios View Mode */}
        {viewMode === 'relatorios' && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Relatórios de Frota</h2>
                <p className="text-sm text-muted-foreground">Exporte relatórios detalhados da frota</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Mobilização */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Truck className="w-4 h-4 text-blue-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Mobilização</h3>
                    <p className="text-xs text-muted-foreground">Resumo geral + detalhamento por tipo</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => {
                    const allVehicles = filteredRows.map(row => ({
                      codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
                      descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
                      empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
                      categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
                      status: getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo',
                    }));
                    exportMobilizacaoPDF(allVehicles, selectedDate, obraSettings);
                    toast.success('PDF de Mobilização gerado!');
                  }}
                >
                  <FileText className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

              {/* Efetivo / Apontamento Diário */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                    <Activity className="w-4 h-4 text-teal-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Efetivo Diário</h3>
                    <p className="text-xs text-muted-foreground">Apontamento diário de equipamentos</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => setEfetivoColumnModalOpen(true)}
                >
                  <FileText className="w-4 h-4" />
                  Configurar e Exportar PDF
                </Button>
              </div>

              {/* Mobilizados */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <CheckSquare className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Mobilizados</h3>
                    <p className="text-xs text-muted-foreground">Lista de equipamentos em campo</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => {
                    const allVehicles = data.rows.map(row => ({
                      codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
                      descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
                      empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
                      categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
                      status: getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo',
                    }));
                    exportMobilizadosPDF(allVehicles, selectedDate, obraSettings);
                    toast.success('PDF de Mobilizados gerado!');
                  }}
                >
                  <FileText className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

              {/* Desmobilizados */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <X className="w-4 h-4 text-red-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Desmobilizados</h3>
                    <p className="text-xs text-muted-foreground">Equipamentos retirados do campo</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => {
                    const allVehicles = data.rows.map(row => ({
                      codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
                      descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
                      empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
                      categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
                      status: getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo',
                    }));
                    const result = exportDesmobilizadosPDF(allVehicles, selectedDate, obraSettings);
                    if (result === false) {
                      toast.info('Nenhum equipamento desmobilizado encontrado.');
                    } else {
                      toast.success('PDF de Desmobilizados gerado!');
                    }
                  }}
                >
                  <FileText className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

              {/* Lista Geral - PDF */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-red-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Lista Geral (PDF)</h3>
                    <p className="text-xs text-muted-foreground">Todos os veículos/equipamentos</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  onClick={exportToPDF}
                >
                  <FileText className="w-4 h-4" />
                  Exportar PDF
                </Button>
              </div>

              {/* Lista Geral - Excel */}
              <div className="bg-card rounded-lg border border-border p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <FileSpreadsheet className="w-4 h-4 text-green-700" />
                  </div>
                  <div>
                    <h3 className="font-semibold">Lista Geral (Excel)</h3>
                    <p className="text-xs text-muted-foreground">Exportar planilha com filtros aplicados</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full gap-2"
                  variant="outline"
                  onClick={exportToExcel}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Exportar Excel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Vehicle History Modal */}
      {selectedVehicle && (
        <VehicleHistoryModal
          open={historyModalOpen}
          onClose={() => {
            setHistoryModalOpen(false);
            setSelectedVehicle(null);
          }}
          vehicleCode={selectedVehicle.codigo}
          vehicleDescription={selectedVehicle.descricao}
          vehicleCategory={selectedVehicle.categoria}
          vehicleEmpresa={selectedVehicle.empresa}
        />
      )}

      {/* Vehicle Form Modal */}
      <VehicleFormModal
        open={vehicleFormOpen}
        onClose={() => setVehicleFormOpen(false)}
        onSuccess={() => refetch()}
        mode={vehicleFormMode}
        vehicle={editingVehicle}
        empresas={empresas}
        categorias={categorias}
      />

      {/* Column Config Modal */}
      <ColumnConfigModal
        open={columnConfigModalOpen}
        onClose={() => setColumnConfigModalOpen(false)}
        columns={columnConfig}
        onSave={savePreferences}
        onReset={resetToDefaults}
        saving={savingLayout}
        moduleName="Frota"
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o veículo <strong>{vehicleToDelete}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVehicle}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Efetivo Column Selector Modal */}
      <EfetivoColumnSelectorModal
        open={efetivoColumnModalOpen}
        onClose={() => setEfetivoColumnModalOpen(false)}
        companies={(() => {
          const empSet = new Set<string>();
          filteredRows.forEach(row => {
            const emp = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']);
            if (emp) empSet.add(emp);
          });
          return Array.from(empSet);
        })()}
        onGenerate={async (selectedColumns) => {
          const allVehicles = filteredRows.map(row => ({
            codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
            descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
            empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
            categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
            status: getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo',
          }));
          await exportEfetivoPDF(allVehicles, selectedDate, maintenanceOrders, obraSettings, selectedColumns);
          setEfetivoColumnModalOpen(false);
          toast.success('PDF de Efetivo gerado!');
        }}
      />
      {/* KPI Detail Modal */}
      <FrotaKpiDetailModal
        open={kpiDetailOpen}
        onClose={() => setKpiDetailOpen(false)}
        kpiType={selectedKpi}
        vehicles={allVehicleItems}
        maintenanceOrders={maintenanceOrders}
        onVehicleClick={(vehicle) => {
          setKpiDetailOpen(false);
          openVehicleHistory({
            codigo: vehicle.codigo,
            descricao: vehicle.descricao,
            categoria: vehicle.categoria,
            empresa: vehicle.empresa,
          });
        }}
      />
      {/* Batch Status Modal */}
      <BatchStatusModal
        open={batchStatusOpen}
        onClose={() => setBatchStatusOpen(false)}
        onSuccess={() => {
          setSelectedCodes(new Set());
          refetch();
        }}
        selectedVehicles={Array.from(selectedCodes)}
      />
    </div>
  );
}
