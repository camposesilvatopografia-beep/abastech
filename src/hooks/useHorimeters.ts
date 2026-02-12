import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';
import { getSheetData } from '@/lib/googleSheets';

/**
 * Normalize a header string for fuzzy matching:
 * Remove accents, uppercase, strip spaces/underscores/dots
 */
function normalizeHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[\s_.]/g, '');
}

// Cached sheet headers to avoid repeated API calls
let _cachedHorimeterHeaders: string[] | null = null;
let _headersCacheTime = 0;
const HEADERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the actual sheet headers for Horimetros, with caching.
 */
async function getHorimetrosHeaders(): Promise<string[]> {
  const now = Date.now();
  if (_cachedHorimeterHeaders && (now - _headersCacheTime) < HEADERS_CACHE_TTL) {
    return _cachedHorimeterHeaders;
  }
  try {
    const sheetData = await getSheetData('Horimetros', { noCache: false });
    _cachedHorimeterHeaders = sheetData.headers || [];
    _headersCacheTime = now;
    return _cachedHorimeterHeaders;
  } catch (e) {
    console.warn('Could not fetch Horimetros headers:', e);
    return [];
  }
}

/**
 * Build rowData using exact header names from the sheet via normalized matching.
 * This ensures keys like "Horimetro Anterior" match " Horimetro Anterior" or "Horímetro Anterior".
 */
function mapToExactHeaders(
  actualHeaders: string[],
  semanticData: Record<string, string>
): Record<string, string> {
  if (actualHeaders.length === 0) return semanticData;

  // Build normalized -> actual header map
  const normalizedMap = new Map<string, string>();
  for (const h of actualHeaders) {
    normalizedMap.set(normalizeHeader(h), h);
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(semanticData)) {
    const normalizedKey = normalizeHeader(key);
    const actualHeader = normalizedMap.get(normalizedKey);
    if (actualHeader) {
      result[actualHeader] = value;
    } else {
      // Fallback: use key as-is
      result[key] = value;
    }
  }

  return result;
}

/**
 * Build sheet row data with actual header names for the Horimetros sheet.
 */
async function buildHorimetrosRowData(semanticData: Record<string, string>): Promise<Record<string, string>> {
  const headers = await getHorimetrosHeaders();
  return mapToExactHeaders(headers, semanticData);
}

export interface Vehicle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  company: string | null;
  unit: string;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface HorimeterReading {
  id: string;
  vehicle_id: string;
  reading_date: string;
  current_value: number;
  previous_value: number | null;
  current_km: number | null;
  previous_km: number | null;
  operator: string | null;
  observations: string | null;
  source: string;
  synced_from_sheet: boolean;
  created_at: string;
  updated_at: string;
  vehicle?: Vehicle;
}

export interface HorimeterWithVehicle extends HorimeterReading {
  vehicle: Vehicle;
}

// Hook para veículos
export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('vehicles')
        .select('*')
        .order('code');
      
      if (fetchError) throw fetchError;
      setVehicles(data || []);
    } catch (err: any) {
      console.error('Error fetching vehicles:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createVehicle = useCallback(async (vehicle: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error: insertError } = await supabase
        .from('vehicles')
        .insert(vehicle)
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      setVehicles(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)));
      return data;
    } catch (err: any) {
      console.error('Error creating vehicle:', err);
      throw err;
    }
  }, []);

  const upsertVehicle = useCallback(async (vehicle: Omit<Vehicle, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data, error: upsertError } = await supabase
        .from('vehicles')
        .upsert(vehicle, { onConflict: 'code' })
        .select()
        .single();
      
      if (upsertError) throw upsertError;
      
      setVehicles(prev => {
        const filtered = prev.filter(v => v.code !== data.code);
        return [...filtered, data].sort((a, b) => a.code.localeCompare(b.code));
      });
      return data;
    } catch (err: any) {
      console.error('Error upserting vehicle:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  return {
    vehicles,
    loading,
    error,
    refetch: fetchVehicles,
    createVehicle,
    upsertVehicle,
  };
}

