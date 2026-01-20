import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, startOfDay, endOfDay, isWithinInterval, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Edit2,
  Save,
  X,
  RefreshCw,
  Gauge,
  Truck,
  Filter,
  Wand2,
  Sparkles,
  CheckCheck,
  Loader2,
  CalendarIcon,
  CalendarDays,
  History,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HorimeterWithVehicle } from '@/hooks/useHorimeters';

type DateFilterType = 'all' | 'today' | 'week' | 'month' | 'period';

interface HorimeterDBCorrectionsTabProps {
  readings: HorimeterWithVehicle[];
  refetch: () => void;
  loading: boolean;
}

interface VehicleStats {
  vehicleId: string;
  vehicleCode: string;
  vehicleDescription: string;
  category: string;
  avgInterval: number;
  totalRecords: number;
}

interface AnomalyRecord {
  readingId: string;
  vehicleId: string;
  vehicleCode: string;
  vehicleDescription: string;
  category: string;
  date: string;
  horimeterPrevious: number;
  horimeterCurrent: number;
  kmPrevious: number;
  kmCurrent: number;
  interval: number;
  avgInterval: number;
  deviationPercent: number;
  severity: 'high' | 'medium' | 'low';
  issueType: 'negative_value' | 'zero_previous' | 'high_interval' | 'negative_km';
  operator: string;
  suggestedCorrection?: {
    previousValue?: number;
    currentValue?: number;
    fieldToFix: 'previous' | 'current';
    source: string;
    correctionType?: 'extra_digit' | 'missing_digit' | 'from_history' | 'estimated';
  };
}

