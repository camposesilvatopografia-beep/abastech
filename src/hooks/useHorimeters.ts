import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { parsePtBRNumber } from '@/lib/ptBRNumber';

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
      let query = supabase
        .from('horimeter_readings')
        .select(`
          *,
          vehicle:vehicles(*)
        `)
        .order('reading_date', { ascending: false });
      
      if (vehicleId) {
        query = query.eq('vehicle_id', vehicleId);
      }
      
      const { data, error: fetchError } = await query;
      
      if (fetchError) throw fetchError;
      setReadings((data || []) as HorimeterWithVehicle[]);
    } catch (err: any) {
      console.error('Error fetching readings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

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
          
          const rowData = {
            'Data': formattedDate,
            'Veiculo': vehicle.code,
            'Categoria': vehicle.category || '',
            'Descricao': vehicle.name || '',
            'Empresa': vehicle.company || '',
            'Operador': reading.operator || '',
            'Hor_Anterior': reading.previous_value ? reading.previous_value.toString().replace('.', ',') : '',
            'Hor_Atual': horimeterVal > 0 ? horimeterVal.toString().replace('.', ',') : '',
            'Km_Anterior': reading.previous_km ? reading.previous_km.toString().replace('.', ',') : '',
            'Km_Atual': kmVal > 0 ? kmVal.toString().replace('.', ',') : '',
            'Observacao': reading.observations || '',
          };
          
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
            
            const rowData = {
              'Data': formattedDate,
              'Veiculo': vehicle.code,
              'Categoria': vehicle.category || '',
              'Descricao': vehicle.name || '',
              'Empresa': vehicle.company || '',
              'Operador': operator || '',
              'Hor_Anterior': previousValue ? previousValue.toString().replace('.', ',') : '',
              'Hor_Atual': horimeterVal > 0 ? horimeterVal.toString().replace('.', ',') : '',
              'Km_Anterior': previousKm ? previousKm.toString().replace('.', ',') : '',
              'Km_Atual': kmVal > 0 ? kmVal.toString().replace('.', ',') : '',
              'Observacao': updates.observations ?? data.observations ?? '',
            };
            
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
      const { data, error: upsertError } = await supabase
        .from('horimeter_readings')
        .upsert({
          ...reading,
          source: reading.source || 'system',
          synced_from_sheet: reading.synced_from_sheet || false,
        }, { onConflict: 'vehicle_id,reading_date' })
        .select(`*, vehicle:vehicles(*)`)
        .single();
      
      if (upsertError) throw upsertError;
      
      setReadings(prev => {
        const filtered = prev.filter(r => 
          !(r.vehicle_id === data.vehicle_id && r.reading_date === data.reading_date)
        );
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
      // Fetch vehicles from sheet
      const { data: vehicleSheetData, error: vehicleError } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Veiculo' },
      });

      if (vehicleError) throw vehicleError;

      // Import vehicles
      const vehicleRows = vehicleSheetData?.rows || [];
      const vehicleMap = new Map<string, string>(); // code -> id

      for (const row of vehicleRows) {
        const code = String(row.CODIGO || row.Codigo || row.Codigo?.trim() || '').trim();
        if (!code) continue;

        const name = String(row.DESCRICAO || row.Descricao || code).trim();
        const description = String(row.DESCRICAO || row.Descricao || '').trim() || null;
        const category = String(row.TIPO || row.Tipo || row.CATEGORIA || row.Categoria || '').trim() || null;
        const company = String(row.EMPRESA || row.Empresa || '').trim() || null;
        
        // Determine unit based on category
        const categoryLower = (category || '').toLowerCase();
        const usesKm = categoryLower.includes('veículo') || categoryLower.includes('veiculo') ||
                       categoryLower.includes('caminhão') || categoryLower.includes('caminhao');
        const unit = usesKm ? 'km' : 'h';

        try {
          const { data: vehicle, error: upsertError } = await supabase
            .from('vehicles')
            .upsert({ code, name, description, category, company, unit }, { onConflict: 'code' })
            .select('id, code')
            .single();
          
          if (!upsertError && vehicle) {
            vehicleMap.set(vehicle.code, vehicle.id);
            stats.vehiclesImported++;
          }
        } catch (err) {
          console.error('Error importing vehicle:', code, err);
          stats.errors++;
        }
      }

      // Fetch all vehicles to complete the map
      const { data: allVehicles } = await supabase.from('vehicles').select('id, code');
      allVehicles?.forEach(v => vehicleMap.set(v.code, v.id));

      // Fetch horimeter readings from sheet
      const { data: horimeterSheetData, error: horimeterError } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'Horimetros' },
      });

      if (horimeterError) throw horimeterError;

      const horimeterRows = horimeterSheetData?.rows || [];
      const total = horimeterRows.length;

      for (let i = 0; i < horimeterRows.length; i++) {
        const row = horimeterRows[i];
        
        const vehicleCode = String(row.VEICULO || row.Veiculo || row.EQUIPAMENTO || '').trim();
        const vehicleId = vehicleMap.get(vehicleCode);
        
        if (!vehicleId) {
          stats.errors++;
          continue;
        }

        // Parse date - note: column may have leading space " Data"
        const dateStr = String(row.DATA || row.Data || row[' Data'] || '').trim();
        let readingDate: string | null = null;
        
        if (dateStr) {
          // Try dd/MM/yyyy format
          const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (match) {
            readingDate = `${match[3]}-${match[2]}-${match[1]}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            readingDate = dateStr;
          }
        }

        if (!readingDate) {
          stats.errors++;
          continue;
        }

        // Parse values - single source of truth for numeric parsing (pt-BR / en-US)
        const parseNum = parsePtBRNumber;

        // Helper to get column value with flexible key matching
        const getColValue = (keys: string[]): any => {
          for (const key of keys) {
            // Try exact match
            if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
            // Try trimmed key
            const trimmedKey = key.trim();
            if (row[trimmedKey] !== undefined && row[trimmedKey] !== null && row[trimmedKey] !== '') return row[trimmedKey];
            // Try with trailing space
            if (row[key + ' '] !== undefined && row[key + ' '] !== null && row[key + ' '] !== '') return row[key + ' '];
          }
          return null;
        };

        // Map horimeter columns (Hor_Anterior, Hor_Atual)
        const horAnteriorRaw = getColValue(['Hor_Anterior', 'HOR_ANTERIOR', 'Hor. Anterior', 'HOR. ANTERIOR']);
        const horAtualRaw = getColValue(['Hor_Atual', 'HOR_ATUAL', 'Hor. Atual', 'HOR. ATUAL']);
        
        // Map km columns (Km_Anterior, Km_Atual)
        const kmAnteriorRaw = getColValue(['Km_Anterior', 'KM_ANTERIOR', 'Km. Anterior', 'KM. ANTERIOR', 'KM Anterior']);
        const kmAtualRaw = getColValue(['Km_Atual', 'KM_ATUAL', 'Km. Atual', 'KM. ATUAL', 'KM Atual']);
        
        const horAnterior = parseNum(horAnteriorRaw);
        const horAtual = parseNum(horAtualRaw);
        const kmAnterior = parseNum(kmAnteriorRaw);
        const kmAtual = parseNum(kmAtualRaw);
        
        // Log for debugging
        if (i < 5) {
          console.log(`📊 Row ${i + 1}:`, {
            veiculo: vehicleCode,
            data: readingDate,
            'Hor_Anterior (raw)': horAnteriorRaw,
            'Hor_Atual (raw)': horAtualRaw,
            'Km_Anterior (raw)': kmAnteriorRaw,
            'Km_Atual (raw)': kmAtualRaw,
            'Parsed values': { horAnterior, horAtual, kmAnterior, kmAtual }
          });
        }
        
        // Store values EXACTLY as they appear in the spreadsheet row
        // Each row already contains both previous and current values
        // - current_value/previous_value = Horímetro values from the SAME row
        // - current_km/previous_km = KM values from the SAME row
        const currentValue = horAtual;
        const previousValue = horAnterior; // Store even if 0 (first record has 0 as previous)

        // Skip only if BOTH horimeter AND km current values are missing/zero
        if (currentValue === 0 && kmAtual === 0) {
          console.log(`⚠️ Skipping row ${i + 1} - no horimeter or km atual values`);
          stats.errors++;
          continue;
        }

        const operator = String(getColValue(['Operador', 'OPERADOR', 'Motorista', 'MOTORISTA']) || '').trim() || null;
        const observations = String(getColValue(['Observacao', 'OBSERVACAO', 'Observação', 'OBS']) || '').trim() || null;

        try {
          // Check if record exists
          const { data: existing } = await supabase
            .from('horimeter_readings')
            .select('id')
            .eq('vehicle_id', vehicleId)
            .eq('reading_date', readingDate)
            .maybeSingle();

          if (existing) {
            // Update existing - store all 4 values exactly as in the sheet
            await supabase
              .from('horimeter_readings')
              .update({
                current_value: currentValue,
                previous_value: previousValue, // Store exactly as in sheet (can be 0)
                current_km: kmAtual > 0 ? kmAtual : null,
                previous_km: kmAnterior > 0 ? kmAnterior : null,
                operator,
                observations,
                synced_from_sheet: true,
              })
              .eq('id', existing.id);
            stats.readingsUpdated++;
          } else {
            // Insert new - store all 4 values exactly as in the sheet
            await supabase
              .from('horimeter_readings')
              .insert({
                vehicle_id: vehicleId,
                reading_date: readingDate,
                current_value: currentValue,
                previous_value: previousValue, // Store exactly as in sheet (can be 0)
                current_km: kmAtual > 0 ? kmAtual : null,
                previous_km: kmAnterior > 0 ? kmAnterior : null,
                operator,
                observations,
                source: 'sheet_sync',
                synced_from_sheet: true,
              });
            stats.readingsImported++;
          }
        } catch (err) {
          console.error('Error importing reading:', err);
          stats.errors++;
        }

        const currentProgress = Math.round(((i + 1) / total) * 100);
        setProgress(currentProgress);
        onProgress?.(i + 1, total);
      }

      // Step 3: Detect and delete readings that exist in DB but not in sheet
      // Build a set of all (vehicleCode, date) pairs from the sheet
      const sheetRecordKeys = new Set<string>();
      const reverseVehicleMap = new Map<string, string>(); // id -> code
      allVehicles?.forEach(v => reverseVehicleMap.set(v.id, v.code));
      
      for (const row of horimeterRows) {
        const vehicleCode = String(row.VEICULO || row.Veiculo || row.EQUIPAMENTO || '').trim();
        const dateStr = String(row.DATA || row.Data || row[' Data'] || '').trim();
        
        let readingDate: string | null = null;
        if (dateStr) {
          const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (match) {
            readingDate = `${match[3]}-${match[2]}-${match[1]}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            readingDate = dateStr;
          }
        }
        
        if (vehicleCode && readingDate) {
          sheetRecordKeys.add(`${vehicleCode}|${readingDate}`);
        }
      }

      // Get all readings from database
      const { data: allDbReadings } = await supabase
        .from('horimeter_readings')
        .select('id, vehicle_id, reading_date');

      // Find readings in DB that are not in sheet
      for (const dbReading of allDbReadings || []) {
        const vehicleCode = reverseVehicleMap.get(dbReading.vehicle_id);
        if (!vehicleCode) continue;
        
        const key = `${vehicleCode}|${dbReading.reading_date}`;
        
        if (!sheetRecordKeys.has(key)) {
          // This reading exists in DB but not in sheet - delete it
          try {
            await supabase
              .from('horimeter_readings')
              .delete()
              .eq('id', dbReading.id);
            stats.readingsDeleted++;
            console.log(`Registro removido do BD (não existe na planilha): ${key}`);
          } catch (err) {
            console.error('Error deleting orphan reading:', err);
            stats.errors++;
          }
        }
      }

      toast({
        title: 'Sincronização concluída!',
        description: `${stats.vehiclesImported} veículos, ${stats.readingsImported} novos, ${stats.readingsUpdated} atualizados, ${stats.readingsDeleted} removidos`,
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

        const usesKm = vehicle.category?.toLowerCase().includes('veículo') ||
                       vehicle.category?.toLowerCase().includes('veiculo');

        const rowData = {
          DATA: formattedDate,
          HORA: new Date(reading.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          VEICULO: vehicle.code,
          CATEGORIA: vehicle.category || '',
          DESCRICAO: vehicle.name || '',
          EMPRESA: vehicle.company || '',
          OPERADOR: reading.operator || '',
          Hor_Anterior: usesKm ? '' : (reading.previous_value?.toString().replace('.', ',') || ''),
          Hor_Atual: usesKm ? '' : reading.current_value.toString().replace('.', ','),
          Km_Anterior: usesKm ? (reading.previous_value?.toString().replace('.', ',') || '') : '',
          Km_Atual: usesKm ? reading.current_value.toString().replace('.', ',') : '',
          OBSERVACAO: reading.observations || '',
        };

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
