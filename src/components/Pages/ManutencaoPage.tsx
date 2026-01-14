import { useState, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { format, startOfDay, endOfDay, isWithinInterval, subDays, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetData } from '@/hooks/useGoogleSheets';

const TABS = [
  { id: 'ordens', label: 'Ordens de Serviço', icon: ClipboardList },
  { id: 'quadro', label: 'Quadro Resumo', icon: LayoutGrid },
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
}

interface Mechanic {
  id: string;
  name: string;
  active: boolean;
}

export function ManutencaoPage() {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ordens');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
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
  });

  // Fetch service orders
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select('*')
        .order('order_date', { ascending: false })
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

  // Fetch vehicle maintenance history
  const fetchVehicleHistory = (vehicleCode: string) => {
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
        // Still in maintenance
        const start = new Date(order.start_date);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalDays += diffDays;
      }
    });
    
    // Get last order
    const lastOrder = vehicleOrders.length > 0 ? vehicleOrders[0] : null;
    
    // Get last horimeter and km from orders
    const ordersWithHorimeter = vehicleOrders.filter(o => (o as any).horimeter_current);
    const ordersWithKm = vehicleOrders.filter(o => (o as any).km_current);
    const lastHorimeter = ordersWithHorimeter.length > 0 ? (ordersWithHorimeter[0] as any).horimeter_current : null;
    const lastKm = ordersWithKm.length > 0 ? (ordersWithKm[0] as any).km_current : null;
    
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
    const currentValue = parseFloat(value);
    if (!currentValue || !vehicleHistory?.lastHorimeter) {
      setHorimeterWarning(null);
      return;
    }
    
    if (currentValue < vehicleHistory.lastHorimeter) {
      setHorimeterWarning(`⚠️ Valor menor que o último registro (${vehicleHistory.lastHorimeter.toLocaleString('pt-BR')}h)`);
    } else if (currentValue - vehicleHistory.lastHorimeter > 500) {
      setHorimeterWarning(`⚠️ Diferença grande: +${(currentValue - vehicleHistory.lastHorimeter).toLocaleString('pt-BR')}h desde último registro`);
    } else {
      setHorimeterWarning(null);
    }
  };

  // Validate km input
  const validateKm = (value: string) => {
    const currentValue = parseFloat(value);
    if (!currentValue || !vehicleHistory?.lastKm) {
      setKmWarning(null);
      return;
    }
    
    if (currentValue < vehicleHistory.lastKm) {
      setKmWarning(`⚠️ Valor menor que o último registro (${vehicleHistory.lastKm.toLocaleString('pt-BR')} km)`);
    } else if (currentValue - vehicleHistory.lastKm > 10000) {
      setKmWarning(`⚠️ Diferença grande: +${(currentValue - vehicleHistory.lastKm).toLocaleString('pt-BR')} km desde último registro`);
    } else {
      setKmWarning(null);
    }
  };

  // Generate order number
  const generateOrderNumber = () => {
    const year = new Date().getFullYear();
    const count = orders.filter(o => o.order_number.includes(year.toString())).length + 1;
    return `OS-${year}-${String(count).padStart(5, '0')}`;
  };

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

  // Filter orders
  const filteredRows = useMemo(() => {
    return orders.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v || '').toLowerCase().includes(search.toLowerCase())
        );
      const status = String(row.status || '').toLowerCase();
      const matchesStatus = statusFilter === 'all' || status.includes(statusFilter);
      
      let matchesDate = true;
      if (startDate || endDate) {
        const rowDate = new Date(row.order_date);
        
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
      
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [orders, search, statusFilter, startDate, endDate]);

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
      return <Badge className="bg-success/20 text-success border-success/30">Finalizada</Badge>;
    }
    if (s.includes('andamento')) {
      return <Badge className="bg-primary/20 text-primary border-primary/30">Em Andamento</Badge>;
    }
    if (s.includes('aberta')) {
      return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30">Aberta</Badge>;
    }
    if (s.includes('aguardando')) {
      return <Badge className="bg-warning/20 text-warning border-warning/30">Aguardando</Badge>;
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
    });
    setIsModalOpen(true);
  };

  // Handle vehicle selection in modal
  const handleVehicleSelect = (vehicleCode: string) => {
    const vehicle = vehicles.find(v => v.code === vehicleCode);
    setFormData({ 
      ...formData, 
      vehicle_code: vehicleCode,
      vehicle_description: vehicle?.description || ''
    });
    fetchVehicleHistory(vehicleCode);
  };

  // Open edit order modal
  const handleEditOrder = (order: ServiceOrder) => {
    setEditingOrder(order);
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

    setIsSaving(true);
    try {
      const mechanic = mechanics.find(m => m.id === formData.mechanic_id);
      const partsCost = parseFloat(formData.parts_cost) || 0;
      const laborCost = parseFloat(formData.labor_cost) || 0;
      
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
        end_date: formData.status.includes('Finalizada') && !editingOrder?.end_date ? new Date().toISOString() : editingOrder?.end_date,
        horimeter_current: parseFloat(formData.horimeter_current) || null,
        km_current: parseFloat(formData.km_current) || null,
      };

      if (editingOrder) {
        const { error } = await supabase
          .from('service_orders')
          .update(orderData)
          .eq('id', editingOrder.id);
        
        if (error) throw error;
        toast.success('Ordem de serviço atualizada!');
      } else {
        const { error } = await supabase
          .from('service_orders')
          .insert({
            ...orderData,
            order_number: generateOrderNumber(),
            order_date: new Date().toISOString().split('T')[0],
          });
        
        if (error) throw error;
        toast.success('Ordem de serviço criada!');
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
      toast.success('Ordem de serviço excluída!');
      fetchOrders();
    } catch (err) {
      console.error('Error deleting order:', err);
      toast.error('Erro ao excluir ordem de serviço');
    }
  };

  // Export single OS to PDF - Professional SaaS Style
  const exportSingleOSToPDF = async (order: ServiceOrder) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Colors
    const primaryColor: [number, number, number] = [230, 126, 34]; // Orange from logo
    const darkColor: [number, number, number] = [44, 62, 80];
    const grayColor: [number, number, number] = [127, 140, 141];
    const lightGray: [number, number, number] = [236, 240, 241];
    
    // Get current user for signature
    const currentUserStr = localStorage.getItem('currentSystemUser');
    const currentUser = currentUserStr ? JSON.parse(currentUserStr) : null;
    const userRole = currentUser?.role || 'operador';
    const userName = currentUser?.name || 'Sistema';
    
    let y = 15;
    
    // === HEADER WITH LOGO ===
    // Try to load the consortium logo
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        logoImg.onload = () => {
          // Add logo centered at top
          const logoWidth = 120;
          const logoHeight = 25;
          const logoX = (pageWidth - logoWidth) / 2;
          doc.addImage(logoImg, 'PNG', logoX, y, logoWidth, logoHeight);
          resolve();
        };
        logoImg.onerror = () => {
          // Fallback: just text header
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...primaryColor);
          doc.text('CONSÓRCIO AERO MARAGOGI', pageWidth / 2, y + 10, { align: 'center' });
          resolve();
        };
        // Use base64 or relative path - for PDF we'll use text fallback mostly
        logoImg.src = '/src/assets/logo-consorcio.png';
      });
    } catch {
      // Fallback header text
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...primaryColor);
      doc.text('CONSÓRCIO AERO MARAGOGI', pageWidth / 2, y + 10, { align: 'center' });
    }
    
    y += 35;
    
    // === TITLE BAR ===
    doc.setFillColor(...primaryColor);
    doc.roundedRect(15, y, pageWidth - 30, 14, 2, 2, 'F');
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('ORDEM DE SERVIÇO', pageWidth / 2, y + 9, { align: 'center' });
    
    y += 20;
    
    // === OS NUMBER AND DATE BADGE ===
    doc.setFillColor(...lightGray);
    doc.roundedRect(15, y, 80, 12, 2, 2, 'F');
    doc.roundedRect(pageWidth - 95, y, 80, 12, 2, 2, 'F');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text(order.order_number, 55, y + 8, { align: 'center' });
    doc.text(format(new Date(order.order_date), 'dd/MM/yyyy'), pageWidth - 55, y + 8, { align: 'center' });
    
    y += 20;
    
    // === INFO CARDS ===
    const cardWidth = (pageWidth - 40) / 2;
    const cardHeight = 45;
    
    // Left card - Vehicle info
    doc.setFillColor(...lightGray);
    doc.roundedRect(15, y, cardWidth, cardHeight, 3, 3, 'F');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('VEÍCULO / EQUIPAMENTO', 20, y + 8);
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text(order.vehicle_code, 20, y + 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    const descLines = doc.splitTextToSize(order.vehicle_description || '-', cardWidth - 10);
    doc.text(descLines.slice(0, 2), 20, y + 28);
    
    // Horimeter/KM info
    const horimeter = (order as any).horimeter_current;
    const km = (order as any).km_current;
    if (horimeter || km) {
      doc.setFontSize(8);
      doc.setTextColor(...grayColor);
      const readingText = horimeter ? `Horímetro: ${horimeter.toLocaleString('pt-BR')}h` : `KM: ${km?.toLocaleString('pt-BR')}`;
      doc.text(readingText, 20, y + 40);
    }
    
    // Right card - Status info
    doc.setFillColor(...lightGray);
    doc.roundedRect(25 + cardWidth, y, cardWidth, cardHeight, 3, 3, 'F');
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('STATUS E PRIORIDADE', 30 + cardWidth, y + 8);
    
    // Status badge
    const statusColor: [number, number, number] = order.status.toLowerCase().includes('finalizada') 
      ? [39, 174, 96] 
      : order.status.toLowerCase().includes('andamento') 
        ? [52, 152, 219] 
        : [241, 196, 15];
    doc.setFillColor(...statusColor);
    doc.roundedRect(30 + cardWidth, y + 12, 50, 8, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(order.status.toUpperCase(), 55 + cardWidth, y + 17, { align: 'center' });
    
    // Priority badge
    const prioColor: [number, number, number] = order.priority.toLowerCase().includes('alta') 
      ? [231, 76, 60] 
      : order.priority.toLowerCase().includes('média') 
        ? [241, 196, 15] 
        : [149, 165, 166];
    doc.setFillColor(...prioColor);
    doc.roundedRect(85 + cardWidth, y + 12, 40, 8, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(order.priority.toUpperCase(), 105 + cardWidth, y + 17, { align: 'center' });
    
    // Type and mechanic
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text(`Tipo: ${order.order_type}`, 30 + cardWidth, y + 30);
    doc.text(`Mecânico: ${order.mechanic_name || '-'}`, 30 + cardWidth, y + 38);
    
    y += cardHeight + 10;
    
    // === PROBLEM SECTION ===
    doc.setFillColor(...primaryColor);
    doc.roundedRect(15, y, pageWidth - 30, 8, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('DESCRIÇÃO DO PROBLEMA', 20, y + 5.5);
    y += 12;
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkColor);
    doc.setFontSize(10);
    const problemLines = doc.splitTextToSize(order.problem_description || 'Não informado', pageWidth - 40);
    doc.text(problemLines.slice(0, 6), 20, y);
    y += Math.min(problemLines.length, 6) * 5 + 8;
    
    // === SOLUTION SECTION ===
    doc.setFillColor(39, 174, 96);
    doc.roundedRect(15, y, pageWidth - 30, 8, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('SOLUÇÃO / SERVIÇO REALIZADO', 20, y + 5.5);
    y += 12;
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...darkColor);
    doc.setFontSize(10);
    const solutionLines = doc.splitTextToSize(order.solution_description || 'Pendente', pageWidth - 40);
    doc.text(solutionLines.slice(0, 6), 20, y);
    y += Math.min(solutionLines.length, 6) * 5 + 8;
    
    // === PARTS USED SECTION ===
    if (order.parts_used) {
      doc.setFillColor(52, 152, 219);
      doc.roundedRect(15, y, pageWidth - 30, 8, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('PEÇAS / MATERIAIS UTILIZADOS', 20, y + 5.5);
      y += 12;
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkColor);
      doc.setFontSize(10);
      const partsLines = doc.splitTextToSize(order.parts_used, pageWidth - 40);
      doc.text(partsLines.slice(0, 4), 20, y);
      y += Math.min(partsLines.length, 4) * 5 + 8;
    }
    
    // === OBSERVATIONS ===
    if (order.notes) {
      doc.setFillColor(...grayColor);
      doc.roundedRect(15, y, pageWidth - 30, 8, 2, 2, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('OBSERVAÇÕES', 20, y + 5.5);
      y += 12;
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkColor);
      doc.setFontSize(9);
      const notesLines = doc.splitTextToSize(order.notes, pageWidth - 40);
      doc.text(notesLines.slice(0, 3), 20, y);
      y += Math.min(notesLines.length, 3) * 5 + 8;
    }
    
    // === HOURS INFO (without costs) ===
    if (order.estimated_hours || order.actual_hours) {
      doc.setFillColor(...lightGray);
      doc.roundedRect(15, y, pageWidth - 30, 15, 2, 2, 'F');
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkColor);
      
      if (order.estimated_hours) {
        doc.text(`Horas Estimadas: ${order.estimated_hours}h`, 25, y + 10);
      }
      if (order.actual_hours) {
        doc.text(`Horas Realizadas: ${order.actual_hours}h`, pageWidth / 2, y + 10);
      }
      
      y += 20;
    }
    
    // === SIGNATURE SECTION ===
    const sigY = Math.max(y + 15, pageHeight - 60);
    const sigWidth = (pageWidth - 50) / 3;
    
    // Signature boxes with labels
    doc.setDrawColor(...grayColor);
    doc.setLineWidth(0.5);
    
    // Signature 1: Motorista/Operador
    doc.line(15, sigY + 15, 15 + sigWidth, sigY + 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('MOTORISTA / OPERADOR', 15 + sigWidth / 2, sigY + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...grayColor);
    doc.text('Nome:', 15, sigY + 28);
    doc.text('Data: ___/___/______', 15, sigY + 33);
    
    // Signature 2: Mecânico
    const sig2X = 20 + sigWidth;
    doc.line(sig2X, sigY + 15, sig2X + sigWidth, sigY + 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('MECÂNICO RESPONSÁVEL', sig2X + sigWidth / 2, sigY + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...grayColor);
    doc.text(`Nome: ${order.mechanic_name || ''}`, sig2X, sigY + 28);
    doc.text('Data: ___/___/______', sig2X, sigY + 33);
    
    // Signature 3: Aprovação (Admin/Supervisor/Operador)
    const sig3X = 25 + sigWidth * 2;
    doc.line(sig3X, sigY + 15, sig3X + sigWidth, sigY + 15);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    const approvalTitle = userRole === 'admin' ? 'APROVAÇÃO (ADMIN)' : 
                          userRole === 'supervisor' ? 'APROVAÇÃO (SUPERVISOR)' : 
                          'RESPONSÁVEL TÉCNICO';
    doc.text(approvalTitle, sig3X + sigWidth / 2, sigY + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...grayColor);
    doc.text(`Nome: ${userName}`, sig3X, sigY + 28);
    doc.text('Data: ___/___/______', sig3X, sigY + 33);
    
    // === FOOTER ===
    doc.setFillColor(...primaryColor);
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
    
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(`Documento gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
    
    doc.save(`${order.order_number}.pdf`);
  };

  // Export list to PDF
  const exportListToPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(18);
    doc.text('Relatório de Ordens de Serviço', 14, 22);
    
    doc.setFontSize(10);
    const dateRangeText = startDate && endDate 
      ? `${format(startDate, 'dd/MM/yyyy')} até ${format(endDate, 'dd/MM/yyyy')}`
      : 'Todo período';
    doc.text(`Período: ${dateRangeText}`, 14, 30);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, 14, 36);

    doc.setFontSize(12);
    doc.text('Resumo:', 14, 46);
    doc.setFontSize(10);
    doc.text(`Em Manutenção: ${metrics.emManutencao}`, 14, 54);
    doc.text(`Aguardando: ${metrics.aguardandoPecas}`, 14, 60);
    doc.text(`Urgentes: ${metrics.urgentes}`, 100, 54);
    doc.text(`Finalizadas: ${metrics.finalizadas}`, 100, 60);

    const tableData = filteredRows.slice(0, 100).map((row) => [
      row.order_number,
      format(new Date(row.order_date), 'dd/MM/yyyy'),
      row.vehicle_code,
      row.order_type,
      (row.problem_description || '').slice(0, 30),
      row.mechanic_name || '-',
      row.priority,
      row.status
    ]);

    autoTable(doc, {
      head: [['Nº OS', 'Data', 'Veículo', 'Tipo', 'Problema', 'Mecânico', 'Prioridade', 'Status']],
      body: tableData,
      startY: 70,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`ordens_servico_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
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
            <Button variant="outline" size="sm" onClick={fetchOrders} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportListToPDF}>
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">PDF</span>
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
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todos os Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="aberta">Aberta</SelectItem>
                <SelectItem value="andamento">Em Andamento</SelectItem>
                <SelectItem value="aguardando">Aguardando Peças</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nº OS</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Veículo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Problema</TableHead>
                  <TableHead className="hidden lg:table-cell">Mecânico</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma ordem de serviço encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-medium">{row.order_number}</TableCell>
                      <TableCell>{format(new Date(row.order_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="font-medium">{row.vehicle_code}</TableCell>
                      <TableCell>
                        <Badge variant={row.order_type === 'Preventiva' ? 'default' : 'secondary'}>
                          {row.order_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                        {row.problem_description || '-'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{row.mechanic_name || '-'}</TableCell>
                      <TableCell>{getPrioridadeBadge(row.priority)}</TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => exportSingleOSToPDF(row)}
                            title="Exportar PDF"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditOrder(row)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteOrder(row)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Other tabs placeholder */}
        {activeTab !== 'ordens' && (
          <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
            <LayoutGrid className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Funcionalidade em desenvolvimento</p>
          </div>
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
                <Select 
                  value={formData.vehicle_code} 
                  onValueChange={handleVehicleSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o veículo" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {vehicles.map(v => (
                      <SelectItem key={v.code} value={v.code}>
                        {v.code} - {v.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aberta">Aberta</SelectItem>
                    <SelectItem value="Em Andamento">Em Andamento</SelectItem>
                    <SelectItem value="Aguardando Peças">Aguardando Peças</SelectItem>
                    <SelectItem value="Finalizada">Finalizada</SelectItem>
                  </SelectContent>
                </Select>
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
                      (último: {vehicleHistory.lastHorimeter.toLocaleString('pt-BR')}h)
                    </span>
                  )}
                </Label>
                <Input
                  type="number"
                  placeholder="Ex: 4500"
                  value={formData.horimeter_current}
                  onChange={(e) => {
                    setFormData({ ...formData, horimeter_current: e.target.value });
                    validateHorimeter(e.target.value);
                  }}
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
                      (último: {vehicleHistory.lastKm.toLocaleString('pt-BR')} km)
                    </span>
                  )}
                </Label>
                <Input
                  type="number"
                  placeholder="Ex: 120000"
                  value={formData.km_current}
                  onChange={(e) => {
                    setFormData({ ...formData, km_current: e.target.value });
                    validateKm(e.target.value);
                  }}
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
                <Input
                  type="number"
                  placeholder="Ex: 4"
                  value={formData.estimated_hours}
                  onChange={(e) => setFormData({ ...formData, estimated_hours: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Horas Realizadas</Label>
                <Input
                  type="number"
                  placeholder="Ex: 5"
                  value={formData.actual_hours}
                  onChange={(e) => setFormData({ ...formData, actual_hours: e.target.value })}
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
    </div>
  );
}
