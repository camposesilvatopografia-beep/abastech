import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
  Search,
  ChevronsUpDown,
  Check,
  QrCode,
  ChevronDown,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { getSheetData } from '@/lib/googleSheets';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatCurrencyInput, parseCurrencyInput, formatQuantityInput } from '@/lib/numberToWords';
import { CurrencyInput } from '@/components/ui/currency-input';
import logoAbastech from '@/assets/logo-abastech.png';
import { useFieldSettings, playSuccessSound, vibrateDevice } from '@/hooks/useFieldSettings';
import { useOfflineStorage } from '@/hooks/useOfflineStorage';
import { QRCodeScanner } from './QRCodeScanner';

interface RequiredFields {
  horimeter_current: boolean;
  km_current: boolean;
  fuel_quantity: boolean;
  arla_quantity: boolean;
  oil_type: boolean;
  oil_quantity: boolean;
  lubricant: boolean;
  filter_blow: boolean;
  observations: boolean;
  photo_horimeter: boolean;
  photo_pump: boolean;
  skip_all_validation?: boolean; // Admin option to skip all mandatory fields
}

const DEFAULT_REQUIRED_FIELDS: RequiredFields = {
  horimeter_current: true,
  km_current: false,
  fuel_quantity: true,
  arla_quantity: false,
  oil_type: false,
  oil_quantity: false,
  lubricant: false,
  filter_blow: false,
  observations: false,
  photo_horimeter: false,
  photo_pump: false,
  skip_all_validation: false,
};

