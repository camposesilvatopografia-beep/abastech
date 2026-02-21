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
            Carregar Tanque
          </h2>
          <p className="text-xs text-muted-foreground">Entrada de combustível de fornecedor externo</p>
        </div>
      </div>

      {/* Type - always Entrada */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Tipo</Label>
        <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-green-500 bg-green-500/20 font-semibold text-green-600 dark:text-green-400">
          <TrendingUp className="w-5 h-5" />
          Entrada
        </div>
      </div>

      {/* Local (auto) */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Local do Tanque</Label>
        <Select value={selectedLocation} onValueChange={setSelectedLocation}>
          <SelectTrigger className="h-12 text-base font-semibold">
            <SelectValue placeholder="Selecione o tanque..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Tanque Canteiro 01">Tanque Canteiro 01</SelectItem>
            <SelectItem value="Tanque Canteiro 02">Tanque Canteiro 02</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Supplier */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Fornecedor</Label>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="h-12 text-base font-semibold">
            <SelectValue placeholder="Selecione o fornecedor..." />
          </SelectTrigger>
          <SelectContent>
            {suppliers.map(s => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
            <SelectItem value="Outro">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Nº Nota Fiscal (opcional)</Label>
        <input
          type="text"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder="Ex: 123456"
          className={cn(
            "flex h-12 w-full rounded-md border px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            theme === 'dark' ? "bg-slate-700 border-slate-600 text-white" : "bg-background border-input"
          )}
        />
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
          placeholder="Ex: 5000"
          className={cn(
            "flex h-12 w-full rounded-md border px-3 py-2 text-lg font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            theme === 'dark' ? "bg-slate-700 border-slate-600 text-white" : "bg-background border-input"
          )}
        />
      </div>

      {/* Unit Price */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Valor Unitário (R$/L) - opcional</Label>
        <CurrencyInput
          value={unitPrice}
          onChange={setUnitPrice}
          placeholder="0,00"
          className="h-12 text-lg font-bold"
        />
      </div>


      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Foto (opcional)</Label>
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
            <img src={photoPumpPreview} alt="Foto" className="w-full h-40 object-cover rounded-lg" />
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

      {/* Observations */}
      <div className={cn(
        "rounded-xl p-4 border",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700" : "bg-white border-slate-200 shadow-sm"
      )}>
        <Label className="text-sm font-medium mb-2 block">Observações (opcional)</Label>
        <textarea
          value={observations}
          onChange={(e) => setObservations(e.target.value)}
          placeholder="Observações..."
          rows={2}
          className={cn(
            "flex w-full rounded-md border px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            theme === 'dark' ? "bg-slate-700 border-slate-600 text-white" : "bg-background border-input"
          )}
        />
      </div>

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={isSaving || !fuelQuantity || !selectedLocation}
        className="w-full h-14 text-base font-bold gap-2 rounded-xl bg-green-600 hover:bg-green-700"
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
  );
}