// Hook para leituras de horímetro
export function useHorimeterReadings(vehicleId?: string) {
  const [readings, setReadings] = useState<HorimeterWithVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchReadings = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Paginate to fetch ALL readings (Supabase default limit is 1000)
      let allData: any[] = [];
      let offset = 0;
      const PAGE_SIZE = 1000;
      
      while (true) {
        let query = supabase
          .from('horimeter_readings')
          .select(`
            *,
            vehicle:vehicles(*)
          `)
          .order('reading_date', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (vehicleId) {
          query = query.eq('vehicle_id', vehicleId);
        }
        
        const { data, error: fetchError } = await query;
        
        if (fetchError) throw fetchError;
        if (!data || data.length === 0) break;
        
        allData = allData.concat(data);
        offset += data.length;
        
        if (data.length < PAGE_SIZE) break;
      }
      
      console.log(`📊 Fetched ${allData.length} horimeter readings from DB`);
      setReadings(allData as HorimeterWithVehicle[]);
    } catch (err: any) {
      console.error('Error fetching readings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('horimeter-readings-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'horimeter_readings',
        },
        (payload) => {
          console.log('📡 Realtime horimeter update:', payload.eventType);
          // Refetch on any change to ensure consistency with vehicle joins
          fetchReadings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchReadings]);

  const createReading = useCallback(async (reading: {
    vehicle_id: string;
    reading_date: string;
    current_value: number;
    previous_value?: number | null;
    current_km?: number | null;
    previous_km?: number | null;
    operator?: string | null;
    observations?: string | null;
    source?: string;
    synced_from_sheet?: boolean;
    _horimeterValue?: number;
    _kmValue?: number;
  }) => {
    try {
      // Remove custom fields before inserting to DB
      const { _horimeterValue, _kmValue, ...dbReading } = reading;
      
      const { data, error: insertError } = await supabase
        .from('horimeter_readings')
        .insert({
          ...dbReading,
          current_km: reading.current_km || null,
          previous_km: reading.previous_km || null,
          source: dbReading.source || 'system',
          synced_from_sheet: dbReading.synced_from_sheet || false,
        })
        .select(`*, vehicle:vehicles(*)`)
        .single();
      
      if (insertError) throw insertError;
      
      setReadings(prev => [data as HorimeterWithVehicle, ...prev]);
      
      // Sync to Google Sheets
      const vehicle = (data as HorimeterWithVehicle).vehicle;
      let syncSuccess = false;
      
      if (vehicle) {
        try {
          const [year, month, day] = reading.reading_date.split('-');
          const formattedDate = `${day}/${month}/${year}`;
          
          // Use provided values or fallback to current_value
          const horimeterVal = _horimeterValue || reading.current_value || 0;
          const kmVal = _kmValue || reading.current_km || 0;
          const prevHor = reading.previous_value || 0;
          const prevKm = reading.previous_km || 0;
          
          // Calculate intervals
          const intervaloH = (horimeterVal > 0 && prevHor > 0) ? horimeterVal - prevHor : 0;
          const totalKm = (kmVal > 0 && prevKm > 0) ? kmVal - prevKm : 0;
          
          // Format numbers in pt-BR (e.g., 1.150,27) for the spreadsheet
          const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';
          
          // Use semantic keys that will be matched to actual sheet headers via normalized comparison
          const semanticData: Record<string, string> = {
            'Data': formattedDate,
            'Veiculo': vehicle.code,
            'Categoria': vehicle.category || '',
            'Descricao': vehicle.name || '',
            'Empresa': vehicle.company || '',
            'Operador': reading.operator || '',
            'Horimetro Anterior': prevHor > 0 ? fmtNum(prevHor) : '',
            'Horimetro Atual': fmtNum(horimeterVal),
            'Intervalo H': intervaloH > 0 ? fmtNum(intervaloH) : '',
            'Km Anterior': prevKm > 0 ? fmtNum(prevKm) : '',
            'Km Atual': kmVal > 0 ? fmtNum(kmVal) : '',
            'Total Km': totalKm > 0 ? fmtNum(totalKm) : '',
          };
          
          // Build rowData with actual sheet header names (fuzzy matched)
          const rowData = await buildHorimetrosRowData(semanticData);
          
          console.log('Sincronizando com planilha Horimetros:', rowData);
          
          const { error: syncError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'create',
              sheetName: 'Horimetros',
              data: rowData,
            },
          });
          
          if (syncError) throw syncError;
          
          syncSuccess = true;
          console.log('✓ Registro sincronizado com planilha Horimetros');
        } catch (syncErr) {
          console.error('Erro ao sincronizar com planilha (registro salvo no BD):', syncErr);
          // Don't throw - the DB save was successful
        }
      }
      
      toast({
        title: 'Sucesso!',
        description: syncSuccess 
          ? '✓ Registro salvo e sincronizado com planilha' 
          : 'Registro salvo (sincronização pendente)',
      });
      return data;
    } catch (err: any) {
      console.error('Error creating reading:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao criar registro',
        variant: 'destructive',
      });
      throw err;
    }
  }, [toast]);

  const updateReading = useCallback(async (id: string, updates: Partial<HorimeterReading> & { _horimeterValue?: number; _kmValue?: number }) => {
    try {
      // First get the current reading to know its data for sheet sync
      const existingReading = readings.find(r => r.id === id);
      
      // Remove custom fields before updating to DB
      const { _horimeterValue, _kmValue, ...dbUpdates } = updates as any;
      
      const { data, error: updateError } = await supabase
        .from('horimeter_readings')
        .update(dbUpdates)
        .eq('id', id)
        .select(`*, vehicle:vehicles(*)`)
        .single();
      
      if (updateError) throw updateError;
      
      setReadings(prev => prev.map(r => r.id === id ? data as HorimeterWithVehicle : r));
      
      // Sync update to Google Sheets
      const vehicle = (data as HorimeterWithVehicle).vehicle;
      if (vehicle && existingReading) {
        try {
          // Find the row in the sheet by matching vehicle code and old date
          const { data: sheetData } = await supabase.functions.invoke('google-sheets', {
            body: { action: 'getData', sheetName: 'Horimetros' },
          });
          
          const rows = sheetData?.rows || [];
          const oldDate = existingReading.reading_date;
          const [oldYear, oldMonth, oldDay] = oldDate.split('-');
          const oldFormattedDate = `${oldDay}/${oldMonth}/${oldYear}`;
          
          const rowIndex = rows.findIndex((row: any) => {
            const rowVehicle = String(row.Veiculo || row.VEICULO || '').trim();
            const rowDate = String(row.Data || row.DATA || row[' Data'] || '').trim();
            return rowVehicle === vehicle.code && rowDate === oldFormattedDate;
          });
          
          if (rowIndex >= 0) {
            const sheetRowIndex = rowIndex + 2; // +1 for header, +1 for 1-based index
            
            const newReadingDate = updates.reading_date || existingReading.reading_date;
            const [year, month, day] = newReadingDate.split('-');
            const formattedDate = `${day}/${month}/${year}`;
            
            const usesKm = vehicle.category?.toLowerCase().includes('veículo') ||
                           vehicle.category?.toLowerCase().includes('veiculo') ||
                           vehicle.category?.toLowerCase().includes('caminhão') ||
                           vehicle.category?.toLowerCase().includes('caminhao');
            
            const currentValue = updates.current_value ?? data.current_value;
            const previousValue = updates.previous_value ?? data.previous_value;
            const currentKm = (updates as any).current_km ?? (data as any).current_km;
            const previousKm = (updates as any).previous_km ?? (data as any).previous_km;
            const operator = updates.operator ?? data.operator;
            
            // Use provided horimeter/km values if available
            const horimeterVal = _horimeterValue || currentValue || 0;
            const kmVal = _kmValue || currentKm || 0;
            const prevHor = previousValue || 0;
            const prevKmVal = previousKm || 0;
            
            // Calculate intervals
            const intervaloH = (horimeterVal > 0 && prevHor > 0) ? horimeterVal - prevHor : 0;
            const totalKm = (kmVal > 0 && prevKmVal > 0) ? kmVal - prevKmVal : 0;
            
            // Format numbers in pt-BR for the spreadsheet
            const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';
            
            // Use semantic keys that will be matched to actual sheet headers
            const semanticData: Record<string, string> = {
              'Data': formattedDate,
              'Veiculo': vehicle.code,
              'Categoria': vehicle.category || '',
              'Descricao': vehicle.name || '',
              'Empresa': vehicle.company || '',
              'Operador': operator || '',
              'Horimetro Anterior': prevHor > 0 ? fmtNum(prevHor) : '',
              'Horimetro Atual': fmtNum(horimeterVal),
              'Intervalo H': intervaloH > 0 ? fmtNum(intervaloH) : '',
              'Km Anterior': prevKmVal > 0 ? fmtNum(prevKmVal) : '',
              'Km Atual': kmVal > 0 ? fmtNum(kmVal) : '',
              'Total Km': totalKm > 0 ? fmtNum(totalKm) : '',
            };
            
            // Build rowData with actual sheet header names (fuzzy matched)
            const rowData = await buildHorimetrosRowData(semanticData);
            
            await supabase.functions.invoke('google-sheets', {
              body: {
                action: 'update',
                sheetName: 'Horimetros',
                data: rowData,
                rowIndex: sheetRowIndex,
              },
            });
            
            console.log('Registro atualizado na planilha Horimetros');
          }
        } catch (syncErr) {
          console.error('Erro ao sincronizar atualização com planilha:', syncErr);
          // Don't throw - the DB update was successful
        }
      }
      
      toast({
        title: 'Sucesso!',
        description: 'Registro atualizado e sincronizado com planilha',
      });
      return data;
    } catch (err: any) {
      console.error('Error updating reading:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao atualizar registro',
        variant: 'destructive',
      });
      throw err;
    }
  }, [toast, readings]);

  const deleteReading = useCallback(async (id: string) => {
    try {
      // Get the reading data before deleting for sheet sync
      const readingToDelete = readings.find(r => r.id === id);
      
      const { error: deleteError } = await supabase
        .from('horimeter_readings')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      
      // IMPORTANT: Remove from local state IMMEDIATELY for UI responsiveness
      setReadings(prev => prev.filter(r => r.id !== id));
      
      // Sync deletion to Google Sheets (fire and forget - don't block UI)
      if (readingToDelete?.vehicle) {
        (async () => {
          try {
            const { data: sheetData } = await supabase.functions.invoke('google-sheets', {
              body: { action: 'getData', sheetName: 'Horimetros' },
            });
            
            const rows = sheetData?.rows || [];
            const [year, month, day] = readingToDelete.reading_date.split('-');
            const formattedDate = `${day}/${month}/${year}`;
            
            const rowIndex = rows.findIndex((row: any) => {
              const rowVehicle = String(row.Veiculo || row.VEICULO || '').trim();
              const rowDate = String(row.Data || row.DATA || row[' Data'] || '').trim();
              return rowVehicle === readingToDelete.vehicle.code && rowDate === formattedDate;
            });
            
            if (rowIndex >= 0) {
              const sheetRowIndex = rowIndex + 2; // +1 for header, +1 for 1-based index
              
              await supabase.functions.invoke('google-sheets', {
                body: {
                  action: 'delete',
                  sheetName: 'Horimetros',
                  rowIndex: sheetRowIndex,
                },
              });
              
              console.log('Registro excluído da planilha Horimetros');
            }
          } catch (syncErr) {
            console.error('Erro ao sincronizar exclusão com planilha:', syncErr);
            // Don't throw - the DB deletion was successful
          }
        })();
      }
      
      toast({
        title: 'Sucesso!',
        description: 'Registro excluído',
      });
    } catch (err: any) {
      console.error('Error deleting reading:', err);
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao excluir registro',
        variant: 'destructive',
      });
      throw err;
    }
  }, [toast, readings]);

  const upsertReading = useCallback(async (reading: {
    vehicle_id: string;
    reading_date: string;
    current_value: number;
    previous_value?: number | null;
    operator?: string | null;
    observations?: string | null;
    source?: string;
    synced_from_sheet?: boolean;
  }) => {
    try {
      // Check if a record already exists for this vehicle + date + source
      const { data: existing } = await supabase
        .from('horimeter_readings')
        .select('id')
        .eq('vehicle_id', reading.vehicle_id)
        .eq('reading_date', reading.reading_date)
        .eq('synced_from_sheet', reading.synced_from_sheet || false)
        .limit(1)
        .maybeSingle();

      let data;
      if (existing) {
        const { data: updated, error: updateError } = await supabase
          .from('horimeter_readings')
          .update({
            ...reading,
            source: reading.source || 'system',
            synced_from_sheet: reading.synced_from_sheet || false,
          })
          .eq('id', existing.id)
          .select(`*, vehicle:vehicles(*)`)
          .single();
        if (updateError) throw updateError;
        data = updated;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('horimeter_readings')
          .insert({
            ...reading,
            source: reading.source || 'system',
            synced_from_sheet: reading.synced_from_sheet || false,
          })
          .select(`*, vehicle:vehicles(*)`)
          .single();
        if (insertError) throw insertError;
        data = inserted;
      }
      
      setReadings(prev => {
        const filtered = prev.filter(r => r.id !== data.id);
        return [data as HorimeterWithVehicle, ...filtered];
      });
      return data;
    } catch (err: any) {
      console.error('Error upserting reading:', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  return {
    readings,
    loading,
    error,
    refetch: fetchReadings,
    createReading,
    updateReading,
    deleteReading,
    upsertReading,
  };
}

// Hook para importar dados da planilha
export function useSheetSync() {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const syncFromSheet = useCallback(async (
    onProgress?: (current: number, total: number) => void
  ): Promise<{
    vehiclesImported: number;
    readingsImported: number;
    readingsUpdated: number;
    readingsDeleted: number;
    errors: number;
  }> => {
    setSyncing(true);
    setProgress(0);
    
    const stats = {
      vehiclesImported: 0,
      readingsImported: 0,
      readingsUpdated: 0,
      readingsDeleted: 0,
      errors: 0,
    };

    try {
      // Fetch vehicles from sheet - try multiple sheet names (non-fatal)
      const vehicleMap = new Map<string, string>(); // code -> id

      for (const vehicleSheetName of ['Veiculo', 'Equipamentos_Obra']) {
        try {
          const { data: vehicleSheetData, error: vehicleError } = await supabase.functions.invoke('google-sheets', {
            body: { action: 'getData', sheetName: vehicleSheetName },
          });

          if (vehicleError || !vehicleSheetData?.rows?.length) continue;

          const vehicleRows = vehicleSheetData.rows || [];
          const vehicleHeaders: string[] = vehicleSheetData.headers || [];
          const vehicleBatchArr: any[] = [];

          const vHeaderLookup = new Map<string, string>();
          for (const h of vehicleHeaders) {
            vHeaderLookup.set(normalizeHeader(h), h);
          }
          const getVCol = (row: any, ...semanticNames: string[]): any => {
            for (const name of semanticNames) {
              const normalized = normalizeHeader(name);
              const actualKey = vHeaderLookup.get(normalized);
              if (actualKey && row[actualKey] !== undefined && row[actualKey] !== null && row[actualKey] !== '') {
                return row[actualKey];
              }
              if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
                return row[name];
              }
            }
            return null;
          };

          for (const row of vehicleRows) {
            const code = String(getVCol(row, 'Codigo', 'CODIGO', 'Código', 'CÓDIGO', 'Veiculo', 'VEICULO') || '').trim();
            if (!code) continue;

            const name = String(getVCol(row, 'Descricao', 'DESCRICAO', 'Descrição', 'DESCRIÇÃO') || code).trim();
            const description = String(getVCol(row, 'Descricao', 'DESCRICAO', 'Descrição', 'DESCRIÇÃO') || '').trim() || null;
            const category = String(getVCol(row, 'Categoria', 'CATEGORIA', 'Tipo', 'TIPO') || '').trim() || null;
            const company = String(getVCol(row, 'Empresa', 'EMPRESA') || '').trim() || null;
            
            const categoryLower = (category || '').toLowerCase();
            const usesKm = categoryLower.includes('veículo') || categoryLower.includes('veiculo') ||
                           categoryLower.includes('caminhão') || categoryLower.includes('caminhao');
            const unit = usesKm ? 'km' : 'h';

            vehicleBatchArr.push({ code, name, description, category, company, unit });
          }

          const VEHICLE_CHUNK = 50;
          for (let i = 0; i < vehicleBatchArr.length; i += VEHICLE_CHUNK) {
            const chunk = vehicleBatchArr.slice(i, i + VEHICLE_CHUNK);
            try {
              const { data: vehicles, error: upsertError } = await supabase
                .from('vehicles')
                .upsert(chunk, { onConflict: 'code' })
                .select('id, code');
              
              if (!upsertError && vehicles) {
                vehicles.forEach(v => vehicleMap.set(v.code, v.id));
                stats.vehiclesImported += vehicles.length;
              }
            } catch (err) {
              console.error('Error batch importing vehicles:', err);
            }
          }
          console.log(`📊 Imported ${vehicleBatchArr.length} vehicles from "${vehicleSheetName}"`);
          break; // Success - no need to try other sheet names
        } catch (err) {
          console.warn(`⚠️ Could not fetch vehicles from "${vehicleSheetName}":`, err);
          // Continue to next sheet name
        }
      }

      // Fetch all vehicles to complete the map
      const { data: allVehicles } = await supabase.from('vehicles').select('id, code');
      allVehicles?.forEach(v => vehicleMap.set(v.code, v.id));

      // Fetch horimeter readings from sheet
      const { data: horimeterSheetData, error: horimeterError } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Horimetros', noCache: true },
      });

      if (horimeterError) throw horimeterError;

      const horimeterRows = horimeterSheetData?.rows || [];
      const sheetHeaders: string[] = horimeterSheetData?.headers || [];
      const total = horimeterRows.length;
      console.log(`📊 Total rows from Horimetros sheet: ${total}`);
      console.log(`📊 Sheet headers: ${JSON.stringify(sheetHeaders)}`);

      // Build a normalized header lookup
      const headerLookup = new Map<string, string>();
      for (const h of sheetHeaders) {
        headerLookup.set(normalizeHeader(h), h);
      }

      const getCol = (row: any, ...semanticNames: string[]): any => {
        for (const name of semanticNames) {
          const normalized = normalizeHeader(name);
          const actualKey = headerLookup.get(normalized);
          if (actualKey && row[actualKey] !== undefined && row[actualKey] !== null && row[actualKey] !== '') {
            return row[actualKey];
          }
          if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
            return row[name];
          }
        }
        return null;
      };

      // PHASE 1: Auto-create missing vehicles from Horimetros data
      const missingVehicleCodes = new Set<string>();
      const vehicleInfoFromSheet = new Map<string, { name: string; category: string | null; company: string | null }>();

      for (const row of horimeterRows) {
        const vehicleCode = String(getCol(row, 'Veiculo', 'VEICULO', 'Equipamento', 'EQUIPAMENTO') || '').trim();
        if (!vehicleCode || vehicleMap.has(vehicleCode)) continue;
        
        missingVehicleCodes.add(vehicleCode);
        if (!vehicleInfoFromSheet.has(vehicleCode)) {
          const desc = String(getCol(row, 'Descricao', 'DESCRICAO', 'Descrição') || vehicleCode).trim();
          const cat = String(getCol(row, 'Categoria', 'CATEGORIA') || '').trim() || null;
          const comp = String(getCol(row, 'Empresa', 'EMPRESA') || '').trim() || null;
          vehicleInfoFromSheet.set(vehicleCode, { name: desc, category: cat, company: comp });
        }
      }

      if (missingVehicleCodes.size > 0) {
        console.log(`📊 Auto-creating ${missingVehicleCodes.size} missing vehicles from Horimetros sheet`);
        const autoVehicles: any[] = [];
        for (const code of missingVehicleCodes) {
          const info = vehicleInfoFromSheet.get(code)!;
          const categoryLower = (info.category || '').toLowerCase();
          const usesKm = categoryLower.includes('veículo') || categoryLower.includes('veiculo') ||
                         categoryLower.includes('caminhão') || categoryLower.includes('caminhao');
          autoVehicles.push({
            code,
            name: info.name,
            description: info.name,
            category: info.category,
            company: info.company,
            unit: usesKm ? 'km' : 'h',
          });
        }

        const VEHICLE_CHUNK = 50;
        for (let i = 0; i < autoVehicles.length; i += VEHICLE_CHUNK) {
          const chunk = autoVehicles.slice(i, i + VEHICLE_CHUNK);
          try {
            const { data: vehicles, error: upsertError } = await supabase
              .from('vehicles')
              .upsert(chunk, { onConflict: 'code' })
              .select('id, code');
            
            if (!upsertError && vehicles) {
              vehicles.forEach(v => vehicleMap.set(v.code, v.id));
              stats.vehiclesImported += vehicles.length;
            }
          } catch (err) {
            console.error('Error auto-creating vehicles:', err);
          }
        }
      }

      // PHASE 2: Delete existing synced readings for clean re-import
      console.log('🗑️ Cleaning existing synced readings for fresh import...');
      
      let deletedCount = 0;
      while (true) {
        const { data: toDelete } = await supabase
          .from('horimeter_readings')
          .select('id')
          .eq('synced_from_sheet', true)
          .limit(500);
        
        if (!toDelete || toDelete.length === 0) break;
        
        const ids = toDelete.map(r => r.id);
        await supabase
          .from('horimeter_readings')
          .delete()
          .in('id', ids);
        
        deletedCount += ids.length;
      }
      console.log(`🗑️ Deleted ${deletedCount} existing synced readings`);
      stats.readingsDeleted = deletedCount;

      // PHASE 3: Parse all rows and prepare batches
      const readingsBatch: any[] = [];
      let parseErrors = 0;
      let skippedNoVehicle = 0;
      let skippedNoDate = 0;
      let skippedNoValue = 0;
      
      for (let i = 0; i < horimeterRows.length; i++) {
        const row = horimeterRows[i];
        
        const vehicleCode = String(getCol(row, 'Veiculo', 'VEICULO', 'Equipamento', 'EQUIPAMENTO') || '').trim();
        const vehicleId = vehicleMap.get(vehicleCode);
        
        if (!vehicleId) {
          skippedNoVehicle++;
          stats.errors++;
          continue;
        }

        // Parse date - handle multiple formats
        const rawDate = getCol(row, 'Data', 'DATA');
        let readingDate: string | null = null;
        
        if (rawDate !== null) {
          const dateStr = String(rawDate).trim();
          
          // 1. Google Sheets serial number (numeric)
          if (typeof rawDate === 'number' || /^\d+(\.\d+)?$/.test(dateStr)) {
            const serial = Number(rawDate);
            if (Number.isFinite(serial) && serial > 25000 && serial < 100000) {
              const utcMs = (serial - 25569) * 86400 * 1000;
              const d = new Date(utcMs);
              if (!isNaN(d.getTime())) {
                readingDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
              }
            }
          }
          
          // 2. dd/MM/yyyy format (Brazilian)
          if (!readingDate) {
            const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (match) {
              const [, p1, p2, p3] = match;
              // Always assume dd/MM/yyyy for Brazilian format
              readingDate = `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
            }
          }
          
          // 3. yyyy-MM-dd format (ISO)
          if (!readingDate && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            readingDate = dateStr;
          }
        }

        if (!readingDate) {
          skippedNoDate++;
          stats.errors++;
          continue;
        }

        const horAnterior = parsePtBRNumber(getCol(row, 'Horimetro Anterior', 'Horímetro Anterior', 'Hor_Anterior'));
        const horAtual = parsePtBRNumber(getCol(row, 'Horimetro Atual', 'Horímetro Atual', 'Hor_Atual'));
        const kmAnterior = parsePtBRNumber(getCol(row, 'Km Anterior', 'KM Anterior', 'Km_Anterior'));
        const kmAtual = parsePtBRNumber(getCol(row, 'Km Atual', 'KM Atual', 'Km_Atual'));
        const intervaloH = parsePtBRNumber(getCol(row, 'Intervalo H', 'IntervaloH'));
        const totalKm = parsePtBRNumber(getCol(row, 'Total Km', 'TotalKm'));

        // Skip only if ALL values are zero/empty (truly empty row)
        if (horAtual === 0 && kmAtual === 0 && horAnterior === 0 && kmAnterior === 0 && intervaloH === 0 && totalKm === 0) {
          skippedNoValue++;
          stats.errors++;
          continue;
        }

        const operator = String(getCol(row, 'Operador', 'OPERADOR', 'Motorista') || '').trim() || null;
        const observations = String(getCol(row, 'Observacao', 'Observação', 'OBS') || '').trim() || null;

        readingsBatch.push({
          vehicle_id: vehicleId,
          reading_date: readingDate,
          current_value: horAtual,
          previous_value: horAnterior > 0 ? horAnterior : null,
          current_km: kmAtual > 0 ? kmAtual : null,
          previous_km: kmAnterior > 0 ? kmAnterior : null,
          operator,
          observations,
          source: 'sheet_sync',
          synced_from_sheet: true,
        });
      }
      
      console.log(`📊 Parse results: ${readingsBatch.length} valid, ${skippedNoVehicle} no vehicle, ${skippedNoDate} no date, ${skippedNoValue} no values`);
      
      if (parseErrors > 0) {
        console.warn(`⚠️ Total parse errors: ${parseErrors}`);
      }

      console.log(`📊 Prepared ${readingsBatch.length} readings for batch insert`);

      // Batch insert in chunks of 100
      const READING_CHUNK = 100;
      for (let i = 0; i < readingsBatch.length; i += READING_CHUNK) {
        const chunk = readingsBatch.slice(i, i + READING_CHUNK);
        try {
          const { error: insertError } = await supabase
            .from('horimeter_readings')
            .insert(chunk);
          
          if (insertError) {
            console.error(`Batch insert error at chunk ${i}:`, insertError);
            stats.errors += chunk.length;
          } else {
            stats.readingsImported += chunk.length;
          }
        } catch (err) {
          console.error('Error batch inserting readings:', err);
          stats.errors += chunk.length;
        }

        const currentProgress = Math.round(((i + chunk.length) / readingsBatch.length) * 100);
        setProgress(currentProgress);
        onProgress?.(i + chunk.length, readingsBatch.length);
      }

      // Count manually-created readings that remain
      const { count: manualCount } = await supabase
        .from('horimeter_readings')
        .select('id', { count: 'exact', head: true })
        .eq('synced_from_sheet', false);

      console.log(`📊 Manual readings preserved: ${manualCount || 0}`);

      toast({
        title: 'Sincronização concluída!',
        description: `${stats.vehiclesImported} veículos, ${stats.readingsImported} lançamentos importados da planilha`,
      });

      return stats;
    } catch (err: any) {
      console.error('Error syncing from sheet:', err);
      toast({
        title: 'Erro na sincronização',
        description: err.message || 'Falha ao sincronizar dados da planilha',
        variant: 'destructive',
      });
      throw err;
    } finally {
      setSyncing(false);
      setProgress(0);
    }
  }, [toast]);

  const exportToSheet = useCallback(async (): Promise<{ exported: number; errors: number }> => {
    setSyncing(true);
    
    const stats = { exported: 0, errors: 0 };

    try {
      // Fetch all readings from database
      const { data: readings, error: fetchError } = await supabase
        .from('horimeter_readings')
        .select(`*, vehicle:vehicles(code, name, category, company)`)
        .order('reading_date', { ascending: false });

      if (fetchError) throw fetchError;

      // Export each reading to sheet
      for (const reading of readings || []) {
        const vehicle = reading.vehicle as any;
        if (!vehicle) continue;

        const [year, month, day] = reading.reading_date.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        // Use correct column mapping: current_value=Hor, current_km=KM
        const prevHor = reading.previous_value || 0;
        const currHor = reading.current_value || 0;
        const prevKm = reading.previous_km || 0;
        const currKm = reading.current_km || 0;
        const intervaloH = (currHor > 0 && prevHor > 0) ? currHor - prevHor : 0;
        const totalKm = (currKm > 0 && prevKm > 0) ? currKm - prevKm : 0;
        const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';
        
        const semanticData: Record<string, string> = {
          'Data': formattedDate,
          'Hora': new Date(reading.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          'Veiculo': vehicle.code,
          'Categoria': vehicle.category || '',
          'Descricao': vehicle.name || '',
          'Empresa': vehicle.company || '',
          'Operador': reading.operator || '',
          'Horimetro Anterior': prevHor > 0 ? fmtNum(prevHor) : '',
          'Horimetro Atual': currHor > 0 ? fmtNum(currHor) : '',
          'Intervalo H': intervaloH > 0 ? fmtNum(intervaloH) : '',
          'Km Anterior': prevKm > 0 ? fmtNum(prevKm) : '',
          'Km Atual': currKm > 0 ? fmtNum(currKm) : '',
          'Total Km': totalKm > 0 ? fmtNum(totalKm) : '',
        };

        // Build rowData with actual sheet header names (fuzzy matched)
        const rowData = await buildHorimetrosRowData(semanticData);

        try {
          await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'create',
              sheetName: 'Horimetros',
              data: rowData,
            },
          });
          stats.exported++;
        } catch (err) {
          console.error('Error exporting reading:', err);
          stats.errors++;
        }
      }

      toast({
        title: 'Exportação concluída!',
        description: `${stats.exported} registros exportados`,
      });

      return stats;
    } catch (err: any) {
      console.error('Error exporting to sheet:', err);
      toast({
        title: 'Erro na exportação',
        description: err.message || 'Falha ao exportar dados para planilha',
        variant: 'destructive',
      });
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  return {
    syncing,
    progress,
    syncFromSheet,
    exportToSheet,
  };
}
