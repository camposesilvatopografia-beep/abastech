import { useState, useEffect, useRef } from 'react';
import { 
  Fuel, 
  Mic, 
  MicOff, 
  Camera, 
  Save, 
  Truck, 
  User, 
  MapPin,
  Gauge,
  Droplet,
  Building2,
  ArrowLeft,
  LogOut,
  CheckCircle,
  X
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
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

interface FieldFuelFormProps {
  user: FieldUser;
  onLogout: () => void;
}

// Voice recognition hook
function useVoiceRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      setIsSupported(true);
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onresult = (event: any) => {
        const result = event.results[0][0].transcript;
        setTranscript(result);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
        toast.error('Erro no reconhecimento de voz');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      setIsListening(true);
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  return { isListening, transcript, isSupported, startListening, stopListening, setTranscript };
}

export function FieldFuelForm({ user, onLogout }: FieldFuelFormProps) {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  
  // Form state
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [category, setCategory] = useState('');
  const [company, setCompany] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [workSite, setWorkSite] = useState('');
  const [horimeterPrevious, setHorimeterPrevious] = useState('');
  const [horimeterCurrent, setHorimeterCurrent] = useState('');
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelType, setFuelType] = useState('Diesel');
  const [arlaQuantity, setArlaQuantity] = useState('');
  const [location, setLocation] = useState('Tanque Canteiro 01');
  const [observations, setObservations] = useState('');

  // Voice recognition
  const voice = useVoiceRecognition();

  // Process voice commands
  useEffect(() => {
    if (voice.transcript && activeVoiceField) {
      const text = voice.transcript.toLowerCase();
      
      // Parse numeric values from voice
      const extractNumber = (str: string): string => {
        const matches = str.match(/[\d,\.]+/g);
        if (matches) {
          return matches.join('').replace(',', '.');
        }
        return str;
      };

      switch (activeVoiceField) {
        case 'vehicle':
          // Try to match vehicle code
          const vehicleMatch = vehiclesData.rows.find(v => 
            String(v['Codigo'] || '').toLowerCase().includes(text) ||
            text.includes(String(v['Codigo'] || '').toLowerCase())
          );
          if (vehicleMatch) {
            handleVehicleSelect(String(vehicleMatch['Codigo']));
          } else {
            setVehicleCode(voice.transcript.toUpperCase());
          }
          break;
        case 'quantity':
          setFuelQuantity(extractNumber(voice.transcript));
          break;
        case 'horimeter':
          setHorimeterCurrent(extractNumber(voice.transcript));
          break;
        case 'arla':
          setArlaQuantity(extractNumber(voice.transcript));
          break;
        case 'observations':
          setObservations(prev => prev + ' ' + voice.transcript);
          break;
      }
      
      voice.setTranscript('');
      setActiveVoiceField(null);
      toast.success('Comando de voz reconhecido!');
    }
  }, [voice.transcript, activeVoiceField, vehiclesData.rows]);

  // Handle vehicle selection
  const handleVehicleSelect = (code: string) => {
    setVehicleCode(code);
    const vehicle = vehiclesData.rows.find(v => String(v['Codigo']) === code);
    if (vehicle) {
      setVehicleDescription(String(vehicle['Descricao'] || ''));
      setCategory(String(vehicle['Categoria'] || ''));
      setCompany(String(vehicle['Empresa'] || ''));
      setOperatorName(String(vehicle['Motorista'] || ''));
      setWorkSite(String(vehicle['Obra'] || ''));
    }
  };

  // Start voice input for a specific field
  const startVoiceForField = (field: string) => {
    setActiveVoiceField(field);
    voice.startListening();
    toast.info(`Fale o valor para ${getFieldLabel(field)}...`);
  };

  const getFieldLabel = (field: string): string => {
    switch (field) {
      case 'vehicle': return 'Veículo';
      case 'quantity': return 'Quantidade';
      case 'horimeter': return 'Horímetro';
      case 'arla': return 'ARLA';
      case 'observations': return 'Observações';
      default: return field;
    }
  };

  // Save record
  const handleSave = async () => {
    if (!vehicleCode || !fuelQuantity) {
      toast.error('Preencha veículo e quantidade');
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('field_fuel_records')
        .insert({
          user_id: user.id,
          vehicle_code: vehicleCode,
          vehicle_description: vehicleDescription,
          category,
          operator_name: operatorName || user.name,
          company,
          work_site: workSite,
          horimeter_previous: parseFloat(horimeterPrevious) || 0,
          horimeter_current: parseFloat(horimeterCurrent) || 0,
          fuel_quantity: parseFloat(fuelQuantity) || 0,
          fuel_type: fuelType,
          arla_quantity: parseFloat(arlaQuantity) || 0,
          location,
          observations
        });

      if (error) throw error;

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
      }, 2000);
      
      toast.success('Abastecimento registrado!');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setVehicleCode('');
    setVehicleDescription('');
    setCategory('');
    setCompany('');
    setOperatorName('');
    setWorkSite('');
    setHorimeterPrevious('');
    setHorimeterCurrent('');
    setFuelQuantity('');
    setArlaQuantity('');
    setObservations('');
  };

  // Get unique vehicles from sheet
  const vehicles = vehiclesData.rows.map(v => ({
    code: String(v['Codigo'] || ''),
    description: String(v['Descricao'] || ''),
  })).filter(v => v.code);

  // Success overlay
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-green-500 flex items-center justify-center z-50">
        <div className="text-center text-white">
          <CheckCircle className="w-24 h-24 mx-auto mb-4 animate-bounce" />
          <h2 className="text-3xl font-bold">Registrado!</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Fuel className="w-8 h-8" />
            <div>
              <h1 className="text-lg font-bold">Abastecimento</h1>
              <p className="text-xs opacity-90">{user.name}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onLogout}
            className="text-primary-foreground hover:bg-primary-foreground/20"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Voice status */}
      {voice.isListening && (
        <div className="bg-red-500 text-white p-3 flex items-center justify-center gap-2 animate-pulse">
          <Mic className="w-5 h-5" />
          <span>Ouvindo... Fale agora</span>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={voice.stopListening}
            className="text-white hover:bg-white/20"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Form */}
      <div className="p-4 space-y-4">
        {/* Vehicle Selection */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-base">
              <Truck className="w-4 h-4" />
              Veículo
            </Label>
            {voice.isSupported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startVoiceForField('vehicle')}
                className={cn(activeVoiceField === 'vehicle' && voice.isListening && "bg-red-100")}
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Select value={vehicleCode} onValueChange={handleVehicleSelect}>
            <SelectTrigger className="h-12 text-lg">
              <SelectValue placeholder="Selecione o veículo" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {vehicles.map(v => (
                <SelectItem key={v.code} value={v.code}>
                  {v.code} - {v.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {vehicleDescription && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 p-2 rounded">
                <span className="text-muted-foreground">Categoria:</span>
                <p className="font-medium">{category || '-'}</p>
              </div>
              <div className="bg-muted/50 p-2 rounded">
                <span className="text-muted-foreground">Empresa:</span>
                <p className="font-medium">{company || '-'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Fuel Quantity */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-base">
              <Fuel className="w-4 h-4" />
              Quantidade (Litros)
            </Label>
            {voice.isSupported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startVoiceForField('quantity')}
                className={cn(activeVoiceField === 'quantity' && voice.isListening && "bg-red-100")}
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Ex: 150"
            value={fuelQuantity}
            onChange={(e) => setFuelQuantity(e.target.value)}
            className="h-14 text-2xl text-center font-bold"
          />
        </div>

        {/* Horimeter */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-base">
              <Gauge className="w-4 h-4" />
              Horímetro / KM Atual
            </Label>
            {voice.isSupported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startVoiceForField('horimeter')}
                className={cn(activeVoiceField === 'horimeter' && voice.isListening && "bg-red-100")}
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Ex: 12500.50"
            value={horimeterCurrent}
            onChange={(e) => setHorimeterCurrent(e.target.value)}
            className="h-12 text-lg text-center"
          />
        </div>

        {/* ARLA */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-base">
              <Droplet className="w-4 h-4" />
              ARLA (Litros)
            </Label>
            {voice.isSupported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startVoiceForField('arla')}
                className={cn(activeVoiceField === 'arla' && voice.isListening && "bg-red-100")}
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={arlaQuantity}
            onChange={(e) => setArlaQuantity(e.target.value)}
            className="h-12 text-lg text-center"
          />
        </div>

        {/* Location */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <Label className="flex items-center gap-2 text-base">
            <MapPin className="w-4 h-4" />
            Local
          </Label>
          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-12">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Tanque Canteiro 01">Tanque Canteiro 01</SelectItem>
              <SelectItem value="Tanque Canteiro 02">Tanque Canteiro 02</SelectItem>
              <SelectItem value="Comboio 01">Comboio 01</SelectItem>
              <SelectItem value="Comboio 02">Comboio 02</SelectItem>
              <SelectItem value="Comboio 03">Comboio 03</SelectItem>
              <SelectItem value="Posto Externo">Posto Externo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Observations */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base">Observações</Label>
            {voice.isSupported && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => startVoiceForField('observations')}
                className={cn(activeVoiceField === 'observations' && voice.isListening && "bg-red-100")}
              >
                <Mic className="w-4 h-4" />
              </Button>
            )}
          </div>
          <Textarea
            placeholder="Observações opcionais..."
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      {/* Fixed Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button 
          onClick={handleSave} 
          disabled={isSaving || !vehicleCode || !fuelQuantity}
          className="w-full h-14 text-lg gap-2"
        >
          {isSaving ? (
            'Salvando...'
          ) : (
            <>
              <Save className="w-5 h-5" />
              Registrar Abastecimento
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
