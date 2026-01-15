import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Fuel, 
  Save, 
  Truck, 
  User, 
  MapPin,
  Gauge,
  Droplet,
  Building2,
  Loader2,
  Wrench,
  Clock,
  Receipt,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  CalendarIcon,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { VehicleCombobox } from '@/components/ui/vehicle-combobox';
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AdminFuelRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type QuickEntryMode = 'normal' | 'arla_only' | 'lubrication_only' | 'filter_blow_only' | 'oil_only';

export function AdminFuelRecordModal({ open, onOpenChange, onSuccess }: AdminFuelRecordModalProps) {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const [isSaving, setIsSaving] = useState(false);
  
  // Quick entry mode
  const [quickEntryMode, setQuickEntryMode] = useState<QuickEntryMode>('normal');
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  
  // Form state
  const [recordType, setRecordType] = useState<'saida' | 'entrada'>('saida');
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [category, setCategory] = useState('');
  const [company, setCompany] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [workSite, setWorkSite] = useState('');
  const [horimeterPrevious, setHorimeterPrevious] = useState('');
  const [horimeterCurrent, setHorimeterCurrent] = useState('');
  const [kmPrevious, setKmPrevious] = useState('');
  const [kmCurrent, setKmCurrent] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelType, setFuelType] = useState('Diesel');
  const [arlaQuantity, setArlaQuantity] = useState('');
  const [location, setLocation] = useState('Tanque Canteiro 01');
  const [observations, setObservations] = useState('');
  
  // Equipment-specific fields
  const [oilType, setOilType] = useState('');
  const [oilQuantity, setOilQuantity] = useState('');
  const [filterBlowQuantity, setFilterBlowQuantity] = useState('');
  const [lubricant, setLubricant] = useState('');
  
  // Entry-specific fields
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  
  // Date and time fields
  const [recordDate, setRecordDate] = useState<Date>(new Date());
  const [recordTime, setRecordTime] = useState('');
  
  // Database data
  const [oilTypes, setOilTypes] = useState<{ id: string; name: string }[]>([]);
  const [lubricants, setLubricants] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  // Location options
  const locationOptions = [
    'Tanque Canteiro 01',
    'Tanque Canteiro 02',
    'Comboio 01',
    'Comboio 02',
    'Comboio 03',
    'Posto Externo',
    'Outro',
  ];

  // Format number to Brazilian format (1.234,56)
  const formatBrazilianNumber = (value: string | number): string => {
    if (!value && value !== 0) return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value;
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Parse Brazilian format to number
  const parseBrazilianNumber = (value: string): number => {
    if (!value) return 0;
    const normalized = value.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
  };

  // Validation for horimeter/km
  const horimeterValidation = useMemo(() => {
    const current = parseBrazilianNumber(horimeterCurrent);
    const previous = parseBrazilianNumber(horimeterPrevious);
    
    if (!current || !previous) return { status: 'neutral', message: '' };
    
    if (current < previous) {
      return { 
        status: 'error', 
        message: `Valor atual (${formatBrazilianNumber(current)}) menor que anterior (${formatBrazilianNumber(previous)})` 
      };
    }
    
    const diff = current - previous;
    if (diff > 500) {
      return { 
        status: 'warning', 
        message: `Diferença alta: ${formatBrazilianNumber(diff)} horas` 
      };
    }
    
    return { 
      status: 'success', 
      message: `Diferença: ${formatBrazilianNumber(diff)} horas` 
    };
  }, [horimeterCurrent, horimeterPrevious]);

  const kmValidation = useMemo(() => {
    const current = parseBrazilianNumber(kmCurrent);
    const previous = parseBrazilianNumber(kmPrevious);
    
    if (!current || !previous) return { status: 'neutral', message: '' };
    
    if (current < previous) {
      return { 
        status: 'error', 
        message: `Valor atual (${formatBrazilianNumber(current)}) menor que anterior (${formatBrazilianNumber(previous)})` 
      };
    }
    
    const diff = current - previous;
    if (diff > 10000) {
      return { 
        status: 'warning', 
        message: `Diferença alta: ${formatBrazilianNumber(diff)} km` 
      };
    }
    
    return { 
      status: 'success', 
      message: `Diferença: ${formatBrazilianNumber(diff)} km` 
    };
  }, [kmCurrent, kmPrevious]);

  const getValidationIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // Fetch database data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [oilTypesRes, lubricantsRes, suppliersRes] = await Promise.all([
          supabase.from('oil_types').select('id, name').eq('active', true).order('name'),
          supabase.from('lubricants').select('id, name').eq('active', true).order('name'),
          supabase.from('suppliers').select('id, name').eq('active', true).order('name'),
        ]);
        
        if (oilTypesRes.data) setOilTypes(oilTypesRes.data);
        if (lubricantsRes.data) setLubricants(lubricantsRes.data);
        if (suppliersRes.data) setSuppliers(suppliersRes.data);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };
    
    if (open) {
      fetchData();
    }
  }, [open]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setQuickEntryMode('normal');
    setShowQuickOptions(false);
    setRecordType('saida');
    setVehicleCode('');
    setVehicleDescription('');
    setCategory('');
    setCompany('');
    setOperatorName('');
    setWorkSite('');
    setHorimeterPrevious('');
    setHorimeterCurrent('');
    setKmPrevious('');
    setKmCurrent('');
    setFuelQuantity('');
    setFuelType('Diesel');
    setArlaQuantity('');
    setLocation('Tanque Canteiro 01');
    setObservations('');
    setOilType('');
    setOilQuantity('');
    setFilterBlowQuantity('');
    setLubricant('');
    setSupplier('');
    setInvoiceNumber('');
    setUnitPrice('');
    setEntryLocation('');
    setRecordDate(new Date());
    setRecordTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  };

  // Transform vehicles for combobox
  const vehicleOptions = useMemo(() => {
    return vehiclesData.rows.map((v, idx) => ({
      id: String(idx),
      code: String(v['Codigo'] || v['CODIGO'] || v['Frota'] || v['FROTA'] || ''),
      name: String(v['Descricao'] || v['DESCRICAO'] || v['DESCRIÇÃO'] || v['Nome'] || ''),
      description: String(v['Descricao'] || v['DESCRICAO'] || v['DESCRIÇÃO'] || ''),
      category: String(v['Categoria'] || v['CATEGORIA'] || ''),
    }));
  }, [vehiclesData.rows]);

  // Handle vehicle selection
  const handleVehicleSelect = async (code: string) => {
    setVehicleCode(code);
    const vehicle = vehiclesData.rows.find(v => String(v['Codigo']) === code);
    if (vehicle) {
      setVehicleDescription(String(vehicle['Descricao'] || ''));
      setCategory(String(vehicle['Categoria'] || ''));
      setCompany(String(vehicle['Empresa'] || ''));
      setOperatorName(String(vehicle['Motorista'] || ''));
      setWorkSite(String(vehicle['Obra'] || ''));
      
      // Fetch previous horimeter/km
      await fetchPreviousValues(code);
    }
  };

  // Fetch previous horimeter/km from records - get the MOST RECENT from all sources (DB + Google Sheets)
  const fetchPreviousValues = async (vehicleCode: string) => {
    try {
      let maxHorimeter = 0;
      let maxKm = 0;

      // 1. Try from field_fuel_records (Supabase)
      const { data: fuelRecords } = await supabase
        .from('field_fuel_records')
        .select('horimeter_current, km_current, record_date, record_time, created_at')
        .eq('vehicle_code', vehicleCode)
        .eq('record_type', 'saida')
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(10);

      if (fuelRecords && fuelRecords.length > 0) {
        fuelRecords.forEach(record => {
          const horValue = Number(record.horimeter_current) || 0;
          const kmValue = Number(record.km_current) || 0;
          if (horValue > maxHorimeter) maxHorimeter = horValue;
          if (kmValue > maxKm) maxKm = kmValue;
        });
      }

      // 2. Try from horimeter_readings (Supabase)
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      if (vehicleData?.id) {
        const { data: horimeterRecords } = await supabase
          .from('horimeter_readings')
          .select('current_value, current_km, reading_date, created_at')
          .eq('vehicle_id', vehicleData.id)
          .order('reading_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(10);

        if (horimeterRecords && horimeterRecords.length > 0) {
          horimeterRecords.forEach(record => {
            const horValue = Number(record.current_value) || 0;
            const kmValue = Number(record.current_km) || 0;
            if (horValue > maxHorimeter) maxHorimeter = horValue;
            if (kmValue > maxKm) maxKm = kmValue;
          });
        }
      }

      // 3. Try from Google Sheets - AbastecimentoCanteiro01
      try {
        const abastecimentoResponse = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'read',
            sheetName: 'AbastecimentoCanteiro01',
          },
        });

        if (abastecimentoResponse.data?.rows) {
          const vehicleRows = abastecimentoResponse.data.rows.filter((row: any) => {
            const rowVehicle = String(row['VEICULO'] || row['Veiculo'] || '').trim().toUpperCase();
            return rowVehicle === vehicleCode.toUpperCase();
          });

          vehicleRows.forEach((row: any) => {
            const horValue = parseFloat(String(row['HORIMETRO ATUAL'] || row['Horimetro Atual'] || row['HOR_ATUAL'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
            const kmValue = parseFloat(String(row['KM ATUAL'] || row['Km Atual'] || row['KM_ATUAL'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
            if (horValue > maxHorimeter) maxHorimeter = horValue;
            if (kmValue > maxKm) maxKm = kmValue;
          });
        }
      } catch (sheetErr) {
        console.warn('Could not fetch from AbastecimentoCanteiro01 sheet:', sheetErr);
      }

      // 4. Try from Google Sheets - Horimetros
      try {
        const horimetrosResponse = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'read',
            sheetName: 'Horimetros',
          },
        });

        if (horimetrosResponse.data?.rows) {
          const vehicleRows = horimetrosResponse.data.rows.filter((row: any) => {
            const rowVehicle = String(row['Veiculo'] || row['VEICULO'] || row['Codigo'] || row['CODIGO'] || '').trim().toUpperCase();
            return rowVehicle === vehicleCode.toUpperCase();
          });

          vehicleRows.forEach((row: any) => {
            const horValue = parseFloat(String(row['Hor_Atual'] || row['HOR_ATUAL'] || row['Horimetro Atual'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
            const kmValue = parseFloat(String(row['Km_Atual'] || row['KM_ATUAL'] || row['Km Atual'] || '0').replace(/\./g, '').replace(',', '.')) || 0;
            if (horValue > maxHorimeter) maxHorimeter = horValue;
            if (kmValue > maxKm) maxKm = kmValue;
          });
        }
      } catch (sheetErr) {
        console.warn('Could not fetch from Horimetros sheet:', sheetErr);
      }

      // Set the highest values found from all sources
      if (maxHorimeter > 0) {
        setHorimeterPrevious(formatBrazilianNumber(maxHorimeter));
      }
      if (maxKm > 0) {
        setKmPrevious(formatBrazilianNumber(maxKm));
      }

      console.log(`Vehicle ${vehicleCode} - Max Horimeter: ${maxHorimeter}, Max KM: ${maxKm} (from DB + Sheets)`);
    } catch (err) {
      console.error('Error fetching previous values:', err);
    }
  };

  // Sync to Google Sheets
  const syncToGoogleSheets = async (recordData: Record<string, any>): Promise<boolean> => {
    try {
      const response = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'create',
          sheetName: 'AbastecimentoCanteiro01',
          data: recordData,
        },
      });

      return !response.error;
    } catch (err) {
      console.error('Sync to sheets failed:', err);
      return false;
    }
  };

  // Get quick entry mode label
  const getQuickModeLabel = (mode: QuickEntryMode): string => {
    switch (mode) {
      case 'arla_only': return 'Apenas ARLA';
      case 'lubrication_only': return 'Apenas Lubrificação';
      case 'filter_blow_only': return 'Apenas Sopra Filtro';
      case 'oil_only': return 'Apenas Completar Óleo';
      default: return 'Normal';
    }
  };

  // Save record
  const handleSave = async () => {
    // Quick entry mode validation
    if (quickEntryMode !== 'normal') {
      if (!vehicleCode) {
        toast.error('Selecione o veículo');
        return;
      }
      
      if (quickEntryMode === 'arla_only' && !arlaQuantity) {
        toast.error('Informe a quantidade de ARLA');
        return;
      }
      if (quickEntryMode === 'lubrication_only' && !lubricant) {
        toast.error('Selecione o lubrificante');
        return;
      }
      if (quickEntryMode === 'filter_blow_only' && !filterBlowQuantity) {
        toast.error('Informe a quantidade de Sopra Filtro');
        return;
      }
      if (quickEntryMode === 'oil_only' && (!oilType || !oilQuantity)) {
        toast.error('Selecione o tipo de óleo e informe a quantidade');
        return;
      }
    } else {
      // Normal mode validation
      if (recordType === 'saida') {
        if (!vehicleCode) {
          toast.error('Selecione o veículo');
          return;
        }
        // Validate horimeter if provided
        if (horimeterValidation.status === 'error') {
          toast.error('Horímetro atual deve ser maior que o anterior');
          return;
        }
        if (kmValidation.status === 'error') {
          toast.error('KM atual deve ser maior que o anterior');
          return;
        }
      } else {
        if (!supplier) {
          toast.error('Selecione o fornecedor');
          return;
        }
      }
    }

    setIsSaving(true);

    try {
      const selectedDate = recordDate;
      const dbRecordDate = format(selectedDate, 'yyyy-MM-dd');
      const dbRecordTime = recordTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const formattedDate = format(selectedDate, 'dd/MM/yyyy');

      // Prepare record for database
      const dbRecord = {
        record_type: quickEntryMode !== 'normal' ? 'saida' : recordType,
        vehicle_code: recordType === 'entrada' && quickEntryMode === 'normal' ? 'ENTRADA' : vehicleCode,
        vehicle_description: recordType === 'entrada' && quickEntryMode === 'normal' ? supplier : vehicleDescription,
        category: recordType === 'entrada' && quickEntryMode === 'normal' ? 'ENTRADA' : category,
        operator_name: recordType === 'entrada' && quickEntryMode === 'normal' ? '' : operatorName,
        company,
        work_site: workSite,
        horimeter_previous: parseBrazilianNumber(horimeterPrevious),
        horimeter_current: parseBrazilianNumber(horimeterCurrent),
        km_previous: parseBrazilianNumber(kmPrevious),
        km_current: parseBrazilianNumber(kmCurrent),
        fuel_quantity: parseFloat(fuelQuantity) || 0,
        fuel_type: fuelType,
        arla_quantity: parseFloat(arlaQuantity) || 0,
        location: recordType === 'entrada' && quickEntryMode === 'normal' ? entryLocation : location,
        observations: quickEntryMode !== 'normal' ? `[${getQuickModeLabel(quickEntryMode)}] ${observations}`.trim() : (observations || null),
        oil_type: oilType || null,
        oil_quantity: parseFloat(oilQuantity) || null,
        filter_blow: !!filterBlowQuantity,
        filter_blow_quantity: parseFloat(filterBlowQuantity) || null,
        lubricant: lubricant || null,
        supplier: supplier || null,
        invoice_number: invoiceNumber || null,
        unit_price: parseFloat(unitPrice.replace(/\./g, '').replace(',', '.')) || null,
        entry_location: entryLocation || null,
        record_date: dbRecordDate,
        record_time: dbRecordTime,
        synced_to_sheet: false,
      };

      // Insert into database
      const { error: dbError } = await supabase
        .from('field_fuel_records')
        .insert([dbRecord]);

      if (dbError) {
        console.error('Database insert error:', dbError);
        toast.error('Erro ao salvar registro');
        setIsSaving(false);
        return;
      }

      // Sync to Google Sheets
      const sheetData: Record<string, any> = {
        'DATA': formattedDate,
        'HORA': recordTime,
        'TIPO': recordType === 'entrada' && quickEntryMode === 'normal' ? 'Entrada' : 'Saída',
        'VEICULO': dbRecord.vehicle_code,
        'DESCRICAO': dbRecord.vehicle_description,
        'CATEGORIA': dbRecord.category,
        'MOTORISTA': operatorName,
        'EMPRESA': company,
        'OBRA': workSite,
        'HORIMETRO ANTERIOR': parseBrazilianNumber(horimeterPrevious) || '',
        'HORIMETRO ATUAL': parseBrazilianNumber(horimeterCurrent) || '',
        'KM ANTERIOR': parseBrazilianNumber(kmPrevious) || '',
        'KM ATUAL': parseBrazilianNumber(kmCurrent) || '',
        'QUANTIDADE': parseFloat(fuelQuantity) || 0,
        'QUANTIDADE DE ARLA': parseFloat(arlaQuantity) || '',
        'TIPO DE COMBUSTIVEL': fuelType,
        'LOCAL': dbRecord.location,
        'OBSERVAÇÃO': dbRecord.observations || '',
        'TIPO DE ÓLEO': oilType || '',
        'QUANTIDADE DE ÓLEO': parseFloat(oilQuantity) || '',
        'SOPRA FILTRO': filterBlowQuantity || '',
        'LUBRIFICANTE': lubricant || '',
        'FORNECEDOR': supplier || '',
        'NOTA FISCAL': invoiceNumber || '',
        'VALOR UNITÁRIO': parseFloat(unitPrice.replace(/\./g, '').replace(',', '.')) || '',
        'LOCAL DE ENTRADA': entryLocation || '',
      };

      // Sync to Google Sheets immediately
      toast.loading('Sincronizando com planilha...', { id: 'sync-sheet' });
      const syncSuccess = await syncToGoogleSheets(sheetData);

      if (syncSuccess) {
        await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('record_date', dbRecordDate)
          .eq('record_time', dbRecordTime)
          .eq('vehicle_code', dbRecord.vehicle_code);
        
        toast.success('Registro salvo e sincronizado com a planilha!', { id: 'sync-sheet' });
      } else {
        toast.warning('Registro salvo, mas sincronização com planilha falhou. Tentando novamente...', { id: 'sync-sheet' });
        // Retry sync once
        const retrySuccess = await syncToGoogleSheets(sheetData);
        if (retrySuccess) {
          await supabase
            .from('field_fuel_records')
            .update({ synced_to_sheet: true })
            .eq('record_date', dbRecordDate)
            .eq('record_time', dbRecordTime)
            .eq('vehicle_code', dbRecord.vehicle_code);
          toast.success('Sincronização concluída!', { id: 'sync-sheet' });
        } else {
          toast.error('Sincronização falhou. Registro será sincronizado posteriormente.', { id: 'sync-sheet' });
        }
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar registro');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-background">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className={cn(
              "p-2.5 rounded-lg",
              recordType === 'entrada' ? "bg-green-600 text-white" : "bg-red-600 text-white"
            )}>
              <Fuel className="h-5 w-5" />
            </div>
            Novo Apontamento (Admin)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                Data
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !recordDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {recordDate ? format(recordDate, "dd/MM/yyyy", { locale: ptBR }) : <span>Selecione...</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={recordDate}
                    onSelect={(date) => date && setRecordDate(date)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Hora
              </Label>
              <Input
                type="time"
                value={recordTime}
                onChange={(e) => setRecordTime(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          {/* Record Type */}
          <div className="space-y-2">
            <Label>Tipo de Registro</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={recordType === 'saida' ? 'default' : 'outline'}
                className={cn(
                  "flex-1",
                  recordType === 'saida' && "bg-red-600 hover:bg-red-700"
                )}
                onClick={() => { setRecordType('saida'); setQuickEntryMode('normal'); }}
              >
                Saída
              </Button>
              <Button
                type="button"
                variant={recordType === 'entrada' ? 'default' : 'outline'}
                className={cn(
                  "flex-1",
                  recordType === 'entrada' && "bg-green-600 hover:bg-green-700"
                )}
                onClick={() => { setRecordType('entrada'); setQuickEntryMode('normal'); }}
              >
                Entrada
              </Button>
            </div>
          </div>

          {/* Quick Entry Options - Only for Saida */}
          {recordType === 'saida' && (
            <Collapsible open={showQuickOptions} onOpenChange={setShowQuickOptions}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" className="w-full justify-between" size="sm">
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    Apontamento Rápido
                  </span>
                  {showQuickOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button
                    type="button"
                    variant={quickEntryMode === 'arla_only' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(quickEntryMode === 'arla_only' && "bg-blue-600 hover:bg-blue-700")}
                    onClick={() => setQuickEntryMode(quickEntryMode === 'arla_only' ? 'normal' : 'arla_only')}
                  >
                    <Droplet className="h-4 w-4 mr-1" />
                    Apenas ARLA
                  </Button>
                  <Button
                    type="button"
                    variant={quickEntryMode === 'lubrication_only' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(quickEntryMode === 'lubrication_only' && "bg-amber-600 hover:bg-amber-700")}
                    onClick={() => setQuickEntryMode(quickEntryMode === 'lubrication_only' ? 'normal' : 'lubrication_only')}
                  >
                    <Wrench className="h-4 w-4 mr-1" />
                    Lubrificação
                  </Button>
                  <Button
                    type="button"
                    variant={quickEntryMode === 'filter_blow_only' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(quickEntryMode === 'filter_blow_only' && "bg-orange-600 hover:bg-orange-700")}
                    onClick={() => setQuickEntryMode(quickEntryMode === 'filter_blow_only' ? 'normal' : 'filter_blow_only')}
                  >
                    Sopra Filtro
                  </Button>
                  <Button
                    type="button"
                    variant={quickEntryMode === 'oil_only' ? 'default' : 'outline'}
                    size="sm"
                    className={cn(quickEntryMode === 'oil_only' && "bg-purple-600 hover:bg-purple-700")}
                    onClick={() => setQuickEntryMode(quickEntryMode === 'oil_only' ? 'normal' : 'oil_only')}
                  >
                    Completar Óleo
                  </Button>
                </div>
                {quickEntryMode !== 'normal' && (
                  <div className="mt-2 p-2 bg-muted rounded-lg text-sm text-muted-foreground">
                    Modo: <span className="font-medium text-foreground">{getQuickModeLabel(quickEntryMode)}</span>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Quick Entry Forms */}
          {quickEntryMode !== 'normal' && (
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Veículo *
                </Label>
                <VehicleCombobox
                  vehicles={vehicleOptions}
                  value={vehicleCode}
                  onValueChange={handleVehicleSelect}
                  placeholder="Selecione o veículo..."
                />
              </div>

              {/* ARLA Only */}
              {quickEntryMode === 'arla_only' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-blue-500" />
                    Quantidade ARLA (L) *
                  </Label>
                  <Input
                    type="number"
                    value={arlaQuantity}
                    onChange={(e) => setArlaQuantity(e.target.value)}
                    placeholder="0"
                    step="0.01"
                    className="text-lg h-12"
                  />
                </div>
              )}

              {/* Lubrication Only */}
              {quickEntryMode === 'lubrication_only' && (
                <div className="space-y-2">
                  <Label>Lubrificante *</Label>
                  <Select value={lubricant} onValueChange={setLubricant}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {lubricants.map(lub => (
                        <SelectItem key={lub.id} value={lub.name}>{lub.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Filter Blow Only */}
              {quickEntryMode === 'filter_blow_only' && (
                <div className="space-y-2">
                  <Label>Quantidade Sopra Filtro *</Label>
                  <Input
                    type="number"
                    value={filterBlowQuantity}
                    onChange={(e) => setFilterBlowQuantity(e.target.value)}
                    placeholder="0"
                    className="text-lg h-12"
                  />
                </div>
              )}

              {/* Oil Only */}
              {quickEntryMode === 'oil_only' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo de Óleo *</Label>
                    <Select value={oilType} onValueChange={setOilType}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {oilTypes.map(oil => (
                          <SelectItem key={oil.id} value={oil.name}>{oil.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade (L) *</Label>
                    <Input
                      type="number"
                      value={oilQuantity}
                      onChange={(e) => setOilQuantity(e.target.value)}
                      placeholder="0"
                      step="0.1"
                      className="text-lg h-12"
                    />
                  </div>
                </div>
              )}

              {/* Location */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Local
                </Label>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locationOptions.map(loc => (
                      <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Normal Entry Forms */}
          {quickEntryMode === 'normal' && recordType === 'saida' && (
            <>
              {/* Vehicle Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Veículo *
                </Label>
                <VehicleCombobox
                  vehicles={vehicleOptions}
                  value={vehicleCode}
                  onValueChange={handleVehicleSelect}
                  placeholder="Selecione o veículo..."
                />
                {vehicleDescription && (
                  <p className="text-sm text-muted-foreground">{vehicleDescription}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Motorista/Operador
                  </Label>
                  <Input
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="Nome do operador"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Empresa
                  </Label>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Empresa"
                  />
                </div>
              </div>

              {/* Horimeter with validation */}
              <TooltipProvider>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-amber-500" />
                      Horímetro Anterior
                    </Label>
                    <Input
                      value={horimeterPrevious}
                      onChange={(e) => setHorimeterPrevious(e.target.value)}
                      placeholder="0,00"
                      className="border-amber-300 focus:border-amber-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Gauge className="h-4 w-4 text-amber-500" />
                      Horímetro Atual
                      {horimeterValidation.status !== 'neutral' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{getValidationIcon(horimeterValidation.status)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{horimeterValidation.message}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </Label>
                    <Input
                      value={horimeterCurrent}
                      onChange={(e) => setHorimeterCurrent(e.target.value)}
                      placeholder="0,00"
                      className={cn(
                        "border-amber-300 focus:border-amber-500",
                        horimeterValidation.status === 'error' && "border-red-500 focus:border-red-600",
                        horimeterValidation.status === 'warning' && "border-yellow-500 focus:border-yellow-600",
                        horimeterValidation.status === 'success' && "border-green-500 focus:border-green-600"
                      )}
                    />
                  </div>
                </div>

                {/* KM with validation */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      KM Anterior
                    </Label>
                    <Input
                      value={kmPrevious}
                      onChange={(e) => setKmPrevious(e.target.value)}
                      placeholder="0,00"
                      className="border-blue-300 focus:border-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      KM Atual
                      {kmValidation.status !== 'neutral' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{getValidationIcon(kmValidation.status)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{kmValidation.message}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </Label>
                    <Input
                      value={kmCurrent}
                      onChange={(e) => setKmCurrent(e.target.value)}
                      placeholder="0,00"
                      className={cn(
                        "border-blue-300 focus:border-blue-500",
                        kmValidation.status === 'error' && "border-red-500 focus:border-red-600",
                        kmValidation.status === 'warning' && "border-yellow-500 focus:border-yellow-600",
                        kmValidation.status === 'success' && "border-green-500 focus:border-green-600"
                      )}
                    />
                  </div>
                </div>
              </TooltipProvider>

              {/* Fuel */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-red-500" />
                    Quantidade (L)
                  </Label>
                  <Input
                    type="number"
                    value={fuelQuantity}
                    onChange={(e) => setFuelQuantity(e.target.value)}
                    placeholder="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Combustível</Label>
                  <Select value={fuelType} onValueChange={setFuelType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Diesel">Diesel</SelectItem>
                      <SelectItem value="Diesel S10">Diesel S10</SelectItem>
                      <SelectItem value="Gasolina">Gasolina</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ARLA and Location */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-blue-500" />
                    Quantidade ARLA (L)
                  </Label>
                  <Input
                    type="number"
                    value={arlaQuantity}
                    onChange={(e) => setArlaQuantity(e.target.value)}
                    placeholder="0"
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Local
                  </Label>
                  <Select value={location} onValueChange={setLocation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locationOptions.map(loc => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Additional Fields */}
              <div className="border-t pt-4">
                <Label className="text-sm font-medium mb-2 block">Campos Adicionais</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Tipo de Óleo
                    </Label>
                    <Select value={oilType} onValueChange={(val) => setOilType(val === '_none' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {oilTypes.map(oil => (
                          <SelectItem key={oil.id} value={oil.name}>{oil.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Qtd. Óleo (L)</Label>
                    <Input
                      type="number"
                      value={oilQuantity}
                      onChange={(e) => setOilQuantity(e.target.value)}
                      placeholder="0"
                      step="0.1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label>Lubrificante</Label>
                    <Select value={lubricant} onValueChange={(val) => setLubricant(val === '_none' ? '' : val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {lubricants.map(lub => (
                          <SelectItem key={lub.id} value={lub.name}>{lub.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Sopra Filtro (Qtd)</Label>
                    <Input
                      type="number"
                      value={filterBlowQuantity}
                      onChange={(e) => setFilterBlowQuantity(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Entrada Fields */}
          {quickEntryMode === 'normal' && recordType === 'entrada' && (
            <div className="space-y-4 p-4 bg-green-50/50 dark:bg-green-950/20 rounded-lg border-2 border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-700 dark:text-green-400">Dados da Entrada</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-semibold text-foreground">
                    <Building2 className="h-4 w-4 text-green-600" />
                    Fornecedor *
                  </Label>
                  <Select value={supplier} onValueChange={setSupplier}>
                    <SelectTrigger className="h-12 text-base border-2 border-green-300 dark:border-green-700 bg-background font-medium">
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-2 border-border">
                      {suppliers.map(sup => (
                        <SelectItem key={sup.id} value={sup.name} className="text-base py-3">{sup.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-semibold text-foreground">
                    <Receipt className="h-4 w-4 text-amber-600" />
                    Nota Fiscal
                  </Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Número da NF"
                    className="h-12 text-base border-2 border-input bg-background font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-semibold text-foreground">
                    <Fuel className="h-4 w-4 text-green-600" />
                    Quantidade (L) *
                  </Label>
                  <Input
                    type="number"
                    value={fuelQuantity}
                    onChange={(e) => setFuelQuantity(e.target.value)}
                    placeholder="0"
                    step="0.01"
                    className="h-12 text-lg border-2 border-green-300 dark:border-green-700 bg-background font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-semibold text-foreground">Valor Unitário (R$)</Label>
                  <Input
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="0,00"
                    className="h-12 text-base border-2 border-input bg-background font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-semibold text-foreground">Tipo de Combustível</Label>
                  <Select value={fuelType} onValueChange={setFuelType}>
                    <SelectTrigger className="h-12 text-base border-2 border-input bg-background font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-2 border-border">
                      <SelectItem value="Diesel" className="text-base py-3">Diesel</SelectItem>
                      <SelectItem value="Diesel S10" className="text-base py-3">Diesel S10</SelectItem>
                      <SelectItem value="Gasolina" className="text-base py-3">Gasolina</SelectItem>
                      <SelectItem value="ARLA" className="text-base py-3">ARLA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-semibold text-foreground">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    Local de Entrada *
                  </Label>
                  <Select value={entryLocation} onValueChange={setEntryLocation}>
                    <SelectTrigger className="h-12 text-base border-2 border-blue-300 dark:border-blue-700 bg-background font-medium">
                      <SelectValue placeholder="Selecione o local" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-2 border-border">
                      {locationOptions.map(loc => (
                        <SelectItem key={loc} value={loc} className="text-base py-3">{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 font-semibold text-foreground">
                  <Droplet className="h-4 w-4 text-blue-500" />
                  Quantidade ARLA (L) - Opcional
                </Label>
                <Input
                  type="number"
                  value={arlaQuantity}
                  onChange={(e) => setArlaQuantity(e.target.value)}
                  placeholder="0"
                  step="0.01"
                  className="h-12 text-base border-2 border-blue-200 dark:border-blue-800 bg-background font-medium"
                />
              </div>
            </div>
          )}

          {/* Observations */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observações adicionais..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Registro
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
