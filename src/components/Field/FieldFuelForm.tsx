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
  X,
  Image,
  Loader2,
  Trash2,
  Wifi,
  WifiOff,
  RefreshCw,
  Cloud,
  CloudOff,
  ScanLine,
  Wrench,
  Clock,
  AlertCircle,
  Receipt,
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
import { formatCurrencyInput, parseCurrencyInput, formatQuantityInput } from '@/lib/numberToWords';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface FieldFuelFormProps {
  user: FieldUser;
  onLogout: () => void;
  onBack?: () => void;
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

export function FieldFuelForm({ user, onLogout, onBack }: FieldFuelFormProps) {
  const { data: vehiclesData } = useSheetData('Veiculo');
  const { data: abastecimentoData } = useSheetData('AbastecimentoCanteiro01');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Photo state
  const [photoPump, setPhotoPump] = useState<File | null>(null);
  const [photoPumpPreview, setPhotoPumpPreview] = useState<string | null>(null);
  const [photoHorimeter, setPhotoHorimeter] = useState<File | null>(null);
  const [photoHorimeterPreview, setPhotoHorimeterPreview] = useState<string | null>(null);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
  
  // OCR state
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isProcessingQuantityOCR, setIsProcessingQuantityOCR] = useState(false);
  const [ocrPhotoPreview, setOcrPhotoPreview] = useState<string | null>(null);
  const [quantityOcrPhotoPreview, setQuantityOcrPhotoPreview] = useState<string | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const quantityOcrInputRef = useRef<HTMLInputElement>(null);
  
  const photoPumpInputRef = useRef<HTMLInputElement>(null);
  const photoHorimeterInputRef = useRef<HTMLInputElement>(null);
  
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
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelType, setFuelType] = useState('Diesel');
  const [arlaQuantity, setArlaQuantity] = useState('');
  const [location, setLocation] = useState(user.assigned_locations?.[0] || 'Tanque Canteiro 01');
  const [observations, setObservations] = useState('');
  
  // Equipment-specific fields (optional)
  const [oilType, setOilType] = useState('');
  const [oilQuantity, setOilQuantity] = useState('');
  const [filterBlow, setFilterBlow] = useState(false);
  const [filterBlowQuantity, setFilterBlowQuantity] = useState('');
  const [lubricant, setLubricant] = useState('');
  
  // Oil types from database
  const [oilTypes, setOilTypes] = useState<{ id: string; name: string }[]>([]);
  
  // Lubricants from database
  const [lubricants, setLubricants] = useState<{ id: string; name: string }[]>([]);
  
  // Suppliers from database
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  
  // Entry-specific fields (Entrada)
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [entryLocation, setEntryLocation] = useState('');
  
  // Invoice photo state (for Entrada)
  const [photoInvoice, setPhotoInvoice] = useState<File | null>(null);
  const [photoInvoicePreview, setPhotoInvoicePreview] = useState<string | null>(null);
  const photoInvoiceInputRef = useRef<HTMLInputElement>(null);
  
  // Quantity in words (for Entrada)
  const [quantityInWords, setQuantityInWords] = useState('');

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
    // Remove thousand separators (.) and replace decimal separator (,) with (.)
    const normalized = value.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
  };

  // Handle horimeter input with Brazilian formatting
  const handleHorimeterChange = (value: string, setter: (val: string) => void) => {
    // Allow only numbers, dots, and commas
    const cleaned = value.replace(/[^\d.,]/g, '');
    setter(cleaned);
  };

  // Check if category is equipment
  const isEquipment = category ? (
    category.toLowerCase().includes('equipamento') || 
    category.toLowerCase().includes('maquina') ||
    category.toLowerCase().includes('máquina')
  ) : false;

  // Voice recognition
  const voice = useVoiceRecognition();

  // Fetch oil types and lubricants from database
  useEffect(() => {
    const fetchOilTypes = async () => {
      try {
        const { data, error } = await supabase
          .from('oil_types')
          .select('id, name')
          .eq('active', true)
          .order('name', { ascending: true });
        
        if (!error && data) {
          setOilTypes(data);
        }
      } catch (err) {
        console.error('Error fetching oil types:', err);
      }
    };
    
    const fetchLubricants = async () => {
      try {
        const { data, error } = await supabase
          .from('lubricants')
          .select('id, name')
          .eq('active', true)
          .order('name', { ascending: true });
        
        if (!error && data) {
          setLubricants(data);
        }
      } catch (err) {
        console.error('Error fetching lubricants:', err);
      }
    };
    
    const fetchSuppliers = async () => {
      try {
        const { data, error } = await supabase
          .from('suppliers')
          .select('id, name')
          .eq('active', true)
          .order('name', { ascending: true });
        
        if (!error && data) {
          setSuppliers(data);
        }
      } catch (err) {
        console.error('Error fetching suppliers:', err);
      }
    };
    
    fetchOilTypes();
    fetchLubricants();
    fetchSuppliers();
  }, []);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restabelecida!');
      // Auto-sync pending records when back online
      syncPendingRecords();
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Sem conexão. Registros serão salvos localmente.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check for pending records on mount
    checkPendingRecords();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check pending records count
  const checkPendingRecords = async () => {
    try {
      const { count } = await supabase
        .from('field_fuel_records')
        .select('*', { count: 'exact', head: true })
        .eq('synced_to_sheet', false)
        .eq('user_id', user.id);
      
      setPendingCount(count || 0);
    } catch (err) {
      console.error('Error checking pending records:', err);
    }
  };

  // Sync pending records to Google Sheets
  const syncPendingRecords = async () => {
    if (isSyncing || !isOnline) return;
    
    setIsSyncing(true);
    
    try {
      const { data: pendingRecords, error } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('synced_to_sheet', false)
        .eq('user_id', user.id);

      if (error) throw error;

      if (!pendingRecords || pendingRecords.length === 0) {
        setPendingCount(0);
        setIsSyncing(false);
        return;
      }

      let synced = 0;
      for (const record of pendingRecords) {
        const syncSuccess = await syncToGoogleSheets({
          date: new Date(record.record_date).toLocaleDateString('pt-BR'),
          time: record.record_time,
          recordType: (record as any).record_type || 'saida',
          vehicleCode: record.vehicle_code,
          vehicleDescription: record.vehicle_description || '',
          category: record.category || '',
          operatorName: record.operator_name || '',
          company: record.company || '',
          workSite: record.work_site || '',
          horimeterPrevious: record.horimeter_previous || 0,
          horimeterCurrent: record.horimeter_current || 0,
          fuelQuantity: record.fuel_quantity,
          fuelType: record.fuel_type || 'Diesel',
          arlaQuantity: record.arla_quantity || 0,
          location: record.location || '',
          observations: record.observations || '',
          photoPumpUrl: record.photo_pump_url,
          photoHorimeterUrl: record.photo_horimeter_url,
          oilType: (record as any).oil_type || '',
          oilQuantity: (record as any).oil_quantity || 0,
          filterBlow: (record as any).filter_blow || false,
          lubricant: (record as any).lubricant || '',
          supplier: (record as any).supplier || '',
          invoiceNumber: (record as any).invoice_number || '',
          unitPrice: (record as any).unit_price || 0,
          entryLocation: (record as any).entry_location || '',
        });

        if (syncSuccess) {
          await supabase
            .from('field_fuel_records')
            .update({ synced_to_sheet: true })
            .eq('id', record.id);
          synced++;
        }
      }

      if (synced > 0) {
        toast.success(`${synced} registro(s) sincronizado(s) com sucesso!`);
      }
      
      await checkPendingRecords();
    } catch (err) {
      console.error('Error syncing pending records:', err);
      toast.error('Erro ao sincronizar registros pendentes');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle photo capture
  const handlePhotoCapture = (type: 'pump' | 'horimeter') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;
      if (type === 'pump') {
        setPhotoPump(file);
        setPhotoPumpPreview(preview);
      } else {
        setPhotoHorimeter(file);
        setPhotoHorimeterPreview(preview);
      }
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (type: 'pump' | 'horimeter' | 'invoice') => {
    if (type === 'pump') {
      setPhotoPump(null);
      setPhotoPumpPreview(null);
      if (photoPumpInputRef.current) photoPumpInputRef.current.value = '';
    } else if (type === 'horimeter') {
      setPhotoHorimeter(null);
      setPhotoHorimeterPreview(null);
      if (photoHorimeterInputRef.current) photoHorimeterInputRef.current.value = '';
    } else {
      setPhotoInvoice(null);
      setPhotoInvoicePreview(null);
      if (photoInvoiceInputRef.current) photoInvoiceInputRef.current.value = '';
    }
  };

  // Handle invoice photo capture
  const handleInvoicePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoInvoice(file);
      setPhotoInvoicePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadPhoto = async (file: File, type: 'pump' | 'horimeter' | 'invoice'): Promise<string | null> => {
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${user.id}/${type}_${timestamp}.${ext}`;

    const { data, error } = await supabase.storage
      .from('field-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('field-photos')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };
  
  // Handle entry quantity change with auto-formatting and words
  const handleEntryQuantityChange = (value: string) => {
    const result = formatQuantityInput(value);
    setFuelQuantity(result.raw.toString());
    setQuantityInWords(result.inWords);
  };
  
  // Handle unit price change with currency formatting
  const handleUnitPriceChange = (value: string) => {
    const formatted = formatCurrencyInput(value);
    setUnitPrice(formatted);
  };

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

  // Handle vehicle selection - fetch previous horimeter/km
  const handleVehicleSelect = async (code: string) => {
    setVehicleCode(code);
    const vehicle = vehiclesData.rows.find(v => String(v['Codigo']) === code);
    if (vehicle) {
      setVehicleDescription(String(vehicle['Descricao'] || ''));
      setCategory(String(vehicle['Categoria'] || ''));
      setCompany(String(vehicle['Empresa'] || ''));
      setOperatorName(String(vehicle['Motorista'] || ''));
      setWorkSite(String(vehicle['Obra'] || ''));
      
      // Fetch last horimeter/km value from database or sheet
      await fetchPreviousHorimeter(code);
    }
  };

  // Fetch previous horimeter/km from records
  const fetchPreviousHorimeter = async (vehicleCode: string) => {
    try {
      let bestValue = 0;
      let bestSource = '';
      
      // 1. Try from field_fuel_records (most recent refueling record)
      const { data: fuelRecords } = await supabase
        .from('field_fuel_records')
        .select('horimeter_current, km_current, record_date, record_time')
        .eq('vehicle_code', vehicleCode)
        .eq('record_type', 'saida')
        .gt('horimeter_current', 0)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(1);

      if (fuelRecords && fuelRecords.length > 0) {
        const value = Number(fuelRecords[0].horimeter_current) || Number(fuelRecords[0].km_current) || 0;
        if (value > bestValue) {
          bestValue = value;
          bestSource = 'abastecimento';
        }
      }

      // 2. Try from horimeter_readings table (dedicated horimeter tracking)
      // First need to find the vehicle_id from the code
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      if (vehicleData?.id) {
        const { data: horimeterRecords } = await supabase
          .from('horimeter_readings')
          .select('current_value, reading_date')
          .eq('vehicle_id', vehicleData.id)
          .order('reading_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        if (horimeterRecords && horimeterRecords.length > 0) {
          const value = Number(horimeterRecords[0].current_value) || 0;
          if (value > bestValue) {
            bestValue = value;
            bestSource = 'horímetro';
          }
        }
      }

      // 3. Try from Google Sheets data (backup)
      if (bestValue === 0 && abastecimentoData.rows.length > 0) {
        const vehicleRecords = abastecimentoData.rows
          .filter(row => {
            const rowVehicle = String(row['VEICULO'] || row['Veiculo'] || '').trim();
            return rowVehicle === vehicleCode;
          })
          .map(row => {
            // Parse date in DD/MM/YYYY format
            const dateStr = String(row['DATA'] || '');
            const [day, month, year] = dateStr.split('/').map(Number);
            const date = new Date(year, month - 1, day);
            const horAtual = parseFloat(String(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || row['HORIMETRO'] || 0).replace(',', '.')) || 0;
            const kmAtual = parseFloat(String(row['KM ATUAL'] || row['KM_ATUAL'] || row['KM'] || 0).replace(',', '.')) || 0;
            return { date, value: Math.max(horAtual, kmAtual) };
          })
          .filter(r => r.value > 0)
          .sort((a, b) => b.date.getTime() - a.date.getTime());

        if (vehicleRecords.length > 0 && vehicleRecords[0].value > bestValue) {
          bestValue = vehicleRecords[0].value;
          bestSource = 'planilha';
        }
      }

      // Set the best value found
      if (bestValue > 0) {
        setHorimeterPrevious(formatBrazilianNumber(bestValue));
        toast.info(`Último registro (${bestSource}): ${formatBrazilianNumber(bestValue)}`);
      } else {
        setHorimeterPrevious('');
      }
    } catch (err) {
      console.error('Error fetching previous horimeter:', err);
      toast.error('Erro ao buscar horímetro anterior');
    }
  };

  // OCR - recognize horimeter value from photo
  const handleOCRCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingOCR(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setOcrPhotoPreview(base64);

        // Call OCR edge function
        toast.info('Analisando imagem...');
        
        const { data, error } = await supabase.functions.invoke('ocr-horimeter', {
          body: { image: base64 }
        });

        if (error) {
          console.error('OCR error:', error);
          toast.error('Erro ao analisar imagem');
          setIsProcessingOCR(false);
          return;
        }

        if (data?.success && data?.value) {
          setHorimeterCurrent(String(data.value));
          toast.success(`Valor reconhecido: ${data.value}`);
          
          // Also set this as the photo for the record
          setPhotoHorimeter(file);
          setPhotoHorimeterPreview(base64);
        } else {
          toast.error('Não foi possível reconhecer o valor. Tente novamente ou digite manualmente.');
        }
        
        setIsProcessingOCR(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('OCR capture error:', err);
      toast.error('Erro ao processar imagem');
      setIsProcessingOCR(false);
    }

    // Reset input
    if (ocrInputRef.current) ocrInputRef.current.value = '';
  };

  // OCR - recognize fuel quantity value from photo
  const handleQuantityOCRCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingQuantityOCR(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setQuantityOcrPhotoPreview(base64);

        // Call OCR edge function with quantity type
        toast.info('Analisando imagem da bomba...');
        
        const { data, error } = await supabase.functions.invoke('ocr-horimeter', {
          body: { image: base64, type: 'quantity' }
        });

        if (error) {
          console.error('OCR quantity error:', error);
          toast.error('Erro ao analisar imagem');
          setIsProcessingQuantityOCR(false);
          return;
        }

        if (data?.success && data?.value) {
          setFuelQuantity(String(data.value));
          toast.success(`Quantidade reconhecida: ${data.value} L`);
          
          // Also set this as the pump photo for the record
          setPhotoPump(file);
          setPhotoPumpPreview(base64);
        } else {
          toast.error('Não foi possível reconhecer o valor. Tente novamente ou digite manualmente.');
        }
        
        setIsProcessingQuantityOCR(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('OCR quantity capture error:', err);
      toast.error('Erro ao processar imagem');
      setIsProcessingQuantityOCR(false);
    }

    // Reset input
    if (quantityOcrInputRef.current) quantityOcrInputRef.current.value = '';
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

  // Sync to Google Sheets
  const syncToGoogleSheets = async (recordData: {
    date: string;
    time: string;
    recordType: string;
    vehicleCode: string;
    vehicleDescription: string;
    category: string;
    operatorName: string;
    company: string;
    workSite: string;
    horimeterPrevious: number;
    horimeterCurrent: number;
    fuelQuantity: number;
    fuelType: string;
    arlaQuantity: number;
    location: string;
    observations: string;
    photoPumpUrl: string | null;
    photoHorimeterUrl: string | null;
    // Equipment fields
    oilType?: string;
    oilQuantity?: number;
    filterBlow?: boolean;
    filterBlowQuantity?: number;
    lubricant?: string;
    // Entry fields
    supplier?: string;
    invoiceNumber?: string;
    unitPrice?: number;
    entryLocation?: string;
  }): Promise<boolean> => {
    try {
      // Format data according to sheet columns
      const sheetData: Record<string, any> = {
        'DATA': recordData.date,
        'HORA': recordData.time,
        'TIPO': recordData.recordType === 'entrada' ? 'Entrada' : 'Saída',
        'VEICULO': recordData.vehicleCode,
        'DESCRICAO': recordData.vehicleDescription,
        'CATEGORIA': recordData.category,
        'MOTORISTA': recordData.operatorName,
        'EMPRESA': recordData.company,
        'OBRA': recordData.workSite,
        'HORIMETRO ANTERIOR': recordData.horimeterPrevious || '',
        'HORIMETRO ATUAL': recordData.horimeterCurrent || '',
        'KM ANTERIOR': '',
        'KM ATUAL': '',
        'QUANTIDADE': recordData.fuelQuantity,
        'QUANTIDADE DE ARLA': recordData.arlaQuantity || '',
        'TIPO DE COMBUSTIVEL': recordData.fuelType,
        'LOCAL': recordData.location,
        'OBSERVAÇÃO': recordData.observations || '',
        'FOTO BOMBA': recordData.photoPumpUrl || '',
        'FOTO HORIMETRO': recordData.photoHorimeterUrl || '',
        // Equipment fields
        'TIPO DE ÓLEO': recordData.oilType || '',
        'QUANTIDADE DE ÓLEO': recordData.oilQuantity || '',
        'SOPRA FILTRO': recordData.filterBlowQuantity || '',
        'LUBRIFICANTE': recordData.lubricant || '',
        // Entry fields
        'FORNECEDOR': recordData.supplier || '',
        'NOTA FISCAL': recordData.invoiceNumber || '',
        'VALOR UNITÁRIO': recordData.unitPrice || '',
        'LOCAL DE ENTRADA': recordData.entryLocation || '',
      };

      const response = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'create',
          sheetName: 'AbastecimentoCanteiro01',
          data: sheetData,
        },
      });

      if (response.error) {
        console.error('Sync error:', response.error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Sync to sheets failed:', err);
      return false;
    }
  };

  // Save record
  const handleSave = async () => {
    // Validate based on record type
    if (recordType === 'saida') {
      if (!vehicleCode || !fuelQuantity) {
        toast.error('Preencha veículo e quantidade');
        return;
      }
      // Validate horimeter for equipment
      if (isEquipment && !horimeterCurrent) {
        toast.error('Horímetro Atual é obrigatório para equipamentos');
        return;
      }
      
      // Validate horimeter current > previous
      if (horimeterCurrent && horimeterPrevious) {
        const currentValue = parseBrazilianNumber(horimeterCurrent);
        const previousValue = parseBrazilianNumber(horimeterPrevious);
        
        if (currentValue <= previousValue) {
          toast.error(`Horímetro Atual (${formatBrazilianNumber(currentValue)}) deve ser maior que o Anterior (${formatBrazilianNumber(previousValue)})`);
          return;
        }
        
        // Warn if difference is too large (possible error)
        const difference = currentValue - previousValue;
        if (difference > 500) {
          const confirmed = window.confirm(
            `A diferença de horímetro é muito alta (${formatBrazilianNumber(difference)}). Deseja continuar mesmo assim?`
          );
          if (!confirmed) return;
        }
      }
    } else {
      // Entrada validation
      if (!supplier || !fuelQuantity) {
        toast.error('Preencha fornecedor e quantidade');
        return;
      }
    }

    setIsSaving(true);
    setIsUploadingPhotos(true);

    try {
      // Upload photos first
      let photoPumpUrl: string | null = null;
      let photoHorimeterUrl: string | null = null;
      let photoInvoiceUrl: string | null = null;

      if (photoPump) {
        toast.info('Enviando foto da bomba...');
        photoPumpUrl = await uploadPhoto(photoPump, 'pump');
      }

      if (photoHorimeter) {
        toast.info('Enviando foto do horímetro...');
        photoHorimeterUrl = await uploadPhoto(photoHorimeter, 'horimeter');
      }
      
      if (photoInvoice) {
        toast.info('Enviando foto da nota fiscal...');
        photoInvoiceUrl = await uploadPhoto(photoInvoice, 'invoice');
      }

      setIsUploadingPhotos(false);

      // Get current date and time
      const now = new Date();
      const recordDate = now.toLocaleDateString('pt-BR');
      const recordTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Save to database first
      const { data: savedRecord, error } = await supabase
        .from('field_fuel_records')
        .insert({
          user_id: user.id,
          record_type: recordType,
          vehicle_code: recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
          vehicle_description: recordType === 'entrada' ? supplier : vehicleDescription,
          category: recordType === 'entrada' ? 'ENTRADA' : category,
          operator_name: recordType === 'entrada' ? '' : (operatorName || user.name),
          company,
          work_site: workSite,
          horimeter_previous: parseBrazilianNumber(horimeterPrevious),
          horimeter_current: parseBrazilianNumber(horimeterCurrent),
          fuel_quantity: parseFloat(fuelQuantity) || 0,
          fuel_type: fuelType,
          arla_quantity: parseFloat(arlaQuantity) || 0,
          location: recordType === 'entrada' ? entryLocation : location,
          observations: recordType === 'entrada' && photoInvoiceUrl 
            ? `${observations} | FOTO NF: ${photoInvoiceUrl}`.trim() 
            : observations,
          photo_pump_url: photoPumpUrl,
          photo_horimeter_url: photoHorimeterUrl,
          record_date: now.toISOString().split('T')[0],
          record_time: recordTime,
          synced_to_sheet: false,
          // Equipment fields
          oil_type: oilType || null,
          oil_quantity: parseFloat(oilQuantity) || null,
          filter_blow: filterBlow || false,
          filter_blow_quantity: parseFloat(filterBlowQuantity) || null,
          lubricant: lubricant || null,
          // Entry fields
          supplier: supplier || null,
          invoice_number: invoiceNumber || null,
          unit_price: parseCurrencyInput(unitPrice) || null,
          entry_location: entryLocation || null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Sync to Google Sheets
      toast.info('Sincronizando com planilha...');
      const syncSuccess = await syncToGoogleSheets({
        date: recordDate,
        time: recordTime,
        recordType,
        vehicleCode: recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
        vehicleDescription: recordType === 'entrada' ? supplier : vehicleDescription,
        category: recordType === 'entrada' ? 'ENTRADA' : category,
        operatorName: recordType === 'entrada' ? '' : (operatorName || user.name),
        company,
        workSite,
        horimeterPrevious: parseBrazilianNumber(horimeterPrevious),
        horimeterCurrent: parseBrazilianNumber(horimeterCurrent),
        fuelQuantity: parseFloat(fuelQuantity) || 0,
        fuelType,
        arlaQuantity: parseFloat(arlaQuantity) || 0,
        location: recordType === 'entrada' ? entryLocation : location,
        observations: recordType === 'entrada' && photoInvoiceUrl 
          ? `${observations} | FOTO NF: ${photoInvoiceUrl}`.trim() 
          : observations,
        photoPumpUrl,
        photoHorimeterUrl,
        oilType,
        oilQuantity: parseFloat(oilQuantity) || 0,
        filterBlow,
        filterBlowQuantity: parseFloat(filterBlowQuantity) || 0,
        lubricant,
        supplier,
        invoiceNumber,
        unitPrice: parseCurrencyInput(unitPrice) || 0,
        entryLocation,
      });

      // Update sync status in database
      if (syncSuccess && savedRecord) {
        await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('id', savedRecord.id);
      }

      // Haptic feedback - vibrate on success
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]); // Short vibration pattern
      }

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
      }, 2500);
      
      // Update pending count
      await checkPendingRecords();
      
      toast.success(syncSuccess 
        ? 'Abastecimento registrado e sincronizado!' 
        : 'Abastecimento registrado! (Sincronização pendente)');
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Erro ao salvar');
    } finally {
      setIsSaving(false);
      setIsUploadingPhotos(false);
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
    setPhotoPump(null);
    setPhotoPumpPreview(null);
    setPhotoHorimeter(null);
    setPhotoHorimeterPreview(null);
    setOcrPhotoPreview(null);
    setQuantityOcrPhotoPreview(null);
    setOilType('');
    setOilQuantity('');
    setFilterBlow(false);
    setFilterBlowQuantity('');
    setLubricant('');
    setSupplier('');
    setInvoiceNumber('');
    setUnitPrice('');
    setEntryLocation('');
    if (photoPumpInputRef.current) photoPumpInputRef.current.value = '';
    if (photoHorimeterInputRef.current) photoHorimeterInputRef.current.value = '';
    if (ocrInputRef.current) ocrInputRef.current.value = '';
    if (quantityOcrInputRef.current) quantityOcrInputRef.current.value = '';
  };

  // Get unique vehicles from sheet
  const vehicles = vehiclesData.rows.map(v => ({
    code: String(v['Codigo'] || ''),
    description: String(v['Descricao'] || ''),
  })).filter(v => v.code);

  // Success overlay with animation
  if (showSuccess) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center z-50 animate-in fade-in duration-300">
        <div className="text-center text-white space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping" style={{ animationDuration: '1s' }} />
            <CheckCircle className="w-28 h-28 mx-auto relative z-10 animate-in zoom-in duration-500" />
          </div>
          <h2 className="text-3xl font-bold animate-in slide-in-from-bottom duration-500">
            {recordType === 'entrada' ? 'Entrada Registrada!' : 'Abastecimento Registrado!'}
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
    <div className="bg-background pb-4">
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
        {/* Current Date/Time Display (Auto-filled) */}
        <div className="bg-muted/50 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Data e Hora do Registro</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Data</p>
              <p className="text-lg font-bold">{new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hora</p>
              <p className="text-lg font-bold">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 italic">
            * Preenchido automaticamente no momento do registro
          </p>
        </div>

        {/* Record Type Selection */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <Label className="flex items-center gap-2 text-base font-medium">
            Tipo de Registro
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant={recordType === 'saida' ? 'default' : 'outline'}
              className={cn(
                "h-14 text-lg",
                recordType === 'saida' && "bg-red-500 hover:bg-red-600"
              )}
              onClick={() => setRecordType('saida')}
            >
              <Fuel className="w-5 h-5 mr-2" />
              Saída
            </Button>
            <Button
              type="button"
              variant={recordType === 'entrada' ? 'default' : 'outline'}
              className={cn(
                "h-14 text-lg",
                recordType === 'entrada' && "bg-green-500 hover:bg-green-600"
              )}
              onClick={() => setRecordType('entrada')}
            >
              <Building2 className="w-5 h-5 mr-2" />
              Entrada
            </Button>
          </div>
        </div>

        {/* SAÍDA FORM */}
        {recordType === 'saida' && (
          <>
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
                <SelectContent className="max-h-60 z-50 bg-popover">
                  {vehicles.length === 0 ? (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      Carregando veículos...
                    </div>
                  ) : (
                    vehicles.map(v => (
                      <SelectItem key={v.code} value={v.code}>
                        {v.code}
                      </SelectItem>
                    ))
                  )}
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
          
          {/* Previous horimeter/km display */}
          {horimeterPrevious && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Último registro: <span className="font-bold">{horimeterPrevious}</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Fuel Quantity with OCR */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-base">
              <Fuel className="w-4 h-4" />
              Quantidade (Litros)
            </Label>
            <div className="flex items-center gap-1">
              {/* OCR Button for quantity */}
              <input
                ref={quantityOcrInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleQuantityOCRCapture}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => quantityOcrInputRef.current?.click()}
                disabled={isProcessingQuantityOCR}
                className="gap-1"
                title="Tirar foto da bomba para reconhecer valor"
              >
                {isProcessingQuantityOCR ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ScanLine className="w-4 h-4" />
                    <span className="text-xs hidden sm:inline">OCR</span>
                  </>
                )}
              </Button>
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
          </div>
          
          {/* OCR Preview for quantity */}
          {quantityOcrPhotoPreview && isProcessingQuantityOCR && (
            <div className="relative">
              <img 
                src={quantityOcrPhotoPreview} 
                alt="Analisando" 
                className="w-full h-24 object-cover rounded-lg opacity-50"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-background/90 px-3 py-2 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Reconhecendo valor...</span>
                </div>
              </div>
            </div>
          )}
          
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Ex: 150"
            value={fuelQuantity}
            onChange={(e) => setFuelQuantity(e.target.value)}
            className="h-14 text-2xl text-center font-bold"
          />
        </div>

        {/* Horimeter with OCR */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 text-base">
              <Gauge className="w-4 h-4" />
              Horímetro / KM Atual
              {isEquipment && recordType === 'saida' && (
                <span className="text-red-500 text-lg">*</span>
              )}
            </Label>
            <div className="flex items-center gap-1">
              {/* OCR Button */}
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOCRCapture}
                className="hidden"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => ocrInputRef.current?.click()}
                disabled={isProcessingOCR}
                className="gap-1"
                title="Tirar foto para reconhecer valor"
              >
                {isProcessingOCR ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ScanLine className="w-4 h-4" />
                    <span className="text-xs hidden sm:inline">OCR</span>
                  </>
                )}
              </Button>
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
          </div>
          
          {/* OCR Preview */}
          {ocrPhotoPreview && isProcessingOCR && (
            <div className="relative">
              <img 
                src={ocrPhotoPreview} 
                alt="Analisando" 
                className="w-full h-24 object-cover rounded-lg opacity-50"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-background/90 px-3 py-2 rounded-lg flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Reconhecendo valor...</span>
                </div>
              </div>
            </div>
          )}
          
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Ex: 4.452,50"
            value={horimeterCurrent}
            onChange={(e) => handleHorimeterChange(e.target.value, setHorimeterCurrent)}
            onBlur={() => {
              if (horimeterCurrent) {
                setHorimeterCurrent(formatBrazilianNumber(parseBrazilianNumber(horimeterCurrent)));
              }
            }}
            className="h-12 text-lg text-center"
          />
          
          {/* Validation warning */}
          {horimeterPrevious && horimeterCurrent && parseBrazilianNumber(horimeterCurrent) < parseBrazilianNumber(horimeterPrevious) && (
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-2 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Valor atual menor que anterior. Verifique!</span>
              </div>
            </div>
          )}
        </div>

        {/* Equipment-specific fields (optional) */}
        {isEquipment && recordType === 'saida' && (
          <div className="bg-card rounded-xl border border-orange-200 dark:border-orange-800 p-4 space-y-4">
            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <Wrench className="w-5 h-5" />
              <Label className="text-base font-medium">Dados do Equipamento (Opcional)</Label>
            </div>
            
            {/* Oil Type */}
            <div className="space-y-2">
              <Label className="text-sm">Tipo de Óleo</Label>
              <Select value={oilType} onValueChange={setOilType}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {oilTypes.map((oil) => (
                    <SelectItem key={oil.id} value={oil.name}>
                      {oil.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Oil Quantity */}
            <div className="space-y-2">
              <Label className="text-sm">Quantidade de Óleo (Litros)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Ex: 5"
                value={oilQuantity}
                onChange={(e) => setOilQuantity(e.target.value)}
                className="h-10"
              />
            </div>
            
            {/* Filter Blow - just quantity input */}
            <div className="space-y-2">
              <Label className="text-sm">Sopra Filtro (Quantidade)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Quantidade (opcional)"
                value={filterBlowQuantity}
                onChange={(e) => setFilterBlowQuantity(e.target.value)}
                className="h-10"
              />
            </div>
            
            {/* Lubricant */}
            <div className="space-y-2">
              <Label className="text-sm">Lubrificante</Label>
              <Select value={lubricant} onValueChange={setLubricant}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Nenhum</SelectItem>
                  {lubricants.map((lub) => (
                    <SelectItem key={lub.id} value={lub.name}>
                      {lub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
          </>
        )}

        {/* ARLA - only for Saida */}
        {recordType === 'saida' && (
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
        )}

        {/* ENTRADA FORM */}
        {recordType === 'entrada' && (
          <>
            {/* Supplier */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <Building2 className="w-4 h-4" />
                Fornecedor
              </Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger className="h-12 text-lg">
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent className="max-h-60 z-50 bg-popover">
                  {suppliers.length === 0 ? (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      Nenhum fornecedor cadastrado
                    </div>
                  ) : (
                    suppliers.map(s => (
                      <SelectItem key={s.id} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {suppliers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Cadastre fornecedores em Cadastros → Fornecedores
                </p>
              )}
            </div>

            {/* Fuel Quantity with number in words */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-base">
                  <Fuel className="w-4 h-4" />
                  Quantidade (Litros)
                </Label>
              </div>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Ex: 1000"
                value={fuelQuantity ? parseInt(fuelQuantity).toLocaleString('pt-BR') : ''}
                onChange={(e) => handleEntryQuantityChange(e.target.value)}
                className="h-14 text-2xl text-center font-bold"
              />
              {quantityInWords && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                  <p className="text-green-700 dark:text-green-300 text-sm font-medium text-center">
                    {quantityInWords}
                  </p>
                </div>
              )}
            </div>

            {/* Invoice Number */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <Receipt className="w-4 h-4" />
                Nota Fiscal
              </Label>
              <Input
                type="text"
                placeholder="Número da NF"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="h-12 text-lg"
              />
            </div>

            {/* Unit Price - currency auto-format */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <Label className="flex items-center gap-2 text-base">
                Valor Unitário (R$)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                  R$
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={unitPrice}
                  onChange={(e) => handleUnitPriceChange(e.target.value)}
                  className="h-12 text-lg pl-10"
                />
              </div>
            </div>

            {/* Entry Location */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <MapPin className="w-4 h-4" />
                Local de Entrada
              </Label>
              <Select value={entryLocation} onValueChange={setEntryLocation}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="Tanque Canteiro 01">Tanque Canteiro 01</SelectItem>
                  <SelectItem value="Tanque Canteiro 02">Tanque Canteiro 02</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Invoice Photo */}
            <div className="bg-card rounded-xl border border-green-200 dark:border-green-800 p-4 space-y-3">
              <Label className="flex items-center gap-2 text-base text-green-600 dark:text-green-400">
                <Camera className="w-4 h-4" />
                Foto da Nota Fiscal (Opcional)
              </Label>
              <input
                ref={photoInvoiceInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleInvoicePhotoCapture}
                className="hidden"
              />
              {photoInvoicePreview ? (
                <div className="relative">
                  <img 
                    src={photoInvoicePreview} 
                    alt="Nota Fiscal" 
                    className="w-full h-40 object-cover rounded-lg border border-green-200"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => removePhoto('invoice')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 flex flex-col gap-2 border-green-200 hover:bg-green-50 dark:hover:bg-green-950"
                  onClick={() => photoInvoiceInputRef.current?.click()}
                >
                  <Receipt className="w-8 h-8 text-green-500" />
                  <span className="text-xs text-muted-foreground">Tirar Foto da NF</span>
                </Button>
              )}
            </div>
          </>
        )}

        {/* Location - for Saida only */}
        {recordType === 'saida' && (
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
                {(user.assigned_locations && user.assigned_locations.length > 0
                  ? user.assigned_locations
                  : ['Tanque Canteiro 01', 'Tanque Canteiro 02', 'Comboio 01', 'Comboio 02', 'Comboio 03', 'Posto Externo']
                ).map((loc) => (
                  <SelectItem key={loc} value={loc}>
                    {loc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {user.assigned_locations && user.assigned_locations.length === 1 && (
              <p className="text-xs text-muted-foreground">
                Local pré-definido pelo administrador
              </p>
            )}
          </div>
        )}

        {/* Photos Section */}
        <div className="bg-card rounded-xl border border-border p-4 space-y-4">
          <Label className="flex items-center gap-2 text-base">
            <Camera className="w-4 h-4" />
            Fotos (Opcional)
          </Label>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Pump Photo */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Foto da Bomba</p>
              <input
                ref={photoPumpInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture('pump')}
                className="hidden"
              />
              {photoPumpPreview ? (
                <div className="relative">
                  <img 
                    src={photoPumpPreview} 
                    alt="Bomba" 
                    className="w-full h-32 object-cover rounded-lg border border-border"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => removePhoto('pump')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 flex flex-col gap-2"
                  onClick={() => photoPumpInputRef.current?.click()}
                >
                  <Camera className="w-8 h-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tirar Foto</span>
                </Button>
              )}
            </div>

            {/* Horimeter Photo */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Foto do Horímetro</p>
              <input
                ref={photoHorimeterInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture('horimeter')}
                className="hidden"
              />
              {photoHorimeterPreview ? (
                <div className="relative">
                  <img 
                    src={photoHorimeterPreview} 
                    alt="Horímetro" 
                    className="w-full h-32 object-cover rounded-lg border border-border"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => removePhoto('horimeter')}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-32 flex flex-col gap-2"
                  onClick={() => photoHorimeterInputRef.current?.click()}
                >
                  <Gauge className="w-8 h-8 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Tirar Foto</span>
                </Button>
              )}
            </div>
          </div>
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

      {/* Save Button */}
      <div className="p-4 pb-20">
        <Button 
          onClick={handleSave} 
          disabled={isSaving || isUploadingPhotos || !fuelQuantity || (recordType === 'saida' ? !vehicleCode : !supplier)}
          className={cn("w-full h-14 text-lg gap-2", recordType === 'entrada' && "bg-green-500 hover:bg-green-600")}
        >
          {isUploadingPhotos ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enviando fotos...
            </>
          ) : isSaving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              {recordType === 'entrada' ? 'Registrar Entrada' : 'Registrar Abastecimento'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
