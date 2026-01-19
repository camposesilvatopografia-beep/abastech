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

  // Filter anomalies by severity
  const filteredAnomalies = useMemo(() => {
    if (severityFilter === 'all') return anomalies;
    return anomalies.filter(a => a.severity === severityFilter);
  }, [anomalies, severityFilter]);

  // Summary counts
  const summaryCounts = useMemo(() => ({
    total: anomalies.length,
    high: anomalies.filter(a => a.severity === 'high').length,
    medium: anomalies.filter(a => a.severity === 'medium').length,
    low: anomalies.filter(a => a.severity === 'low').length,
  }), [anomalies]);

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
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Mostrando {filteredAnomalies.length} de {anomalies.length} registros com inconsistências
        </div>
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

      {/* Anomalies Table */}
      {filteredAnomalies.length === 0 ? (
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
                <TableHead className="w-[100px]">Prioridade</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Problema</TableHead>
                <TableHead className="text-right">Anterior</TableHead>
                <TableHead className="text-right">Atual</TableHead>
                <TableHead className="text-right">Intervalo</TableHead>
                <TableHead className="text-right">Média</TableHead>
                <TableHead className="text-right">Desvio</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAnomalies.map((anomaly) => {
                const isEditing = editingRowIndex === anomaly.rowIndex;
                const isVehicle = anomaly.category === 'VEICULO';
                
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
                          anomaly.issueType === 'zero_previous' && "text-yellow-600 font-bold"
                        )}>
                          {formatBrazilianNumber(isVehicle ? anomaly.kmPrevious : anomaly.horimeterPrevious)}
                        </span>
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
                        anomaly.interval < 0 && "text-red-600 font-bold",
                        anomaly.deviationPercent > 200 && "text-yellow-600 font-bold"
                      )}>
                        {formatBrazilianNumber(anomaly.interval)} {isVehicle ? 'km' : 'h'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatBrazilianNumber(anomaly.avgInterval)} {isVehicle ? 'km' : 'h'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={cn(
                        anomaly.deviationPercent > 300 && "text-red-600",
                        anomaly.deviationPercent > 200 && anomaly.deviationPercent <= 300 && "text-yellow-600"
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
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleStartEdit(anomaly)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
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
