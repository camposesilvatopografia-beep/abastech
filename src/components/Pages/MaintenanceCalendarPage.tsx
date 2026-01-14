import { useState, useMemo, useEffect } from 'react';
import { 
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Wrench,
  Clock,
  AlertTriangle,
  CheckCircle,
  Edit,
  Trash2,
  X,
  Save,
  MessageCircle,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addDays, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSheetData } from '@/hooks/useGoogleSheets';

interface ScheduledMaintenance {
  id: string;
  vehicle_code: string;
  vehicle_description: string | null;
  maintenance_type: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  interval_days: number | null;
  interval_hours: number | null;
  last_completed_date: string | null;
  status: string;
  priority: string;
  notes: string | null;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function MaintenanceCalendarPage() {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [maintenances, setMaintenances] = useState<ScheduledMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<ScheduledMaintenance | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    vehicle_code: '',
    vehicle_description: '',
    title: '',
    description: '',
    scheduled_date: '',
    interval_days: '90',
    interval_hours: '',
    priority: 'Média',
    notes: '',
  });

  // Fetch scheduled maintenances
  const fetchMaintenances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduled_maintenance')
        .select('*')
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      setMaintenances((data as ScheduledMaintenance[]) || []);
    } catch (err) {
      console.error('Error fetching maintenances:', err);
      toast.error('Erro ao carregar manutenções');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMaintenances();
  }, []);

  // Calendar days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    
    // Add days from previous month to fill the first week
    const startDay = start.getDay();
    for (let i = startDay - 1; i >= 0; i--) {
      days.unshift(addDays(start, -(i + 1)));
    }
    
    // Add days from next month to fill the last week
    const endDay = end.getDay();
    for (let i = 1; i <= 6 - endDay; i++) {
      days.push(addDays(end, i));
    }
    
    return days;
  }, [currentMonth]);

  // Get maintenances for a specific day
  const getMaintenancesForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return maintenances.filter(m => m.scheduled_date === dateStr);
  };

  // Status badge
  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('concluída') || s.includes('concluida')) {
      return <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px]">Concluída</Badge>;
    }
    if (s.includes('atrasada')) {
      return <Badge className="bg-red-500/20 text-red-600 border-red-500/30 text-[10px]">Atrasada</Badge>;
    }
    if (s.includes('andamento')) {
      return <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-[10px]">Em Andamento</Badge>;
    }
    return <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[10px]">Programada</Badge>;
  };

  // Priority color
  const getPriorityColor = (priority: string) => {
    const p = priority.toLowerCase();
    if (p.includes('alta') || p.includes('urgente')) return 'border-l-red-500 bg-red-50 dark:bg-red-950/20';
    if (p.includes('média') || p.includes('media')) return 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20';
    return 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20';
  };

  // Vehicles list
  const vehicles = useMemo(() => {
    return vehiclesData.rows.map(v => ({
      code: String(v['Codigo'] || ''),
      description: String(v['Descricao'] || ''),
    })).filter(v => v.code);
  }, [vehiclesData.rows]);

  // Open modal for new maintenance
  const handleNewMaintenance = (date?: Date) => {
    setEditingMaintenance(null);
    setFormData({
      vehicle_code: '',
      vehicle_description: '',
      title: '',
      description: '',
      scheduled_date: date ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      interval_days: '90',
      interval_hours: '',
      priority: 'Média',
      notes: '',
    });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleEditMaintenance = (maintenance: ScheduledMaintenance) => {
    setEditingMaintenance(maintenance);
    setFormData({
      vehicle_code: maintenance.vehicle_code,
      vehicle_description: maintenance.vehicle_description || '',
      title: maintenance.title,
      description: maintenance.description || '',
      scheduled_date: maintenance.scheduled_date,
      interval_days: maintenance.interval_days?.toString() || '90',
      interval_hours: maintenance.interval_hours?.toString() || '',
      priority: maintenance.priority,
      notes: maintenance.notes || '',
    });
    setIsModalOpen(true);
  };

  // Save maintenance
  const handleSave = async () => {
    if (!formData.vehicle_code || !formData.title || !formData.scheduled_date) {
      toast.error('Preencha veículo, título e data');
      return;
    }

    setIsSaving(true);
    try {
      const vehicle = vehicles.find(v => v.code === formData.vehicle_code);
      
      const maintenanceData = {
        vehicle_code: formData.vehicle_code,
        vehicle_description: vehicle?.description || formData.vehicle_description,
        title: formData.title,
        description: formData.description || null,
        scheduled_date: formData.scheduled_date,
        interval_days: parseInt(formData.interval_days) || 90,
        interval_hours: formData.interval_hours ? parseInt(formData.interval_hours) : null,
        priority: formData.priority,
        notes: formData.notes || null,
        status: 'Programada',
        maintenance_type: 'Preventiva',
      };

      if (editingMaintenance) {
        const { error } = await supabase
          .from('scheduled_maintenance')
          .update(maintenanceData)
          .eq('id', editingMaintenance.id);
        
        if (error) throw error;
        toast.success('Manutenção atualizada!');
      } else {
        const { error } = await supabase
          .from('scheduled_maintenance')
          .insert(maintenanceData);
        
        if (error) throw error;
        toast.success('Manutenção programada!');
      }

      setIsModalOpen(false);
      fetchMaintenances();
    } catch (err) {
      console.error('Error saving maintenance:', err);
      toast.error('Erro ao salvar manutenção');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete maintenance
  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta manutenção programada?')) return;

    try {
      const { error } = await supabase
        .from('scheduled_maintenance')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Manutenção excluída!');
      fetchMaintenances();
    } catch (err) {
      console.error('Error deleting maintenance:', err);
      toast.error('Erro ao excluir manutenção');
    }
  };

  // Mark as completed
  const handleComplete = async (maintenance: ScheduledMaintenance) => {
    try {
      const nextDate = addDays(new Date(), maintenance.interval_days || 90);
      
      // Update current as completed and create next occurrence
      await supabase
        .from('scheduled_maintenance')
        .update({ 
          status: 'Concluída',
          last_completed_date: format(new Date(), 'yyyy-MM-dd')
        })
        .eq('id', maintenance.id);

      // Create next scheduled maintenance
      await supabase
        .from('scheduled_maintenance')
        .insert({
          vehicle_code: maintenance.vehicle_code,
          vehicle_description: maintenance.vehicle_description,
          title: maintenance.title,
          description: maintenance.description,
          scheduled_date: format(nextDate, 'yyyy-MM-dd'),
          interval_days: maintenance.interval_days,
          interval_hours: maintenance.interval_hours,
          priority: maintenance.priority,
          notes: maintenance.notes,
          status: 'Programada',
          maintenance_type: 'Preventiva',
        });

      toast.success('Manutenção concluída! Próxima agendada automaticamente.');
      fetchMaintenances();
    } catch (err) {
      console.error('Error completing maintenance:', err);
      toast.error('Erro ao concluir manutenção');
    }
  };

  // Share upcoming maintenances via WhatsApp
  const handleShareWhatsApp = () => {
    const now = new Date();
    const upcoming = maintenances.filter(m => {
      const date = new Date(m.scheduled_date);
      const daysUntil = differenceInDays(date, now);
      return daysUntil >= 0 && daysUntil <= 7 && m.status === 'Programada';
    });

    if (upcoming.length === 0) {
      toast.info('Nenhuma manutenção preventiva nos próximos 7 dias');
      return;
    }

    let message = `🔧 *MANUTENÇÕES PREVENTIVAS - Próximos 7 dias*\n`;
    message += `📅 Gerado em: ${format(now, 'dd/MM/yyyy HH:mm', { locale: ptBR })}\n\n`;

    upcoming.forEach((m, index) => {
      const date = new Date(m.scheduled_date);
      const daysUntil = differenceInDays(date, now);
      const urgencyEmoji = daysUntil <= 2 ? '🔴' : daysUntil <= 5 ? '🟡' : '🟢';
      
      message += `${urgencyEmoji} *${m.vehicle_code}* - ${m.title}\n`;
      message += `   📆 ${format(date, 'dd/MM/yyyy', { locale: ptBR })}`;
      message += daysUntil === 0 ? ' (HOJE!)' : daysUntil === 1 ? ' (AMANHÃ)' : ` (${daysUntil} dias)`;
      message += `\n`;
      if (m.description) {
        message += `   📝 ${m.description}\n`;
      }
      if (index < upcoming.length - 1) message += '\n';
    });

    message += `\n📊 Total: ${upcoming.length} manutenção(ões) programada(s)`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = maintenances.filter(m => {
      const date = new Date(m.scheduled_date);
      return date.getMonth() === currentMonth.getMonth() && 
             date.getFullYear() === currentMonth.getFullYear();
    });

    const overdue = maintenances.filter(m => {
      const date = new Date(m.scheduled_date);
      return date < now && m.status === 'Programada';
    });

    const upcoming = maintenances.filter(m => {
      const date = new Date(m.scheduled_date);
      const daysUntil = differenceInDays(date, now);
      return daysUntil >= 0 && daysUntil <= 7 && m.status === 'Programada';
    });

    return {
      thisMonth: thisMonth.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
    };
  }, [maintenances, currentMonth]);

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CalendarIcon className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Calendário de Manutenções</h1>
              <p className="text-sm text-muted-foreground">Preventivas programadas por veículo</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleShareWhatsApp}
              className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
            >
              <MessageCircle className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">WhatsApp</span>
            </Button>
            <Button variant="outline" size="sm" onClick={fetchMaintenances} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleNewMaintenance()}>
              <Plus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Nova Preventiva</span>
              <span className="sm:hidden">Nova</span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.thisMonth}</p>
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Este Mês</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.upcoming}</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Próximos 7 dias</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.overdue}</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70">Atrasadas</p>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          {/* Month Navigation */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {WEEKDAYS.map(day => (
              <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground bg-muted/20">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map((day, index) => {
              const dayMaintenances = getMaintenancesForDay(day);
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              
              return (
                <div
                  key={index}
                  className={cn(
                    "min-h-[80px] md:min-h-[100px] p-1 border-b border-r border-border cursor-pointer transition-colors",
                    !isCurrentMonth && "bg-muted/30",
                    isToday(day) && "bg-primary/5",
                    isSelected && "bg-primary/10 ring-2 ring-primary ring-inset",
                    "hover:bg-muted/50"
                  )}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => handleNewMaintenance(day)}
                >
                  <div className={cn(
                    "text-xs md:text-sm font-medium mb-1",
                    !isCurrentMonth && "text-muted-foreground",
                    isToday(day) && "text-primary font-bold"
                  )}>
                    {format(day, 'd')}
                  </div>
                  
                  <div className="space-y-1">
                    {dayMaintenances.slice(0, 2).map(m => (
                      <div
                        key={m.id}
                        className={cn(
                          "text-[10px] md:text-xs p-1 rounded border-l-2 truncate",
                          getPriorityColor(m.priority)
                        )}
                        title={`${m.vehicle_code}: ${m.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditMaintenance(m);
                        }}
                      >
                        <span className="font-medium">{m.vehicle_code}</span>
                        <span className="hidden md:inline">: {m.title}</span>
                      </div>
                    ))}
                    {dayMaintenances.length > 2 && (
                      <div className="text-[10px] text-muted-foreground text-center">
                        +{dayMaintenances.length - 2} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details */}
        {selectedDate && (
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" />
                {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              </h3>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => handleNewMaintenance(selectedDate)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>

            {getMaintenancesForDay(selectedDate).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma manutenção programada para este dia
              </p>
            ) : (
              <div className="space-y-3">
                {getMaintenancesForDay(selectedDate).map(m => (
                  <div
                    key={m.id}
                    className={cn(
                      "p-3 rounded-lg border-l-4",
                      getPriorityColor(m.priority)
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{m.vehicle_code}</span>
                          <span className="text-sm text-muted-foreground">-</span>
                          <span className="text-sm truncate">{m.vehicle_description}</span>
                        </div>
                        <p className="font-medium mt-1">{m.title}</p>
                        {m.description && (
                          <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {getStatusBadge(m.status)}
                          <Badge variant="outline" className="text-[10px]">
                            <Clock className="w-3 h-3 mr-1" />
                            A cada {m.interval_days} dias
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {m.status === 'Programada' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleComplete(m)}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Marcar como concluída"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditMaintenance(m)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(m.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-l-2 border-red-500 bg-red-50" />
            <span>Alta Prioridade</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-l-2 border-amber-500 bg-amber-50" />
            <span>Média Prioridade</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-l-2 border-blue-500 bg-blue-50" />
            <span>Baixa Prioridade</span>
          </div>
        </div>
      </div>

      {/* Maintenance Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-5 h-5" />
              {editingMaintenance ? 'Editar Manutenção Preventiva' : 'Nova Manutenção Preventiva'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Vehicle */}
            <div className="space-y-2">
              <Label>Veículo *</Label>
              <Select 
                value={formData.vehicle_code} 
                onValueChange={(value) => {
                  const vehicle = vehicles.find(v => v.code === value);
                  setFormData({ 
                    ...formData, 
                    vehicle_code: value,
                    vehicle_description: vehicle?.description || ''
                  });
                }}
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

            {/* Title */}
            <div className="space-y-2">
              <Label>Título da Manutenção *</Label>
              <Input
                placeholder="Ex: Troca de óleo, Revisão geral..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descrição detalhada da manutenção..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            {/* Date and Interval */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Programada *</Label>
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Intervalo (dias)</Label>
                <Input
                  type="number"
                  placeholder="90"
                  value={formData.interval_days}
                  onChange={(e) => setFormData({ ...formData, interval_days: e.target.value })}
                />
              </div>
            </div>

            {/* Priority */}
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
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Notas adicionais..."
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
            <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}