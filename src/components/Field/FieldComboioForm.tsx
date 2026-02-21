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
  CheckCircle,
  Clock,
  MapPin,
  Droplet,
  Cloud,
} from 'lucide-react';
import logoAbastech from '@/assets/logo-abastech.png';
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

  // Detect if user is a comboio user (only shows Entrada) or tanque user (only Saída)
  const isComboioUser = useMemo(() => {
    const locs = user.assigned_locations || [];
    return locs.some(loc => loc.toLowerCase().includes('comboio'));
  }, [user.assigned_locations]);

  // Form state
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [company, setCompany] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const recordType = isComboioUser ? 'entrada' : 'saida';
  const [entryLocation, setEntryLocation] = useState('');
  const [photoPump, setPhotoPump] = useState<File | null>(null);
  const [photoPumpPreview, setPhotoPumpPreview] = useState<string | null>(null);
  const photoPumpInputRef = useRef<HTMLInputElement>(null);

  // Vehicle search
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Fetch comboio drivers (field_users assigned to comboio locations)
  const [comboioDrivers, setComboioDrivers] = useState<{ name: string; locations: string[] }[]>([]);
  useEffect(() => {
    const fetchDrivers = async () => {
      const { data } = await supabase
        .from('field_users')
        .select('name, assigned_locations')
        .eq('active', true);
      if (data) {
        const drivers = data
          .filter((u: any) => (u.assigned_locations || []).some((loc: string) => loc.toLowerCase().includes('comboio')))
          .map((u: any) => ({ name: u.name, locations: u.assigned_locations || [] }));
        setComboioDrivers(drivers);
      }
    };
    fetchDrivers();
  }, []);


  // Helper: find driver name for a comboio vehicle code
  const getDriverForVehicle = (code: string): string | null => {
    const codeNum = code.match(/(\d+)/)?.[1]?.replace(/^0+/, '');
    if (!codeNum) return null;
    const driver = comboioDrivers.find(d => 
      d.locations.some(loc => {
        const locNum = loc.match(/(\d+)/)?.[1]?.replace(/^0+/, '');
        return locNum === codeNum && loc.toLowerCase().includes('comboio');
      })
    );
    return driver?.name || null;
  };

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
    
    for (const loc of userLocations) {
      const normalized = loc.toLowerCase().trim();
      
      // Extract number from location like "Comboio 02", "Comboio 03"
      const numMatch = normalized.match(/(\d+)/);
      const locNumber = numMatch ? numMatch[1].replace(/^0+/, '') : null;
      
      const match = comboioVehicles.find((v: any) => {
        const code = String(v['Codigo'] || v['CODIGO'] || v['Código'] || '').toLowerCase().trim();
        const desc = String(v['Descricao'] || v['DESCRICAO'] || v['Descrição'] || v['Nome'] || '').toLowerCase().trim();
        
        // Direct match by number (e.g., location "Comboio 02" matches vehicle with "02" or "2" in code/desc)
        if (locNumber) {
          const codeNum = code.match(/(\d+)/);
          const descNum = desc.match(/(\d+)/);
          if (codeNum && codeNum[1].replace(/^0+/, '') === locNumber) return true;
          if (descNum && descNum[1].replace(/^0+/, '') === locNumber) return true;
        }
        
        // Fallback: substring matching
        return normalized.includes(code) || code.includes(normalized) ||
               desc.includes(normalized) || normalized.includes(desc);
      });
      
      if (match) {
        handleVehicleSelect(match);
        return;
      }
    }
  }, [comboioVehicles, user.assigned_locations]);

  // Auto-set entryLocation for tanque users
  useEffect(() => {
    if (!isComboioUser && !entryLocation) {
      const tanqueLoc = (user.assigned_locations || []).find(loc => loc.toLowerCase().includes('tanque'));
      if (tanqueLoc) setEntryLocation(tanqueLoc);
    }
  }, [isComboioUser, user.assigned_locations]);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return comboioVehicles;
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-\s]/g, '');
    const searchNorm = normalize(vehicleSearch);
    return comboioVehicles.filter((v: any) => {
      const code = normalize(String(v['Codigo'] || v['CODIGO'] || v['Código'] || ''));
      const desc = normalize(String(v['Descricao'] || v['DESCRICAO'] || v['Descrição'] || v['Nome'] || ''));
      return code.includes(searchNorm) || desc.includes(searchNorm);
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
      // Use user's assigned comboio location for LOCAL column
      const userComboioLocation = (user.assigned_locations || []).find(loc => 
        loc.toLowerCase().includes('comboio')
      );
      const location = userComboioLocation || vehicleDescription || vehicleCode || '';

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

      const { data: insertedData, error } = await supabase
        .from('field_fuel_records')
        .insert(recordData as any)
        .select('id')
        .single();

      if (error) throw error;

      const recordId = insertedData?.id;

      // Sync to Google Sheets immediately if online
      const isOnline = navigator.onLine;
      if (isOnline) {
        try {
          const dateBR = now.toLocaleDateString('pt-BR');
          const { error: sheetError } = await supabase.functions.invoke('google-sheets', {
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

          if (!sheetError && recordId) {
            await supabase
              .from('field_fuel_records')
              .update({ synced_to_sheet: true } as any)
              .eq('id', recordId);
          }
        } catch (sheetErr) {
          console.error('Sheet sync error (will retry later):', sheetErr);
          // Background retry via edge function
          setTimeout(async () => {
            try {
              await supabase.functions.invoke('sync-pending-fuel', {});
            } catch (retryErr) {
              console.error('Background retry failed:', retryErr);
            }
          }, 5000);
        }
      } else {
        console.log('Offline: record saved locally, will sync when online');
        toast.info('Sem conexão. O registro será sincronizado quando voltar online.');
      }

      broadcast('fuel_record_created', { vehicleCode });

      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onBack();
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
      <div className="fixed inset-0 bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center z-50 animate-in fade-in duration-300">
        <div className="text-center text-white space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" style={{ animationDuration: '1s' }} />
            <CheckCircle className="w-28 h-28 mx-auto relative z-10 animate-in zoom-in duration-500" />
          </div>
          <h2 className="text-3xl font-bold animate-in slide-in-from-bottom duration-500">
            {recordType === 'entrada' ? 'Entrada Registrada!' : 'Saída Registrada!'}
          </h2>
          <p className="text-lg opacity-90 animate-in slide-in-from-bottom duration-700">
            Dados salvos com sucesso
          </p>
          <div className="flex items-center justify-center gap-2 mt-4 animate-in slide-in-from-bottom duration-900">
            <Cloud className="w-5 h-5" />
            <span className="text-sm">Sincronizando com planilha...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pb-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-800 to-orange-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logoAbastech} alt="Abastech" className="h-8 w-auto" />
            <span className="text-white font-bold text-base">Carregar Comboio</span>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 space-y-3 max-w-2xl mx-auto">

        {/* Type Selection */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-3 shadow-lg">
          {isComboioUser ? (
            <Button type="button" variant="default" disabled className="w-full h-12 text-base font-bold bg-gradient-to-r from-green-500 to-green-600 text-white border-0 shadow-lg shadow-green-500/30 cursor-default">
              <TrendingUp className="w-5 h-5 mr-2" />
              Entrada
            </Button>
          ) : (
            <Button type="button" variant="default" disabled className="w-full h-12 text-base font-bold bg-gradient-to-r from-red-500 to-red-600 text-white border-0 shadow-lg shadow-red-500/30 cursor-default">
              <TrendingDown className="w-5 h-5 mr-2" />
              Saída
            </Button>
          )}
        </div>

        {/* Local */}
        <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-indigo-100 dark:bg-indigo-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
              {isComboioUser ? 'Local de Entrada' : 'Local (Tanque de Saída)'}
            </span>
          </div>
          <Select value={entryLocation} onValueChange={setEntryLocation}>
            <SelectTrigger className="h-14 text-lg font-bold border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 shadow-md">
              <SelectValue placeholder="Selecione o tanque..." />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="Tanque Canteiro 01" className="text-base py-3 font-medium">Tanque Canteiro 01</SelectItem>
              <SelectItem value="Tanque Canteiro 02" className="text-base py-3 font-medium">Tanque Canteiro 02</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Vehicle Selection - hidden for comboio users */}
        {!isComboioUser && (
          <div className="bg-sky-50 dark:bg-sky-950/40 rounded-2xl border-2 border-sky-400 dark:border-sky-600 p-4 space-y-3 shadow-lg">
            <div className="flex items-center gap-3 bg-sky-100 dark:bg-sky-900/60 px-4 py-2.5 rounded-xl -ml-1">
              <Truck className="w-6 h-6 text-sky-600 dark:text-sky-400" />
              <span className="text-lg font-bold text-sky-800 dark:text-sky-200">
                Comboio de Destino <span className="text-red-500">*</span>
              </span>
            </div>
            <Popover open={vehicleOpen} onOpenChange={setVehicleOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between font-medium h-14 text-lg",
                    "bg-white dark:bg-slate-900 border-2 border-sky-300 dark:border-sky-600",
                    "hover:border-sky-500 transition-all duration-200 shadow-md",
                    !vehicleCode && "text-muted-foreground"
                  )}
                >
                  {vehicleCode ? (
                    <div className="flex items-center gap-2">
                      <Truck className="w-5 h-5 text-sky-600" />
                      <span className="font-bold">{vehicleCode}</span>
                      {(() => {
                        const driverName = getDriverForVehicle(vehicleCode);
                        return driverName ? (
                          <span className="text-sm text-muted-foreground">- {driverName}</span>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                    "Selecione o Comboio..."
                  )}
                  <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0 bg-popover border-2 border-border shadow-xl z-[100]" align="start" sideOffset={4}>
                <Command className="bg-popover" shouldFilter={false}>
                  <div className="flex items-center border-b-2 border-border px-3 bg-muted/50">
                    <Search className="h-5 w-5 shrink-0 text-primary mr-2" />
                    <CommandInput
                      placeholder="Buscar comboio..."
                      value={vehicleSearch}
                      onValueChange={setVehicleSearch}
                      className="h-12 text-base border-0 focus:ring-0 bg-transparent placeholder:text-muted-foreground"
                    />
                  </div>
                  <CommandList className="max-h-[400px] overflow-auto">
                    <CommandEmpty className="py-6 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Truck className="h-8 w-8 opacity-50" />
                        <span className="text-sm">Nenhum comboio encontrado</span>
                      </div>
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredVehicles.map((v: any, idx: number) => {
                        const code = String(v['Codigo'] || v['CODIGO'] || v['Código'] || '');
                        const driverName = getDriverForVehicle(code);
                        return (
                          <CommandItem
                            key={`${code}-${idx}`}
                            value={`${code} ${driverName || ''}`}
                            onSelect={() => handleVehicleSelect(v)}
                            className="py-3"
                          >
                            <div className="flex items-center gap-3 w-full">
                              <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                                <Truck className="w-5 h-5 text-sky-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-bold text-sm block">{code}</span>
                                {driverName && (
                                  <span className="text-xs text-muted-foreground block truncate">{driverName}</span>
                                )}
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
          </div>
        )}

        {/* Quantity */}
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl border-2 border-amber-400 dark:border-amber-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-amber-100 dark:bg-amber-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <Droplet className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
              Quantidade (Litros) <span className="text-red-500">*</span>
            </span>
          </div>
          <input
            type="number"
            inputMode="numeric"
            value={fuelQuantity}
            onChange={(e) => setFuelQuantity(e.target.value)}
            placeholder="Ex: 250"
            className="flex h-16 w-full rounded-md border-2 border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 px-3 py-2 text-3xl text-center font-black shadow-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {/* Photo */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border-2 border-emerald-400 dark:border-emerald-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-emerald-100 dark:bg-emerald-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <Camera className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
              Foto da Bomba
            </span>
          </div>
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
              <img src={photoPumpPreview} alt="Foto bomba" className="w-full h-40 object-cover rounded-lg border-2 border-emerald-300" />
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
              className="w-full h-20 flex flex-col gap-1 border-2 border-dashed border-emerald-300 dark:border-emerald-600 hover:bg-emerald-100/50"
              onClick={() => photoPumpInputRef.current?.click()}
            >
              <Camera className="w-6 h-6 text-emerald-500" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Tirar Foto</span>
            </Button>
          )}
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSaving || !vehicleCode || !fuelQuantity || !entryLocation}
          className={cn(
            "w-full h-16 text-lg font-bold gap-2 rounded-2xl shadow-lg",
            recordType === 'entrada'
              ? "bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-green-500/30"
              : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-red-500/30"
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
    </div>
  );
}
