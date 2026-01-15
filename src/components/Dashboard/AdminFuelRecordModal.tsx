import { useState, useEffect, useMemo } from 'react';
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
  X,
} from 'lucide-react';
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

export function AdminFuelRecordModal({ open, onOpenChange, onSuccess }: AdminFuelRecordModalProps) {
  const { data: vehiclesData, refetch: refetchVehicles } = useSheetData('Veiculo');
  const [isSaving, setIsSaving] = useState(false);
  
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
  };

  // Transform vehicles for combobox
  const vehicleOptions = useMemo(() => {
    return vehiclesData.rows.map((v, idx) => ({
      id: String(idx),
      code: String(v['Codigo'] || ''),
      name: String(v['Codigo'] || ''),
      description: String(v['Descricao'] || ''),
      category: String(v['Categoria'] || ''),
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

  // Fetch previous horimeter/km from records
  const fetchPreviousValues = async (vehicleCode: string) => {
    try {
      // Try from field_fuel_records
      const { data: fuelRecords } = await supabase
        .from('field_fuel_records')
        .select('horimeter_current, km_current')
        .eq('vehicle_code', vehicleCode)
        .eq('record_type', 'saida')
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(1);

      if (fuelRecords && fuelRecords.length > 0) {
        const horValue = Number(fuelRecords[0].horimeter_current) || 0;
        const kmValue = Number(fuelRecords[0].km_current) || 0;
        
        if (horValue > 0) setHorimeterPrevious(formatBrazilianNumber(horValue));
        if (kmValue > 0) setKmPrevious(formatBrazilianNumber(kmValue));
      }

      // Also try from horimeter_readings
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      if (vehicleData?.id) {
        const { data: horimeterRecords } = await supabase
          .from('horimeter_readings')
          .select('current_value, current_km')
          .eq('vehicle_id', vehicleData.id)
          .order('reading_date', { ascending: false })
          .limit(1);

        if (horimeterRecords && horimeterRecords.length > 0) {
          const horValue = Number(horimeterRecords[0].current_value) || 0;
          const kmValue = Number(horimeterRecords[0].current_km) || 0;
          
          if (horValue > 0 && !horimeterPrevious) {
            setHorimeterPrevious(formatBrazilianNumber(horValue));
          }
          if (kmValue > 0 && !kmPrevious) {
            setKmPrevious(formatBrazilianNumber(kmValue));
          }
        }
      }
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

  // Save record
  const handleSave = async () => {
    // Validate
    if (recordType === 'saida') {
      if (!vehicleCode) {
        toast.error('Selecione o veículo');
        return;
      }
    } else {
      if (!supplier) {
        toast.error('Selecione o fornecedor');
        return;
      }
    }

    setIsSaving(true);

    try {
      const now = new Date();
      const recordDate = now.toISOString().split('T')[0];
      const recordTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const formattedDate = now.toLocaleDateString('pt-BR');

      // Prepare record for database
      const dbRecord = {
        record_type: recordType,
        vehicle_code: recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
        vehicle_description: recordType === 'entrada' ? supplier : vehicleDescription,
        category: recordType === 'entrada' ? 'ENTRADA' : category,
        operator_name: recordType === 'entrada' ? '' : operatorName,
        company,
        work_site: workSite,
        horimeter_previous: parseBrazilianNumber(horimeterPrevious),
        horimeter_current: parseBrazilianNumber(horimeterCurrent),
        km_previous: parseBrazilianNumber(kmPrevious),
        km_current: parseBrazilianNumber(kmCurrent),
        fuel_quantity: parseFloat(fuelQuantity) || 0,
        fuel_type: fuelType,
        arla_quantity: parseFloat(arlaQuantity) || 0,
        location: recordType === 'entrada' ? entryLocation : location,
        observations: observations || null,
        oil_type: oilType || null,
        oil_quantity: parseFloat(oilQuantity) || null,
        filter_blow: !!filterBlowQuantity,
        filter_blow_quantity: parseFloat(filterBlowQuantity) || null,
        lubricant: lubricant || null,
        supplier: supplier || null,
        invoice_number: invoiceNumber || null,
        unit_price: parseFloat(unitPrice.replace(/\./g, '').replace(',', '.')) || null,
        entry_location: entryLocation || null,
        record_date: recordDate,
        record_time: recordTime,
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
        'TIPO': recordType === 'entrada' ? 'Entrada' : 'Saída',
        'VEICULO': recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
        'DESCRICAO': recordType === 'entrada' ? supplier : vehicleDescription,
        'CATEGORIA': recordType === 'entrada' ? 'ENTRADA' : category,
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
        'LOCAL': recordType === 'entrada' ? entryLocation : location,
        'OBSERVAÇÃO': observations || '',
        'TIPO DE ÓLEO': oilType || '',
        'QUANTIDADE DE ÓLEO': parseFloat(oilQuantity) || '',
        'SOPRA FILTRO': filterBlowQuantity || '',
        'LUBRIFICANTE': lubricant || '',
        'FORNECEDOR': supplier || '',
        'NOTA FISCAL': invoiceNumber || '',
        'VALOR UNITÁRIO': parseFloat(unitPrice.replace(/\./g, '').replace(',', '.')) || '',
        'LOCAL DE ENTRADA': entryLocation || '',
      };

      const syncSuccess = await syncToGoogleSheets(sheetData);

      if (syncSuccess) {
        // Update synced status
        await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('record_date', recordDate)
          .eq('record_time', recordTime)
          .eq('vehicle_code', dbRecord.vehicle_code);
      }

      toast.success('Registro salvo com sucesso!');
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Fuel className="h-5 w-5 text-primary" />
            Novo Apontamento (Admin)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                onClick={() => setRecordType('saida')}
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
                onClick={() => setRecordType('entrada')}
              >
                Entrada
              </Button>
            </div>
          </div>

          {recordType === 'saida' ? (
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
                {/* Operator */}
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

                {/* Company */}
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

              {/* Horimeter/KM */}
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
                  </Label>
                  <Input
                    value={horimeterCurrent}
                    onChange={(e) => setHorimeterCurrent(e.target.value)}
                    placeholder="0,00"
                    className="border-amber-300 focus:border-amber-500"
                  />
                </div>
              </div>

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
                  </Label>
                  <Input
                    value={kmCurrent}
                    onChange={(e) => setKmCurrent(e.target.value)}
                    placeholder="0,00"
                    className="border-blue-300 focus:border-blue-500"
                  />
                </div>
              </div>

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

              {/* ARLA */}
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
          ) : (
            <>
              {/* Entrada Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Fornecedor *
                  </Label>
                  <Select value={supplier} onValueChange={setSupplier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map(sup => (
                        <SelectItem key={sup.id} value={sup.name}>{sup.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Nota Fiscal
                  </Label>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Número da NF"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-green-500" />
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
                  <Label>Valor Unitário (R$)</Label>
                  <Input
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                      <SelectItem value="ARLA">ARLA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Local de Entrada
                  </Label>
                  <Select value={entryLocation} onValueChange={setEntryLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o local" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationOptions.map(loc => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Droplet className="h-4 w-4 text-blue-500" />
                  Quantidade ARLA (L) - Opcional
                </Label>
                <Input
                  type="number"
                  value={arlaQuantity}
                  onChange={(e) => setArlaQuantity(e.target.value)}
                  placeholder="0"
                  step="0.01"
                />
              </div>
            </>
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
