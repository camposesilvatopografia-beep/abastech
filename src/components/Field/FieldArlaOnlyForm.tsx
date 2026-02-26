import { useState, useRef, useMemo, useCallback } from 'react';
import { ArrowLeft, Droplets, Check, Clock, Search, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';
import { format } from 'date-fns';
import logoAbastech from '@/assets/logo-abastech.png';

const removeAccents = (text: string): string => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface FieldArlaOnlyFormProps {
  user: FieldUser;
  onBack: () => void;
}

export function FieldArlaOnlyForm({ user, onBack }: FieldArlaOnlyFormProps) {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const { broadcast } = useRealtimeSync();

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Form state - only vehicle and arla quantity
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [category, setCategory] = useState('');
  const [company, setCompany] = useState('');
  const [arlaQuantity, setArlaQuantity] = useState('');

  // Vehicle search
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Derive user location
  const userLocation = useMemo(() => {
    const locs = user.assigned_locations || [];
    const tanqueLoc = locs.find(l => l.toLowerCase().includes('tanque'));
    return tanqueLoc || locs[0] || '';
  }, [user.assigned_locations]);

  // Vehicle options from sheet
  const vehicleOptions = useMemo(() => {
    if (!vehiclesData?.rows) return [];
    return vehiclesData.rows
      .filter(row => {
        const status = String(row['STATUS'] || row['Status'] || '').toLowerCase();
        return status !== 'desmobilizado' && status !== 'inativo';
      })
      .map(row => ({
        code: String(row['VEICULO'] || row['Veiculo'] || row['Código'] || '').trim(),
        description: String(row['DESCRICAO'] || row['Descricao'] || row['Descrição'] || row['Nome'] || '').trim(),
        category: String(row['CATEGORIA'] || row['Categoria'] || '').trim(),
        company: String(row['EMPRESA'] || row['Empresa'] || '').trim(),
      }))
      .filter(v => v.code);
  }, [vehiclesData]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return vehicleOptions;
    const search = vehicleSearch.toLowerCase();
    return vehicleOptions.filter(v =>
      v.code.toLowerCase().includes(search) ||
      v.description.toLowerCase().includes(search)
    );
  }, [vehicleOptions, vehicleSearch]);

  const handleVehicleSelect = (code: string) => {
    const vehicle = vehicleOptions.find(v => v.code === code);
    if (vehicle) {
      setVehicleCode(vehicle.code);
      setVehicleDescription(vehicle.description);
      setCategory(vehicle.category);
      setCompany(vehicle.company);
    }
    setVehicleOpen(false);
    setVehicleSearch('');
  };

  const handleSubmit = async () => {
    if (isSavingRef.current) return;

    if (!vehicleCode) {
      toast.error('Selecione o veículo');
      return;
    }

    const qty = parseFloat(arlaQuantity.replace(',', '.'));
    if (!qty || qty <= 0) {
      toast.error('Informe a quantidade de Arla');
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const now = new Date();
      const recordDate = format(now, 'yyyy-MM-dd');
      const recordTime = format(now, 'HH:mm:ss');

      // Check for duplicates
      const { checkDuplicateFuelRecord } = await import('@/lib/deduplication');
      const duplicate = await checkDuplicateFuelRecord({
        vehicle_code: vehicleCode,
        record_date: recordDate,
        fuel_quantity: qty,
        record_type: 'Saida',
        record_time: recordTime.substring(0, 5),
      });

      if (duplicate) {
        toast.warning('Registro duplicado detectado!', { duration: 5000 });
        setIsSaving(false);
        isSavingRef.current = false;
        return;
      }

      const recordData = {
        user_id: user.id,
        vehicle_code: vehicleCode,
        vehicle_description: vehicleDescription,
        category,
        company,
        operator_name: removeAccents(user.name),
        work_site: '',
        horimeter_previous: null,
        horimeter_current: null,
        km_previous: null,
        km_current: null,
        fuel_quantity: 0,
        fuel_type: 'Arla',
        arla_quantity: qty,
        location: userLocation,
        entry_location: null,
        observations: `[APENAS ARLA] ${qty}L`,
        record_date: recordDate,
        record_time: recordTime,
        record_type: 'Saida',
        photo_pump_url: null,
        photo_horimeter_url: null,
        synced_to_sheet: navigator.onLine,
        supplier: null,
        invoice_number: null,
        unit_price: null,
        oil_type: null,
        oil_quantity: null,
        filter_blow: false,
        filter_blow_quantity: null,
        lubricant: null,
      };

      const { data: insertedData, error } = await supabase
        .from('field_fuel_records')
        .insert(recordData as any)
        .select('id')
        .single();

      if (error) throw error;

      const recordId = insertedData?.id;

      // Sync to Google Sheets
      if (navigator.onLine && recordId) {
        try {
          const { buildFuelSheetData } = await import('@/lib/fuelSheetMapping');
          const dateBR = now.toLocaleDateString('pt-BR');
          const sheetData = buildFuelSheetData({
            id: recordId,
            date: dateBR,
            time: recordTime.substring(0, 5),
            recordType: 'Saida',
            category,
            vehicleCode,
            vehicleDescription: removeAccents(vehicleDescription),
            operatorName: removeAccents(user.name),
            company,
            workSite: '',
            horimeterPrevious: 0,
            horimeterCurrent: 0,
            kmPrevious: 0,
            kmCurrent: 0,
            fuelQuantity: 0,
            fuelType: 'Arla',
            location: userLocation,
            arlaQuantity: qty,
            observations: `[APENAS ARLA] ${qty}L`,
          });

          const { error: sheetError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'create',
              sheetName: 'AbastecimentoCanteiro01',
              data: sheetData,
            },
          });

          if (sheetError) {
            await supabase
              .from('field_fuel_records')
              .update({ synced_to_sheet: false })
              .eq('id', recordId);
          }
        } catch (syncErr) {
          console.error('Sheet sync failed:', syncErr);
          await supabase
            .from('field_fuel_records')
            .update({ synced_to_sheet: false })
            .eq('id', recordId);
        }
      }

      // Broadcast sync event
      await broadcast('fuel_record_created', {
        vehicleCode,
        location: userLocation,
        quantity: qty,
      });

      vibrateDevice(settings.vibrationEnabled);
      playSuccessSound(settings.soundEnabled);
      setShowSuccess(true);

      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
        onBack();
      }, 2000);

    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar. Verifique sua conexão.');
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const resetForm = () => {
    setVehicleCode('');
    setVehicleDescription('');
    setCategory('');
    setCompany('');
    setArlaQuantity('');
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-cyan-500 to-cyan-700">
        <div className="text-center text-white space-y-4 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto">
            <Check className="w-14 h-14" />
          </div>
          <h2 className="text-2xl font-bold">Arla Registrado!</h2>
          <p className="text-white/80">{vehicleCode} • {arlaQuantity}L</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-800 to-cyan-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logoAbastech} alt="Abastech" className="h-8 w-auto" />
            <span className="text-white font-bold text-base">Abastecer Apenas Arla</span>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 space-y-4 max-w-2xl mx-auto">
        {/* Vehicle Selector */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <Label className="text-base font-bold text-foreground">
              Veículo <span className="text-destructive">*</span>
            </Label>
          </div>

          <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className={cn(
                  "w-full justify-between h-14 text-base rounded-xl",
                  !vehicleCode && "text-muted-foreground"
                )}
              >
                {vehicleCode ? `${vehicleCode} - ${vehicleDescription}` : 'Selecione o veículo...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Buscar veículo..."
                  value={vehicleSearch}
                  onValueChange={setVehicleSearch}
                />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>Nenhum veículo encontrado.</CommandEmpty>
                  <CommandGroup>
                    {filteredVehicles.map((v) => (
                      <CommandItem
                        key={v.code}
                        value={`${v.code} ${v.description}`}
                        onSelect={() => handleVehicleSelect(v.code)}
                        className="py-3"
                      >
                        <div>
                          <span className="font-bold">{v.code}</span>
                          <span className="text-muted-foreground ml-2 text-sm">{v.description}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Arla Quantity */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <Label className="text-base font-bold text-foreground">
              Quantidade de Arla (L) <span className="text-destructive">*</span>
            </Label>
          </div>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="Ex: 20"
            value={arlaQuantity}
            onChange={(e) => setArlaQuantity(e.target.value)}
            className="h-14 text-lg rounded-xl text-center font-bold"
          />
        </div>

        {/* Location info */}
        <div className="text-center text-sm text-muted-foreground">
          Local: <span className="font-medium text-foreground">{userLocation}</span>
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isSaving || !vehicleCode || !arlaQuantity}
          className="w-full h-14 text-lg font-bold rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 text-white shadow-lg"
        >
          {isSaving ? (
            <>Salvando...</>
          ) : (
            <>
              <Droplets className="w-5 h-5 mr-2" />
              Registrar Arla
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
