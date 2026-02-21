import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Truck,
  Camera,
  Save,
  ArrowLeft,
  Loader2,
  Image,
  Trash2,
  Search,
  ChevronsUpDown,
  Check,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CurrencyInput } from '@/components/ui/currency-input';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';
import { format } from 'date-fns';

// Remove accents for spreadsheet compatibility
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

interface FieldComboioFormProps {
  user: FieldUser;
  onBack: () => void;
}

export function FieldComboioForm({ user, onBack }: FieldComboioFormProps) {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const { broadcast } = useRealtimeSync();

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Form state
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [company, setCompany] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [recordType, setRecordType] = useState<'entrada' | 'saida'>('entrada');
  const [entryLocation, setEntryLocation] = useState('');
  const [photoPump, setPhotoPump] = useState<File | null>(null);
  const [photoPumpPreview, setPhotoPumpPreview] = useState<string | null>(null);
  const photoPumpInputRef = useRef<HTMLInputElement>(null);

  // Vehicle search
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Filter vehicles to only show "Tanque Comboio" category
  const comboioVehicles = useMemo(() => {
    if (!vehiclesData?.rows) return [];
    return vehiclesData.rows.filter((v: any) => {
      const cat = String(v['Categoria'] || v['CATEGORIA'] || '').toLowerCase();
      return cat.includes('tanque comboio') || cat.includes('tanque_comboio');
    });
  }, [vehiclesData?.rows]);

  // Auto-select comboio based on user's assigned_locations
  useEffect(() => {
    if (vehicleCode || comboioVehicles.length === 0) return;
    
    const userLocations = user.assigned_locations || [];
    // Find a comboio that matches the user's assigned location
    for (const loc of userLocations) {
      const normalized = loc.toLowerCase();
      const match = comboioVehicles.find((v: any) => {
        const code = String(v['Codigo'] || v['CODIGO'] || v['Código'] || '').toLowerCase();
        const desc = String(v['Descricao'] || v['DESCRICAO'] || v['Descrição'] || v['Nome'] || '').toLowerCase();
        // Match "comboio 01" in location with vehicle code/desc
        return normalized.includes(code) || code.includes(normalized.replace('tanque ', '').replace('canteiro ', '')) ||
               desc.includes(normalized) || normalized.includes(desc.split(' ').slice(-1)[0]);
      });
      if (match) {
        handleVehicleSelect(match);
        break;
      }
    }

    // If user location contains "comboio", try direct match
    if (!vehicleCode) {
      for (const loc of userLocations) {
        const normalized = loc.toLowerCase();
        if (normalized.includes('comboio')) {
          // Extract number from location like "Comboio 01"
          const numMatch = normalized.match(/\d+/);
          if (numMatch) {
            const match = comboioVehicles.find((v: any) => {
              const code = String(v['Codigo'] || v['CODIGO'] || v['Código'] || '').toLowerCase();
              const desc = String(v['Descricao'] || v['DESCRICAO'] || v['Descrição'] || v['Nome'] || '').toLowerCase();
              return code.includes(numMatch[0]) || desc.includes(numMatch[0]);
            });
            if (match) {
              handleVehicleSelect(match);
              break;
            }
          }
        }
      }
    }
  }, [comboioVehicles, user.assigned_locations]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return comboioVehicles;
    const search = vehicleSearch.toLowerCase();
    return comboioVehicles.filter((v: any) => {
      const code = String(v['Codigo'] || v['CODIGO'] || v['Código'] || '').toLowerCase();
      const desc = String(v['Descricao'] || v['DESCRICAO'] || v['Descrição'] || v['Nome'] || '').toLowerCase();
      return code.includes(search) || desc.includes(search);
    });
  }, [comboioVehicles, vehicleSearch]);

  const handleVehicleSelect = (vehicle: any) => {
    const code = String(vehicle['Codigo'] || vehicle['CODIGO'] || vehicle['Código'] || '');
    const desc = String(vehicle['Descricao'] || vehicle['DESCRICAO'] || vehicle['Descrição'] || vehicle['Nome'] || '');
    const comp = String(vehicle['Empresa'] || vehicle['EMPRESA'] || '');
    setVehicleCode(code);
    setVehicleDescription(desc);
    setCompany(comp);
    setVehicleOpen(false);
    setVehicleSearch('');
  };

  // Photo handling
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPumpPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setPhotoPump(file);
  };

  const uploadPhoto = async (file: File, path: string): Promise<string | null> => {
    try {
      const fileName = `${path}/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      const { error } = await supabase.storage.from('field-photos').upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('field-photos').getPublicUrl(fileName);
      return urlData.publicUrl;
    } catch (err) {
      console.error('Error uploading photo:', err);
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!vehicleCode) {
      toast.error('Selecione o veículo (Comboio)');
      return;
    }
    if (!entryLocation) {
      toast.error('Selecione o Local de Entrada');
      return;
    }
    const qty = parseInt(fuelQuantity, 10);
    if (!qty || qty <= 0) {
      toast.error('Informe a quantidade de combustível');
      return;
    }

    setIsSaving(true);

    try {
      // Upload photo if exists
      let photoPumpUrl: string | null = null;
      if (photoPump) {
        photoPumpUrl = await uploadPhoto(photoPump, 'comboio');
      }

      const now = new Date();
      const recordDate = format(now, 'yyyy-MM-dd');
      const recordTime = format(now, 'HH:mm:ss');
      const location = entryLocation || user.assigned_locations?.[0] || '';

      const recordData = {
        user_id: user.id,
        vehicle_code: vehicleCode,
        vehicle_description: vehicleDescription,
        category: 'Tanque Comboio',
        company,
        operator_name: removeAccents(user.name),
        work_site: '',
        horimeter_previous: null,
        horimeter_current: null,
        km_previous: null,
        km_current: null,
        fuel_quantity: qty,
        fuel_type: 'Diesel',
        arla_quantity: null,
        location,
        entry_location: entryLocation,
        observations: `[CARREGAR COMBOIO] Local: ${entryLocation}`,
        record_date: recordDate,
        record_time: recordTime,
        record_type: recordType,
        photo_pump_url: photoPumpUrl,
        photo_horimeter_url: null,
        synced_to_sheet: false,
      };

      const { error } = await supabase
        .from('field_fuel_records')
        .insert(recordData as any);

      if (error) throw error;

      // Sync to Google Sheets
      try {
        const dateBR = now.toLocaleDateString('pt-BR');
        await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'append',
            sheetName: 'AbastecimentoCanteiro01',
            values: [[
              dateBR,
              recordTime.substring(0, 5),
              recordType === 'entrada' ? 'ENTRADA' : 'SAIDA',
              vehicleCode,
              removeAccents(vehicleDescription),
              'Tanque Comboio',
              removeAccents(user.name),
              company,
              '',
              '', '', '', '',
              fuelQuantity,
              'Diesel',
              '',
              location,
              `[CARREGAR COMBOIO] Local: ${entryLocation}`,
            ]],
          },
        });
      } catch (sheetErr) {
        console.error('Sheet sync error:', sheetErr);
      }

      broadcast('fuel_record_created', { vehicleCode });

      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        // Reset form
        setVehicleCode('');
        setVehicleDescription('');
        setCompany('');
        setFuelQuantity('');
        setRecordType('entrada');
        setEntryLocation('');
        setPhotoPump(null);
        setPhotoPumpPreview(null);
        if (photoPumpInputRef.current) photoPumpInputRef.current.value = '';
      }, 2000);

      toast.success('Registro salvo com sucesso!');
    } catch (err) {
      console.error('Error saving record:', err);
      toast.error('Erro ao salvar registro');
    } finally {
      setIsSaving(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto animate-bounce">
            <Check className="w-10 h-10 text-white" />
          </div>
          <h2 className={cn("text-xl font-bold", theme === 'dark' ? "text-white" : "text-slate-800")}>
            Registro Salvo!
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className={cn("text-lg font-bold", theme === 'dark' ? "text-white" : "text-slate-800")}>
            Carregar Comboio
          </h2>
          <p className="text-xs text-muted-foreground">Abastecimento do tanque do Comboio</p>
        </div>
      </div>

      {/* Type Selection */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Tipo</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRecordType('entrada')}
            className={cn(
              "flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all font-semibold",
              recordType === 'entrada'
                ? "border-green-500 bg-green-500/20 text-green-600 dark:text-green-400"
                : theme === 'dark'
                  ? "border-slate-600 text-slate-400 hover:border-slate-500"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            <TrendingUp className="w-5 h-5" />
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setRecordType('saida')}
            className={cn(
              "flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all font-semibold",
              recordType === 'saida'
                ? "border-red-500 bg-red-500/20 text-red-600 dark:text-red-400"
                : theme === 'dark'
                  ? "border-slate-600 text-slate-400 hover:border-slate-500"
                  : "border-slate-200 text-slate-500 hover:border-slate-300"
            )}
          >
            <TrendingDown className="w-5 h-5" />
            Saída
          </button>
        </div>
      </div>

      {/* Vehicle Selection */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Veículo (Comboio)</Label>
        <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                "w-full justify-between h-12 text-left",
                !vehicleCode && "text-muted-foreground"
              )}
            >
              {vehicleCode ? (
                <span className="font-bold text-primary">{vehicleCode}</span>
              ) : (
                "Selecione o Comboio..."
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-3rem)] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Buscar comboio..."
                value={vehicleSearch}
                onValueChange={setVehicleSearch}
              />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>Nenhum comboio encontrado</CommandEmpty>
                <CommandGroup>
                  {filteredVehicles.map((v: any, idx: number) => {
                    const code = String(v['Codigo'] || v['CODIGO'] || v['Código'] || '');
                    const desc = String(v['Descricao'] || v['DESCRICAO'] || v['Descrição'] || v['Nome'] || '');
                    return (
                      <CommandItem
                        key={`${code}-${idx}`}
                        value={`${code} ${desc}`}
                        onSelect={() => handleVehicleSelect(v)}
                        className="py-3"
                      >
                        <div className="flex items-center gap-2 w-full">
                          <Truck className="w-4 h-4 text-orange-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-primary">{code}</span>
                            <span className="text-xs text-muted-foreground ml-2 truncate">{desc}</span>
                          </div>
                          {vehicleCode === code && (
                            <Check className="w-4 h-4 text-primary shrink-0" />
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {vehicleDescription && (
          <p className="text-xs text-muted-foreground mt-1">{vehicleDescription}</p>
        )}
      </div>

      {/* Local de Entrada */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Local de Entrada</Label>
        <Select value={entryLocation} onValueChange={setEntryLocation}>
          <SelectTrigger className="h-12 text-base font-semibold">
            <SelectValue placeholder="Selecione o tanque..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Tanque Canteiro 01">Tanque Canteiro 01</SelectItem>
            <SelectItem value="Tanque Canteiro 02">Tanque Canteiro 02</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quantity */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Quantidade (Litros)</Label>
        <input
          type="number"
          inputMode="numeric"
          value={fuelQuantity}
          onChange={(e) => setFuelQuantity(e.target.value)}
          placeholder="Ex: 250"
          className={cn(
            "flex h-12 w-full rounded-md border px-3 py-2 text-lg font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            theme === 'dark' 
              ? "bg-slate-700 border-slate-600 text-white" 
              : "bg-background border-input"
          )}
        />
      </div>

      {/* Photo */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Foto da Bomba</Label>
        <input
          ref={photoPumpInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoCapture}
          className="hidden"
        />
        {photoPumpPreview ? (
          <div className="relative">
            <img src={photoPumpPreview} alt="Foto bomba" className="w-full h-40 object-cover rounded-lg" />
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8"
              onClick={() => {
                setPhotoPump(null);
                setPhotoPumpPreview(null);
                if (photoPumpInputRef.current) photoPumpInputRef.current.value = '';
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full h-20 flex flex-col gap-1"
            onClick={() => photoPumpInputRef.current?.click()}
          >
            <Camera className="w-6 h-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Tirar Foto</span>
          </Button>
        )}
      </div>

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        disabled={isSaving || !vehicleCode || !fuelQuantity || !entryLocation}
        className={cn(
          "w-full h-14 text-base font-bold gap-2 rounded-xl",
          recordType === 'entrada'
            ? "bg-green-600 hover:bg-green-700"
            : "bg-red-600 hover:bg-red-700"
        )}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            Salvar {recordType === 'entrada' ? 'Entrada' : 'Saída'}
          </>
        )}
      </Button>
    </div>
  );
}
