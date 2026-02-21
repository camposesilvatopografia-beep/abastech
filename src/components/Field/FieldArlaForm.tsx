import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  Save,
  ArrowLeft,
  Loader2,
  Trash2,
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

interface FieldArlaFormProps {
  user: FieldUser;
  onBack: () => void;
}

export function FieldArlaForm({ user, onBack }: FieldArlaFormProps) {
  const { theme } = useTheme();
  const { settings } = useFieldSettings();
  const { broadcast } = useRealtimeSync();

  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Form state
  const [selectedLocation, setSelectedLocation] = useState('');
  const [arlaQuantity, setArlaQuantity] = useState('');
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
    const qty = parseInt(arlaQuantity, 10);
    if (!qty || qty <= 0) {
      toast.error('Informe a quantidade de Arla');
      return;
    }

    setIsSaving(true);

    try {
      let photoPumpUrl: string | null = null;
      if (photoPump) {
        photoPumpUrl = await uploadPhoto(photoPump, 'arla');
      }

      const now = new Date();
      const recordDate = format(now, 'yyyy-MM-dd');
      const recordTime = format(now, 'HH:mm:ss');

      const parsedPrice = unitPrice ? unitPrice / 100 : null;

      const recordData = {
        user_id: user.id,
        vehicle_code: selectedLocation,
        vehicle_description: selectedLocation,
        category: 'Tanque Arla',
        company: '',
        operator_name: removeAccents(user.name),
        work_site: '',
        horimeter_previous: null,
        horimeter_current: null,
        km_previous: null,
        km_current: null,
        fuel_quantity: 0,
        fuel_type: 'Arla',
        arla_quantity: qty,
        location: selectedLocation,
        entry_location: null,
        unit_price: parsedPrice,
        observations: `[CARREGAR ARLA] Fornecedor: ${supplier || 'N/A'}${invoiceNumber ? ` | NF: ${invoiceNumber}` : ''}${observations ? ` | ${observations}` : ''}`,
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
                'Tanque Arla',
                removeAccents(user.name),
                '',
                '',
                '', '', '', '',
                '',
                'Arla',
                qty.toString(),
                selectedLocation,
                `[CARREGAR ARLA] Fornecedor: ${supplier || 'N/A'}${invoiceNumber ? ` | NF: ${invoiceNumber}` : ''}`,
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

      broadcast('fuel_record_created', { vehicleCode: selectedLocation });

      if (settings.soundEnabled) playSuccessSound();
      if (settings.vibrationEnabled) vibrateDevice();

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onBack();
      }, 2000);

      toast.success('Entrada de Arla registrada!');
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
            Entrada de Arla Registrada!
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
      <div className="bg-gradient-to-r from-cyan-800 to-cyan-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 text-white hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={logoAbastech} alt="Abastech" className="h-8 w-auto" />
            <span className="text-white font-bold text-base">Carregar Tanque Arla</span>
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
        <div className="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl border-2 border-cyan-400 dark:border-cyan-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-cyan-100 dark:bg-cyan-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <MapPin className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span className="text-lg font-bold text-cyan-800 dark:text-cyan-200">
              Local do Tanque <span className="text-red-500">*</span>
            </span>
          </div>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="h-14 text-lg font-bold border-2 border-cyan-300 dark:border-cyan-600 bg-white dark:bg-slate-900 shadow-md">
              <SelectValue placeholder="Selecione o tanque..." />
            </SelectTrigger>
            <SelectContent className="z-50 bg-popover">
              <SelectItem value="Tanque Arla 01" className="text-base py-3 font-medium">Tanque Arla 01</SelectItem>
              <SelectItem value="Tanque Arla 02" className="text-base py-3 font-medium">Tanque Arla 02</SelectItem>
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

        {/* Quantity - Arla */}
        <div className="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl border-2 border-cyan-400 dark:border-cyan-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-cyan-100 dark:bg-cyan-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <Droplet className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span className="text-lg font-bold text-cyan-800 dark:text-cyan-200">
              Quantidade Arla (Litros) <span className="text-red-500">*</span>
            </span>
          </div>
          <input
            type="number"
            inputMode="numeric"
            value={arlaQuantity}
            onChange={(e) => setArlaQuantity(e.target.value)}
            placeholder="Ex: 1000"
            className="flex h-16 w-full rounded-md border-2 border-cyan-300 dark:border-cyan-600 bg-white dark:bg-slate-900 px-3 py-2 text-3xl text-center font-black shadow-md ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
          disabled={isSaving || !arlaQuantity || !selectedLocation}
          className="w-full h-16 text-lg font-bold gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 shadow-lg shadow-cyan-500/30"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Salvar Entrada de Arla
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
