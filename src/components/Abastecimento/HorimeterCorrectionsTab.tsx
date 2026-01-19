import { useState, useMemo, useCallback } from 'react';
import { format, parse, isValid } from 'date-fns';
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
  Clock,
  Filter,
  Wand2,
  Sparkles,
  CheckCheck,
  Loader2,
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface HorimeterCorrectionsTabProps {
  data: {
    headers: string[];
    rows: Record<string, any>[];
  };
  refetch: () => void;
  loading: boolean;
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

function formatBrazilianNumber(value: number): string {
  if (!value && value !== 0) return '';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const date = new Date(year, month, day);
    if (isValid(date)) return date;
  }
  const parsed = new Date(dateStr);
  return isValid(parsed) ? parsed : null;
}

function parseTime(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':');
  if (parts.length >= 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

interface VehicleStats {
  vehicleCode: string;
  vehicleDescription: string;
  category: string;
  avgConsumption: number;
  avgInterval: number;
  totalRecords: number;
}

interface AnomalyRecord {
  rowIndex: number;
  vehicleCode: string;
  vehicleDescription: string;
  category: string;
  date: string;
  time: string;
  horimeterPrevious: number;
  horimeterCurrent: number;
  kmPrevious: number;
  kmCurrent: number;
  fuelQuantity: number;
  interval: number;
  avgInterval: number;
  deviationPercent: number;
  severity: 'high' | 'medium' | 'low';
  issueType: 'high_interval' | 'negative_value' | 'zero_previous' | 'suspicious_sequence';
  rawRow: Record<string, any>;
  suggestedCorrection?: {
    previousValue: number;
    source: string;
    sourceDate: string;
  };
}

export function HorimeterCorrectionsTab({ data, refetch, loading }: HorimeterCorrectionsTabProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
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
    details: { vehicleCode: string; date: string; oldValue: number; newValue: number; source: string }[];
  } | null>(null);
  const [anomaliesWithSuggestions, setAnomaliesWithSuggestions] = useState<AnomalyRecord[]>([]);
  const [isCalculatingSuggestions, setIsCalculatingSuggestions] = useState(false);

  // Calculate vehicle statistics (average intervals)
  const vehicleStats = useMemo(() => {
    const stats: Map<string, VehicleStats> = new Map();
    const vehicleRecords: Map<string, { date: Date; horimeter: number; km: number }[]> = new Map();

    // Group records by vehicle
    data.rows.forEach(row => {
      const vehicleCode = String(row['VEICULO'] || '').trim();
      if (!vehicleCode) return;

      const date = parseDate(String(row['DATA'] || ''));
      if (!date) return;

      const horimeterCurrent = parseNumber(row['HORIMETRO ATUAL']);
      const kmCurrent = parseNumber(row['KM ATUAL']);
      const category = String(row['CATEGORIA'] || '').toUpperCase();

      if (!vehicleRecords.has(vehicleCode)) {
        vehicleRecords.set(vehicleCode, []);
        stats.set(vehicleCode, {
          vehicleCode,
          vehicleDescription: String(row['DESCRICAO'] || ''),
          category,
          avgConsumption: 0,
          avgInterval: 0,
          totalRecords: 0,
        });
      }

      vehicleRecords.get(vehicleCode)!.push({
        date,
        horimeter: horimeterCurrent,
        km: kmCurrent,
      });
    });

    // Calculate average intervals
    vehicleRecords.forEach((records, vehicleCode) => {
      const stat = stats.get(vehicleCode)!;
      stat.totalRecords = records.length;

      if (records.length < 2) return;

      // Sort by date
      records.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Calculate intervals
      let totalInterval = 0;
      let intervalCount = 0;
      const isVehicle = stat.category === 'VEICULO';

      for (let i = 1; i < records.length; i++) {
        const prev = records[i - 1];
        const curr = records[i];
        
        const interval = isVehicle 
          ? curr.km - prev.km 
          : curr.horimeter - prev.horimeter;

        if (interval > 0 && interval < 50000) { // Ignore unrealistic values
          totalInterval += interval;
          intervalCount++;
        }
      }

      stat.avgInterval = intervalCount > 0 ? totalInterval / intervalCount : 0;
    });

    return stats;
  }, [data.rows]);

  // Identify anomalies
  const anomalies = useMemo(() => {
    const issues: AnomalyRecord[] = [];

    data.rows.forEach(row => {
      const vehicleCode = String(row['VEICULO'] || '').trim();
      if (!vehicleCode) return;

      const rowIndex = row._rowIndex as number;
      const category = String(row['CATEGORIA'] || '').toUpperCase();
      const isVehicle = category === 'VEICULO';
      
      const horimeterPrevious = parseNumber(row['HORIMETRO ANTERIOR']);
      const horimeterCurrent = parseNumber(row['HORIMETRO ATUAL']);
      const kmPrevious = parseNumber(row['KM ANTERIOR']);
      const kmCurrent = parseNumber(row['KM ATUAL']);
      const fuelQuantity = parseNumber(row['QUANTIDADE']);
      
      const stat = vehicleStats.get(vehicleCode);
      const avgInterval = stat?.avgInterval || 0;

      // Calculate current interval
      const interval = isVehicle 
        ? kmCurrent - kmPrevious 
        : horimeterCurrent - horimeterPrevious;

      // Check for various issues
      let issueType: AnomalyRecord['issueType'] | null = null;
      let severity: AnomalyRecord['severity'] = 'low';
      let deviationPercent = 0;

      // Issue 1: Negative interval (current < previous)
      if (interval < 0) {
        issueType = 'negative_value';
        severity = 'high';
        deviationPercent = -100;
      }
      // Issue 2: Zero previous value when current has value
      else if ((isVehicle && kmPrevious === 0 && kmCurrent > 0) || 
               (!isVehicle && horimeterPrevious === 0 && horimeterCurrent > 0)) {
        issueType = 'zero_previous';
        severity = 'medium';
        deviationPercent = 100;
      }
      // Issue 3: High interval compared to average
      else if (avgInterval > 0 && interval > 0) {
        deviationPercent = ((interval - avgInterval) / avgInterval) * 100;
        
        // More than 200% of average is suspicious
        if (deviationPercent > 200) {
          issueType = 'high_interval';
          severity = deviationPercent > 500 ? 'high' : deviationPercent > 300 ? 'medium' : 'low';
        }
      }

      if (issueType) {
        issues.push({
          rowIndex,
          vehicleCode,
          vehicleDescription: String(row['DESCRICAO'] || ''),
          category,
          date: String(row['DATA'] || ''),
          time: String(row['HORA'] || ''),
          horimeterPrevious,
          horimeterCurrent,
          kmPrevious,
          kmCurrent,
          fuelQuantity,
          interval,
          avgInterval,
          deviationPercent,
          severity,
          issueType,
          rawRow: row,
        });
      }
    });

    // Sort by severity (high first) then by date
    return issues.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      return b.date.localeCompare(a.date);
    });
  }, [data.rows, vehicleStats]);

  // Build a map of vehicle records sorted by date/time for finding previous values
  const vehicleRecordsMap = useMemo(() => {
    const map: Map<string, { date: string; time: string; dateObj: Date; timeMinutes: number; rowIndex: number; horimeter: number; km: number; category: string }[]> = new Map();
    
    data.rows.forEach(row => {
      const vehicleCode = String(row['VEICULO'] || '').trim();
      if (!vehicleCode) return;
      
      const dateStr = String(row['DATA'] || '');
      const timeStr = String(row['HORA'] || '');
      const dateObj = parseDate(dateStr);
      if (!dateObj) return;
      
      const horimeterCurrent = parseNumber(row['HORIMETRO ATUAL']);
      const kmCurrent = parseNumber(row['KM ATUAL']);
      const category = String(row['CATEGORIA'] || '').toUpperCase();
      const rowIndex = row._rowIndex as number;
      
      if (!map.has(vehicleCode)) {
        map.set(vehicleCode, []);
      }
      
      map.get(vehicleCode)!.push({
        date: dateStr,
        time: timeStr,
        dateObj,
        timeMinutes: parseTime(timeStr),
        rowIndex,
        horimeter: horimeterCurrent,
        km: kmCurrent,
        category,
      });
    });
    
    // Sort each vehicle's records by date and time (newest first)
    map.forEach((records, vehicleCode) => {
      records.sort((a, b) => {
        const dateDiff = b.dateObj.getTime() - a.dateObj.getTime();
        if (dateDiff !== 0) return dateDiff;
        return b.timeMinutes - a.timeMinutes;
      });
    });
    
    return map;
  }, [data.rows]);

  // Function to find the correct previous value for an anomaly
  const findCorrectPreviousValue = useCallback((anomaly: AnomalyRecord): AnomalyRecord['suggestedCorrection'] | null => {
    const records = vehicleRecordsMap.get(anomaly.vehicleCode);
    if (!records || records.length < 2) return null;
    
    const isVehicle = anomaly.category === 'VEICULO';
    const anomalyDate = parseDate(anomaly.date);
    const anomalyTime = parseTime(anomaly.time);
    if (!anomalyDate) return null;
    
    // Find the record immediately before this one
    let previousRecord = null;
    for (const record of records) {
      // Skip if it's the same record
      if (record.rowIndex === anomaly.rowIndex) continue;
      
      // Check if this record is before the anomaly
      const recordDate = record.dateObj;
      if (recordDate.getTime() < anomalyDate.getTime() || 
          (recordDate.getTime() === anomalyDate.getTime() && record.timeMinutes < anomalyTime)) {
        previousRecord = record;
        break; // Since records are sorted newest first, the first match is the immediate previous
      }
    }
    
    if (!previousRecord) return null;
    
    const previousValue = isVehicle ? previousRecord.km : previousRecord.horimeter;
    if (previousValue <= 0) return null;
    
    return {
      previousValue,
      source: 'Planilha',
      sourceDate: previousRecord.date,
    };
  }, [vehicleRecordsMap]);

  // Calculate suggestions for all anomalies
  const calculateSuggestions = useCallback(async () => {
    setIsCalculatingSuggestions(true);
    
    const withSuggestions = anomalies.map(anomaly => {
      const suggestion = findCorrectPreviousValue(anomaly);
      return {
        ...anomaly,
        suggestedCorrection: suggestion || undefined,
      };
    });
    
    setAnomaliesWithSuggestions(withSuggestions);
    setIsCalculatingSuggestions(false);
    
    const withValidSuggestions = withSuggestions.filter(a => a.suggestedCorrection);
    if (withValidSuggestions.length > 0) {
      toast.success(`${withValidSuggestions.length} correções sugeridas encontradas!`);
    } else {
      toast.info('Nenhuma correção automática disponível');
    }
  }, [anomalies, findCorrectPreviousValue]);

  // Apply a single auto-fix
  const applySingleAutoFix = async (anomaly: AnomalyRecord): Promise<boolean> => {
    if (!anomaly.suggestedCorrection) return false;
    
    try {
      const isVehicle = anomaly.category === 'VEICULO';
      const rowData: Record<string, any> = { ...anomaly.rawRow };
      delete rowData._rowIndex;
      
      if (isVehicle) {
        rowData['KM ANTERIOR'] = formatBrazilianNumber(anomaly.suggestedCorrection.previousValue);
      } else {
        rowData['HORIMETRO ANTERIOR'] = formatBrazilianNumber(anomaly.suggestedCorrection.previousValue);
      }
      
      const { error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'update',
          sheetName: 'AbastecimentoCanteiro01',
          rowIndex: anomaly.rowIndex,
          rowData,
        },
      });
      
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error applying fix:', err);
      return false;
    }
  };

  // Apply all auto-fixes
  const applyAllAutoFixes = async () => {
    const fixableAnomalies = anomaliesWithSuggestions.filter(a => a.suggestedCorrection);
    if (fixableAnomalies.length === 0) {
      toast.info('Nenhuma correção automática disponível');
      return;
    }
    
    setIsAutoFixing(true);
    const results = {
      total: fixableAnomalies.length,
      fixed: 0,
      errors: 0,
      details: [] as { vehicleCode: string; date: string; oldValue: number; newValue: number; source: string }[],
    };
    
    for (const anomaly of fixableAnomalies) {
      const isVehicle = anomaly.category === 'VEICULO';
      const oldValue = isVehicle ? anomaly.kmPrevious : anomaly.horimeterPrevious;
      
      const success = await applySingleAutoFix(anomaly);
      if (success) {
        results.fixed++;
        results.details.push({
          vehicleCode: anomaly.vehicleCode,
          date: anomaly.date,
          oldValue,
          newValue: anomaly.suggestedCorrection!.previousValue,
          source: anomaly.suggestedCorrection!.sourceDate,
        });
      } else {
        results.errors++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    setAutoFixResults(results);
    setShowAutoFixDialog(true);
    setIsAutoFixing(false);
    
    if (results.fixed > 0) {
      refetch();
    }
  };

  // Filter anomalies by severity
  const displayedAnomalies = useMemo(() => {
    const source = anomaliesWithSuggestions.length > 0 ? anomaliesWithSuggestions : anomalies;
    if (severityFilter === 'all') return source;
    return source.filter(a => a.severity === severityFilter);
  }, [anomalies, anomaliesWithSuggestions, severityFilter]);

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
    setEditingRowIndex(anomaly.rowIndex);
    setEditData({
      horimeterPrevious: formatBrazilianNumber(anomaly.horimeterPrevious),
      horimeterCurrent: formatBrazilianNumber(anomaly.horimeterCurrent),
      kmPrevious: formatBrazilianNumber(anomaly.kmPrevious),
      kmCurrent: formatBrazilianNumber(anomaly.kmCurrent),
    });
  };

  const handleCancelEdit = () => {
    setEditingRowIndex(null);
    setEditData(null);
  };

  const handleSaveEdit = async (anomaly: AnomalyRecord) => {
    if (!editData || !anomaly.rowIndex) {
      toast.error('Não foi possível identificar o registro');
      return;
    }

    setIsSaving(true);
    
    try {
      // Build the updated row data
      const rowData: Record<string, any> = { ...anomaly.rawRow };
      delete rowData._rowIndex;
      
      rowData['HORIMETRO ANTERIOR'] = editData.horimeterPrevious;
      rowData['HORIMETRO ATUAL'] = editData.horimeterCurrent;
      rowData['KM ANTERIOR'] = editData.kmPrevious;
      rowData['KM ATUAL'] = editData.kmCurrent;

      const { error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'update',
          sheetName: 'AbastecimentoCanteiro01',
          rowIndex: anomaly.rowIndex,
          rowData,
        },
      });

      if (error) throw error;

      toast.success('Registro corrigido com sucesso!');
      setEditingRowIndex(null);
      setEditData(null);
      refetch();
    } catch (err) {
      console.error('Error saving correction:', err);
      toast.error('Erro ao salvar correção');
    } finally {
      setIsSaving(false);
    }
  };

  // Apply suggestion to a single row
  const handleApplySuggestion = async (anomaly: AnomalyRecord) => {
    if (!anomaly.suggestedCorrection) {
      toast.error('Nenhuma sugestão disponível');
      return;
    }
    
    setIsSaving(true);
    const success = await applySingleAutoFix(anomaly);
    setIsSaving(false);
    
    if (success) {
      toast.success('Correção aplicada com sucesso!');
      refetch();
    } else {
      toast.error('Erro ao aplicar correção');
    }
  };

  const getSeverityBadge = (severity: AnomalyRecord['severity']) => {
    switch (severity) {
      case 'high':
        return <Badge className="bg-red-500 text-white">Alta</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-500 text-white">Média</Badge>;
      case 'low':
        return <Badge className="bg-blue-500 text-white">Baixa</Badge>;
    }
  };

  const getIssueDescription = (issueType: AnomalyRecord['issueType']) => {
    switch (issueType) {
      case 'negative_value':
        return 'Valor atual menor que anterior';
      case 'zero_previous':
        return 'Anterior zerado';
      case 'high_interval':
        return 'Intervalo muito alto';
      case 'suspicious_sequence':
        return 'Sequência suspeita';
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={cn(
            "cursor-pointer transition-all",
            severityFilter === 'all' && "ring-2 ring-primary"
          )}
          onClick={() => setSeverityFilter('all')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summaryCounts.total}</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all border-red-200",
            severityFilter === 'high' && "ring-2 ring-red-500"
          )}
          onClick={() => setSeverityFilter('high')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Alta Prioridade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{summaryCounts.high}</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all border-yellow-200",
            severityFilter === 'medium' && "ring-2 ring-yellow-500"
          )}
          onClick={() => setSeverityFilter('medium')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Média Prioridade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{summaryCounts.medium}</p>
          </CardContent>
        </Card>

        <Card 
          className={cn(
            "cursor-pointer transition-all border-blue-200",
            severityFilter === 'low' && "ring-2 ring-blue-500"
          )}
          onClick={() => setSeverityFilter('low')}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Baixa Prioridade
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{summaryCounts.low}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          Mostrando {displayedAnomalies.length} de {anomalies.length} registros com inconsistências
          {summaryCounts.fixable > 0 && (
            <span className="ml-2 text-green-600 font-medium">
              ({summaryCounts.fixable} com correção sugerida)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={calculateSuggestions}
            disabled={loading || isCalculatingSuggestions || anomalies.length === 0}
          >
            {isCalculatingSuggestions ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Analisar
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={applyAllAutoFixes}
            disabled={loading || isAutoFixing || summaryCounts.fixable === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            {isAutoFixing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-2" />
            )}
            Corrigir Tudo ({summaryCounts.fixable})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Auto-fix Results Dialog */}
      <Dialog open={showAutoFixDialog} onOpenChange={setShowAutoFixDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCheck className="h-5 w-5 text-green-600" />
              Resultado da Correção Automática
            </DialogTitle>
            <DialogDescription>
              {autoFixResults?.fixed} de {autoFixResults?.total} registros foram corrigidos
            </DialogDescription>
          </DialogHeader>
          
          {autoFixResults && autoFixResults.details.length > 0 && (
            <div className="space-y-2">
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Veículo</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Anterior (errado)</TableHead>
                      <TableHead className="text-right">Anterior (corrigido)</TableHead>
                      <TableHead>Fonte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {autoFixResults.details.map((detail, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{detail.vehicleCode}</TableCell>
                        <TableCell>{detail.date}</TableCell>
                        <TableCell className="text-right text-red-600 line-through">
                          {formatBrazilianNumber(detail.oldValue)}
                        </TableCell>
                        <TableCell className="text-right text-green-600 font-medium">
                          {formatBrazilianNumber(detail.newValue)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{detail.source}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowAutoFixDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anomalies Table */}
      {displayedAnomalies.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma inconsistência encontrada</h3>
          <p className="text-muted-foreground">
            {severityFilter !== 'all' 
              ? 'Não há registros com essa prioridade.'
              : 'Todos os registros de horímetro/km estão dentro dos padrões esperados.'}
          </p>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[80px]">Prioridade</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Problema</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead className="text-right">Sugestão</TableHead>
                <TableHead className="text-right">Atual</TableHead>
                <TableHead className="text-right">Desvio</TableHead>
                <TableHead className="w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedAnomalies.map((anomaly) => {
                const isEditing = editingRowIndex === anomaly.rowIndex;
                const isVehicle = anomaly.category === 'VEICULO';
                const hasSuggestion = !!anomaly.suggestedCorrection;
                
                return (
                  <TableRow 
                    key={anomaly.rowIndex}
                    className={cn(
                      anomaly.severity === 'high' && "bg-red-50 dark:bg-red-950/20",
                      anomaly.severity === 'medium' && "bg-yellow-50 dark:bg-yellow-950/20",
                    )}
                  >
                    <TableCell>{getSeverityBadge(anomaly.severity)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isVehicle ? (
                          <Truck className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Gauge className="h-4 w-4 text-amber-500" />
                        )}
                        <div>
                          <div className="font-medium">{anomaly.vehicleCode}</div>
                          <div className="text-xs text-muted-foreground">{anomaly.vehicleDescription}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{anomaly.date}</div>
                        <div className="text-muted-foreground">{anomaly.time}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {getIssueDescription(anomaly.issueType)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {isVehicle ? 'KM' : 'Horímetro'}: {formatBrazilianNumber(anomaly.interval)} {isVehicle ? 'km' : 'h'}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isEditing ? (
                        <Input
                          value={isVehicle ? editData?.kmPrevious : editData?.horimeterPrevious}
                          onChange={(e) => setEditData(prev => prev ? {
                            ...prev,
                            [isVehicle ? 'kmPrevious' : 'horimeterPrevious']: e.target.value,
                          } : null)}
                          className="w-28 h-8 text-right"
                        />
                      ) : (
                        <span className={cn(
                          anomaly.issueType === 'zero_previous' && "text-yellow-600 font-bold",
                          anomaly.issueType === 'negative_value' && "text-red-600 font-bold"
                        )}>
                          {formatBrazilianNumber(isVehicle ? anomaly.kmPrevious : anomaly.horimeterPrevious)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {hasSuggestion ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-green-600 font-bold flex items-center justify-end gap-1">
                                <Sparkles className="h-3 w-3" />
                                {formatBrazilianNumber(anomaly.suggestedCorrection!.previousValue)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Baseado no registro de {anomaly.suggestedCorrection!.sourceDate}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {isEditing ? (
                        <Input
                          value={isVehicle ? editData?.kmCurrent : editData?.horimeterCurrent}
                          onChange={(e) => setEditData(prev => prev ? {
                            ...prev,
                            [isVehicle ? 'kmCurrent' : 'horimeterCurrent']: e.target.value,
                          } : null)}
                          className="w-28 h-8 text-right"
                        />
                      ) : (
                        <span>
                          {formatBrazilianNumber(isVehicle ? anomaly.kmCurrent : anomaly.horimeterCurrent)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={cn(
                        anomaly.deviationPercent > 300 && "text-red-600",
                        anomaly.deviationPercent > 200 && anomaly.deviationPercent <= 300 && "text-yellow-600",
                        anomaly.deviationPercent < 0 && "text-red-600"
                      )}>
                        {anomaly.deviationPercent >= 0 ? '+' : ''}{Math.round(anomaly.deviationPercent)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-600"
                            onClick={() => handleSaveEdit(anomaly)}
                            disabled={isSaving}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          {hasSuggestion && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                                    onClick={() => handleApplySuggestion(anomaly)}
                                    disabled={isSaving}
                                  >
                                    <Wand2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Aplicar correção sugerida</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => handleStartEdit(anomaly)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
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
}
