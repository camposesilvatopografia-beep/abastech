import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package2,
  Camera,
  Save,
  ArrowLeft,
  Loader2,
  Trash2,
  Check,
  TrendingUp,
  CheckCircle,
  Clock,
  MapPin,
  Droplet,
  Building2,
  Receipt,
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
import { CurrencyInput } from '@/components/ui/currency-input';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';
import { format } from 'date-fns';

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

interface FieldTanqueFormProps {
  user: FieldUser;
  onBack: () => void;
}

export function FieldTanqueForm({ user, onBack }: FieldTanqueFormProps) {
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const { broadcast } = useRealtimeSync();

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Form state
  const [selectedLocation, setSelectedLocation] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [observations, setObservations] = useState('');
  const [photoPump, setPhotoPump] = useState<File | null>(null);
  const [photoPumpPreview, setPhotoPumpPreview] = useState<string | null>(null);
  const photoPumpInputRef = useRef<HTMLInputElement>(null);

  // Suppliers from DB
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchSuppliers = async () => {
      const { data } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (data) setSuppliers(data);
    };
    fetchSuppliers();
  }, []);

  // Determine user's tanque location
  const userTanqueLocation = useMemo(() => {
    const locs = user.assigned_locations || [];
    return locs.find(loc => loc.toLowerCase().includes('tanque')) || locs[0] || '';
  }, [user.assigned_locations]);

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
    if (!selectedLocation) {
      toast.error('Selecione o local do tanque');
      return;
    }
    const qty = parseInt(fuelQuantity, 10);
    if (!qty || qty <= 0) {
      toast.error('Informe a quantidade de combustível');
      return;
    }

    setIsSaving(true);

    try {
      let photoPumpUrl: string | null = null;
      if (photoPump) {
        photoPumpUrl = await uploadPhoto(photoPump, 'tanque');
      }

      const now = new Date();
      const recordDate = format(now, 'yyyy-MM-dd');
      const recordTime = format(now, 'HH:mm:ss');

      const parsedPrice = unitPrice ? unitPrice / 100 : null;

      const recordData = {
        user_id: user.id,
        vehicle_code: selectedLocation,
        vehicle_description: selectedLocation,
        category: 'Tanque Canteiro',
        company: '',
        operator_name: removeAccents(user.name),
        work_site: '',
        horimeter_previous: null,
        horimeter_current: null,
        km_previous: null,
        km_current: null,
        fuel_quantity: qty,
        fuel_type: 'Diesel',
        arla_quantity: null,
        location: selectedLocation,
        entry_location: null,
        unit_price: parsedPrice,
        observations: `[CARREGAR TANQUE] Fornecedor: ${supplier || 'N/A'}${invoiceNumber ? ` | NF: ${invoiceNumber}` : ''}${observations ? ` | ${observations}` : ''}`,
        record_date: recordDate,
        record_time: recordTime,
        record_type: 'entrada',
        supplier: supplier,
        invoice_number: invoiceNumber,
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
      if (navigator.onLine) {
        try {
          const dateBR = now.toLocaleDateString('pt-BR');
          const { error: sheetError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'append',
              sheetName: 'AbastecimentoCanteiro01',
              values: [[
                dateBR,
                recordTime.substring(0, 5),
                'ENTRADA',
                selectedLocation,
                removeAccents(selectedLocation),
                'Tanque Canteiro',
                removeAccents(user.name),
                '',
                '',
                '', '', '', '',
                fuelQuantity,
                'Diesel',
                '',
                selectedLocation,
                `[CARREGAR TANQUE] Fornecedor: ${supplier || 'N/A'}${invoiceNumber ? ` | NF: ${invoiceNumber}` : ''}`,
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
          console.error('Sheet sync error:', sheetErr);
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
        toast.info('Sem conexão. Será sincronizado quando voltar online.');
      }

      broadcast('fuel_record_created', { vehicleCode: userTanqueLocation });

      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onBack();
      }, 2000);

      toast.success('Entrada no tanque registrada!');
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
            Entrada Registrada!
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
      <div className="bg-gradient-to-r from-teal-800 to-teal-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logoAbastech} alt="Abastech" className="h-8 w-auto" />
            <span className="text-white font-bold text-base">Carregar Tanque</span>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>

      <div className="px-3 py-3 space-y-3 max-w-2xl mx-auto">

        {/* Type - always Entrada */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-3 shadow-lg">
          <Button type="button" variant="default" disabled className="w-full h-12 text-base font-bold bg-gradient-to-r from-green-500 to-green-600 text-white border-0 shadow-lg shadow-green-500/30 cursor-default">
            <TrendingUp className="w-5 h-5 mr-2" />
            Entrada
          </Button>
        </div>

        {/* Local do Tanque */}
        <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-indigo-100 dark:bg-indigo-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
              Local do Tanque <span className="text-red-500">*</span>
            </span>
          </div>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="h-14 text-lg font-bold border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 shadow-md">
              <SelectValue placeholder="Selecione o tanque..." />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="Tanque Canteiro 01" className="text-base py-3 font-medium">Tanque Canteiro 01</SelectItem>
              <SelectItem value="Tanque Canteiro 02" className="text-base py-3 font-medium">Tanque Canteiro 02</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Supplier */}
        <div className="bg-purple-50 dark:bg-purple-950/40 rounded-2xl border-2 border-purple-400 dark:border-purple-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-purple-100 dark:bg-purple-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <span className="text-lg font-bold text-purple-800 dark:text-purple-200">
              Fornecedor <span className="text-red-500">*</span>
            </span>
          </div>
          <Select value={supplier} onValueChange={setSupplier}>
            <SelectTrigger className="h-14 text-lg font-bold border-2 border-purple-300 dark:border-purple-600 bg-white dark:bg-slate-900 shadow-md">
              <SelectValue placeholder="Selecione o fornecedor..." />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              {suppliers.map(s => (
                <SelectItem key={s.id} value={s.name} className="text-base py-3 font-medium">{s.name}</SelectItem>
              ))}
              <SelectItem value="Outro" className="text-base py-3 font-medium">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoice */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-700/60 px-4 py-2.5 rounded-xl -ml-1">
            <Receipt className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Nº Nota Fiscal
            </span>
          </div>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Ex: 123456"
            className="flex h-14 w-full rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-lg font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shadow-md"
          />
        </div>

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
            placeholder="Ex: 5000"
            className="flex h-16 w-full rounded-md border-2 border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 px-3 py-2 text-3xl text-center font-black shadow-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        {/* Unit Price */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-700/60 px-4 py-2.5 rounded-xl -ml-1">
            <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Valor Unitário (R$/L)
            </span>
          </div>
          <CurrencyInput
            value={unitPrice}
            onChange={setUnitPrice}
            placeholder="0,00"
            className="h-14 text-lg font-bold border-2 border-slate-300 dark:border-slate-600 shadow-md"
          />
        </div>

        {/* Photo */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border-2 border-emerald-400 dark:border-emerald-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-emerald-100 dark:bg-emerald-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <Camera className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
              Foto
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
              <img src={photoPumpPreview} alt="Foto" className="w-full h-40 object-cover rounded-lg border-2 border-emerald-300" />
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

        {/* Observations */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-700/60 px-4 py-2.5 rounded-xl -ml-1">
            <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
              Observações
            </span>
          </div>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            placeholder="Observações opcionais..."
            rows={2}
            className="flex w-full rounded-md border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shadow-md"
          />
        </div>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={isSaving || !fuelQuantity || !selectedLocation}
          className="w-full h-16 text-lg font-bold gap-2 rounded-2xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg shadow-green-500/30"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Salvar Entrada no Tanque
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