export function HorimeterDBCorrectionsTab({ readings, refetch, loading }: HorimeterDBCorrectionsTabProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('month');
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    horimeterPrevious: string;
    horimeterCurrent: string;
    kmPrevious: string;
    kmCurrent: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [showAutoFixDialog, setShowAutoFixDialog] = useState(false);
  const [autoFixResults, setAutoFixResults] = useState<{
    total: number;
    fixed: number;
    errors: number;
    details: { vehicleCode: string; date: string; oldValue: number; newValue: number; field: string }[];
  } | null>(null);
  const [anomaliesWithSuggestions, setAnomaliesWithSuggestions] = useState<AnomalyRecord[]>([]);
  const [isCalculatingSuggestions, setIsCalculatingSuggestions] = useState(false);
  const [correctedIds, setCorrectedIds] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  // Fetch inconsistency alerts (history)
  const fetchAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const { data, error } = await supabase
        .from('horimeter_inconsistency_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error('Error fetching alerts:', error);
      } else {
        setAlerts(data || []);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  // Fetch alerts when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      fetchAlerts();
    }
  }, [activeTab, fetchAlerts]);

  // Get date range
  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (dateFilterType) {
      case 'today':
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return { start: todayStart, end: today };
      case 'week':
        return { start: subDays(today, 7), end: today };
      case 'month':
        return { start: subDays(today, 30), end: today };
      case 'period':
        return { start: startDate || subDays(today, 30), end: endDate || today };
      case 'all':
      default:
        return { start: null, end: null };
    }
  }, [dateFilterType, startDate, endDate]);

  // Check if date is in filter
  const isDateInFilter = useCallback((dateStr: string): boolean => {
    const recordDate = new Date(dateStr + 'T00:00:00');
    if (isNaN(recordDate.getTime())) return false;

    if (!dateRange.start || !dateRange.end) return true;
    
    return isWithinInterval(recordDate, {
      start: startOfDay(dateRange.start),
      end: endOfDay(dateRange.end),
    });
  }, [dateRange]);

  // Calculate vehicle statistics
  const vehicleStats = useMemo(() => {
    const stats = new Map<string, VehicleStats>();
    const vehicleReadings = new Map<string, number[]>();

    readings.forEach(reading => {
      const vehicleId = reading.vehicle_id;
      if (!reading.vehicle) return;

      if (!vehicleReadings.has(vehicleId)) {
        vehicleReadings.set(vehicleId, []);
        stats.set(vehicleId, {
          vehicleId,
          vehicleCode: reading.vehicle.code,
          vehicleDescription: reading.vehicle.name || reading.vehicle.description || '',
          category: reading.vehicle.category || '',
          avgInterval: 0,
          totalRecords: 0,
        });
      }

      vehicleReadings.get(vehicleId)!.push(reading.current_value);
    });

    // Calculate average intervals
    vehicleReadings.forEach((values, vehicleId) => {
      const stat = stats.get(vehicleId)!;
      stat.totalRecords = values.length;

      if (values.length >= 2) {
        const sortedValues = [...values].sort((a, b) => a - b);
        let totalInterval = 0;
        let count = 0;

        for (let i = 1; i < sortedValues.length; i++) {
          const interval = sortedValues[i] - sortedValues[i - 1];
          if (interval > 0 && interval < 500) {
            totalInterval += interval;
            count++;
          }
        }

        stat.avgInterval = count > 0 ? totalInterval / count : 0;
      }
    });

    return stats;
  }, [readings]);

  // Identify anomalies
  const anomalies = useMemo(() => {
    const issues: AnomalyRecord[] = [];

    readings.forEach(reading => {
      if (!reading.vehicle) return;

      const category = reading.vehicle.category?.toUpperCase() || '';
      const isVehicle = category === 'VEICULO';

      const horimeterPrevious = reading.previous_value || 0;
      const horimeterCurrent = reading.current_value;
      const kmPrevious = reading.previous_km || 0;
      const kmCurrent = reading.current_km || 0;

      const stat = vehicleStats.get(reading.vehicle_id);
      const avgInterval = stat?.avgInterval || 0;

      // Calculate intervals
      const horimeterInterval = horimeterCurrent - horimeterPrevious;
      const kmInterval = kmCurrent - kmPrevious;

      let issueType: AnomalyRecord['issueType'] | null = null;
      let severity: AnomalyRecord['severity'] = 'low';
      let deviationPercent = 0;
      let interval = isVehicle ? kmInterval : horimeterInterval;

      // Issue 1: Negative horimeter interval
      if (horimeterInterval < 0 && horimeterPrevious > 0) {
        issueType = 'negative_value';
        severity = 'high';
        deviationPercent = -100;
        interval = horimeterInterval;
      }
      // Issue 2: Negative KM interval
      else if (kmInterval < 0 && kmPrevious > 0) {
        issueType = 'negative_km';
        severity = 'high';
        deviationPercent = -100;
        interval = kmInterval;
      }
      // Issue 3: Zero previous when current has value
      else if ((horimeterPrevious === 0 && horimeterCurrent > 0) || 
               (kmPrevious === 0 && kmCurrent > 0)) {
        issueType = 'zero_previous';
        severity = 'medium';
        deviationPercent = 100;
      }
      // Issue 4: High interval compared to average
      else if (avgInterval > 0 && horimeterInterval > 0) {
        deviationPercent = ((horimeterInterval - avgInterval) / avgInterval) * 100;
        
        if (deviationPercent > 500) {
          issueType = 'high_interval';
          severity = 'high';
        } else if (deviationPercent > 300) {
          issueType = 'high_interval';
          severity = 'medium';
        } else if (deviationPercent > 200) {
          issueType = 'high_interval';
          severity = 'low';
        }
      }

      if (issueType) {
        issues.push({
          readingId: reading.id,
          vehicleId: reading.vehicle_id,
          vehicleCode: reading.vehicle.code,
          vehicleDescription: reading.vehicle.name || reading.vehicle.description || '',
          category,
          date: reading.reading_date,
          horimeterPrevious,
          horimeterCurrent,
          kmPrevious,
          kmCurrent,
          interval,
          avgInterval,
          deviationPercent,
          severity,
          issueType,
          operator: reading.operator || '',
        });
      }
    });

    return issues.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.date.localeCompare(a.date);
    });
  }, [readings, vehicleStats]);

  // Find correct value for anomaly
  const findCorrectValue = useCallback((anomaly: AnomalyRecord): AnomalyRecord['suggestedCorrection'] | null => {
    const vehicleReadings = readings
      .filter(r => r.vehicle_id === anomaly.vehicleId && r.id !== anomaly.readingId)
      .sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime());

    if (vehicleReadings.length === 0) return null;

    const anomalyDate = new Date(anomaly.date);
    const currentValue = anomaly.horimeterCurrent;
    const previousValue = anomaly.horimeterPrevious;
    const avgInterval = anomaly.avgInterval || 50;

    // Find reading before this one
    const prevReading = vehicleReadings.find(r => new Date(r.reading_date) < anomalyDate);
    const prevValue = prevReading?.current_value || 0;

    // Case 1: High interval - check for extra digit
    if (anomaly.issueType === 'high_interval' && currentValue > 0 && prevValue > 0) {
      const currentDiv10 = currentValue / 10;
      const intervalIfDiv10 = currentDiv10 - prevValue;

      if (intervalIfDiv10 > 0 && intervalIfDiv10 < avgInterval * 3) {
        return {
          currentValue: Math.round(currentDiv10 * 100) / 100,
          fieldToFix: 'current',
          source: 'Valor atual ÷10 (dígito extra)',
          correctionType: 'extra_digit',
        };
      }

      const prevTimes10 = prevValue * 10;
      const intervalIfPrevTimes10 = currentValue - prevTimes10;

      if (intervalIfPrevTimes10 > 0 && intervalIfPrevTimes10 < avgInterval * 3) {
        return {
          previousValue: Math.round(prevTimes10 * 100) / 100,
          fieldToFix: 'previous',
          source: 'Anterior ×10 (dígito faltando)',
          correctionType: 'missing_digit',
        };
      }
    }

    // Case 2: Negative interval - use previous record
    if (anomaly.issueType === 'negative_value' && prevReading && prevValue > 0 && prevValue < currentValue) {
      return {
        previousValue: prevValue,
        fieldToFix: 'previous',
        source: `Registro anterior (${prevReading.reading_date})`,
        correctionType: 'from_history',
      };
    }

    // Case 3: Zero previous - get from history
    if (anomaly.issueType === 'zero_previous' && prevReading && prevValue > 0) {
      return {
        previousValue: prevValue,
        fieldToFix: 'previous',
        source: `Registro anterior (${prevReading.reading_date})`,
        correctionType: 'from_history',
      };
    }

    // Fallback: estimate based on average
    if (prevValue === 0 && avgInterval > 0) {
      const estimated = currentValue - avgInterval;
      if (estimated > 0) {
        return {
          previousValue: Math.round(estimated * 100) / 100,
          fieldToFix: 'previous',
          source: 'Intervalo médio estimado',
          correctionType: 'estimated',
        };
      }
    }

    return null;
  }, [readings]);

  // Calculate suggestions for all anomalies
  const calculateSuggestions = useCallback(() => {
    setIsCalculatingSuggestions(true);

    const withSuggestions = anomalies.map(anomaly => ({
      ...anomaly,
      suggestedCorrection: findCorrectValue(anomaly) || undefined,
    }));

    setAnomaliesWithSuggestions(withSuggestions);
    setIsCalculatingSuggestions(false);

    const validCount = withSuggestions.filter(a => a.suggestedCorrection).length;
    if (validCount > 0) {
      toast.success(`${validCount} correções sugeridas encontradas!`);
    } else {
      toast.info('Nenhuma correção automática disponível');
    }
  }, [anomalies, findCorrectValue]);

  // Mark as corrected
  const markAsCorrected = (anomaly: AnomalyRecord) => {
    setCorrectedIds(prev => new Set([...prev, anomaly.readingId]));
  };

  // Apply single fix
  const applySingleFix = async (anomaly: AnomalyRecord): Promise<boolean> => {
    if (!anomaly.suggestedCorrection) return false;

    try {
      const { fieldToFix, previousValue, currentValue } = anomaly.suggestedCorrection;

      const updateData: Record<string, number | null> = {};

      if (fieldToFix === 'current') {
        updateData.current_value = currentValue!;
      } else {
        updateData.previous_value = previousValue!;
      }

      const { error } = await supabase
        .from('horimeter_readings')
        .update(updateData)
        .eq('id', anomaly.readingId);

      if (error) {
        console.error('Error updating reading:', error);
        toast.error(`Erro ao corrigir: ${error.message}`);
        return false;
      }

      // Update alert status if exists
      await supabase
        .from('horimeter_inconsistency_alerts')
        .update({
          status: 'resolved',
          resolution_notes: `Correção automática: ${anomaly.suggestedCorrection.source}`,
          resolved_at: new Date().toISOString(),
          resolved_by: 'Sistema',
        })
        .eq('reading_id', anomaly.readingId);

      markAsCorrected(anomaly);
      toast.success(`Correção aplicada: ${anomaly.vehicleCode}`);
      return true;
    } catch (err) {
      console.error('Error applying fix:', err);
      toast.error('Erro ao aplicar correção');
      return false;
    }
  };

  // Apply all fixes
  const applyAllFixes = async () => {
    const fixable = anomaliesWithSuggestions.filter(a => a.suggestedCorrection && !correctedIds.has(a.readingId));
    if (fixable.length === 0) {
      toast.info('Nenhuma correção pendente');
      return;
    }

    setIsAutoFixing(true);
    const results = {
      total: fixable.length,
      fixed: 0,
      errors: 0,
      details: [] as { vehicleCode: string; date: string; oldValue: number; newValue: number; field: string }[],
    };

    for (const anomaly of fixable) {
      const correction = anomaly.suggestedCorrection!;
      const field = correction.fieldToFix === 'current' ? 'Atual' : 'Anterior';
      const oldValue = correction.fieldToFix === 'current' ? anomaly.horimeterCurrent : anomaly.horimeterPrevious;
      const newValue = correction.fieldToFix === 'current' ? correction.currentValue! : correction.previousValue!;

      const success = await applySingleFix(anomaly);
      if (success) {
        results.fixed++;
        results.details.push({
          vehicleCode: anomaly.vehicleCode,
          date: anomaly.date,
          oldValue,
          newValue,
          field,
        });
      } else {
        results.errors++;
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setAutoFixResults(results);
    setShowAutoFixDialog(true);
    setIsAutoFixing(false);

    if (results.fixed > 0) {
      refetch();
    }
  };

  // Get unique vehicles
  const vehiclesWithAnomalies = useMemo(() => {
    const vehicleMap = new Map<string, { id: string; code: string; description: string }>();
    const source = anomaliesWithSuggestions.length > 0 ? anomaliesWithSuggestions : anomalies;
    source.forEach(a => {
      if (!vehicleMap.has(a.vehicleId)) {
        vehicleMap.set(a.vehicleId, {
          id: a.vehicleId,
          code: a.vehicleCode,
          description: a.vehicleDescription,
        });
      }
    });
    return Array.from(vehicleMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [anomalies, anomaliesWithSuggestions]);

  // Filtered anomalies
  const displayedAnomalies = useMemo(() => {
    const source = anomaliesWithSuggestions.length > 0 ? anomaliesWithSuggestions : anomalies;
    return source.filter(a => {
      if (correctedIds.has(a.readingId)) return false;
      if (!isDateInFilter(a.date)) return false;
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (vehicleFilter !== 'all' && a.vehicleId !== vehicleFilter) return false;
      return true;
    });
  }, [anomalies, anomaliesWithSuggestions, severityFilter, vehicleFilter, isDateInFilter, correctedIds]);

  // Summary counts
  const summaryCounts = useMemo(() => ({
    total: anomalies.length,
    high: anomalies.filter(a => a.severity === 'high').length,
    medium: anomalies.filter(a => a.severity === 'medium').length,
    low: anomalies.filter(a => a.severity === 'low').length,
    fixable: anomaliesWithSuggestions.filter(a => a.suggestedCorrection).length,
  }), [anomalies, anomaliesWithSuggestions]);

  // Handle edit
  const handleStartEdit = (anomaly: AnomalyRecord) => {
    setEditingId(anomaly.readingId);
    setEditData({
      horimeterPrevious: anomaly.horimeterPrevious.toString(),
      horimeterCurrent: anomaly.horimeterCurrent.toString(),
      kmPrevious: anomaly.kmPrevious.toString(),
      kmCurrent: anomaly.kmCurrent.toString(),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditData(null);
  };

  const handleSaveEdit = async (anomaly: AnomalyRecord) => {
    if (!editData) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('horimeter_readings')
        .update({
          previous_value: parseFloat(editData.horimeterPrevious) || 0,
          current_value: parseFloat(editData.horimeterCurrent) || 0,
          previous_km: parseFloat(editData.kmPrevious) || null,
          current_km: parseFloat(editData.kmCurrent) || null,
        })
        .eq('id', anomaly.readingId);

      if (error) throw error;

      toast.success('Registro atualizado com sucesso!');
      markAsCorrected(anomaly);
      handleCancelEdit();
      refetch();
    } catch (err) {
      console.error('Error saving edit:', err);
      toast.error('Erro ao salvar alterações');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle apply suggestion
  const handleApplySuggestion = async (anomaly: AnomalyRecord) => {
    const success = await applySingleFix(anomaly);
    if (success) {
      refetch();
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'high':
        return <Badge variant="destructive">Alta</Badge>;
      case 'medium':
        return <Badge className="bg-amber-500 hover:bg-amber-600">Média</Badge>;
      case 'low':
        return <Badge variant="secondary">Baixa</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getIssueDescription = (issueType: string) => {
    switch (issueType) {
      case 'negative_value':
        return 'Intervalo negativo (Horímetro)';
      case 'negative_km':
        return 'Intervalo negativo (KM)';
      case 'zero_previous':
        return 'Valor anterior zerado';
      case 'high_interval':
        return 'Intervalo muito alto';
      default:
        return issueType;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('pending')}
          className="gap-2"
        >
          <ListChecks className="h-4 w-4" />
          Pendentes
          {summaryCounts.total > 0 && (
            <Badge variant="secondary" className="ml-1">{displayedAnomalies.length}</Badge>
          )}
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('history')}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          Histórico de Alertas
        </Button>
      </div>

      {activeTab === 'pending' && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{summaryCounts.total}</p>
              </CardContent>
            </Card>
            <Card className="border-destructive/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-destructive">{summaryCounts.high}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Média
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-amber-600">{summaryCounts.medium}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Baixa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{summaryCounts.low}</p>
              </CardContent>
            </Card>
            <Card className="border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Corrigíveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-primary">{summaryCounts.fixable}</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Actions */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/50 rounded-lg">
            {/* Date Filters */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={dateFilterType === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilterType('all')}
              >
                Todos
              </Button>
              <Button
                variant={dateFilterType === 'today' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilterType('today')}
              >
                Hoje
              </Button>
              <Button
                variant={dateFilterType === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilterType('week')}
              >
                7 Dias
              </Button>
              <Button
                variant={dateFilterType === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilterType('month')}
              >
                30 Dias
              </Button>
              <Button
                variant={dateFilterType === 'period' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilterType('period')}
              >
                <CalendarDays className="h-4 w-4 mr-1" />
                Período
              </Button>
            </div>

            {dateFilterType === 'period' && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="border-green-500">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Início'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground">até</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="border-destructive">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {endDate ? format(endDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Fim'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="flex-1" />

            {/* Vehicle Filter */}
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar veículo..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] bg-background">
                  <SelectItem value="all">Todos os veículos</SelectItem>
                  {vehiclesWithAnomalies.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="font-bold text-primary">{v.code}</span>
                      {v.description && <span className="text-muted-foreground ml-2 text-xs">{v.description}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {vehicleFilter !== 'all' && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setVehicleFilter('all')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Severity Filter */}
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as any)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Severidade" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>

            {/* Actions */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={calculateSuggestions}
                    disabled={isCalculatingSuggestions || anomalies.length === 0}
                  >
                    {isCalculatingSuggestions ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4 mr-2" />
                    )}
                    Analisar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Analisar e sugerir correções inteligentes</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {summaryCounts.fixable > 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={applyAllFixes}
                disabled={isAutoFixing}
                className="bg-primary"
              >
                {isAutoFixing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCheck className="h-4 w-4 mr-2" />
                )}
                Corrigir Tudo ({summaryCounts.fixable})
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          {/* Anomalies Table */}
          {displayedAnomalies.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma anomalia encontrada</h3>
              <p className="text-muted-foreground">
                Todos os registros de horímetro estão consistentes.
              </p>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Problema</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead className="text-right">Anterior</TableHead>
                    <TableHead className="text-right">Atual</TableHead>
                    <TableHead className="text-right">Intervalo</TableHead>
                    <TableHead>Sugestão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedAnomalies.map(anomaly => {
                    const isEditing = editingId === anomaly.readingId;
                    
                    return (
                      <TableRow key={anomaly.readingId} className={cn(
                        anomaly.severity === 'high' && 'bg-destructive/5',
                        anomaly.severity === 'medium' && 'bg-amber-500/5'
                      )}>
                        <TableCell className="font-medium">
                          {format(new Date(anomaly.date + 'T00:00:00'), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-bold text-primary">{anomaly.vehicleCode}</span>
                            {anomaly.vehicleDescription && (
                              <span className="text-muted-foreground text-xs block">{anomaly.vehicleDescription}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getIssueDescription(anomaly.issueType)}</TableCell>
                        <TableCell>{getSeverityBadge(anomaly.severity)}</TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              value={editData?.horimeterPrevious || ''}
                              onChange={(e) => setEditData(prev => prev ? {...prev, horimeterPrevious: e.target.value} : null)}
                              className="w-24 text-right"
                            />
                          ) : (
                            anomaly.horimeterPrevious.toLocaleString('pt-BR')
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <Input
                              value={editData?.horimeterCurrent || ''}
                              onChange={(e) => setEditData(prev => prev ? {...prev, horimeterCurrent: e.target.value} : null)}
                              className="w-24 text-right"
                            />
                          ) : (
                            anomaly.horimeterCurrent.toLocaleString('pt-BR')
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-medium",
                          anomaly.interval < 0 ? "text-destructive" : "text-green-600"
                        )}>
                          {anomaly.interval > 0 ? '+' : ''}{anomaly.interval.toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          {anomaly.suggestedCorrection ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className="cursor-help bg-green-50 text-green-700 border-green-300">
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    {anomaly.suggestedCorrection.fieldToFix === 'current' 
                                      ? `Atual → ${anomaly.suggestedCorrection.currentValue?.toLocaleString('pt-BR')}`
                                      : `Anterior → ${anomaly.suggestedCorrection.previousValue?.toLocaleString('pt-BR')}`
                                    }
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{anomaly.suggestedCorrection.source}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleSaveEdit(anomaly)}
                                  disabled={isSaving}
                                >
                                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="icon" onClick={handleCancelEdit}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                {anomaly.suggestedCorrection && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleApplySuggestion(anomaly)}
                                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                        >
                                          <CheckCheck className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Aplicar correção sugerida</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleStartEdit(anomaly)}>
                                        <Edit2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Editar manualmente</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Histórico de Alertas de Inconsistência</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchAlerts} disabled={loadingAlerts}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loadingAlerts && "animate-spin")} />
              Atualizar
            </Button>
          </CardHeader>
          <CardContent>
            {loadingAlerts ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum alerta de inconsistência registrado.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Anterior</TableHead>
                    <TableHead className="text-right">Atual</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Resolução</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.map(alert => (
                    <TableRow key={alert.id}>
                      <TableCell>{alert.reading_date}</TableCell>
                      <TableCell>
                        <span className="font-bold text-primary">{alert.vehicle_code}</span>
                        {alert.vehicle_name && (
                          <span className="text-muted-foreground text-xs block">{alert.vehicle_name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {alert.value_type === 'horimeter' ? 'Horímetro' : 'KM'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{alert.previous_value?.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className="text-right">{alert.current_value?.toLocaleString('pt-BR')}</TableCell>
                      <TableCell className={cn(
                        "text-right font-medium",
                        alert.difference < 0 ? "text-destructive" : ""
                      )}>
                        {alert.difference?.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        {alert.status === 'resolved' ? (
                          <Badge className="bg-green-500">Resolvido</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500 text-amber-600">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {alert.resolution_notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Auto-fix Results Dialog */}
      <Dialog open={showAutoFixDialog} onOpenChange={setShowAutoFixDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Correções Aplicadas
            </DialogTitle>
            <DialogDescription>
              Resumo das correções automáticas realizadas.
            </DialogDescription>
          </DialogHeader>
          
          {autoFixResults && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{autoFixResults.total}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{autoFixResults.fixed}</p>
                  <p className="text-sm text-muted-foreground">Corrigidos</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-destructive">{autoFixResults.errors}</p>
                  <p className="text-sm text-muted-foreground">Erros</p>
                </div>
              </div>

              {autoFixResults.details.length > 0 && (
                <div className="max-h-60 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Campo</TableHead>
                        <TableHead className="text-right">Antes</TableHead>
                        <TableHead className="text-right">Depois</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {autoFixResults.details.map((detail, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{detail.vehicleCode}</TableCell>
                          <TableCell>{detail.date}</TableCell>
                          <TableCell>{detail.field}</TableCell>
                          <TableCell className="text-right">{detail.oldValue.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right text-green-600">{detail.newValue.toLocaleString('pt-BR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowAutoFixDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
