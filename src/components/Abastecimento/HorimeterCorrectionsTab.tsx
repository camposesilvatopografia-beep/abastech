import { useState, useMemo, useCallback, useEffect } from 'react';
import { format, parse, isValid, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
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

type DateFilterType = 'all' | 'today' | 'date' | 'period';

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
    previousValue?: number;
    currentValue?: number;
    fieldToFix: 'previous' | 'current';
    source: string;
    sourceDate: string;
    correctionType?: 'current_extra_digit' | 'previous_missing_digit' | 'decimal_shift' | 'estimated_interval' | 'from_sheet';
  };
}

export function HorimeterCorrectionsTab({ data, refetch, loading }: HorimeterCorrectionsTabProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
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
  const [correctedRowIds, setCorrectedRowIds] = useState<Set<string>>(new Set());
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch audit logs
  const fetchAuditLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const { data: logs, error } = await supabase
        .from('correction_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) {
        console.error('Error fetching audit logs:', error);
      } else {
        setAuditLogs(logs || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  // Fetch logs when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  // Date filter function
  const isDateInFilter = useCallback((dateStr: string): boolean => {
    const recordDate = parseDate(dateStr);
    if (!recordDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateFilterType) {
      case 'all':
        return true;
      case 'today':
        const recordDay = new Date(recordDate);
        recordDay.setHours(0, 0, 0, 0);
        return recordDay.getTime() === today.getTime();
      case 'date':
        if (!selectedDate) return true;
        const selected = new Date(selectedDate);
        selected.setHours(0, 0, 0, 0);
        const record = new Date(recordDate);
        record.setHours(0, 0, 0, 0);
        return record.getTime() === selected.getTime();
      case 'period':
        if (!startDate || !endDate) return true;
        return isWithinInterval(recordDate, {
          start: startOfDay(startDate),
          end: endOfDay(endDate),
        });
      default:
        return true;
    }
  }, [dateFilterType, selectedDate, startDate, endDate]);

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

  // Function to intelligently find the correct value for an anomaly
  const findCorrectPreviousValue = useCallback((anomaly: AnomalyRecord): AnomalyRecord['suggestedCorrection'] | null => {
    const records = vehicleRecordsMap.get(anomaly.vehicleCode);
    if (!records || records.length < 2) return null;
    
    const isVehicle = anomaly.category === 'VEICULO';
    const anomalyDate = parseDate(anomaly.date);
    const anomalyTime = parseTime(anomaly.time);
    if (!anomalyDate) return null;
    
    const currentValue = isVehicle ? anomaly.kmCurrent : anomaly.horimeterCurrent;
    const previousValue = isVehicle ? anomaly.kmPrevious : anomaly.horimeterPrevious;
    
    // Find the record immediately before this one
    let previousRecord = null;
    let nextRecord = null;
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.rowIndex === anomaly.rowIndex) continue;
      
      const recordDate = record.dateObj;
      const isBefore = recordDate.getTime() < anomalyDate.getTime() || 
          (recordDate.getTime() === anomalyDate.getTime() && record.timeMinutes < anomalyTime);
      
      if (isBefore && !previousRecord) {
        previousRecord = record;
      } else if (!isBefore) {
        nextRecord = record;
      }
    }
    
    const prevValue = previousRecord ? (isVehicle ? previousRecord.km : previousRecord.horimeter) : 0;
    const nextValue = nextRecord ? (isVehicle ? nextRecord.km : nextRecord.horimeter) : 0;
    const avgInterval = anomaly.avgInterval || 0;
    
    // SMART CORRECTION LOGIC
    // Case 1: High interval - check if current value might have extra digit (typing error)
    if (anomaly.issueType === 'high_interval' && currentValue > 0 && prevValue > 0) {
      // Try dividing current by 10 (extra digit typed in CURRENT)
      const currentDiv10 = currentValue / 10;
      const intervalIfDiv10 = currentDiv10 - prevValue;
      
      // If dividing by 10 gives a reasonable interval (positive and within 3x average)
      if (intervalIfDiv10 > 0 && (avgInterval <= 0 || intervalIfDiv10 < avgInterval * 3)) {
        // Suggest correcting the CURRENT value (remove extra digit)
        return {
          currentValue: Math.round(currentDiv10 * 100) / 100,
          fieldToFix: 'current' as const,
          source: 'Correção inteligente (valor atual ÷10)',
          sourceDate: anomaly.date,
          correctionType: 'current_extra_digit',
        };
      }
      
      // Try multiplying previous by 10 (missing digit in previous)
      const prevTimes10 = prevValue * 10;
      const intervalIfPrevTimes10 = currentValue - prevTimes10;
      
      if (intervalIfPrevTimes10 > 0 && (avgInterval <= 0 || intervalIfPrevTimes10 < avgInterval * 3)) {
        return {
          previousValue: Math.round(prevTimes10 * 100) / 100,
          fieldToFix: 'previous' as const,
          source: 'Correção inteligente (anterior ×10)',
          sourceDate: previousRecord?.date || anomaly.date,
          correctionType: 'previous_missing_digit',
        };
      }
      
      // Check if decimal point was placed wrong in CURRENT (e.g., 889953.90 should be 88995.39)
      const currentDecimalShift = currentValue / 10;
      const intervalWithShift = currentDecimalShift - prevValue;
      
      if (intervalWithShift > 0 && intervalWithShift < (avgInterval > 0 ? avgInterval * 2 : 200)) {
        return {
          currentValue: Math.round(currentDecimalShift * 100) / 100,
          fieldToFix: 'current' as const,
          source: 'Correção inteligente (ponto decimal)',
          sourceDate: anomaly.date,
          correctionType: 'decimal_shift',
        };
      }
    }
    
    // Case 2: Negative interval - the previous value is higher than current
    if (anomaly.issueType === 'negative_value') {
      // If we have a next record, use a value that makes sense between current and next
      if (nextRecord && nextValue > 0) {
        const suggestedPrev = currentValue - (avgInterval > 0 ? avgInterval : 50);
        if (suggestedPrev > 0) {
          return {
            previousValue: Math.round(suggestedPrev * 100) / 100,
            fieldToFix: 'previous' as const,
            source: 'Correção inteligente (intervalo estimado)',
            sourceDate: previousRecord?.date || '',
            correctionType: 'estimated_interval',
          };
        }
      }
      
      // Otherwise, just use the real previous record value
      if (previousRecord && prevValue > 0 && prevValue < currentValue) {
        return {
          previousValue: prevValue,
          fieldToFix: 'previous' as const,
          source: 'Registro anterior na planilha',
          sourceDate: previousRecord.date,
          correctionType: 'from_sheet',
        };
      }
    }
    
    // Case 3: Zero previous - get from the actual previous record
    if (anomaly.issueType === 'zero_previous' && previousRecord && prevValue > 0) {
      return {
        previousValue: prevValue,
        fieldToFix: 'previous' as const,
        source: 'Registro anterior na planilha',
        sourceDate: previousRecord.date,
        correctionType: 'from_sheet',
      };
    }
    
    // Fallback: use the actual previous record if available and different from current recorded previous
    if (previousRecord && prevValue > 0 && Math.abs(prevValue - previousValue) > 1) {
      return {
        previousValue: prevValue,
        fieldToFix: 'previous' as const,
        source: 'Planilha',
        sourceDate: previousRecord.date,
        correctionType: 'from_sheet',
      };
    }
    
    return null;
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

  // Get current user from localStorage
  const getCurrentUser = (): string => {
    try {
      const fieldUser = localStorage.getItem('fieldUser');
      if (fieldUser) {
        const parsed = JSON.parse(fieldUser);
        return parsed.name || parsed.username || 'Campo';
      }
      const systemUser = localStorage.getItem('systemUser');
      if (systemUser) {
        const parsed = JSON.parse(systemUser);
        return parsed.name || parsed.username || 'Admin';
      }
    } catch {
      // ignore
    }
    return 'Sistema';
  };

  // Save audit log for a correction
  const saveAuditLog = async (
    anomaly: AnomalyRecord,
    fieldCorrected: string,
    oldValue: number,
    newValue: number,
    correctionType?: string,
    correctionSource: 'auto_fix' | 'manual' = 'auto_fix'
  ) => {
    try {
      const appliedBy = getCurrentUser();
      
      await supabase.from('correction_audit_logs').insert({
        vehicle_code: anomaly.vehicleCode,
        vehicle_description: anomaly.vehicleDescription || null,
        record_date: anomaly.date,
        record_time: anomaly.time || null,
        field_corrected: fieldCorrected,
        old_value: oldValue,
        new_value: newValue,
        correction_type: correctionType || null,
        correction_source: correctionSource,
        applied_by: appliedBy,
        row_index: anomaly.rowIndex || null,
      });
      
      console.log('Audit log saved for', anomaly.vehicleCode, fieldCorrected);
    } catch (err) {
      console.error('Error saving audit log:', err);
    }
  };

  // Apply a single auto-fix (updates both Google Sheets and Supabase database)
  const applySingleAutoFix = async (anomaly: AnomalyRecord): Promise<boolean> => {
    if (!anomaly.suggestedCorrection) return false;
    
    try {
      const isVehicle = anomaly.category === 'VEICULO';
      // Create a copy of rawRow for the update
      const data: Record<string, any> = { ...anomaly.rawRow };
      delete data._rowIndex;
      
      const { fieldToFix, previousValue, currentValue, correctionType } = anomaly.suggestedCorrection;
      
      // Determine old and new values for audit log
      let oldValue: number;
      let newValue: number;
      let fieldCorrected: string;
      
      if (fieldToFix === 'current') {
        oldValue = isVehicle ? anomaly.kmCurrent : anomaly.horimeterCurrent;
        newValue = currentValue!;
        fieldCorrected = isVehicle ? 'km_current' : 'horimeter_current';
        
        if (isVehicle) {
          data['KM ATUAL'] = formatBrazilianNumber(currentValue!);
        } else {
          data['HORIMETRO ATUAL'] = formatBrazilianNumber(currentValue!);
        }
      } else {
        oldValue = isVehicle ? anomaly.kmPrevious : anomaly.horimeterPrevious;
        newValue = previousValue!;
        fieldCorrected = isVehicle ? 'km_previous' : 'horimeter_previous';
        
        if (isVehicle) {
          data['KM ANTERIOR'] = formatBrazilianNumber(previousValue!);
        } else {
          data['HORIMETRO ANTERIOR'] = formatBrazilianNumber(previousValue!);
        }
      }
      
      console.log('Applying fix to row', anomaly.rowIndex, 'with data:', data);
      
      // Update Google Sheets - use 'data' property as expected by edge function
      const { data: responseData, error: sheetError } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'update',
          sheetName: 'AbastecimentoCanteiro01',
          rowIndex: anomaly.rowIndex,
          data, // Edge function expects 'data' not 'rowData'
        },
      });
      
      if (sheetError) {
        console.error('Error updating Google Sheets:', sheetError);
        toast.error(`Erro ao atualizar planilha: ${sheetError.message}`);
        return false;
      }
      
      console.log('Google Sheets update response:', responseData);
      
      // Also update the Supabase database (field_fuel_records)
      const dateFormatted = anomaly.date;
      const dateParts = dateFormatted.split('/');
      const isoDate = dateParts.length === 3 
        ? `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`
        : null;
      
      if (isoDate) {
        const dbUpdate: Record<string, number | null> = {};
        
        if (fieldToFix === 'current') {
          if (isVehicle) {
            dbUpdate.km_current = currentValue!;
          } else {
            dbUpdate.horimeter_current = currentValue!;
          }
        } else {
          if (isVehicle) {
            dbUpdate.km_previous = previousValue!;
          } else {
            dbUpdate.horimeter_previous = previousValue!;
          }
        }
        
        const { data: dbData, error: dbError } = await supabase
          .from('field_fuel_records')
          .update(dbUpdate)
          .eq('vehicle_code', anomaly.vehicleCode)
          .eq('record_date', isoDate)
          .eq('record_time', anomaly.time)
          .select();
        
        if (dbError) {
          console.error('Error updating database:', dbError);
        } else {
          console.log('Database updated successfully:', dbData);
        }
      }
      
      // Save audit log
      await saveAuditLog(anomaly, fieldCorrected, oldValue, newValue, correctionType, 'auto_fix');
      
      toast.success(`Correção aplicada: ${anomaly.vehicleCode} - ${fieldCorrected}`);
      
      return true;
    } catch (err) {
      console.error('Error applying fix:', err);
      toast.error('Erro ao aplicar correção');
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
      details: [] as { vehicleCode: string; date: string; oldValue: number; newValue: number; source: string; fieldFixed: string }[],
    };
    
    for (const anomaly of fixableAnomalies) {
      const isVehicle = anomaly.category === 'VEICULO';
      const correction = anomaly.suggestedCorrection!;
      const fieldFixed = correction.fieldToFix === 'current' 
        ? (isVehicle ? 'Km Atual' : 'Hor. Atual')
        : (isVehicle ? 'Km Anterior' : 'Hor. Anterior');
      const oldValue = correction.fieldToFix === 'current'
        ? (isVehicle ? anomaly.kmCurrent : anomaly.horimeterCurrent)
        : (isVehicle ? anomaly.kmPrevious : anomaly.horimeterPrevious);
      const newValue = correction.fieldToFix === 'current' 
        ? correction.currentValue!
        : correction.previousValue!;
      
      const success = await applySingleAutoFix(anomaly);
      if (success) {
        results.fixed++;
        results.details.push({
          vehicleCode: anomaly.vehicleCode,
          date: anomaly.date,
          oldValue,
          newValue,
          source: correction.source,
          fieldFixed,
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

  // Filter anomalies by severity and date, excluding corrected ones
  const displayedAnomalies = useMemo(() => {
    const source = anomaliesWithSuggestions.length > 0 ? anomaliesWithSuggestions : anomalies;
    return source.filter(a => {
      // Exclude corrected items
      const rowId = `${a.vehicleCode}-${a.date}-${a.time}`;
      if (correctedRowIds.has(rowId)) return false;
      // Apply date filter
      if (!isDateInFilter(a.date)) return false;
      // Apply severity filter
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      return true;
    });
  }, [anomalies, anomaliesWithSuggestions, severityFilter, isDateInFilter, correctedRowIds]);

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
      const isVehicle = anomaly.category === 'VEICULO';
      
      // Build the updated row data
      const data: Record<string, any> = { ...anomaly.rawRow };
      delete data._rowIndex;
      
      data['HORIMETRO ANTERIOR'] = editData.horimeterPrevious;
      data['HORIMETRO ATUAL'] = editData.horimeterCurrent;
      data['KM ANTERIOR'] = editData.kmPrevious;
      data['KM ATUAL'] = editData.kmCurrent;

      // Update Google Sheets
      const { error: sheetError } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'update',
          sheetName: 'AbastecimentoCanteiro01',
          rowIndex: anomaly.rowIndex,
          data,
        },
      });

      if (sheetError) {
        console.error('Error updating Google Sheets:', sheetError);
        throw sheetError;
      }

      // Update Supabase database
      const dateFormatted = anomaly.date;
      const dateParts = dateFormatted.split('/');
      const isoDate = dateParts.length === 3 
        ? `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`
        : null;
      
      if (isoDate) {
        const newHorimeterPrevious = parseNumber(editData.horimeterPrevious);
        const newHorimeterCurrent = parseNumber(editData.horimeterCurrent);
        const newKmPrevious = parseNumber(editData.kmPrevious);
        const newKmCurrent = parseNumber(editData.kmCurrent);
        
        const dbUpdate: Record<string, number | null> = {
          horimeter_previous: newHorimeterPrevious || null,
          horimeter_current: newHorimeterCurrent || null,
          km_previous: newKmPrevious || null,
          km_current: newKmCurrent || null,
        };
        
        const { error: dbError } = await supabase
          .from('field_fuel_records')
          .update(dbUpdate)
          .eq('vehicle_code', anomaly.vehicleCode)
          .eq('record_date', isoDate)
          .eq('record_time', anomaly.time);
        
        if (dbError) {
          console.error('Error updating database:', dbError);
        }
        
        // Save audit logs for all changed fields
        if (isVehicle) {
          if (newKmPrevious !== anomaly.kmPrevious) {
            await saveAuditLog(anomaly, 'km_previous', anomaly.kmPrevious, newKmPrevious, undefined, 'manual');
          }
          if (newKmCurrent !== anomaly.kmCurrent) {
            await saveAuditLog(anomaly, 'km_current', anomaly.kmCurrent, newKmCurrent, undefined, 'manual');
          }
        } else {
          if (newHorimeterPrevious !== anomaly.horimeterPrevious) {
            await saveAuditLog(anomaly, 'horimeter_previous', anomaly.horimeterPrevious, newHorimeterPrevious, undefined, 'manual');
          }
          if (newHorimeterCurrent !== anomaly.horimeterCurrent) {
            await saveAuditLog(anomaly, 'horimeter_current', anomaly.horimeterCurrent, newHorimeterCurrent, undefined, 'manual');
          }
        }
      }

      toast.success('Registro corrigido com sucesso!');
      markAsCorrected(anomaly);
      setEditingRowIndex(null);
      setEditData(null);
    } catch (err) {
      console.error('Error saving correction:', err);
      toast.error('Erro ao salvar correção');
    } finally {
      setIsSaving(false);
    }
  };

  // Mark an anomaly as corrected (removes from pending list)
  const markAsCorrected = (anomaly: AnomalyRecord) => {
    const rowId = `${anomaly.vehicleCode}-${anomaly.date}-${anomaly.time}`;
    setCorrectedRowIds(prev => new Set([...prev, rowId]));
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
      markAsCorrected(anomaly);
      // Optionally refetch to update data, but item will be hidden immediately
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
      {/* Tab Navigation */}
      <div className="flex items-center gap-4 border-b pb-2">
        <Button
          variant={activeTab === 'pending' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('pending')}
          className="gap-2"
        >
          <ListChecks className="h-4 w-4" />
          Pendentes
          {displayedAnomalies.length > 0 && (
            <Badge variant="secondary" className="ml-1">{displayedAnomalies.length}</Badge>
          )}
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('history')}
          className="gap-2"
        >
          <History className="h-4 w-4" />
          Histórico de Correções
          {auditLogs.length > 0 && (
            <Badge variant="outline" className="ml-1">{auditLogs.length}</Badge>
          )}
        </Button>
      </div>

      {activeTab === 'pending' && (
        <>
          {/* Date Filter */}
          <div className="flex flex-wrap items-center gap-2 p-4 bg-muted/50 rounded-lg">
            <span className="text-sm font-medium text-muted-foreground">Período:</span>
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
            variant={dateFilterType === 'date' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDateFilterType('date')}
          >
            <CalendarIcon className="h-4 w-4 mr-1" />
            Data
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

        {/* Single Date Picker */}
        {dateFilterType === 'date' && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="ml-2">
                <CalendarIcon className="h-4 w-4 mr-2" />
                {selectedDate ? format(selectedDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecionar'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        )}

        {/* Period Date Pickers */}
        {dateFilterType === 'period' && (
          <div className="flex items-center gap-2 ml-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="border-green-500">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : 'Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
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
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                  locale={ptBR}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

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
                      {hasSuggestion && anomaly.suggestedCorrection!.fieldToFix === 'previous' ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-green-600 font-bold flex items-center justify-end gap-1">
                                <Sparkles className="h-3 w-3" />
                                {formatBrazilianNumber(anomaly.suggestedCorrection!.previousValue!)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">Corrigir ANTERIOR</p>
                              <p className="text-xs">{anomaly.suggestedCorrection!.source}</p>
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
                      ) : hasSuggestion && anomaly.suggestedCorrection!.fieldToFix === 'current' ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <div className="flex flex-col items-end">
                                <span className="text-muted-foreground line-through text-xs">
                                  {formatBrazilianNumber(isVehicle ? anomaly.kmCurrent : anomaly.horimeterCurrent)}
                                </span>
                                <span className="text-purple-600 font-bold flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  {formatBrazilianNumber(anomaly.suggestedCorrection!.currentValue!)}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="font-medium">Corrigir ATUAL</p>
                              <p className="text-xs">{anomaly.suggestedCorrection!.source}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Correções Aplicadas
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAuditLogs}
              disabled={loadingLogs}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", loadingLogs && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : auditLogs.length === 0 ? (
            <Card className="p-8 text-center">
              <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Nenhuma correção aplicada ainda.</p>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Campo</TableHead>
                    <TableHead className="text-right">Valor Anterior</TableHead>
                    <TableHead className="text-right">Valor Novo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Aplicado por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="text-sm">
                          <div>{format(new Date(log.created_at), 'dd/MM/yyyy', { locale: ptBR })}</div>
                          <div className="text-muted-foreground">{format(new Date(log.created_at), 'HH:mm', { locale: ptBR })}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{log.vehicle_code}</div>
                          {log.vehicle_description && (
                            <div className="text-xs text-muted-foreground">{log.vehicle_description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {log.field_corrected === 'horimeter_previous' && 'Hor. Anterior'}
                          {log.field_corrected === 'horimeter_current' && 'Hor. Atual'}
                          {log.field_corrected === 'km_previous' && 'Km Anterior'}
                          {log.field_corrected === 'km_current' && 'Km Atual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        {log.old_value ? formatBrazilianNumber(log.old_value) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-600 font-bold">
                        {formatBrazilianNumber(log.new_value)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.correction_source === 'auto_fix' ? 'default' : 'secondary'}>
                          {log.correction_source === 'auto_fix' ? 'Automático' : 'Manual'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.applied_by}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
