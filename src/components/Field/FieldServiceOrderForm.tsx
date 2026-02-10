import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Save,
  Truck,
  User,
  Gauge,
  Loader2,
  AlertCircle,
  ChevronsUpDown,
  Check,
  CalendarIcon,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  ArrowLeft,
  Plus,
  List,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyInput } from '@/components/ui/currency-input';
import { OSPhotoUpload } from '@/components/Maintenance/OSPhotoUpload';
import { supabase } from '@/integrations/supabase/client';
import { createRow, getSheetData } from '@/lib/googleSheets';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface Vehicle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  company: string | null;
}

interface Mechanic {
  id: string;
  name: string;
}

interface FieldServiceOrderFormProps {
  user: FieldUser;
  onBack: () => void;
}

const ORDEM_SERVICO_SHEET = 'Ordem_Servico';

const STATUS_OPTIONS = [
  { value: 'Aberta', icon: '📋' },
  { value: 'Em Andamento', icon: '🔧' },
  { value: 'Aguardando Peças', icon: '📦' },
  { value: 'Finalizada', icon: '✅' },
];

const TYPE_OPTIONS = ['Corretiva', 'Preventiva', 'Preditiva'];
const PRIORITY_OPTIONS = ['Baixa', 'Média', 'Alta', 'Urgente'];