// Function to remove accents from text (for spreadsheet compatibility)
const removeAccents = (text: string): string => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
  required_fields?: RequiredFields;
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
  const { data: abastecimentoData, refetch: refetchAbastecimento, loading: isLoadingSheetData } = useSheetData('AbastecimentoCanteiro01');
  const { settings } = useFieldSettings();
  const offlineStorage = useOfflineStorage(user.id);
  
  // Fallback vehicles from Supabase DB + IndexedDB cache for offline mode
  const [dbVehicles, setDbVehicles] = useState<{ code: string; description: string; category: string; company?: string }[]>([]);
  
  // Real-time sync broadcast
  const { broadcast } = useRealtimeSync();
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [isRefreshingHorimeter, setIsRefreshingHorimeter] = useState(false);
  
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
  
  // Quick entry mode for simplified records
  type QuickEntryMode = 'normal' | 'arla_only' | 'lubrication_only' | 'filter_blow_only' | 'oil_only' | 'comboio_tank_refuel';
  const [quickEntryMode, setQuickEntryMode] = useState<QuickEntryMode>('normal');
  
  // Comboio fuel type selection (for Tanque users refueling Comboio vehicles)
  type ComboioFuelType = null | 'tank_refuel' | 'own_refuel';
  const [comboioFuelType, setComboioFuelType] = useState<ComboioFuelType>(null);
  const [showComboioChoice, setShowComboioChoice] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(false);
  const [vehicleCode, setVehicleCode] = useState('');
  const [vehicleDescription, setVehicleDescription] = useState('');
  const [category, setCategory] = useState('');
  const [company, setCompany] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [workSite, setWorkSite] = useState('');
  const [horimeterPrevious, setHorimeterPrevious] = useState('');
  const [horimeterPreviousDate, setHorimeterPreviousDate] = useState('');
  const [lastHorimeterHistory, setLastHorimeterHistory] = useState<
    { dateTime: string; horimeterAtual: string; isKm?: boolean }[]
  >([]);
  const [lastFuelRecords, setLastFuelRecords] = useState<{
    record_date: string;
    record_time: string;
    fuel_quantity: number;
    horimeter_current: number | null;
    km_current: number | null;
    location: string | null;
  }[]>([]);
  const [horimeterCurrent, setHorimeterCurrent] = useState<number | null>(null);
  const [kmPrevious, setKmPrevious] = useState('');
  const [kmCurrent, setKmCurrent] = useState<number | null>(null);
  const [fuelQuantity, setFuelQuantity] = useState<number | null>(null);
  const [fuelType, setFuelType] = useState('Diesel');
  const [arlaQuantity, setArlaQuantity] = useState<number | null>(null);
  const [location, setLocation] = useState(user.assigned_locations?.[0] || 'Tanque Canteiro 01');
  const [observations, setObservations] = useState('');
  
  // Equipment-specific fields (optional)
  const [oilType, setOilType] = useState('');
  const [oilQuantity, setOilQuantity] = useState<number | null>(null);
  const [filterBlow, setFilterBlow] = useState(false);
  const [filterBlowQuantity, setFilterBlowQuantity] = useState<number | null>(null);
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
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
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

  // Check if category is vehicle (uses KM instead of horimeter)
  const isVehicleCategory = category ? (
    category.toLowerCase() === 'veiculo' ||
    category.toLowerCase() === 'veículo' ||
    category.toLowerCase().includes('veiculo') ||
    category.toLowerCase().includes('veículo')
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

  // Load vehicles from Supabase DB + IndexedDB cache for offline fallback
  useEffect(() => {
    const loadVehiclesFromDB = async () => {
      try {
        // Try Supabase DB first
        const { data, error } = await supabase
          .from('vehicles')
          .select('code, name, description, category, company')
          .order('code', { ascending: true });
        
        if (!error && data && data.length > 0) {
          const mapped = data.map(v => ({
            code: v.code,
            description: v.description || v.name || '',
            category: v.category || '',
            company: v.company || '',
          }));
          setDbVehicles(mapped);
          // Cache to IndexedDB for offline
          await offlineStorage.cacheData('vehicles_list', mapped);
          return;
        }
      } catch (err) {
        console.log('DB vehicles fetch failed, trying cache...');
      }
      
      // Fallback to IndexedDB cache
      try {
        const cached = await offlineStorage.getCachedData<typeof dbVehicles>('vehicles_list');
        if (cached && cached.length > 0) {
          setDbVehicles(cached);
          console.log(`Loaded ${cached.length} vehicles from offline cache`);
        }
      } catch (err) {
        console.error('Failed to load cached vehicles:', err);
      }
    };
    
    loadVehiclesFromDB();
  }, []);

  // Cache sheet vehicles to IndexedDB whenever they load successfully
  useEffect(() => {
    if (vehiclesData.rows.length > 0) {
      const mapped = vehiclesData.rows.map(v => ({
        code: String(v['Codigo'] || ''),
        description: String(v['Descricao'] || ''),
        category: String(v['Categoria'] || ''),
        company: String(v['Empresa'] || ''),
      })).filter(v => v.code);
      
      // Update DB vehicles state with sheet data (most up-to-date)
      setDbVehicles(mapped);
      // Cache to IndexedDB
      offlineStorage.cacheData('vehicles_list', mapped).catch(() => {});
    }
  }, [vehiclesData.rows]);

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
          kmPrevious: record.km_previous || 0,
          kmCurrent: record.km_current || 0,
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
          filterBlowQuantity: (record as any).filter_blow_quantity || 0,
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
    setFuelQuantity(result.raw);
    setQuantityInWords(result.inWords);
  };
  
  // Handle unit price change with currency formatting - no longer needed with CurrencyInput
  // const handleUnitPriceChange = (value: string) => { ... }

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
          const qtyNum = parseFloat(extractNumber(voice.transcript));
          setFuelQuantity(isNaN(qtyNum) ? null : qtyNum);
          break;
        case 'horimeter':
          const horNum = parseFloat(extractNumber(voice.transcript));
          setHorimeterCurrent(isNaN(horNum) ? null : horNum);
          break;
        case 'arla':
          const arlaNum = parseFloat(extractNumber(voice.transcript));
          setArlaQuantity(isNaN(arlaNum) ? null : arlaNum);
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

  // Check if a vehicle code is a Caminhão Comboio (CC prefix)
  const isComboioVehicle = (code: string, description?: string): boolean => {
    const codeUpper = code.toUpperCase();
    const descUpper = (description || '').toUpperCase();
    return (
      codeUpper.startsWith('CC') || 
      codeUpper.includes('COMBOIO') ||
      descUpper.includes('CAMINHAO COMBOIO') ||
      descUpper.includes('CAMINHÃO COMBOIO') ||
      descUpper.includes('COMBOIO')
    );
  };

  // Handle vehicle selection - fetch previous horimeter/km
  const handleVehicleSelect = async (code: string) => {
    setVehicleCode(code);
    // Try sheet data first, then fall back to DB/cached vehicles
    const sheetVehicle = vehiclesData.rows.find(v => String(v['Codigo']) === code);
    const cachedVehicle = dbVehicles.find(v => v.code === code);
    
    if (sheetVehicle) {
      const desc = String(sheetVehicle['Descricao'] || '');
      const cat = String(sheetVehicle['Categoria'] || '');
      setVehicleDescription(desc);
      setCategory(cat);
      setCompany(String(sheetVehicle['Empresa'] || ''));
      setOperatorName(String(sheetVehicle['Motorista'] || ''));
      setWorkSite(String(sheetVehicle['Obra'] || ''));
      
      if (userLocationInfo.isTanqueUser && isComboioVehicle(code, desc) && recordType === 'saida' && quickEntryMode === 'normal') {
        setShowComboioChoice(true);
        setComboioFuelType(null);
      } else {
        setShowComboioChoice(false);
        setComboioFuelType(null);
      }
      
      await fetchPreviousHorimeter(code, { forceSheetNoCache: true, vehicleCategory: cat });
    } else if (cachedVehicle) {
      // Offline fallback: use cached vehicle data
      setVehicleDescription(cachedVehicle.description);
      setCategory(cachedVehicle.category);
      setCompany(cachedVehicle.company || '');
      
      // Fetch operator from most recent fuel record or horimeter reading for this vehicle
      // This ensures the correct operator/driver is used even when offline
      try {
        const { data: recentFuel } = await supabase
          .from('field_fuel_records')
          .select('operator_name')
          .eq('vehicle_code', code)
          .not('operator_name', 'is', null)
          .neq('operator_name', '')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (recentFuel && recentFuel.length > 0 && recentFuel[0].operator_name) {
          setOperatorName(recentFuel[0].operator_name);
        } else {
          // Try from horimeter readings via vehicle code lookup
          const { data: vehicleRow } = await supabase
            .from('vehicles')
            .select('id')
            .eq('code', code)
            .maybeSingle();
          
          if (vehicleRow?.id) {
            const { data: recentHor } = await supabase
              .from('horimeter_readings')
              .select('operator')
              .eq('vehicle_id', vehicleRow.id)
              .not('operator', 'is', null)
              .neq('operator', '')
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (recentHor && recentHor.length > 0 && recentHor[0].operator) {
              setOperatorName(recentHor[0].operator);
            }
          }
        }
      } catch (err) {
        console.warn('[FieldFuelForm] Failed to fetch operator for cached vehicle:', err);
      }
      
      if (userLocationInfo.isTanqueUser && isComboioVehicle(code, cachedVehicle.description) && recordType === 'saida' && quickEntryMode === 'normal') {
        setShowComboioChoice(true);
        setComboioFuelType(null);
      } else {
        setShowComboioChoice(false);
        setComboioFuelType(null);
      }
      
      await fetchPreviousHorimeter(code, { forceSheetNoCache: false, vehicleCategory: cachedVehicle.category });
    }
  };
  
  // Handle Comboio fuel type selection
  const handleComboioFuelTypeSelect = async (type: ComboioFuelType) => {
    setComboioFuelType(type);
    setShowComboioChoice(false);
    
    if (type === 'tank_refuel') {
      // Simplified mode: only quantity and pump photo
      setQuickEntryMode('comboio_tank_refuel');
      // Clear horimeter fields since they won't be used
      setHorimeterCurrent(null);
      setHorimeterPrevious('');
      toast.info('Modo Abastecimento do Tanque: apenas quantidade e foto são obrigatórios');
    } else {
      // Full mode: all fields required - normal refueling with horimeter tracking
      setQuickEntryMode('normal');
      // Fetch previous horimeter/km for proper consumption calculation
      if (vehicleCode) {
        await fetchPreviousHorimeter(vehicleCode, { forceSheetNoCache: true });
      }
      toast.info('Modo Abastecimento Próprio: todos os campos habilitados');
    }
  };

  // Fetch previous horimeter/km from records
  // vehicleCategory: 'EQUIPAMENTO' -> prioritize horimeter, 'VEICULO' -> prioritize km
  const fetchPreviousHorimeter = async (
    vehicleCode: string,
    options?: { forceSheetNoCache?: boolean; vehicleCategory?: string }
  ) => {
    try {
      const isVehicle = (options?.vehicleCategory || '').toUpperCase() === 'VEICULO';
      let bestValue = 0; // horimeter
      let bestKmValue = 0; // km
      let bestSource = '';
      let bestDateTime: Date | null = null;
      // Helper to combine date and time into a single Date object for comparison
      const combineDateAndTime = (dateStr: string, timeStr?: string): Date => {
        const date = new Date(dateStr + 'T12:00:00');
        if (timeStr) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          date.setHours(hours || 0, minutes || 0, 0, 0);
        }
        return date;
      };
      
      // 1. Try from field_fuel_records (most recent refueling record)
      // Prefer created_at because record_date/record_time are strings and may sort incorrectly.
      const { data: fuelRecords } = await supabase
        .from('field_fuel_records')
        .select('horimeter_current, km_current, record_date, record_time, created_at')
        .eq('vehicle_code', vehicleCode)
        .or('horimeter_current.gt.0,km_current.gt.0')
        .order('created_at', { ascending: false })
        .limit(1);

      if (fuelRecords && fuelRecords.length > 0) {
        const record = fuelRecords[0];
        const horValue = Number(record.horimeter_current) || 0;
        const kmValue = Number(record.km_current) || 0;
        const recordDateTime = record.created_at ? new Date(record.created_at) : combineDateAndTime(record.record_date, record.record_time);

        if (horValue > 0 || kmValue > 0) {
          bestValue = horValue;
          bestKmValue = kmValue;
          bestDateTime = recordDateTime;
          bestSource = 'banco';
        }
      }

      // 2. Try from horimeter_readings table (dedicated horimeter tracking)
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
          .limit(1);

        if (horimeterRecords && horimeterRecords.length > 0) {
          const record = horimeterRecords[0];
          const horValue = Number(record.current_value) || 0;
          const kmValue = Number(record.current_km) || 0;
          const recordDateTime = new Date(record.reading_date + 'T23:59:59');
          
          // Use this if it's more recent
          if (!bestDateTime || recordDateTime > bestDateTime) {
            if (horValue > 0 || kmValue > 0) {
              bestValue = horValue;
              bestKmValue = kmValue;
              bestDateTime = recordDateTime;
              bestSource = 'horímetro';
            }
          }
        }
      }

      // 3. ALWAYS check Google Sheets data and compare with database records
      // The sheet might have more recent data that hasn't been synced to the database
      const sheetRows = options?.forceSheetNoCache
        ? (await getSheetData('AbastecimentoCanteiro01', { noCache: true })).rows
        : abastecimentoData.rows;

      if (sheetRows.length > 0) {
        const normalizeKey = (k: string) =>
          k
            .trim()
            .toUpperCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/\s+/g, ' ');

        const getByNormalizedKey = (row: Record<string, any>, wanted: string[]) => {
          const wantedSet = new Set(wanted.map(normalizeKey));
          for (const [k, v] of Object.entries(row)) {
            if (wantedSet.has(normalizeKey(k))) return v;
          }
          return undefined;
        };

        const parseSheetDateTime = (rawDate: any, rawTime?: any): Date | null => {
          // Google Sheets can return formatted strings ("19/01/2026") OR serial numbers.
          const dateVal = rawDate;
          const timeVal = rawTime;

          const toDateFromSerial = (serial: number): Date => {
            // Google Sheets serial date: days since 1899-12-30
            const utcMs = (serial - 25569) * 86400 * 1000;
            return new Date(utcMs);
          };

          let base: Date | null = null;

          // 1) Date
          if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
            base = toDateFromSerial(dateVal);
          } else {
            const dateStr = String(dateVal ?? '').trim();
            if (!dateStr) return null;

            // numeric string serial?
            if (/^\d+(\.\d+)?$/.test(dateStr)) {
              const serial = Number(dateStr);
              if (Number.isFinite(serial)) base = toDateFromSerial(serial);
            } else if (dateStr.includes('/')) {
              const [day, month, year] = dateStr.split('/').map((n) => Number(n));
              if (!day || !month || !year) return null;
              base = new Date(year, month - 1, day, 12, 0, 0);
            } else {
              const parsed = new Date(dateStr);
              if (Number.isNaN(parsed.getTime())) return null;
              base = new Date(parsed);
            }
          }

          if (!base || Number.isNaN(base.getTime())) return null;

          // normalize base to local midday to avoid TZ edge cases
          base.setHours(12, 0, 0, 0);

          // 2) Time
          if (typeof timeVal === 'number' && Number.isFinite(timeVal)) {
            // time as fraction of day (0..1)
            if (timeVal >= 0 && timeVal < 1) {
              const totalMinutes = Math.round(timeVal * 24 * 60);
              const h = Math.floor(totalMinutes / 60);
              const m = totalMinutes % 60;
              base.setHours(h, m, 0, 0);
            }
          } else {
            const timeStr = String(timeVal ?? '').trim();
            if (timeStr) {
              const parts = timeStr.split(':');
              const h = Number(parts[0]);
              const m = Number(parts[1] ?? 0);
              if (!Number.isNaN(h)) base.setHours(h || 0, m || 0, 0, 0);
            }
          }

          return Number.isNaN(base.getTime()) ? null : base;
        };

        const normalizeVehicleCode = (v: any) =>
          String(v ?? '')
            .replace(/\u00A0/g, ' ') // NBSP
            .trim()
            .toUpperCase()
            .replace(/[–—]/g, '-')
            .replace(/\s+/g, '');

        const targetVehicle = normalizeVehicleCode(vehicleCode);

        const vehicleRecords = sheetRows
          .filter((row) => {
            const rowVehicleRaw = getByNormalizedKey(row as any, [
              'VEICULO',
              'VEÍCULO',
              'CODIGO',
              'CÓDIGO',
              'COD',
            ]);
            const rowVehicle = normalizeVehicleCode(rowVehicleRaw);
            return rowVehicle && rowVehicle === targetVehicle;
          })
          .map((row) => {
            const dateRaw = getByNormalizedKey(row as any, ['DATA', 'DATE']);
            const timeRaw = getByNormalizedKey(row as any, ['HORA', 'TIME']);
            const dateTime = parseSheetDateTime(String(dateRaw || ''), String(timeRaw || ''));

            // Column M - HORIMETRO ATUAL
            const horAtualStr = String(
              getByNormalizedKey(row as any, [
                'HORIMETRO ATUAL',
                'HORIMETRO ATUA',
                'HOR_ATUAL',
                'HORIMETRO',
              ]) || '0'
            );
            const horAtual = parseBrazilianNumber(horAtualStr);

            const kmAtualStr = String(
              getByNormalizedKey(row as any, ['KM ATUAL', 'KM_ATUAL', 'KM']) || '0'
            );
            const kmAtual = parseBrazilianNumber(kmAtualStr);

            return {
              dateTime,
              horValue: horAtual,
              kmValue: kmAtual,
              rowIndex: (row as any)._rowIndex ?? 0,
            };
          })
          .filter((r) => !!r.dateTime && (r.horValue > 0 || r.kmValue > 0))
          .sort((a, b) => {
            const aTime = a.dateTime?.getTime() ?? 0;
            const bTime = b.dateTime?.getTime() ?? 0;
            if (aTime !== bTime) return bTime - aTime;
            return (b.rowIndex || 0) - (a.rowIndex || 0);
          });

        // Histórico (5 últimos) - sempre da planilha
        // Show horimeter for EQUIPAMENTO, km for VEICULO
        const historyTop5 = vehicleRecords.slice(0, 5).map((r) => {
          const formatted = r.dateTime!.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          // Select value based on category: VEICULO -> km, EQUIPAMENTO -> horimeter
          const displayValue = isVehicle ? r.kmValue : r.horValue;
          return {
            dateTime: formatted,
            horimeterAtual: formatBrazilianNumber(displayValue),
            isKm: isVehicle,
          };
        });
        setLastHorimeterHistory(historyTop5);

        if (vehicleRecords.length > 0) {
          const sheetRecord = vehicleRecords[0];

          // IMPORTANT: For "horímetro anterior" in Apontamento Campo we treat the spreadsheet
          // column "HORIMETRO ATUAL" (coluna M) as the source of truth for the last abastecimento.
          // So if we have a valid sheet record, we always prefer it.
          bestValue = sheetRecord.horValue;
          bestKmValue = sheetRecord.kmValue;
          bestDateTime = sheetRecord.dateTime!;
          bestSource = 'planilha';
        } else {
          setLastHorimeterHistory([]);
        }
      }

      // Set the best value found based on category
      // VEICULO -> prioritize km, EQUIPAMENTO -> prioritize horimeter
      const valueToShow = isVehicle
        ? (bestKmValue > 0 ? bestKmValue : bestValue)
        : (bestValue > 0 ? bestValue : bestKmValue);
      const unitLabel = isVehicle ? 'km' : 'h';
      
      if (valueToShow > 0) {
        setHorimeterPrevious(formatBrazilianNumber(valueToShow));
        if (bestDateTime) {
          const formattedDateTime = bestDateTime.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          setHorimeterPreviousDate(formattedDateTime);
          toast.info(`Último abastecimento em ${formattedDateTime}: ${formatBrazilianNumber(valueToShow)}${unitLabel}`);
        } else {
          setHorimeterPreviousDate('');
          toast.info(`Último registro (${bestSource}): ${formatBrazilianNumber(valueToShow)}${unitLabel}`);
        }
      } else {
        setHorimeterPrevious('');
        setHorimeterPreviousDate('');
      }
      
      // Fetch last 5 fuel records for admin users
      if (user.role === 'admin') {
        const { data: recentRecords } = await supabase
          .from('field_fuel_records')
          .select('record_date, record_time, fuel_quantity, horimeter_current, km_current, location, created_at')
          .eq('vehicle_code', vehicleCode)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (recentRecords && recentRecords.length > 0) {
          setLastFuelRecords(recentRecords);
        } else {
          setLastFuelRecords([]);
        }
      }
    } catch (err) {
      console.error('Error fetching previous horimeter:', err);
      toast.error('Erro ao buscar horímetro anterior');
    }
  };

  // Force refresh sheet data and then fetch previous horimeter
  const handleForceRefreshHorimeter = async () => {
    if (!vehicleCode) {
      toast.error('Selecione um veículo primeiro');
      return;
    }
    
    setIsRefreshingHorimeter(true);
    try {
      // Force refresh from Google Sheets
      await refetchAbastecimento(true); // true = noCache
      
      // Small delay to allow state to update
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Re-fetch horimeter with fresh data
      await fetchPreviousHorimeter(vehicleCode);
      
      toast.success('Dados atualizados com sucesso!');
    } catch (err) {
      console.error('Error refreshing horimeter data:', err);
      toast.error('Erro ao atualizar dados');
    } finally {
      setIsRefreshingHorimeter(false);
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
          setHorimeterCurrent(parseFloat(data.value) || null);
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
          setFuelQuantity(parseFloat(data.value) || null);
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
    kmPrevious?: number;
    kmCurrent?: number;
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
      const { buildFuelSheetData } = await import('@/lib/fuelSheetMapping');
      const sheetData = buildFuelSheetData({
        date: recordData.date,
        time: recordData.time,
        recordType: recordData.recordType,
        category: recordData.category,
        vehicleCode: recordData.vehicleCode,
        vehicleDescription: recordData.vehicleDescription,
        operatorName: recordData.operatorName,
        company: recordData.company,
        workSite: recordData.workSite,
        horimeterPrevious: recordData.horimeterPrevious,
        horimeterCurrent: recordData.horimeterCurrent,
        kmPrevious: recordData.kmPrevious || 0,
        kmCurrent: recordData.kmCurrent || 0,
        fuelQuantity: recordData.fuelQuantity,
        fuelType: recordData.fuelType,
        location: recordData.location,
        arlaQuantity: recordData.arlaQuantity,
        observations: recordData.observations,
        photoPumpUrl: recordData.photoPumpUrl,
        photoHorimeterUrl: recordData.photoHorimeterUrl,
        oilType: recordData.oilType,
        oilQuantity: recordData.oilQuantity,
        filterBlowQuantity: recordData.filterBlowQuantity,
        lubricant: recordData.lubricant,
        supplier: recordData.supplier,
        invoiceNumber: recordData.invoiceNumber,
        unitPrice: recordData.unitPrice,
        entryLocation: recordData.entryLocation,
      });

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
    // Quick entry mode validation - simplified
    if (quickEntryMode !== 'normal') {
      if (!vehicleCode) {
        toast.error('Selecione o veículo');
        return;
      }
      
      // Mode-specific validation
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
      if (quickEntryMode === 'comboio_tank_refuel') {
        // Comboio tank refuel: only needs quantity and pump photo
        if (!fuelQuantity) {
          toast.error('Informe a quantidade de combustível');
          return;
        }
        if (!photoPump) {
          toast.error('Foto da bomba é obrigatória para abastecimento de tanque');
          return;
        }
      }
    } else {
      // Normal mode validation
      // Get user's required fields configuration
      const requiredFields = user.required_fields || DEFAULT_REQUIRED_FIELDS;
      
      // Check if admin user has skip_all_validation enabled
      const skipValidation = requiredFields.skip_all_validation === true;
      
      if (recordType === 'saida') {
        // Vehicle is always required
        if (!vehicleCode) {
          toast.error('Selecione o veículo');
          return;
        }
        
        // Skip all field validations if admin mode is enabled
        if (!skipValidation) {
          // Validate fuel_quantity based on user config
          if (requiredFields.fuel_quantity && !fuelQuantity) {
            toast.error('Quantidade de Combustível é obrigatória');
            return;
          }
          
          // Validate horimeter based on user config (or equipment type) - skip for vehicles
          if (!isVehicleCategory && (requiredFields.horimeter_current || isEquipment) && !horimeterCurrent) {
            toast.error('Horímetro Atual é obrigatório');
            return;
          }
          
          // Validate km_current for vehicles or based on user config
          if ((isVehicleCategory || requiredFields.km_current) && !horimeterCurrent && !kmCurrent) {
            toast.error(isVehicleCategory ? 'KM Atual é obrigatório' : 'KM Atual é obrigatório');
            return;
          }
          
          // Validate arla_quantity based on user config
          if (requiredFields.arla_quantity && !arlaQuantity) {
            toast.error('Quantidade de ARLA é obrigatória');
            return;
          }
          
          // Validate oil_type based on user config
          if (requiredFields.oil_type && !oilType) {
            toast.error('Tipo de Óleo é obrigatório');
            return;
          }
          
          // Validate oil_quantity based on user config
          if (requiredFields.oil_quantity && !oilQuantity) {
            toast.error('Quantidade de Óleo é obrigatória');
            return;
          }
          
          // Validate lubricant based on user config
          if (requiredFields.lubricant && !lubricant) {
            toast.error('Lubrificante é obrigatório');
            return;
          }
          
          // Validate observations based on user config
          if (requiredFields.observations && !observations.trim()) {
            toast.error('Observações são obrigatórias');
            return;
          }
          
          // Validate photos based on user config
          if (requiredFields.photo_pump && !photoPump) {
            toast.error('Foto da Bomba é obrigatória');
            return;
          }
          if (requiredFields.photo_horimeter && !photoHorimeter) {
            toast.error('Foto do Horímetro é obrigatória');
            return;
          }
        }
        
        // Validate current > previous (only if value is provided)
        if (horimeterCurrent !== null && horimeterPrevious) {
          const currentValue = horimeterCurrent;
          const previousValue = parseBrazilianNumber(horimeterPrevious);
          const label = isVehicleCategory ? 'KM' : 'Horímetro';
          
          if (currentValue <= previousValue) {
            toast.error(`${label} Atual (${formatBrazilianNumber(currentValue)}) deve ser maior que o Anterior (${formatBrazilianNumber(previousValue)})`);
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
        // For Comboio users: require entryLocation; for Tanque users: require supplier
        const userLocations = user.assigned_locations || [];
        const isComboioUser = userLocations.some(loc => 
          loc.toLowerCase().includes('comboio') || loc.toLowerCase().startsWith('cb')
        );
        const isTanqueUser = userLocations.some(loc => 
          loc.toLowerCase().includes('tanque') || loc.toLowerCase().includes('canteiro')
        );
        const isOnlyComboio = isComboioUser && !isTanqueUser;
        
        if (!fuelQuantity) {
          toast.error('Preencha a quantidade');
          return;
        }
        
        if (isOnlyComboio) {
          // Comboio users need entry location (origin tank)
          if (!entryLocation) {
            toast.error('Selecione o local de origem');
            return;
          }
        } else if (isTanqueUser) {
          // Tanque users need supplier
          if (!supplier) {
            toast.error('Selecione o fornecedor');
            return;
          }
        }
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

      // Prepare record data - normalize record_type to remove accents for spreadsheet compatibility
      // e.g., "Saída" becomes "Saida", "Entrada" stays "Entrada"
      const normalizedRecordType = removeAccents(recordType === 'saida' ? 'Saida' : recordType === 'entrada' ? 'Entrada' : recordType);
      
      const recordData = {
        user_id: user.id,
        record_type: normalizedRecordType,
        vehicle_code: recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
        vehicle_description: recordType === 'entrada' ? (supplier || '') : vehicleDescription,
        category: recordType === 'entrada' ? 'ENTRADA' : category,
        operator_name: recordType === 'entrada' ? '' : (operatorName || user.name),
        company,
        work_site: workSite,
        // For vehicles: save to km columns; for equipment: save to horimeter columns
        horimeter_previous: quickEntryMode === 'comboio_tank_refuel' ? null : (isVehicleCategory ? null : parseBrazilianNumber(horimeterPrevious)),
        horimeter_current: quickEntryMode === 'comboio_tank_refuel' ? null : (isVehicleCategory ? null : horimeterCurrent),
        km_previous: isVehicleCategory ? parseBrazilianNumber(horimeterPrevious) : (kmPrevious ? parseBrazilianNumber(kmPrevious) : null),
        km_current: isVehicleCategory ? horimeterCurrent : (kmCurrent ?? null),
        // fuelQuantity is now a number, no need to parse
        fuel_quantity: fuelQuantity ?? 0,
        fuel_type: fuelType,
        arla_quantity: arlaQuantity ?? 0,
        location: location,
        observations: (() => {
          let obs = observations;
          // Add comboio tank refuel indicator
          if (quickEntryMode === 'comboio_tank_refuel') {
            obs = `[ABAST. TANQUE COMBOIO] ${obs}`.trim();
          }
          // Add invoice photo URL for entrada
          if (recordType === 'entrada' && photoInvoiceUrl) {
            obs = `${obs} | FOTO NF: ${photoInvoiceUrl}`.trim();
          }
          return obs;
        })(),
        photo_pump_url: photoPumpUrl,
        photo_horimeter_url: photoHorimeterUrl,
        record_date: now.toISOString().split('T')[0],
        record_time: recordTime,
        synced_to_sheet: false,
        // Equipment fields
        oil_type: oilType || null,
        oil_quantity: oilQuantity ?? null,
        filter_blow: filterBlow || false,
        filter_blow_quantity: filterBlowQuantity ?? null,
        lubricant: lubricant || null,
        // Entry fields
        supplier: supplier || null,
        invoice_number: invoiceNumber || null,
        unit_price: unitPrice ?? null,
        entry_location: entryLocation || null,
      };

      // Check if we're online
      if (!navigator.onLine && offlineStorage.isSupported) {
        // Save to IndexedDB for offline storage
        await offlineStorage.saveOfflineRecord(recordData);
        setSavedOffline(true);
        
        // Haptic feedback
        vibrateDevice(settings.vibrationEnabled);
        playSuccessSound(settings.soundEnabled);
        
        setShowSuccess(true);
        
        toast.success('Registro salvo localmente! Será sincronizado quando houver conexão.', {
          duration: 4000,
        });
        
        setTimeout(() => {
          setShowSuccess(false);
          setSavedOffline(false);
          resetForm();
          if (onBack) onBack();
        }, 2000);
        
        return;
      }

      // Save to database (online mode)
      const { data: savedRecord, error } = await supabase
        .from('field_fuel_records')
        .insert(recordData as any)
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
        vehicleDescription: recordType === 'entrada' ? (supplier || '') : vehicleDescription,
        category: recordType === 'entrada' ? 'ENTRADA' : category,
        operatorName: recordType === 'entrada' ? '' : (operatorName || user.name),
        company,
        workSite,
        horimeterPrevious: isVehicleCategory ? 0 : parseBrazilianNumber(horimeterPrevious),
        horimeterCurrent: isVehicleCategory ? 0 : (horimeterCurrent ?? 0),
        kmPrevious: isVehicleCategory ? parseBrazilianNumber(horimeterPrevious) : (kmPrevious ? parseBrazilianNumber(kmPrevious) : 0),
        kmCurrent: isVehicleCategory ? (horimeterCurrent ?? 0) : (kmCurrent ?? 0),
        fuelQuantity: fuelQuantity ?? 0,
        fuelType,
        arlaQuantity: arlaQuantity ?? 0,
        location: location,
        observations: recordType === 'entrada' && photoInvoiceUrl
          ? `${observations} | FOTO NF: ${photoInvoiceUrl}`.trim()
          : observations,
        photoPumpUrl,
        photoHorimeterUrl,
        oilType,
        oilQuantity: oilQuantity ?? 0,
        filterBlow,
        filterBlowQuantity: filterBlowQuantity ?? 0,
        lubricant,
        supplier,
        invoiceNumber,
        unitPrice: unitPrice ?? 0,
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
      vibrateDevice(settings.vibrationEnabled);
      
      // Audio notification on success
      playSuccessSound(settings.soundEnabled);

      setShowSuccess(true);
      
      // Update pending count
      await checkPendingRecords();
      
      // If sync failed, trigger background retry via edge function (fire-and-forget)
      if (!syncSuccess && savedRecord) {
        console.warn('[FieldFuelForm] Sheet sync failed, scheduling background retry...');
        // Retry via edge function after a short delay
        setTimeout(async () => {
          try {
            await supabase.functions.invoke('sync-pending-fuel', {});
            console.log('[FieldFuelForm] Background retry completed');
          } catch (retryErr) {
            console.error('[FieldFuelForm] Background retry failed:', retryErr);
          }
        }, 5000); // Wait 5s then retry
      }

      toast.success(syncSuccess 
        ? 'Abastecimento registrado e sincronizado!' 
        : 'Abastecimento registrado! Planilha será sincronizada em breve.');
      
      // Broadcast to all clients (desktop + mobile) for real-time sync
      console.log('[FieldFuelForm] Broadcasting fuel_record_created event...');
      await broadcast('fuel_record_created', { 
        vehicleCode: recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
        location: location,
        quantity: fuelQuantity ?? 0
      });
      
      // Wait for animation and then redirect to dashboard
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
        // Redirect to dashboard
        if (onBack) {
          onBack();
        }
      }, 2000);
      
    } catch (err) {
      console.error('Save error:', err);
      
      // If save failed and we have offline support, save locally
      if (offlineStorage.isSupported) {
        try {
          const now = new Date();
          const fallbackData = {
            user_id: user.id,
            record_type: recordType,
            vehicle_code: recordType === 'entrada' ? 'ENTRADA' : vehicleCode,
            vehicle_description: recordType === 'entrada' ? (supplier || '') : vehicleDescription,
            category: recordType === 'entrada' ? 'ENTRADA' : category,
            operator_name: recordType === 'entrada' ? '' : (operatorName || user.name),
            company,
            work_site: workSite,
            horimeter_previous: parseBrazilianNumber(horimeterPrevious),
            horimeter_current: horimeterCurrent ?? 0,
            fuel_quantity: fuelQuantity ?? 0,
            fuel_type: fuelType,
            arla_quantity: arlaQuantity ?? 0,
            location: location,
            observations,
            record_date: now.toISOString().split('T')[0],
            record_time: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            synced_to_sheet: false,
            oil_type: oilType || null,
            oil_quantity: oilQuantity ?? null,
            filter_blow: filterBlow || false,
            filter_blow_quantity: filterBlowQuantity ?? null,
            lubricant: lubricant || null,
            supplier: supplier || null,
            invoice_number: invoiceNumber || null,
            unit_price: unitPrice ?? null,
            entry_location: entryLocation || null,
          };
          
          await offlineStorage.saveOfflineRecord(fallbackData);
          
          vibrateDevice(settings.vibrationEnabled);
          playSuccessSound(settings.soundEnabled);
          setShowSuccess(true);
          
          toast.warning('Registro salvo localmente! Será sincronizado quando possível.', {
            duration: 4000,
          });
          
          setTimeout(() => {
            setShowSuccess(false);
            resetForm();
            if (onBack) onBack();
          }, 2000);
          
          return;
        } catch (offlineErr) {
          console.error('Offline save also failed:', offlineErr);
        }
      }
      
      toast.error('Erro ao salvar. Verifique sua conexão.');
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
    setHorimeterCurrent(null);
    setFuelQuantity(null);
    setArlaQuantity(null);
    setObservations('');
    setPhotoPump(null);
    setPhotoPumpPreview(null);
    setPhotoHorimeter(null);
    setPhotoHorimeterPreview(null);
    setOcrPhotoPreview(null);
    setQuantityOcrPhotoPreview(null);
    setOilType('');
    setOilQuantity(null);
    setFilterBlow(false);
    setFilterBlowQuantity(null);
    setLubricant('');
    setSupplier('');
    setInvoiceNumber('');
    setUnitPrice(null);
    setEntryLocation('');
    setQuickEntryMode('normal');
    setShowQuickOptions(false);
    setComboioFuelType(null);
    setShowComboioChoice(false);
    if (photoPumpInputRef.current) photoPumpInputRef.current.value = '';
    if (photoHorimeterInputRef.current) photoHorimeterInputRef.current.value = '';
    if (ocrInputRef.current) ocrInputRef.current.value = '';
    if (quantityOcrInputRef.current) quantityOcrInputRef.current.value = '';
  };

  // Determine user location type
  const userLocationInfo = useMemo(() => {
    const userLocations = user.assigned_locations || [];
    const isComboioUser = userLocations.some(loc => 
      loc.toLowerCase().includes('comboio') || loc.toLowerCase().startsWith('cb')
    );
    const isTanqueUser = userLocations.some(loc => 
      loc.toLowerCase().includes('tanque') || loc.toLowerCase().includes('canteiro')
    );
    return { isComboioUser, isTanqueUser, isOnlyComboio: isComboioUser && !isTanqueUser };
  }, [user.assigned_locations]);

  // Get quick entry mode label
  const getQuickModeLabel = (mode: QuickEntryMode): string => {
    switch (mode) {
      case 'arla_only': return 'Apenas ARLA';
      case 'lubrication_only': return 'Apenas Lubrificação';
      case 'filter_blow_only': return 'Apenas Sopra Filtro';
      case 'oil_only': return 'Apenas Completar Óleo';
      case 'comboio_tank_refuel': return 'Abastecimento do Tanque (Comboio)';
      default: return 'Apontamento Rápido';
    }
  };

  // Get unique vehicles from sheet with sorting, falling back to DB/cache when offline
  const vehicles = useMemo(() => {
    // Prefer sheet data when available
    if (vehiclesData.rows.length > 0) {
      return vehiclesData.rows
        .map(v => ({
          code: String(v['Codigo'] || ''),
          description: String(v['Descricao'] || ''),
          category: String(v['Categoria'] || ''),
        }))
        .filter(v => v.code)
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    
    // Fallback to DB/cached vehicles when sheet is unavailable (offline)
    if (dbVehicles.length > 0) {
      return dbVehicles
        .map(v => ({
          code: v.code,
          description: v.description,
          category: v.category,
        }))
        .filter(v => v.code)
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    
    return [];
  }, [vehiclesData.rows, dbVehicles]);

  // Group vehicles by category for improved search UX
  const groupedVehicles = useMemo(() => {
    const groups: Record<string, typeof vehicles> = {};
    
    vehicles.forEach(vehicle => {
      const category = vehicle.category?.trim() || 'Outros';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(vehicle);
    });

    // Sort categories alphabetically, but keep "Outros" at the end
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === 'Outros') return 1;
      if (b === 'Outros') return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    return sortedCategories.map(category => ({
      category,
      vehicles: groups[category].sort((a, b) => a.code.localeCompare(b.code))
    }));
  }, [vehicles]);

  // Custom filter function for vehicle search - prioritizes prefix matches
  const vehicleSearchFilter = React.useCallback((value: string, search: string) => {
    if (!search) return 1;
    const searchLower = search.toLowerCase().trim();
    const valueLower = value.toLowerCase();
    
    // Extract vehicle code from the value (it's the first part before space)
    const vehicleCode = valueLower.split(' ')[0];
    
    // Highest priority: code starts with search term
    if (vehicleCode.startsWith(searchLower)) {
      return 1;
    }
    
    // Second priority: code contains search term
    if (vehicleCode.includes(searchLower)) {
      return 0.8;
    }
    
    // Third priority: description or category contains search term
    if (valueLower.includes(searchLower)) {
      return 0.5;
    }
    
    return 0;
  }, []);

  // Vehicle search combobox state
  const [vehicleSearchOpen, setVehicleSearchOpen] = useState(false);
  
  // QR Code scanner state
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  
  // Handle QR code scan result from new scanner
  const handleQRCodeResult = (scannedCode: string) => {
    // Try to find the vehicle by scanned code
    const foundVehicle = vehicles.find(v => 
      v.code === scannedCode || 
      v.code.includes(scannedCode) ||
      scannedCode.includes(v.code) ||
      v.code.toLowerCase() === scannedCode.toLowerCase()
    );
    
    if (foundVehicle) {
      handleVehicleSelect(foundVehicle.code);
      toast.success(`Veículo encontrado: ${foundVehicle.code}`);
    } else {
      // Try direct code
      setVehicleCode(scannedCode);
      toast.info(`Código lido: ${scannedCode}`);
    }
  };

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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 pb-4">
      {/* Compact Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={logoAbastech} alt="Abastech" className="h-8 w-auto" />
            <span className="text-white font-bold text-base">Abastecimento</span>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-xs">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      </div>
      
      {/* Form */}
      <div className="px-3 py-3 space-y-3 max-w-2xl mx-auto">

        {/* Record Type - Fixed as Saída */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm">
          <div className="grid grid-cols-1">
            <Button
              type="button"
              variant="default"
              className="h-12 text-base font-bold bg-gradient-to-r from-red-500 to-red-600 text-white border-0 shadow-lg shadow-red-500/30 cursor-default"
              disabled
            >
              <Fuel className="w-5 h-5 mr-2" />
              Saída
            </Button>
          </div>
        </div>

        {/* Quick Entry Options based on user location */}
        {recordType === 'saida' && (
          <div className="bg-purple-50/80 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 p-3 space-y-2 shadow-sm">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-base text-purple-700 dark:text-purple-400">
                <Wrench className="w-4 h-4" />
                Apontamento Rápido
              </Label>
              <Button
                type="button"
                size="sm"
                variant={showQuickOptions ? "default" : "outline"}
                className={cn(
                  "gap-1",
                  showQuickOptions 
                    ? "bg-purple-500 hover:bg-purple-600 text-white" 
                    : "border-purple-300 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900"
                )}
                onClick={() => {
                  setShowQuickOptions(!showQuickOptions);
                  if (!showQuickOptions) setQuickEntryMode('normal');
                }}
              >
                {showQuickOptions ? 'Ocultar' : 'Opções'}
              </Button>
            </div>

            {showQuickOptions && (
              <div className="space-y-2">
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  Selecione para registrar sem informar horímetro/km e quantidade de diesel
                </p>
                
                {/* Tanque/Canteiro users - ARLA only option */}
                {userLocationInfo.isTanqueUser && (
                  <Button
                    type="button"
                    variant={quickEntryMode === 'arla_only' ? 'default' : 'outline'}
                    className={cn(
                      "w-full h-12 justify-start gap-2",
                      quickEntryMode === 'arla_only'
                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                        : "border-blue-300 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900"
                    )}
                    onClick={() => setQuickEntryMode(quickEntryMode === 'arla_only' ? 'normal' : 'arla_only')}
                  >
                    <Droplet className="w-5 h-5" />
                    Apenas ARLA
                  </Button>
                )}

                {/* Comboio users - Lubrication/Filter/Oil options */}
                {userLocationInfo.isComboioUser && (
                  <div className="grid grid-cols-1 gap-2">
                    <Button
                      type="button"
                      variant={quickEntryMode === 'lubrication_only' ? 'default' : 'outline'}
                      className={cn(
                        "w-full h-12 justify-start gap-2",
                        quickEntryMode === 'lubrication_only'
                          ? "bg-orange-500 hover:bg-orange-600 text-white"
                          : "border-orange-300 text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900"
                      )}
                      onClick={() => setQuickEntryMode(quickEntryMode === 'lubrication_only' ? 'normal' : 'lubrication_only')}
                    >
                      <Wrench className="w-5 h-5" />
                      Apenas Lubrificação
                    </Button>
                    <Button
                      type="button"
                      variant={quickEntryMode === 'filter_blow_only' ? 'default' : 'outline'}
                      className={cn(
                        "w-full h-12 justify-start gap-2",
                        quickEntryMode === 'filter_blow_only'
                          ? "bg-amber-500 hover:bg-amber-600 text-white"
                          : "border-amber-300 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900"
                      )}
                      onClick={() => setQuickEntryMode(quickEntryMode === 'filter_blow_only' ? 'normal' : 'filter_blow_only')}
                    >
                      <AlertCircle className="w-5 h-5" />
                      Apenas Sopra Filtro
                    </Button>
                    <Button
                      type="button"
                      variant={quickEntryMode === 'oil_only' ? 'default' : 'outline'}
                      className={cn(
                        "w-full h-12 justify-start gap-2",
                        quickEntryMode === 'oil_only'
                          ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                          : "border-yellow-300 text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900"
                      )}
                      onClick={() => setQuickEntryMode(quickEntryMode === 'oil_only' ? 'normal' : 'oil_only')}
                    >
                      <Fuel className="w-5 h-5" />
                      Apenas Completar Óleo
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Active quick mode indicator */}
            {quickEntryMode !== 'normal' && (
              <div className="bg-purple-100 dark:bg-purple-900/50 border border-purple-300 dark:border-purple-700 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    Modo: {getQuickModeLabel(quickEntryMode)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-purple-600 hover:text-purple-800"
                    onClick={() => setQuickEntryMode('normal')}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                  Sem necessidade de horímetro/km ou diesel
                </p>
              </div>
            )}
          </div>
        )}

        {/* QUICK ENTRY MODE FORMS */}
        {quickEntryMode !== 'normal' && recordType === 'saida' && (
          <>
            {/* Vehicle Selection - Always needed for quick modes */}
            <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-base">
                  <Truck className="w-4 h-4" />
                  Veículo
                  <span className="text-red-500">*</span>
                </Label>
                {/* QR Code Scanner Button */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsQRScannerOpen(true)}
                  className="gap-1"
                  title="Escanear QR Code do veículo"
                >
                  <QrCode className="w-4 h-4" />
                  <span className="text-xs hidden sm:inline">QR</span>
                </Button>
              </div>
              
              {/* Searchable Vehicle Combobox - Grouped by Category */}
              <Popover open={vehicleSearchOpen} onOpenChange={setVehicleSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehicleSearchOpen}
                    className={cn(
                      "w-full h-14 justify-between font-medium border-2 transition-all",
                      !vehicleCode && "text-muted-foreground border-blue-300 dark:border-blue-700",
                      vehicleCode && "border-green-400 bg-green-50 dark:bg-green-950/30"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {vehicleCode ? (
                        <Truck className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                      ) : (
                        <Search className="h-5 w-5 shrink-0 text-blue-500 animate-pulse" />
                      )}
                      <span className={cn(
                        "truncate text-lg",
                        vehicleCode ? "font-bold text-green-700 dark:text-green-300" : "text-blue-600 dark:text-blue-400"
                      )}>
                        {vehicleCode || "🔍 Pesquisar veículo..."}
                      </span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className="w-[--radix-popover-trigger-width] min-w-[320px] p-0 bg-popover border-2 shadow-xl z-[100]" 
                  align="start"
                  sideOffset={4}
                >
                  <Command className="bg-popover">
                    <div className="flex items-center border-b-2 px-3 bg-muted/50">
                      <Search className="h-5 w-5 shrink-0 text-primary mr-2" />
                      <CommandInput 
                        placeholder="Digite código, descrição ou categoria..." 
                        className="h-12 text-base border-0 focus:ring-0 bg-transparent"
                      />
                    </div>
                    <CommandList className="max-h-[350px] overflow-auto">
                      <CommandEmpty className="py-6 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Truck className="h-8 w-8 opacity-50" />
                          <span className="text-sm">Nenhum veículo encontrado</span>
                        </div>
                      </CommandEmpty>
                      
                      {groupedVehicles.map(({ category: cat, vehicles: categoryVehicles }) => (
                        <CommandGroup 
                          key={cat} 
                          heading={
                            <div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b">
                              <span className="w-2 h-2 rounded-full bg-primary/50" />
                              {cat} ({categoryVehicles.length})
                            </div>
                          }
                          className="p-0"
                        >
                          <div className="p-2">
                            {categoryVehicles.map((vehicle) => {
                              const isSelected = vehicleCode === vehicle.code;
                              
                              return (
                                <CommandItem
                                  key={vehicle.code}
                                  value={`${vehicle.code} ${vehicle.description} ${cat}`.toLowerCase()}
                                  onSelect={() => {
                                    handleVehicleSelect(vehicle.code);
                                    setVehicleSearchOpen(false);
                                  }}
                                  className={cn(
                                    "cursor-pointer py-3 px-3 rounded-lg mb-1 transition-colors",
                                    isSelected && "bg-primary/10 border border-primary/30"
                                  )}
                                >
                                  <Check
                                    className={cn(
                                      "mr-3 h-5 w-5 text-primary",
                                      isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span className={cn(
                                      "font-bold text-base truncate",
                                      isSelected && "text-primary"
                                    )}>
                                      {vehicle.code}
                                    </span>
                                    {vehicle.description && (
                                      <span className="text-xs text-muted-foreground truncate">
                                        {vehicle.description}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </div>
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Selected vehicle info */}
              {vehicleCode && vehicleDescription && (
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 p-3 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <span className="font-medium">{vehicleCode}</span> - {vehicleDescription}
                  </p>
                  {category && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Categoria: {category}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ARLA Only Form */}
            {quickEntryMode === 'arla_only' && (
              <div className="bg-blue-50/80 dark:bg-blue-950/30 backdrop-blur-sm rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3 shadow-sm">
                <Label className="flex items-center gap-2 text-base text-blue-700 dark:text-blue-400">
                  <Droplet className="w-4 h-4" />
                  Quantidade de ARLA (Litros)
                  <span className="text-red-500">*</span>
                </Label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Ex: 50"
                  value={arlaQuantity ?? ''}
                  onChange={(e) => setArlaQuantity(e.target.value ? Number(e.target.value) : null)}
                  className="flex h-14 w-full rounded-md border px-3 py-2 text-2xl text-center font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-background border-input"
                />
              </div>
            )}

            {/* Lubrication Only Form */}
            {quickEntryMode === 'lubrication_only' && (
              <div className="bg-orange-50/80 dark:bg-orange-950/30 backdrop-blur-sm rounded-xl border border-orange-200 dark:border-orange-800 p-4 space-y-3 shadow-sm">
                <Label className="flex items-center gap-2 text-base text-orange-700 dark:text-orange-400">
                  <Wrench className="w-4 h-4" />
                  Lubrificante
                  <span className="text-red-500">*</span>
                </Label>
                <Select value={lubricant} onValueChange={setLubricant}>
                  <SelectTrigger className="h-12 text-lg border-orange-300 dark:border-orange-700">
                    <SelectValue placeholder="Selecione o lubrificante" />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {lubricants.length === 0 ? (
                      <div className="p-3 text-center text-muted-foreground text-sm">
                        Nenhum lubrificante cadastrado
                      </div>
                    ) : (
                      lubricants.map(lub => (
                        <SelectItem key={lub.id} value={lub.name}>
                          {lub.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Filter Blow Only Form */}
            {quickEntryMode === 'filter_blow_only' && (
              <div className="bg-amber-50/80 dark:bg-amber-950/30 backdrop-blur-sm rounded-xl border border-amber-200 dark:border-amber-800 p-4 space-y-3 shadow-sm">
                <Label className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  Quantidade Sopra Filtro
                  <span className="text-red-500">*</span>
                </Label>
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="Ex: 2"
                  value={filterBlowQuantity ?? ''}
                  onChange={(e) => setFilterBlowQuantity(e.target.value ? Number(e.target.value) : null)}
                  className="flex h-14 w-full rounded-md border px-3 py-2 text-2xl text-center font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-background border-input"
                />
              </div>
            )}

            {/* Oil Only Form */}
            {quickEntryMode === 'oil_only' && (
              <div className="bg-yellow-50/80 dark:bg-yellow-950/30 backdrop-blur-sm rounded-xl border border-yellow-200 dark:border-yellow-800 p-4 space-y-4 shadow-sm">
                <Label className="flex items-center gap-2 text-base text-yellow-700 dark:text-yellow-400">
                  <Fuel className="w-4 h-4" />
                  Completar Óleo
                </Label>
                
                <div className="space-y-2">
                  <Label className="text-sm">Tipo de Óleo <span className="text-red-500">*</span></Label>
                  <Select value={oilType} onValueChange={setOilType}>
                    <SelectTrigger className="h-12 text-lg border-yellow-300 dark:border-yellow-700">
                      <SelectValue placeholder="Selecione o tipo de óleo" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {oilTypes.length === 0 ? (
                        <div className="p-3 text-center text-muted-foreground text-sm">
                          Nenhum tipo de óleo cadastrado
                        </div>
                      ) : (
                        oilTypes.map(oil => (
                          <SelectItem key={oil.id} value={oil.name}>
                            {oil.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Quantidade (Litros) <span className="text-red-500">*</span></Label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Ex: 5"
                    value={oilQuantity ?? ''}
                    onChange={(e) => setOilQuantity(e.target.value ? Number(e.target.value) : null)}
                    className="flex h-14 w-full rounded-md border px-3 py-2 text-2xl text-center font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-background border-input"
                  />
                </div>
              </div>
            )}

            {/* Location - for quick modes */}
            {user.assigned_locations && user.assigned_locations.length > 1 ? (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 space-y-3 shadow-lg">
                <div className="flex items-center gap-3 bg-indigo-100 dark:bg-indigo-900/60 px-4 py-2.5 rounded-xl -ml-1">
                  <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
                    Local
                  </span>
                </div>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger className="h-14 text-lg font-bold border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 shadow-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {user.assigned_locations.map((loc) => (
                      <SelectItem key={loc} value={loc} className="text-base py-3 font-medium">
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : user.assigned_locations?.length === 1 ? (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">Local:</span>
                  <span className="text-lg font-bold text-foreground">{location}</span>
                </div>
              </div>
            ) : null}

            {/* Observations for quick modes */}
            <div className="bg-white dark:bg-slate-800 backdrop-blur-sm rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3 shadow-lg">
              <Label className="text-base text-foreground">Observações</Label>
              <Textarea
                placeholder="Observações opcionais..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                rows={2}
                className="bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </>
        )}

        {/* NORMAL SAÍDA FORM - only when not in quick mode (but comboio_tank_refuel shows vehicle selection) */}
        {recordType === 'saida' && (quickEntryMode === 'normal' || quickEntryMode === 'comboio_tank_refuel') && (
          <>
            {/* Location - above Vehicle */}
            {user.assigned_locations && user.assigned_locations.length > 1 ? (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 space-y-3 shadow-lg">
                <div className="flex items-center gap-3 bg-indigo-100 dark:bg-indigo-900/60 px-4 py-2.5 rounded-xl -ml-1">
                  <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
                    Local
                  </span>
                </div>
                <Select value={location} onValueChange={setLocation}>
                  <SelectTrigger className="h-14 text-lg font-bold border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 shadow-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50 bg-popover">
                    {user.assigned_locations.map((loc) => (
                      <SelectItem key={loc} value={loc} className="text-base py-3 font-medium">
                        {loc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : user.assigned_locations?.length === 1 ? (
              <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 shadow-lg">
                <div className="flex items-center gap-3">
                  <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">Local:</span>
                  <span className="text-lg font-bold text-foreground">{location}</span>
                </div>
              </div>
            ) : null}

            {/* Vehicle Selection */}
            <div className="bg-sky-50 dark:bg-sky-950/40 rounded-2xl border-2 border-sky-400 dark:border-sky-600 p-4 space-y-3 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 bg-sky-100 dark:bg-sky-900/60 px-4 py-2.5 rounded-xl -ml-1">
                  <Truck className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                  <span className="text-lg font-bold text-sky-800 dark:text-sky-200">
                    Veículo <span className="text-red-500">*</span>
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-sky-600"
                  onClick={() => setIsQRScannerOpen(true)}
                >
                  <QrCode className="w-6 h-6" />
                </Button>
              </div>

              <Popover open={vehicleSearchOpen} onOpenChange={setVehicleSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={vehicleSearchOpen}
                    className={cn(
                      "w-full justify-between font-medium h-14 text-lg",
                      "bg-white dark:bg-slate-900 border-2 border-sky-300 dark:border-sky-600",
                      "hover:border-sky-500 transition-all duration-200 shadow-md",
                      !vehicleCode && "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Truck className={cn("h-5 w-5 shrink-0", vehicleCode ? "text-sky-600" : "text-muted-foreground")} />
                      <span className="truncate font-bold">{vehicleCode || 'Selecione o veículo...'}</span>
                    </div>
                    <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0 bg-popover border-2 border-border shadow-xl z-[100]" align="start" sideOffset={4}>
                  <Command className="bg-popover">
                    <div className="flex items-center border-b-2 border-border px-3 bg-muted/50">
                      <Search className="h-5 w-5 shrink-0 text-primary mr-2" />
                      <CommandInput placeholder="Digite para pesquisar..." className="h-12 text-base border-0 focus:ring-0 bg-transparent placeholder:text-muted-foreground" />
                    </div>
                    <CommandList className="max-h-[400px] overflow-auto">
                      <CommandEmpty className="py-6 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Truck className="h-8 w-8 opacity-50" />
                          <span className="text-sm">Nenhum veículo encontrado.</span>
                        </div>
                      </CommandEmpty>
                      {groupedVehicles.map(({ category: cat, vehicles: catVehicles }) => (
                        <CommandGroup key={cat} heading={
                          <div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                            <span className="w-2 h-2 rounded-full bg-primary/50" />
                            {cat} ({catVehicles.length})
                          </div>
                        } className="p-0">
                          <div className="p-2">
                            {catVehicles.map((vehicle) => {
                              const isSelected = vehicleCode === vehicle.code;
                              const searchValue = `${vehicle.code} ${vehicle.description || ''} ${cat}`.toLowerCase();
                              return (
                                <CommandItem
                                  key={vehicle.code}
                                  value={searchValue}
                                  onSelect={() => {
                                    handleVehicleSelect(vehicle.code);
                                    setVehicleSearchOpen(false);
                                  }}
                                  className={cn(
                                    "cursor-pointer py-3 px-3 rounded-lg mb-1 transition-colors",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    isSelected && "bg-primary/10 border border-primary/30"
                                  )}
                                >
                                  <Check className={cn('mr-3 h-5 w-5 text-primary', isSelected ? 'opacity-100' : 'opacity-0')} />
                                  <div className="flex flex-col flex-1 min-w-0">
                                    <span className={cn("font-bold text-base truncate", isSelected && "text-primary")}>
                                      {vehicle.code}
                                    </span>
                                    {vehicle.description && (
                                      <span className="text-xs text-muted-foreground truncate">{vehicle.description}</span>
                                    )}
                                  </div>
                                </CommandItem>
                              );
                            })}
                          </div>
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Vehicle info card */}
              {vehicleCode && (
                <div className="bg-sky-100/80 dark:bg-sky-900/40 rounded-xl p-3 border border-sky-200 dark:border-sky-700 space-y-2">
                  <div className="flex items-center gap-2 text-sky-800 dark:text-sky-200">
                    <Truck className="w-4 h-4" />
                    <span className="font-bold">{vehicleCode}</span>
                    {vehicleDescription && <span className="text-sm">- {vehicleDescription}</span>}
                  </div>
                  {category && <span className="text-xs bg-sky-200 dark:bg-sky-800 px-2 py-1 rounded text-sky-700 dark:text-sky-300">{category}</span>}
                  {horimeterPrevious && (
                    <div className="bg-white/50 dark:bg-blue-950/50 rounded p-2 border border-blue-100 dark:border-blue-800">
                      <span className="text-xs text-muted-foreground block">{isVehicleCategory ? 'KM Atual' : 'Horímetro Atual'}</span>
                      <span className="font-bold text-blue-700 dark:text-blue-200">
                        {horimeterPrevious}
                      </span>
                    </div>
                  )}

                  {lastHorimeterHistory.length > 0 && (
                    <div className="bg-white/30 dark:bg-blue-950/30 rounded p-2 border border-blue-100/60 dark:border-blue-800/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          Último registro: {lastHorimeterHistory[0].dateTime}
                        </span>
                        <span className="font-semibold text-blue-700 dark:text-blue-200">
                          {lastHorimeterHistory[0].horimeterAtual}{lastHorimeterHistory[0].isKm ? ' km' : 'h'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Last 5 fuel records - Admin only */}
              {user.role === 'admin' && lastFuelRecords.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 p-3 rounded-lg">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Últimos abastecimentos:</p>
                  <div className="space-y-1">
                    {lastFuelRecords.map((r, i) => (
                      <div key={i} className="flex justify-between text-xs text-amber-600 dark:text-amber-400">
                        <span>{r.record_date} {r.record_time}</span>
                        <span>{r.fuel_quantity}L {r.horimeter_current ? `H:${r.horimeter_current}` : ''} {r.km_current ? `KM:${r.km_current}` : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

        {/* Fuel Quantity with OCR - OPTIMIZED FOR SUNLIGHT */}
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl border-2 border-amber-400 dark:border-amber-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 bg-amber-100 dark:bg-amber-900/60 px-4 py-2.5 rounded-xl -ml-1">
              <Fuel className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
                Quantidade (Litros)
              </span>
            </div>
          </div>
          
          <input
            type="number"
            inputMode="numeric"
            placeholder="Ex: 250"
            value={fuelQuantity ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setFuelQuantity(val ? Number(val) : null);
              if (val) {
                const result = formatQuantityInput(val);
                setQuantityInWords(result.inWords);
              } else {
                setQuantityInWords('');
              }
            }}
            className="flex h-16 w-full rounded-md border-2 border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 px-3 py-2 text-3xl text-center font-black ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800 shadow-md"
          />
        </div>

        {/* Horimeter / KM with OCR */}
        {quickEntryMode !== 'comboio_tank_refuel' && (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border-2 border-emerald-400 dark:border-emerald-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 bg-emerald-100 dark:bg-emerald-900/60 px-4 py-2.5 rounded-xl -ml-1">
              <Gauge className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                {isVehicleCategory ? 'KM Atual' : 'Horímetro Atual'}
              </span>
              {(isEquipment || isVehicleCategory) && recordType === 'saida' && (
                <span className="text-red-500 text-2xl font-bold">*</span>
              )}
            </div>
          </div>
          
          <CurrencyInput
            placeholder="0,00"
            value={horimeterCurrent}
            onChange={setHorimeterCurrent}
            decimals={2}
            className="h-14 text-2xl text-center font-bold border-2 border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 shadow-md"
          />
          
          {/* Validation warning */}
          {horimeterPrevious && horimeterCurrent !== null && horimeterCurrent < parseBrazilianNumber(horimeterPrevious) && (
            <div className="bg-yellow-100 dark:bg-yellow-950 border-2 border-yellow-400 dark:border-yellow-700 p-3 rounded-xl">
              <div className="flex items-center gap-3 text-yellow-800 dark:text-yellow-300 text-base font-semibold">
                <AlertCircle className="w-5 h-5" />
                <span>Valor atual menor que anterior. Verifique!</span>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Equipment-specific fields (optional) - Hide for comboio tank refuel mode */}
        {isEquipment && recordType === 'saida' && quickEntryMode !== 'comboio_tank_refuel' && (
          <Collapsible>
            <div className="bg-blue-50 dark:bg-blue-950/30 backdrop-blur-sm rounded-xl border border-blue-200 dark:border-blue-800 shadow-sm">
              <CollapsibleTrigger className="flex items-center justify-between w-full p-4">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                  <Wrench className="w-5 h-5" />
                  <span className="text-base font-semibold">Equipamento (Opcionais)</span>
                </div>
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 space-y-3">
                {/* Oil Type */}
                <div className="space-y-2">
                  <Label className="text-sm">Tipo de Óleo</Label>
                  <Select value={oilType} onValueChange={setOilType}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione o tipo de óleo" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {oilTypes.map(oil => (
                        <SelectItem key={oil.id} value={oil.name}>{oil.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Oil Quantity */}
                {oilType && (
                  <div className="space-y-2">
                    <Label className="text-sm">Quantidade Óleo (Litros)</Label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Ex: 5"
                      value={oilQuantity ?? ''}
                      onChange={(e) => setOilQuantity(e.target.value ? Number(e.target.value) : null)}
                      className="flex h-12 w-full rounded-md border px-3 py-2 text-xl text-center font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-background border-input"
                    />
                  </div>
                )}

                {/* Lubricant */}
                <div className="space-y-2">
                  <Label className="text-sm">Lubrificante</Label>
                  <Select value={lubricant} onValueChange={setLubricant}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione o lubrificante" />
                    </SelectTrigger>
                    <SelectContent className="z-50 bg-popover">
                      {lubricants.map(lub => (
                        <SelectItem key={lub.id} value={lub.name}>{lub.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filter Blow */}
                <div className="space-y-2">
                  <Label className="text-sm">Sopra Filtro (quantidade)</Label>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={filterBlowQuantity ?? ''}
                    onChange={(e) => {
                      setFilterBlowQuantity(e.target.value ? Number(e.target.value) : null);
                      setFilterBlow(!!e.target.value);
                    }}
                    className="flex h-12 w-full rounded-md border px-3 py-2 text-xl text-center font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-background border-input"
                  />
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}

        {/* ARLA */}
        <div className="bg-cyan-50 dark:bg-cyan-950/40 rounded-2xl border-2 border-cyan-400 dark:border-cyan-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-3 bg-cyan-100 dark:bg-cyan-900/60 px-4 py-2.5 rounded-xl -ml-1">
            <Droplet className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            <span className="text-lg font-bold text-cyan-800 dark:text-cyan-200">
              ARLA (Litros)
            </span>
          </div>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={arlaQuantity ?? ''}
            onChange={(e) => setArlaQuantity(e.target.value ? Number(e.target.value) : null)}
            className="flex h-14 w-full rounded-md border-2 border-cyan-300 dark:border-cyan-600 bg-white dark:bg-slate-900 px-3 py-2 text-2xl text-center font-bold ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 dark:focus:ring-cyan-800 shadow-md"
          />
        </div>

        {/* Observations */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
          <Label className="text-base text-foreground">Observações</Label>
          <Textarea
            placeholder="Observações opcionais..."
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
            className="bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-foreground placeholder:text-muted-foreground"
          />
        </div>
          </>
        )}

        {/* ENTRADA FORM */}
        {recordType === 'entrada' && quickEntryMode === 'normal' && (
          <>
            {(() => {
              const userLocations = user.assigned_locations || [];
              const isComboioUser = userLocations.some(loc => 
                loc.toLowerCase().includes('comboio') || loc.toLowerCase().startsWith('cb')
              );
              const isTanqueUser = userLocations.some(loc => 
                loc.toLowerCase().includes('tanque') || loc.toLowerCase().includes('canteiro')
              );
              const isOnlyComboio = isComboioUser && !isTanqueUser;
              
              return (
                <>
                  {/* Fuel Quantity */}
                  <div className="bg-amber-50 dark:bg-amber-950/40 rounded-2xl border-2 border-amber-400 dark:border-amber-600 p-4 space-y-3 shadow-lg">
                    <div className="flex items-center gap-3 bg-amber-100 dark:bg-amber-900/60 px-4 py-2.5 rounded-xl -ml-1">
                      <Fuel className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      <span className="text-lg font-bold text-amber-800 dark:text-amber-200">
                        Quantidade (Litros) <span className="text-red-500">*</span>
                      </span>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="Ex: 5000"
                      value={fuelQuantity ?? ''}
                      onChange={(e) => setFuelQuantity(e.target.value ? Number(e.target.value) : null)}
                      className="flex h-16 w-full rounded-md border-2 border-amber-300 dark:border-amber-600 bg-white dark:bg-slate-900 px-3 py-2 text-3xl text-center font-black shadow-md"
                    />
                  </div>

                  {/* For Comboio users ONLY - Show Entry Location (Tanque) Selection */}
                  {isOnlyComboio && (
                    <div className="bg-green-50/80 dark:bg-green-950/30 backdrop-blur-sm rounded-xl border border-green-200 dark:border-green-800 p-4 space-y-3 shadow-sm">
                      <Label className="flex items-center gap-2 text-base text-green-700 dark:text-green-400">
                        <MapPin className="w-5 h-5" />
                        Local de Entrada <span className="text-red-500">*</span>
                      </Label>
                      <Select value={entryLocation} onValueChange={setEntryLocation}>
                        <SelectTrigger className="h-12 text-base border-green-300 dark:border-green-700">
                          <SelectValue placeholder="Selecione o tanque de origem" />
                        </SelectTrigger>
                        <SelectContent className="z-50 bg-popover">
                          <SelectItem value="Tanque Canteiro 01">Tanque Canteiro 01</SelectItem>
                          <SelectItem value="Tanque Canteiro 02">Tanque Canteiro 02</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* For Tanque users - Show Supplier and Invoice */}
                  {isTanqueUser && (
                    <>
                      <div className="bg-purple-50/80 dark:bg-purple-950/30 backdrop-blur-sm rounded-xl border border-purple-200 dark:border-purple-800 p-4 space-y-3 shadow-sm">
                        <Label className="flex items-center gap-2 text-base text-purple-700 dark:text-purple-400">
                          <Building2 className="w-5 h-5" />
                          Fornecedor <span className="text-red-500">*</span>
                        </Label>
                        <Select value={supplier} onValueChange={setSupplier}>
                          <SelectTrigger className="h-12 text-base border-purple-300 dark:border-purple-700">
                            <SelectValue placeholder="Selecione o fornecedor" />
                          </SelectTrigger>
                          <SelectContent className="z-50 bg-popover">
                            {suppliers.map(s => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
                        <Label className="flex items-center gap-2 text-base">
                          <Receipt className="w-5 h-5" />
                          Nota Fiscal
                        </Label>
                        <Input
                          placeholder="Número da nota fiscal"
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          className="h-12 text-base"
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
                        <Label className="flex items-center gap-2 text-base">
                          Valor Unitário (R$/L)
                        </Label>
                        <CurrencyInput
                          placeholder="0,00"
                          value={unitPrice}
                          onChange={setUnitPrice}
                          decimals={4}
                          className="h-12 text-lg"
                        />
                      </div>

                      {/* Location for tanque users */}
                      <div className="bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border-2 border-indigo-400 dark:border-indigo-600 p-4 space-y-3 shadow-lg">
                        <div className="flex items-center gap-3 bg-indigo-100 dark:bg-indigo-900/60 px-4 py-2.5 rounded-xl -ml-1">
                          <MapPin className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                          <span className="text-lg font-bold text-indigo-800 dark:text-indigo-200">
                            Local
                          </span>
                        </div>
                        <Select value={location} onValueChange={setLocation}>
                          <SelectTrigger className="h-14 text-lg font-bold border-2 border-indigo-300 dark:border-indigo-600 bg-white dark:bg-slate-900 shadow-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="z-50 bg-popover">
                            {(userLocations.filter(loc => 
                              loc.toLowerCase().includes('tanque') || loc.toLowerCase().includes('canteiro')
                            )).map(loc => (
                              <SelectItem key={loc} value={loc} className="text-base py-3 font-medium">{loc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {/* Observations */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 shadow-sm">
                    <Label className="text-base text-foreground">Observações</Label>
                    <Textarea
                      placeholder="Observações opcionais..."
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      rows={2}
                      className="bg-slate-100 dark:bg-slate-700/50 border-slate-300 dark:border-slate-600 text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </>
              );
            })()}
          </>
        )}

        {/* Photos Section - Only for Saida - OPTIMIZED FOR SUNLIGHT */}
        {recordType === 'saida' && (
        <div className="bg-rose-50 dark:bg-rose-950/40 rounded-2xl border-2 border-rose-400 dark:border-rose-600 p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <Camera className="w-5 h-5" />
            <span className="text-base font-bold">
              {quickEntryMode === 'comboio_tank_refuel' ? 'Foto da Bomba' : 'Fotos'} *
            </span>
          </div>
          
          <div className={cn(
            "grid gap-3",
            quickEntryMode === 'comboio_tank_refuel' ? "grid-cols-1" : "grid-cols-2"
          )}>
            {/* Pump Photo - Always visible */}
            <div className="space-y-2">
              <Label className="text-sm text-rose-600 dark:text-rose-400">Foto Bomba</Label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPhotoPump(file);
                  }}
                  className="hidden"
                  id="photo-pump"
                />
                <label
                  htmlFor="photo-pump"
                  className={cn(
                    "flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                    photoPump
                      ? "border-green-400 bg-green-50 dark:bg-green-950/30"
                      : "border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 hover:border-rose-400"
                  )}
                >
                  {photoPump ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-5 h-5" />
                      <span className="text-sm font-medium">Foto OK</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera className="w-6 h-6 text-rose-400" />
                      <span className="text-xs text-muted-foreground">Tirar foto</span>
                    </div>
                  )}
                </label>
                {photoPump && (
                  <button
                    type="button"
                    onClick={() => setPhotoPump(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Horimeter Photo - Hidden for comboio tank refuel */}
            {quickEntryMode !== 'comboio_tank_refuel' && (
              <div className="space-y-2">
                <Label className="text-sm text-rose-600 dark:text-rose-400">{isVehicleCategory ? 'Foto KM' : 'Foto Horímetro'}</Label>
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setPhotoHorimeter(file);
                    }}
                    className="hidden"
                    id="photo-horimeter"
                  />
                  <label
                    htmlFor="photo-horimeter"
                    className={cn(
                      "flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed cursor-pointer transition-all",
                      photoHorimeter
                        ? "border-green-400 bg-green-50 dark:bg-green-950/30"
                        : "border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 hover:border-rose-400"
                    )}
                  >
                    {photoHorimeter ? (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Foto OK</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Image className="w-6 h-6 text-rose-400" />
                        <span className="text-xs text-muted-foreground">Tirar foto</span>
                      </div>
                    )}
                  </label>
                  {photoHorimeter && (
                    <button
                      type="button"
                      onClick={() => setPhotoHorimeter(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Save Button */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm p-3 -mx-3 border-t border-border shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.1)]">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            "w-full h-14 text-lg gap-2 shadow-lg text-white",
            "bg-gradient-to-r from-blue-800 to-blue-900 hover:from-blue-900 hover:to-blue-950"
          )}
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
              Registrar Abastecimento
            </>
          )}
        </Button>
        </div>
      </div>

      {/* QR Code Scanner Modal */}
      <QRCodeScanner
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScan={handleQRCodeResult}
      />
    </div>
  );
}
