import { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Truck, RefreshCw, FileText, Search, ChevronDown, ChevronRight,
  Calendar, X, Plus, Edit, Trash2, Settings2, History, 
  LayoutGrid, List, ArrowUpDown, AlertTriangle, Building2, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VehicleHistoryModal } from '@/components/Frota/VehicleHistoryModal';
import { VehicleFormModal } from '@/components/Frota/VehicleFormModal';
import { MobilizedEquipmentsView } from '@/components/Frota/MobilizedEquipmentsView';
import { exportMobilizacaoPDF, exportEfetivoPDF, exportMobilizadosPDF, exportDesmobilizadosPDF, exportFrotaGeralAtualizadaPDF } from '@/components/Frota/FrotaReportGenerators';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { EfetivoColumnSelectorModal, type EfetivoColumn } from '@/components/Frota/EfetivoColumnSelectorModal';
import { useObraSettings } from '@/hooks/useObraSettings';
import { ColumnConfigModal } from '@/components/Layout/ColumnConfigModal';
import { useLayoutPreferences, ColumnConfig } from '@/hooks/useLayoutPreferences';
import { FrotaKpiDetailModal, type KpiType } from '@/components/Frota/FrotaKpiDetailModal';
import { BatchStatusModal } from '@/components/Frota/BatchStatusModal';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const SHEET_NAME = 'Veiculo';