export function FieldServiceOrderForm({ user, onBack }: FieldServiceOrderFormProps) {
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const isDark = theme === 'dark';

  // Sub-view navigation
  const [subView, setSubView] = useState<'menu' | 'form' | 'records'>('menu');

  // Data
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Vehicle selection
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Records state
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  // Form state
  const [form, setForm] = useState({
    vehicle_code: '',
    vehicle_description: '',
    vehicle_company: '',
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
    horimeter_current: null as number | null,
    km_current: null as number | null,
    entry_date: new Date().toISOString().split('T')[0],
    entry_time: format(new Date(), 'HH:mm'),
    exit_date: '',
    exit_time: '',
    interval_days: '90',
    photo_before_url: null as string | null,
    photo_after_url: null as string | null,
    photo_parts_url: null as string | null,
    photo_4_url: null as string | null,
    photo_5_url: null as string | null,
    created_by: user.name,
  });

  // Previous readings
  const [lastHorimeter, setLastHorimeter] = useState<number | null>(null);
  const [lastKm, setLastKm] = useState<number | null>(null);

  // Fetch vehicles and mechanics
  useEffect(() => {
    const fetchData = async () => {
      setVehiclesLoading(true);
      const [vehiclesRes, mechanicsRes] = await Promise.all([
        supabase.from('vehicles').select('id, code, name, description, category, company').order('code'),
        supabase.from('mechanics').select('id, name').eq('active', true).order('name'),
      ]);
      if (vehiclesRes.data) setVehicles(vehiclesRes.data);
      if (mechanicsRes.data) setMechanics(mechanicsRes.data);
      setVehiclesLoading(false);
    };
    fetchData();
  }, []);

  // Fetch records for history view
  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Erro ao buscar OS:', err);
      toast.error('Erro ao carregar registros');
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subView === 'records') {
      fetchRecords();
    }
  }, [subView, fetchRecords]);

  const selectedVehicle = useMemo(() => vehicles.find(v => v.code === form.vehicle_code), [vehicles, form.vehicle_code]);

  // Fetch latest horimeter/KM and Motorista when vehicle changes
  useEffect(() => {
    if (!form.vehicle_code) {
      setLastHorimeter(null);
      setLastKm(null);
      return;
    }

    const fetchLatest = async () => {
      // Fetch Motorista from Veiculo sheet
      try {
        const veiculoSheet = await getSheetData('Veiculo', { noCache: false });
        const normalizeCode = (v: any) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
        const targetCode = normalizeCode(form.vehicle_code);
        const veiculoRow = (veiculoSheet.rows || []).find(row => {
          const code = normalizeCode(row['Codigo'] || row['CODIGO'] || row['Código'] || '');
          return code === targetCode;
        });
        if (veiculoRow) {
          const motorista = String(veiculoRow['Motorista'] || veiculoRow['MOTORISTA'] || '').trim();
          if (motorista) {
            setForm(prev => ({ ...prev, created_by: motorista }));
          }
        }
      } catch (e) { console.error('Error fetching Veiculo sheet for Motorista:', e); }

      const [osRes, fuelRes, horRes] = await Promise.all([
        supabase.from('service_orders')
          .select('horimeter_current, km_current, entry_date')
          .eq('vehicle_code', form.vehicle_code)
          .not('horimeter_current', 'is', null)
          .order('entry_date', { ascending: false })
          .limit(1),
        supabase.from('field_fuel_records')
          .select('horimeter_current, km_current, record_date')
          .eq('vehicle_code', form.vehicle_code)
          .order('record_date', { ascending: false })
          .limit(1),
        supabase.from('vehicles')
          .select('id')
          .eq('code', form.vehicle_code)
          .single(),
      ]);

      let latestHor: number | null = null;
      let latestKm: number | null = null;

      if (osRes.data?.[0]) {
        latestHor = osRes.data[0].horimeter_current;
        latestKm = osRes.data[0].km_current;
      }

      if (fuelRes.data?.[0]) {
        if (fuelRes.data[0].horimeter_current && (!latestHor || fuelRes.data[0].horimeter_current > latestHor)) {
          latestHor = fuelRes.data[0].horimeter_current;
        }
        if (fuelRes.data[0].km_current && (!latestKm || fuelRes.data[0].km_current > latestKm)) {
          latestKm = fuelRes.data[0].km_current;
        }
      }

      if (horRes.data?.id) {
        const { data: readings } = await supabase
          .from('horimeter_readings')
          .select('current_value, current_km')
          .eq('vehicle_id', horRes.data.id)
          .order('reading_date', { ascending: false })
          .limit(1);
        if (readings?.[0]) {
          if (readings[0].current_value && (!latestHor || readings[0].current_value > latestHor)) {
            latestHor = readings[0].current_value;
          }
          if (readings[0].current_km && (!latestKm || readings[0].current_km > latestKm)) {
            latestKm = readings[0].current_km;
          }
        }
      }

      setLastHorimeter(latestHor);
      setLastKm(latestKm);
    };
    fetchLatest();
  }, [form.vehicle_code]);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return vehicles;
    const s = vehicleSearch.toLowerCase();
    return vehicles
      .filter(v => v.code.toLowerCase().includes(s) || v.name.toLowerCase().includes(s) || (v.description || '').toLowerCase().includes(s))
      .sort((a, b) => {
        const aS = a.code.toLowerCase().startsWith(s) ? -1 : 0;
        const bS = b.code.toLowerCase().startsWith(s) ? -1 : 0;
        return aS - bS;
      });
  }, [vehicles, vehicleSearch]);

  // Generate order number
  const generateOrderNumber = useCallback(async () => {
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('service_orders')
      .select('order_number')
      .like('order_number', `OS-${year}-%`)
      .order('order_number', { ascending: false })
      .limit(1);

    let next = 1;
    if (data?.[0]) {
      const match = data[0].order_number.match(/OS-\d{4}-(\d+)/);
      if (match) next = parseInt(match[1], 10) + 1;
    }
    return `OS-${year}-${String(next).padStart(5, '0')}`;
  }, []);

  // Sync to Google Sheets
  const syncToSheet = async (orderData: any) => {
    try {
      const formatDateForSheet = (dateStr: string | null | undefined): string => {
        if (!dateStr) return '';
        try {
          // Handle both ISO and YYYY-MM-DD formats
          const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
          if (isNaN(date.getTime())) return dateStr;
          return format(date, 'dd/MM/yyyy');
        } catch {
          return dateStr || '';
        }
      };

      const formatTimeForSheet = (timeStr: string | null | undefined, dateStr: string | null | undefined): string => {
        if (timeStr) return timeStr.length >= 5 ? timeStr.substring(0, 5) : timeStr;
        if (dateStr) {
          try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            return format(date, 'HH:mm');
          } catch {
            return '';
          }
        }
        return '';
      };

      const isFinalized = orderData.status === 'Finalizada';

      // Calculate downtime (Horas_Parado)
      let horasParado = '';
      if (orderData.entry_date && orderData.entry_time) {
        const endRef = isFinalized && orderData.end_date ? new Date(orderData.end_date) : new Date();
        try {
          const entryDateStr = orderData.entry_date.includes('T') ? orderData.entry_date.split('T')[0] : orderData.entry_date;
          const entryDateTime = new Date(`${entryDateStr}T${orderData.entry_time}`);
          if (!isNaN(entryDateTime.getTime()) && !isNaN(endRef.getTime())) {
            const diffMs = endRef.getTime() - entryDateTime.getTime();
            if (diffMs > 0) {
              const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;
              horasParado = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
            }
          }
        } catch { /* ignore */ }
      }

      const rowData: Record<string, string> = {
        'Data': formatDateForSheet(orderData.entry_date || orderData.order_date),
        'Veiculo': orderData.vehicle_code || '',
        'Empresa': orderData.vehicle_company || form.vehicle_company || '',
        'Motorista': orderData.created_by || '',
        'Potencia': orderData.vehicle_description || '',
        'Problema': orderData.problem_description || '',
        'Servico': orderData.solution_description || '',
        'Mecanico': orderData.mechanic_name || '',
        'Data_Entrada': formatDateForSheet(orderData.entry_date),
        'Data_Saida': isFinalized ? formatDateForSheet(orderData.end_date || new Date().toISOString()) : '',
        'Hora_Entrada': formatTimeForSheet(orderData.entry_time, null),
        'Hora_Saida': isFinalized ? formatTimeForSheet(null, orderData.end_date) : '',
        'Horas_Parado': isFinalized ? horasParado : '',
        'Observacao': orderData.notes || '',
        'Status': orderData.status || '',
      };

      console.log('Syncing OS to sheet with data:', JSON.stringify(rowData));
      await createRow(ORDEM_SERVICO_SHEET, rowData);
      console.log('OS synced to sheet successfully:', orderData.order_number);
    } catch (err) {
      console.error('Erro ao sincronizar OS com planilha:', err);
      toast.error('OS salva no banco, mas falhou ao sincronizar com a planilha. Verifique se a aba "Ordem_Servico" existe.');
      throw err; // Re-throw so we know it failed
    }
  };

  const handleSave = async () => {
    if (!form.vehicle_code) {
      toast.error('Selecione um veículo');
      return;
    }
    if (!form.problem_description.trim()) {
      toast.error('Descreva o problema');
      return;
    }

    // Validate exit > entry if finalizing
    if (form.exit_date && form.entry_date) {
      const entry = new Date(`${form.entry_date}T${form.entry_time || '00:00'}`);
      const exit = new Date(`${form.exit_date}T${form.exit_time || '00:00'}`);
      if (exit <= entry) {
        toast.error('Data/Hora de Saída deve ser posterior à Entrada');
        return;
      }
    }

    setIsSaving(true);
    try {
      const orderNumber = await generateOrderNumber();
      const mechanic = mechanics.find(m => m.id === form.mechanic_id);
      const partsCost = parseFloat(form.parts_cost) || 0;
      const laborCost = parseFloat(form.labor_cost) || 0;

      let endDateValue: string | null = null;
      if (form.exit_date) {
        endDateValue = new Date(`${form.exit_date}T${form.exit_time || '00:00'}`).toISOString();
      } else if (form.status === 'Finalizada') {
        endDateValue = new Date().toISOString();
      }

      const orderData = {
        order_number: orderNumber,
        order_date: form.entry_date || new Date().toISOString().split('T')[0],
        vehicle_code: form.vehicle_code,
        vehicle_description: form.vehicle_description || null,
        order_type: form.order_type,
        priority: form.priority,
        status: form.status,
        problem_description: form.problem_description,
        solution_description: form.solution_description || null,
        mechanic_id: form.mechanic_id || null,
        mechanic_name: mechanic?.name || form.mechanic_name || null,
        estimated_hours: parseFloat(form.estimated_hours) || null,
        actual_hours: parseFloat(form.actual_hours) || null,
        parts_used: form.parts_used || null,
        parts_cost: partsCost || null,
        labor_cost: laborCost || null,
        total_cost: (partsCost + laborCost) || null,
        notes: form.notes || null,
        created_by: form.created_by || null,
        start_date: form.status === 'Em Andamento' ? new Date().toISOString() : null,
        end_date: endDateValue,
        horimeter_current: form.horimeter_current || null,
        km_current: form.km_current || null,
        entry_date: form.entry_date || null,
        entry_time: form.entry_time || null,
        interval_days: form.order_type === 'Preventiva' ? (parseInt(form.interval_days) || 90) : null,
        photo_before_url: form.photo_before_url || null,
        photo_after_url: form.photo_after_url || null,
        photo_parts_url: form.photo_parts_url || null,
        photo_4_url: form.photo_4_url || null,
        photo_5_url: form.photo_5_url || null,
      };

      const { error } = await supabase.from('service_orders').insert(orderData);
      if (error) throw error;

      // Sync to sheet - don't let sheet failure block success
      try {
        await syncToSheet({ ...orderData, vehicle_company: form.vehicle_company });
      } catch {
        // Error already toasted in syncToSheet
      }

      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      toast.success(`${orderNumber} criada com sucesso!`);

      // Reset form
      setForm(prev => ({
        ...prev,
        vehicle_code: '',
        vehicle_description: '',
        vehicle_company: '',
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
        horimeter_current: null,
        km_current: null,
        status: 'Aberta',
        order_type: 'Corretiva',
        priority: 'Média',
        entry_date: new Date().toISOString().split('T')[0],
        entry_time: format(new Date(), 'HH:mm'),
        exit_date: '',
        exit_time: '',
        photo_before_url: null,
        photo_after_url: null,
        photo_parts_url: null,
        photo_4_url: null,
        photo_5_url: null,
      }));
      setLastHorimeter(null);
      setLastKm(null);
    } catch (err: any) {
      console.error('Erro ao criar OS:', err);
      toast.error(err.message || 'Erro ao criar ordem de serviço');
    } finally {
      setIsSaving(false);
    }
  };

  const sectionClass = cn(
    "rounded-xl p-4 space-y-3 shadow-md",
    isDark ? "bg-slate-800/80 border border-slate-700" : "bg-white border border-slate-200"
  );

  const inputClass = cn("h-12 text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "");

  // Group records by date
  const groupedRecords = useMemo(() => {
    const groups: Record<string, any[]> = {};
    records.forEach(r => {
      const date = r.entry_date || r.order_date || 'Sem data';
      if (!groups[date]) groups[date] = [];
      groups[date].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [records]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Finalizada': return 'text-emerald-400';
      case 'Em Andamento': return 'text-amber-400';
      case 'Aguardando Peças': return 'text-orange-400';
      default: return 'text-blue-400';
    }
  };

  // ============ MENU VIEW ============
  if (subView === 'menu') {
    return (
      <div className={cn("p-4 space-y-4", isDark ? "text-white" : "text-slate-900")}>
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Ordem de Serviço</h2>
            <p className="text-sm text-muted-foreground">Selecione uma opção</p>
          </div>
        </div>

        <button
          onClick={() => setSubView('form')}
          className={cn(
            "w-full rounded-xl p-6 flex items-center gap-4 shadow-lg transition-transform active:scale-[0.98]",
            isDark
              ? "bg-gradient-to-br from-emerald-600 to-emerald-800 text-white"
              : "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white"
          )}
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <Plus className="w-7 h-7" />
          </div>
          <div className="text-left">
            <p className="text-lg font-bold">Nova OS</p>
            <p className="text-sm opacity-80">Criar nova Ordem de Serviço</p>
          </div>
        </button>

        <button
          onClick={() => setSubView('records')}
          className={cn(
            "w-full rounded-xl p-6 flex items-center gap-4 shadow-lg transition-transform active:scale-[0.98]",
            isDark
              ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white"
              : "bg-gradient-to-br from-blue-500 to-blue-700 text-white"
          )}
        >
          <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
            <List className="w-7 h-7" />
          </div>
          <div className="text-left">
            <p className="text-lg font-bold">Consultar OS</p>
            <p className="text-sm opacity-80">Histórico de Ordens de Serviço</p>
          </div>
        </button>
      </div>
    );
  }

  // ============ RECORDS VIEW ============
  if (subView === 'records') {
    return (
      <div className={cn("p-4 space-y-4 pb-24", isDark ? "text-white" : "text-slate-900")}>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => setSubView('menu')} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">Registros de OS</h2>
            <p className="text-sm text-muted-foreground">{records.length} registros encontrados</p>
          </div>
        </div>

        {recordsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Nenhuma OS encontrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groupedRecords.map(([date, items]) => {
              const isExpanded = expandedDates.has(date);
              let displayDate = date;
              try {
                const d = new Date(`${date}T12:00:00`);
                if (!isNaN(d.getTime())) displayDate = format(d, 'dd/MM/yyyy (EEEE)', { locale: ptBR });
              } catch {}

              return (
                <div key={date}>
                  <button
                    onClick={() => toggleDate(date)}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg font-medium",
                      isDark ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-blue-500" />
                      {displayDate}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{items.length} OS</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 mt-2 ml-2">
                      {items.map(item => (
                        <div
                          key={item.id}
                          className={cn(
                            "rounded-lg p-3 border",
                            isDark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-200"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-sm">{item.order_number}</span>
                            <span className={cn("text-xs font-medium", getStatusColor(item.status))}>
                              {item.status}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-blue-500">{item.vehicle_code}</div>
                          {item.vehicle_description && (
                            <div className="text-xs text-muted-foreground">{item.vehicle_description}</div>
                          )}
                          {item.problem_description && (
                            <div className="text-xs mt-1 text-muted-foreground line-clamp-2">
                              {item.problem_description}
                            </div>
                          )}
                          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{item.order_type}</span>
                            <span>•</span>
                            <span>{item.priority}</span>
                            {item.mechanic_name && (
                              <>
                                <span>•</span>
                                <span>{item.mechanic_name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ============ FORM VIEW ============
  return (
    <div className={cn("p-4 pb-24 space-y-4", isDark ? "text-white" : "text-slate-900")}>
      
      {/* Back button */}
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => setSubView('menu')} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl font-bold">Nova Ordem de Serviço</h2>
      </div>

      {/* Vehicle Selection */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Veículo / Equipamento</h3>
        </div>

        <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                "w-full h-14 justify-between text-left font-medium text-base",
                isDark ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-300",
                !form.vehicle_code && "text-muted-foreground"
              )}
            >
              {form.vehicle_code ? (
                <span className="truncate">
                  <span className="font-bold">{form.vehicle_code}</span> - {form.vehicle_description || selectedVehicle?.name || ''}
                </span>
              ) : "Selecione o veículo"}
              <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] p-0" align="start">
            <Command>
              <CommandInput placeholder="Buscar veículo..." value={vehicleSearch} onValueChange={setVehicleSearch} autoFocus />
              <CommandList className="max-h-60">
                <CommandEmpty>Nenhum veículo encontrado</CommandEmpty>
                <CommandGroup>
                  {filteredVehicles.slice(0, 50).map(v => (
                    <CommandItem
                      key={v.id}
                      value={v.code}
                      onSelect={() => {
                        setForm(prev => ({
                          ...prev,
                          vehicle_code: v.code,
                          vehicle_description: v.description || v.name || '',
                          vehicle_company: v.company || '',
                        }));
                        setVehicleOpen(false);
                        setVehicleSearch('');
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", form.vehicle_code === v.code ? "opacity-100" : "opacity-0")} />
                      <div className="flex flex-col">
                        <span className="font-bold">{v.code}</span>
                        <span className="text-xs text-muted-foreground">{v.name} {v.category ? `• ${v.category}` : ''}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Last readings */}
        {(lastHorimeter || lastKm) && (
          <div className={cn("flex gap-3 text-sm rounded-lg p-2", isDark ? "bg-slate-700/50" : "bg-blue-50")}>
            {lastHorimeter && (
              <span className="text-amber-500 font-medium">Último Hor: {lastHorimeter.toLocaleString('pt-BR')}h</span>
            )}
            {lastKm && (
              <span className="text-blue-500 font-medium">Último KM: {lastKm.toLocaleString('pt-BR')}</span>
            )}
          </div>
        )}
      </div>

      {/* Type, Priority, Status */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
            <Wrench className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Classificação</h3>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={form.order_type} onValueChange={v => setForm(prev => ({ ...prev, order_type: v }))}>
              <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={form.priority} onValueChange={v => setForm(prev => ({ ...prev, priority: v }))}>
              <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={v => setForm(prev => ({ ...prev, status: v }))}>
              <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.icon} {s.value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {form.order_type === 'Preventiva' && (
          <div>
            <Label className="text-xs">Intervalo (Dias)</Label>
            <Input
              value={form.interval_days}
              onChange={e => setForm(prev => ({ ...prev, interval_days: e.target.value }))}
              type="number"
              className={inputClass}
            />
          </div>
        )}
      </div>

      {/* Entry Date/Time */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
            <CalendarIcon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Entrada</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Data de Entrada</Label>
            <Input
              type="date"
              value={form.entry_date}
              onChange={e => setForm(prev => ({ ...prev, entry_date: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-xs">Hora de Entrada</Label>
            <Input
              type="time"
              value={form.entry_time}
              onChange={e => setForm(prev => ({ ...prev, entry_time: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        {form.status === 'Finalizada' && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
              <Label className="text-xs">Data de Saída</Label>
              <Input
                type="date"
                value={form.exit_date}
                onChange={e => setForm(prev => ({ ...prev, exit_date: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <Label className="text-xs">Hora de Saída</Label>
              <Input
                type="time"
                value={form.exit_time}
                onChange={e => setForm(prev => ({ ...prev, exit_time: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* Horimeter / KM */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Gauge className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Horímetro / KM</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Horímetro Atual</Label>
            <CurrencyInput
              value={form.horimeter_current}
              onChange={v => setForm(prev => ({ ...prev, horimeter_current: v }))}
              placeholder="0,00"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-xs">KM Atual</Label>
            <CurrencyInput
              value={form.km_current}
              onChange={v => setForm(prev => ({ ...prev, km_current: v }))}
              placeholder="0,00"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Problem / Solution */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Problema *</h3>
        </div>
        <Textarea
          value={form.problem_description}
          onChange={e => setForm(prev => ({ ...prev, problem_description: e.target.value }))}
          placeholder="Descreva o problema encontrado..."
          rows={3}
          className={cn("text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "")}
        />

        <Label className="text-sm font-medium mt-3 block">Serviço Executado</Label>
        <Textarea
          value={form.solution_description}
          onChange={e => setForm(prev => ({ ...prev, solution_description: e.target.value }))}
          placeholder="Descreva o serviço realizado..."
          rows={3}
          className={cn("text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "")}
        />
      </div>

      {/* Mechanic */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-slate-500 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Mecânico</h3>
        </div>
        <Select
          value={form.mechanic_id}
          onValueChange={v => {
            const mech = mechanics.find(m => m.id === v);
            setForm(prev => ({ ...prev, mechanic_id: v, mechanic_name: mech?.name || '' }));
          }}
        >
          <SelectTrigger className={inputClass}>
            <SelectValue placeholder="Selecione o mecânico" />
          </SelectTrigger>
          <SelectContent>
            {mechanics.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="mt-2">
          <Label className="text-xs">Motorista / Operador</Label>
          <Input
            value={form.created_by}
            onChange={e => setForm(prev => ({ ...prev, created_by: e.target.value }))}
            placeholder="Nome do motorista/operador"
            className={inputClass}
          />
        </div>
      </div>

      {/* Costs */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Peças e Custos</h3>
        </div>
        <Textarea
          value={form.parts_used}
          onChange={e => setForm(prev => ({ ...prev, parts_used: e.target.value }))}
          placeholder="Peças utilizadas..."
          rows={2}
          className={cn("text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "")}
        />
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Horas Est.</Label>
            <Input
              value={form.estimated_hours}
              onChange={e => setForm(prev => ({ ...prev, estimated_hours: e.target.value }))}
              type="number"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-xs">Custo Peças</Label>
            <Input
              value={form.parts_cost}
              onChange={e => setForm(prev => ({ ...prev, parts_cost: e.target.value }))}
              type="number"
              className={inputClass}
            />
          </div>
          <div>
            <Label className="text-xs">Custo M.O.</Label>
            <Input
              value={form.labor_cost}
              onChange={e => setForm(prev => ({ ...prev, labor_cost: e.target.value }))}
              type="number"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-lg">Fotos</h3>
        </div>
        <OSPhotoUpload
          photos={{
            before: form.photo_before_url,
            after: form.photo_after_url,
            parts: form.photo_parts_url,
            photo4: form.photo_4_url,
            photo5: form.photo_5_url,
          }}
          onPhotoChange={(key, url) => {
            const map: Record<string, string> = {
              before: 'photo_before_url',
              after: 'photo_after_url',
              parts: 'photo_parts_url',
              photo4: 'photo_4_url',
              photo5: 'photo_5_url',
            };
            setForm(prev => ({ ...prev, [map[key]]: url }));
          }}
          vehicleCode={form.vehicle_code}
        />
      </div>

      {/* Notes */}
      <div className={sectionClass}>
        <Label className="text-sm font-medium">Observações</Label>
        <Textarea
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Observações adicionais..."
          rows={3}
          className={cn("text-base", isDark ? "bg-slate-700 border-slate-600 text-white" : "")}
        />
      </div>

      {/* Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-900/95 to-slate-900/80 backdrop-blur-sm border-t border-slate-700/50">
        <Button
          onClick={handleSave}
          disabled={isSaving || !form.vehicle_code || !form.problem_description.trim()}
          className="w-full h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Criando OS...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Criar Ordem de Serviço
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