const DEFAULT_STATUS_LABELS: Record<string, { label: string; color: string; shortLabel?: string }> = {
  ativo: { label: 'Ativo', shortLabel: 'ATIVO', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  inativo: { label: 'Inativo', shortLabel: 'INATIVO', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  manutencao: { label: 'Manutenção', shortLabel: 'MANUT.', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  mobilizado: { label: 'Mobilizado', shortLabel: 'MOB', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  desmobilizado: { label: 'Desmobilizado', shortLabel: 'DESMOB', color: 'bg-red-100 text-red-700 border-red-300' },
  'a mobilizar': { label: 'A Mobilizar', shortLabel: 'A MOB', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  'em transito': { label: 'Em Trânsito', shortLabel: 'TRÂNS.', color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
  reserva: { label: 'Reserva', shortLabel: 'RESERVA', color: 'bg-purple-100 text-purple-700 border-purple-300' },
};

function getAllStatusLabels() {
  try {
    const saved = localStorage.getItem('frota-custom-statuses');
    const custom = saved ? JSON.parse(saved) : {};
    return { ...DEFAULT_STATUS_LABELS, ...custom };
  } catch { return DEFAULT_STATUS_LABELS; }
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'codigo', label: 'Código', visible: true, order: 0 },
  { key: 'descricao', label: 'Descrição', visible: true, order: 1 },
  { key: 'categoria', label: 'Categoria', visible: true, order: 2 },
  { key: 'empresa', label: 'Empresa', visible: true, order: 3 },
  { key: 'status', label: 'Status', visible: true, order: 4 },
  { key: 'acoes', label: 'Ações', visible: true, order: 5 },
];

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

// ====== MAIN COMPONENT ======
export function FrotaPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('resumo');
  const { settings: obraSettings } = useObraSettings();
  const { columnConfig, visibleColumns, savePreferences, resetToDefaults, saving: savingLayout } = useLayoutPreferences('frota', DEFAULT_COLUMNS);
  const [columnConfigModalOpen, setColumnConfigModalOpen] = useState(false);
  const [efetivoColumnModalOpen, setEfetivoColumnModalOpen] = useState(false);
  
  // Maintenance
  const [maintenanceCount, setMaintenanceCount] = useState(0);
  const [maintenanceOrders, setMaintenanceOrders] = useState<Array<{
    vehicle_code: string; vehicle_description: string | null; problem_description: string | null;
    status: string; entry_date: string | null; mechanic_name: string | null;
  }>>([]);
  
  const fetchMaintenance = useCallback(async () => {
    const { data: orders } = await supabase
      .from('service_orders')
      .select('vehicle_code, vehicle_description, problem_description, status, entry_date, mechanic_name')
      .in('status', ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças']);
    if (orders) {
      setMaintenanceOrders(orders);
      const osVehicleCodes = new Set(orders.map(o => o.vehicle_code));
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
    const channel = supabase.channel('frota-maintenance').on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders' }, () => fetchMaintenance()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMaintenance]);

  // Vehicle form
  const [vehicleFormOpen, setVehicleFormOpen] = useState(false);
  const [vehicleFormMode, setVehicleFormMode] = useState<'create' | 'edit'>('create');
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<{ codigo: string; descricao: string; categoria: string; empresa: string } | null>(null);
  const [kpiDetailOpen, setKpiDetailOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KpiType>('total');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [batchStatusOpen, setBatchStatusOpen] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  const EXCLUDED_DESCRIPTIONS = ['aferição comboio', 'ajuste'];

  // All vehicles parsed
  const allVehicles = useMemo(() => {
    return data.rows.filter(row => {
      const desc = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']).trim().toLowerCase();
      return !EXCLUDED_DESCRIPTIONS.includes(desc);
    }).map(row => ({
      codigo: getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
      descricao: getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
      empresa: getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
      categoria: getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
      motorista: getRowValue(row as any, ['MOTORISTA', 'Motorista', 'motorista']),
      potencia: getRowValue(row as any, ['POTENCIA', 'Potencia', 'potencia', 'POTÊNCIA']),
      obra: getRowValue(row as any, ['OBRA', 'Obra', 'obra']),
      status: (getRowValue(row as any, ['STATUS', 'Status', 'status']) || 'ativo').toLowerCase(),
      marcaModelo: getRowValue(row as any, ['MARCA', 'Marca', 'marca', 'MODELO', 'Modelo', 'modelo']),
      proprietario: getRowValue(row as any, ['PROPRIETARIO', 'Proprietario', 'proprietario', 'PROPRIETÁRIO']),
    }));
  }, [data.rows]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return allVehicles.filter(v => {
      const matchesSearch = !search || [v.codigo, v.descricao, v.empresa, v.categoria, v.motorista, v.proprietario]
        .some(f => f.toLowerCase().includes(search.toLowerCase()));
      const matchesEmpresa = empresaFilter === 'all' || v.empresa === empresaFilter;
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      const matchesTipo = tipoFilter === 'all' || v.descricao === tipoFilter;
      return matchesSearch && matchesEmpresa && matchesStatus && matchesTipo;
    });
  }, [allVehicles, search, empresaFilter, statusFilter, tipoFilter]);

  // Unique lists for filters
  const empresas = useMemo(() => [...new Set(allVehicles.map(v => v.empresa).filter(Boolean))].sort(), [allVehicles]);
  const descricoes = useMemo(() => [...new Set(allVehicles.map(v => v.descricao).filter(Boolean))].sort(), [allVehicles]);

  // Metrics
  const metrics = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const byEmpresa: Record<string, number> = {};
    const byDescricao: Record<string, number> = {};
    const mobilizadosByEmpresa: Record<string, number> = {};
    const desmobilizadosByEmpresa: Record<string, number> = {};
    let mobilizados = 0, desmobilizados = 0, aMobilizar = 0;
    
    filteredVehicles.forEach(v => {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
      if (v.empresa) byEmpresa[v.empresa] = (byEmpresa[v.empresa] || 0) + 1;
      if (v.descricao) byDescricao[v.descricao] = (byDescricao[v.descricao] || 0) + 1;
      
      if (v.status === 'mobilizado' || v.status === 'ativo') {
        mobilizados++;
        if (v.empresa) mobilizadosByEmpresa[v.empresa] = (mobilizadosByEmpresa[v.empresa] || 0) + 1;
      } else if (v.status === 'desmobilizado' || v.status === 'inativo') {
        desmobilizados++;
        if (v.empresa) desmobilizadosByEmpresa[v.empresa] = (desmobilizadosByEmpresa[v.empresa] || 0) + 1;
      } else if (v.status === 'a mobilizar') {
        aMobilizar++;
      }
    });

    return { total: filteredVehicles.length, mobilizados, desmobilizados, aMobilizar, byStatus, byEmpresa, byDescricao, mobilizadosByEmpresa, desmobilizadosByEmpresa };
  }, [filteredVehicles]);

  // Veículos Leves
  const veiculosLeves = useMemo(() => {
    return filteredVehicles.filter(v => {
      const desc = v.descricao.toLowerCase();
      return desc.includes('veículo leve') || desc.includes('veiculo leve') || desc.includes('veíc. leve');
    });
  }, [filteredVehicles]);

  // Quick status change
  const handleQuickStatusChange = async (codigo: string, newStatus: string) => {
    setChangingStatus(codigo);
    try {
      const { data: sheetData, error: fetchError } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Veiculo', noCache: true },
      });
      if (fetchError) throw fetchError;

      const rows = sheetData?.rows || [];
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s/g, '');
      const targetCode = normalize(codigo);
      const matchedRow = rows.find((r: any) => {
        const code = normalize(String(r.CODIGO || r['CÓDIGO'] || r['Codigo'] || ''));
        return code === targetCode;
      });

      if (!matchedRow?._rowIndex) throw new Error('Veículo não encontrado na planilha');

      const updatedRow: Record<string, any> = { ...matchedRow };
      delete updatedRow._rowIndex;
      // Set status in the row
      const statusKey = Object.keys(updatedRow).find(k => k.toLowerCase() === 'status');
      if (statusKey) updatedRow[statusKey] = newStatus;
      else updatedRow['STATUS'] = newStatus;

      const { error } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'update', sheetName: 'Veiculo', rowIndex: matchedRow._rowIndex, rowData: updatedRow },
      });
      if (error) throw error;

      // Also update Supabase vehicles table
      await supabase.from('vehicles').update({ status: newStatus }).eq('code', codigo);

      toast.success(`${codigo} → ${getAllStatusLabels()[newStatus]?.label || newStatus}`);
      refetch();
    } catch (error) {
      console.error('Error changing status:', error);
      toast.error('Erro ao alterar status');
    } finally {
      setChangingStatus(null);
    }
  };

  const openVehicleHistory = (vehicle: { codigo: string; descricao: string; categoria: string; empresa: string }) => {
    setSelectedVehicle(vehicle);
    setHistoryModalOpen(true);
  };
  const openCreateVehicle = () => { setVehicleFormMode('create'); setEditingVehicle(null); setVehicleFormOpen(true); };
  const openEditVehicle = (vehicle: any) => { setVehicleFormMode('edit'); setEditingVehicle(vehicle); setVehicleFormOpen(true); };
  const openDeleteConfirm = (codigo: string) => { setVehicleToDelete(codigo); setDeleteDialogOpen(true); };

  const handleDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    setDeleting(true);
    try {
      const { data: sheetData, error: fetchError } = await supabase.functions.invoke('google-sheets', { body: { action: 'getData', sheetName: 'Veiculo', noCache: true } });
      if (fetchError) throw fetchError;
      const rows = sheetData?.rows || [];
      const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s/g, '');
      const targetCode = normalize(vehicleToDelete);
      const matchedRow = rows.find((r: any) => normalize(String(r.CODIGO || r['CÓDIGO'] || r['Codigo'] || '')) === targetCode);
      if (!matchedRow?._rowIndex) throw new Error('Veículo não encontrado na planilha');
      const { error } = await supabase.functions.invoke('google-sheets', { body: { action: 'delete', sheetName: 'Veiculo', rowIndex: matchedRow._rowIndex } });
      if (error) throw error;
      await supabase.from('vehicles').delete().eq('code', vehicleToDelete);
      toast.success('Veículo excluído com sucesso!');
      refetch();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      toast.error('Erro ao excluir veículo');
    } finally { setDeleting(false); setDeleteDialogOpen(false); setVehicleToDelete(null); }
  };

  const handleKpiClick = (kpi: KpiType) => { setSelectedKpi(kpi); setKpiDetailOpen(true); };

  const toggleSelectVehicle = (code: string) => {
    setSelectedCodes(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  };

  // Export PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('FROTA GERAL DA OBRA', 14, 16);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 35);
    doc.text(`Total: ${metrics.total} | Mobilizados: ${metrics.mobilizados} | Desmobilizados: ${metrics.desmobilizados}`, 14, 42);

    const tableData = filteredVehicles.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(v => [
      v.codigo, v.descricao, v.empresa, v.categoria, getAllStatusLabels()[v.status]?.label || v.status
    ]);

    autoTable(doc, {
      head: [['Código', 'Descrição', 'Empresa', 'Categoria', 'Status']],
      body: tableData,
      startY: 48,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    doc.save(`frota_geral_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // ====== UI ======
  const statusBadge = (status: string) => {
    const allStatuses = getAllStatusLabels();
    const info = allStatuses[status] || allStatuses['ativo'];
    return <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border", info.color)}>{info.shortLabel || info.label}</span>;
  };

  const mobDesmobBtn = (vehicle: { codigo: string; status: string }) => {
    const isMob = vehicle.status === 'mobilizado' || vehicle.status === 'ativo';
    const isChanging = changingStatus === vehicle.codigo;
    return (
      <Button
        size="sm"
        variant={isMob ? "destructive" : "default"}
        className={cn("text-[10px] h-7 gap-1 font-bold", isMob ? "" : "bg-emerald-600 hover:bg-emerald-700")}
        disabled={isChanging}
        onClick={(e) => { e.stopPropagation(); handleQuickStatusChange(vehicle.codigo, isMob ? 'desmobilizado' : 'mobilizado'); }}
      >
        <ArrowUpDown className="w-3 h-3" />
        {isChanging ? '...' : isMob ? 'Desmob.' : 'Mobilizar'}
      </Button>
    );
  };

  // ====== RESUMO TAB ======
  const sortedByDescricao = useMemo(() => {
    return Object.entries(metrics.byDescricao).sort((a, b) => b[1] - a[1]);
  }, [metrics.byDescricao]);

  const sortedByStatus = useMemo(() => {
    return Object.entries(metrics.byStatus).sort((a, b) => b[1] - a[1]);
  }, [metrics.byStatus]);

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-5">
        {/* ====== HEADER ====== */}
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-xl p-4 md:p-5 shadow-lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/20 rounded-lg">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Frota Geral da Obra</h1>
                <p className="text-sm text-white/70">Visão operacional da frota mobilizada</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setColumnConfigModalOpen(true)}>
                <Settings2 className="w-4 h-4" />
                Layout PDF
              </Button>
              <Button size="sm" className="gap-2 bg-red-500 hover:bg-red-600 text-white" onClick={exportToPDF}>
                <FileText className="w-4 h-4" />
                Exportar PDF
              </Button>
            </div>
          </div>
        </div>

        {/* ====== KPI CARDS ====== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Total */}
          <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleKpiClick('total')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Truck className="w-4 h-4" />
                <span className="text-xs font-medium">Total</span>
              </div>
              <p className="text-3xl font-black text-foreground">{metrics.total}</p>
            </CardContent>
          </Card>

          {/* Mobilizados */}
          <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleKpiClick('mobilizados')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-muted-foreground">Mobilizados</span>
              </div>
              <p className="text-3xl font-black text-emerald-600">{metrics.mobilizados}</p>
              <div className="mt-2 space-y-0.5 max-h-20 overflow-hidden">
                {Object.entries(metrics.mobilizadosByEmpresa).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([emp, count]) => (
                  <div key={emp} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground truncate mr-2">{emp.toUpperCase()}</span>
                    <span className="font-bold text-emerald-600">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Desmobilizados */}
          <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleKpiClick('desmobilizados')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-muted-foreground">Desmobilizados</span>
              </div>
              <p className="text-3xl font-black text-red-500">{metrics.desmobilizados}</p>
              <div className="mt-2 space-y-0.5 max-h-20 overflow-hidden">
                {Object.entries(metrics.desmobilizadosByEmpresa).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([emp, count]) => (
                  <div key={emp} className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground truncate mr-2">{emp.toUpperCase()}</span>
                    <span className="font-bold text-red-500">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* A Mobilizar */}
          <Card className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleKpiClick('ativos')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-medium text-muted-foreground">A Mobilizar</span>
              </div>
              <p className="text-3xl font-black text-blue-500">{metrics.aMobilizar}</p>
            </CardContent>
          </Card>
        </div>

        {/* ====== FILTERS ====== */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar código, empresa, equipamento..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Todos os Status" /></SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Todos os Status</SelectItem>
              {Object.entries(getAllStatusLabels()).map(([key, val]: [string, any]) => (
                <SelectItem key={key} value={key}>{val.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Todas as Empresas" /></SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Todas as Empresas</SelectItem>
              {empresas.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Todos os Tipos" /></SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {descricoes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || statusFilter !== 'all' || empresaFilter !== 'all' || tipoFilter !== 'all') && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setEmpresaFilter('all'); setTipoFilter('all'); }}>
              <X className="w-4 h-4 mr-1" /> Limpar
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={openCreateVehicle} size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" /><span className="hidden sm:inline">Novo</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* ====== TABS ====== */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50 border">
            <TabsTrigger value="resumo" className="gap-1.5 text-xs sm:text-sm">
              <BarChart3 className="w-3.5 h-3.5" /> Resumo
            </TabsTrigger>
            <TabsTrigger value="veiculos-leves" className="gap-1.5 text-xs sm:text-sm">
              <Truck className="w-3.5 h-3.5" /> Veículos Leves
            </TabsTrigger>
            <TabsTrigger value="desmobilizados" className="gap-1.5 text-xs sm:text-sm">
              <AlertTriangle className="w-3.5 h-3.5" /> Desmobilizados
            </TabsTrigger>
            <TabsTrigger value="por-empresa" className="gap-1.5 text-xs sm:text-sm">
              <Building2 className="w-3.5 h-3.5" /> Por Empresa
            </TabsTrigger>
            <TabsTrigger value="listagem" className="gap-1.5 text-xs sm:text-sm">
              <List className="w-3.5 h-3.5" /> Listagem
            </TabsTrigger>
          </TabsList>

          {/* ====== RESUMO ====== */}
          <TabsContent value="resumo" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Por Status */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold mb-3">Por Status</h3>
                  <div className="space-y-3">
                    {sortedByStatus.map(([status, count]) => {
                      const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
                      const info = getAllStatusLabels()[status];
                      return (
                        <div key={status} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium uppercase">{info?.label || status}</span>
                            <span className="text-muted-foreground">{count} ({pct}%)</span>
                          </div>
                          <Progress value={pct} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Por Tipo de Equipamento */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-bold mb-3">Por Tipo de Equipamento</h3>
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {sortedByDescricao.map(([desc, count]) => (
                      <button
                        key={desc}
                        className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm"
                        onClick={() => { setTipoFilter(desc); setActiveTab('listagem'); }}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{desc}</span>
                        </div>
                        <Badge variant="secondary" className="rounded-full text-xs font-bold">{count}</Badge>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Veículos Leves */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck className="w-4 h-4" />
                    <h3 className="font-bold">Veículos Leves</h3>
                    <Badge variant="secondary" className="rounded-full">{veiculosLeves.length}</Badge>
                  </div>
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {veiculosLeves.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(v => (
                      <button
                        key={v.codigo}
                        className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors text-sm"
                        onClick={() => openVehicleHistory(v)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-xs">{v.codigo}</span>
                          <span className="text-muted-foreground truncate">{v.motorista || v.proprietario || v.empresa}</span>
                        </div>
                        {statusBadge(v.status)}
                      </button>
                    ))}
                    {veiculosLeves.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum veículo leve encontrado</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ====== VEÍCULOS LEVES ====== */}
          <TabsContent value="veiculos-leves" className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Leves</p>
                <p className="text-2xl font-black">{veiculosLeves.length}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Mobilizados</p>
                <p className="text-2xl font-black text-emerald-600">{veiculosLeves.filter(v => v.status === 'mobilizado' || v.status === 'ativo').length}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Desmobilizados</p>
                <p className="text-2xl font-black text-red-500">{veiculosLeves.filter(v => v.status === 'desmobilizado' || v.status === 'inativo').length}</p>
              </CardContent></Card>
            </div>

            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Código</TableHead>
                      <TableHead>Proprietário</TableHead>
                      <TableHead>Marca/Modelo</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {veiculosLeves.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(v => (
                      <TableRow key={v.codigo} className="hover:bg-muted/30 cursor-pointer" onClick={() => openVehicleHistory(v)}>
                        <TableCell className="font-mono font-bold">{v.codigo}</TableCell>
                        <TableCell>{v.proprietario || v.empresa}</TableCell>
                        <TableCell>{v.marcaModelo || v.descricao}</TableCell>
                        <TableCell>{v.motorista || '-'}</TableCell>
                        <TableCell>{statusBadge(v.status)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {mobDesmobBtn(v)}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditVehicle(v); }}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(v.codigo); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {veiculosLeves.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum veículo leve</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* ====== DESMOBILIZADOS ====== */}
          <TabsContent value="desmobilizados" className="mt-4 space-y-4">
            {(() => {
              const desmob = filteredVehicles.filter(v => v.status === 'desmobilizado' || v.status === 'inativo');
              return (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Card><CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Total Desmobilizados</p>
                      <p className="text-2xl font-black text-red-500">{desmob.length}</p>
                    </CardContent></Card>
                    <Card><CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Empresas</p>
                      <p className="text-2xl font-black">{new Set(desmob.map(v => v.empresa)).size}</p>
                    </CardContent></Card>
                  </div>
                  <Card>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Ação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {desmob.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(v => (
                            <TableRow key={v.codigo} className="hover:bg-muted/30 cursor-pointer" onClick={() => openVehicleHistory(v)}>
                              <TableCell className="font-mono font-bold">{v.codigo}</TableCell>
                              <TableCell>{v.descricao}</TableCell>
                              <TableCell>{v.empresa}</TableCell>
                              <TableCell>{statusBadge(v.status)}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button size="sm" className="text-[10px] h-7 gap-1 font-bold bg-emerald-600 hover:bg-emerald-700" disabled={changingStatus === v.codigo}
                                    onClick={(e) => { e.stopPropagation(); handleQuickStatusChange(v.codigo, 'mobilizado'); }}>
                                    <ArrowUpDown className="w-3 h-3" />{changingStatus === v.codigo ? '...' : 'Mobilizar'}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditVehicle(v); }}>
                                    <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                          {desmob.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum desmobilizado</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          {/* ====== POR EMPRESA ====== */}
          <TabsContent value="por-empresa" className="mt-4 space-y-4">
            {Object.entries(metrics.byEmpresa).sort((a, b) => b[1] - a[1]).map(([empresa, count]) => {
              const empVehicles = filteredVehicles.filter(v => v.empresa === empresa);
              const empMob = empVehicles.filter(v => v.status === 'mobilizado' || v.status === 'ativo').length;
              const empDesmob = empVehicles.filter(v => v.status === 'desmobilizado' || v.status === 'inativo').length;
              // Group by descricao
              const byDesc: Record<string, typeof empVehicles> = {};
              empVehicles.forEach(v => { if (!byDesc[v.descricao]) byDesc[v.descricao] = []; byDesc[v.descricao].push(v); });

              return (
                <Card key={empresa}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <h3 className="font-bold text-lg">{empresa}</h3>
                        <Badge variant="secondary" className="rounded-full">{count}</Badge>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <span className="text-emerald-600 font-bold">MOB: {empMob}</span>
                        <span className="text-red-500 font-bold">DESMOB: {empDesmob}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {Object.entries(byDesc).sort((a, b) => b[1].length - a[1].length).map(([desc, vehicles]) => (
                        <div key={desc} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm">{desc}</span>
                            <Badge variant="outline" className="rounded-full text-xs">{vehicles.length}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {vehicles.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(v => (
                              <button key={v.codigo} className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50 hover:bg-muted text-xs transition-colors"
                                onClick={() => openVehicleHistory(v)}>
                                <span className="font-mono font-bold">{v.codigo}</span>
                                {statusBadge(v.status)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ====== LISTAGEM ====== */}
          <TabsContent value="listagem" className="mt-4 space-y-3">
            {/* Batch actions */}
            {selectedCodes.size > 0 && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <span className="text-sm font-medium">{selectedCodes.size} selecionado(s)</span>
                <Button size="sm" variant="outline" onClick={() => setBatchStatusOpen(true)} className="gap-1">
                  <RefreshCw className="w-3.5 h-3.5" /> Alterar Status
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedCodes(new Set())}>Limpar</Button>
              </div>
            )}

            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filteredVehicles.length > 0 && selectedCodes.size === filteredVehicles.length}
                          onCheckedChange={() => {
                            if (selectedCodes.size === filteredVehicles.length) setSelectedCodes(new Set());
                            else setSelectedCodes(new Set(filteredVehicles.map(v => v.codigo)));
                          }}
                        />
                      </TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12"><RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredVehicles.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Nenhum veículo encontrado</TableCell></TableRow>
                    ) : filteredVehicles.sort((a, b) => a.codigo.localeCompare(b.codigo)).map(v => (
                      <TableRow key={v.codigo} className={cn("hover:bg-muted/30 cursor-pointer", selectedCodes.has(v.codigo) && "bg-primary/5")}
                        onClick={() => openVehicleHistory(v)}>
                        <TableCell className="w-10" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selectedCodes.has(v.codigo)} onCheckedChange={() => toggleSelectVehicle(v.codigo)} />
                        </TableCell>
                        <TableCell className="font-mono font-bold">{v.codigo}</TableCell>
                        <TableCell>{v.descricao}</TableCell>
                        <TableCell>{v.empresa}</TableCell>
                        <TableCell>{v.categoria}</TableCell>
                        <TableCell>{statusBadge(v.status)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {mobDesmobBtn(v)}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditVehicle(v); }}>
                              <Edit className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={(e) => { e.stopPropagation(); openDeleteConfirm(v.codigo); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
            <p className="text-sm text-muted-foreground">
              Exibindo <span className="font-semibold text-foreground">{filteredVehicles.length}</span> de {allVehicles.length} veículos
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* ====== MODALS ====== */}
      <VehicleHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        vehicleCode={selectedVehicle?.codigo || ''}
        vehicleDescription={selectedVehicle?.descricao || ''}
        vehicleCategory={selectedVehicle?.categoria || ''}
        vehicleEmpresa={selectedVehicle?.empresa || ''}
      />

      <VehicleFormModal
        open={vehicleFormOpen}
        onClose={() => setVehicleFormOpen(false)}
        mode={vehicleFormMode}
        vehicle={editingVehicle}
        onSuccess={() => { setVehicleFormOpen(false); refetch(); }}
        empresas={empresas}
        categorias={descricoes}
      />

      <FrotaKpiDetailModal
        open={kpiDetailOpen}
        onClose={() => setKpiDetailOpen(false)}
        kpiType={selectedKpi}
        vehicles={allVehicles}
        maintenanceOrders={maintenanceOrders}
        onVehicleClick={(v) => { setKpiDetailOpen(false); openVehicleHistory(v); }}
      />

      <BatchStatusModal
        open={batchStatusOpen}
        onClose={() => setBatchStatusOpen(false)}
        onSuccess={() => { setBatchStatusOpen(false); setSelectedCodes(new Set()); refetch(); }}
        selectedVehicles={Array.from(selectedCodes)}
      />

      <ColumnConfigModal
        open={columnConfigModalOpen}
        onClose={() => setColumnConfigModalOpen(false)}
        columns={columnConfig}
        onSave={savePreferences}
        onReset={resetToDefaults}
        saving={savingLayout}
        moduleName="frota"
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja excluir o veículo <strong>{vehicleToDelete}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVehicle} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
