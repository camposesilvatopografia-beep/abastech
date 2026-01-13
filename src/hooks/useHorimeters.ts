import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Vehicle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  company: string | null;
  unit: string;
  created_at: string;
  updated_at: string;
}

export interface HorimeterReading {
  id: string;
  vehicle_id: string;
  reading_date: string;
  current_value: number;
  previous_value: number | null;
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
    operator?: string | null;
    observations?: string | null;
    source?: string;
    synced_from_sheet?: boolean;
  }) => {
    try {
      const { data, error: insertError } = await supabase
        .from('horimeter_readings')
        .insert({
          ...reading,
          source: reading.source || 'system',
          synced_from_sheet: reading.synced_from_sheet || false,
        })
        .select(`*, vehicle:vehicles(*)`)
        .single();
      
      if (insertError) throw insertError;
      
      setReadings(prev => [data as HorimeterWithVehicle, ...prev]);
      toast({
        title: 'Sucesso!',
        description: 'Registro criado com sucesso',
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

  const updateReading = useCallback(async (id: string, updates: Partial<HorimeterReading>) => {
    try {
      const { data, error: updateError } = await supabase
        .from('horimeter_readings')
        .update(updates)
        .eq('id', id)
        .select(`*, vehicle:vehicles(*)`)
        .single();
      
      if (updateError) throw updateError;
      
      setReadings(prev => prev.map(r => r.id === id ? data as HorimeterWithVehicle : r));
      toast({
        title: 'Sucesso!',
        description: 'Registro atualizado com sucesso',
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
  }, [toast]);

  const deleteReading = useCallback(async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('horimeter_readings')
        .delete()
        .eq('id', id);
      
      if (deleteError) throw deleteError;
      
      setReadings(prev => prev.filter(r => r.id !== id));
      toast({
        title: 'Sucesso!',
        description: 'Registro excluído com sucesso',
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
  }, [toast]);

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
    errors: number;
  }> => {
    setSyncing(true);
    setProgress(0);
    
    const stats = {
      vehiclesImported: 0,
      readingsImported: 0,
      readingsUpdated: 0,
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
        const code = String(row.CODIGO || row.Codigo || row.VEICULO || row.Veiculo || '').trim();
        if (!code) continue;

        const name = String(row.DESCRICAO || row.Descricao || row.DESCRIÇÃO || code).trim();
        const description = String(row.DESCRICAO || row.Descricao || row.DESCRIÇÃO || '').trim() || null;
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

        // Parse date
        const dateStr = String(row.DATA || row.Data || '').trim();
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

        // Parse values
        const parseNum = (val: any): number => {
          if (!val) return 0;
          const str = String(val).replace(/\./g, '').replace(',', '.');
          return parseFloat(str) || 0;
        };

        const horAtual = parseNum(row.Hor_Atual || row.HOR_ATUAL || row.HORIMETRO || row.HORAS);
        const kmAtual = parseNum(row.Km_Atual || row.KM_ATUAL || row.KM);
        const currentValue = horAtual > 0 ? horAtual : kmAtual;
        
        const horAnterior = parseNum(row.Hor_Anterior || row.HOR_ANTERIOR);
        const kmAnterior = parseNum(row.Km_Anterior || row.KM_ANTERIOR);
        const previousValue = horAnterior > 0 ? horAnterior : kmAnterior;

        if (currentValue === 0) {
          stats.errors++;
          continue;
        }

        const operator = String(row.OPERADOR || row.Operador || row.MOTORISTA || '').trim() || null;
        const observations = String(row.OBSERVACAO || row.Observacao || row.OBS || '').trim() || null;

        try {
          // Check if record exists
          const { data: existing } = await supabase
            .from('horimeter_readings')
            .select('id')
            .eq('vehicle_id', vehicleId)
            .eq('reading_date', readingDate)
            .maybeSingle();

          if (existing) {
            // Update existing
            await supabase
              .from('horimeter_readings')
              .update({
                current_value: currentValue,
                previous_value: previousValue || null,
                operator,
                observations,
                synced_from_sheet: true,
              })
              .eq('id', existing.id);
            stats.readingsUpdated++;
          } else {
            // Insert new
            await supabase
              .from('horimeter_readings')
              .insert({
                vehicle_id: vehicleId,
                reading_date: readingDate,
                current_value: currentValue,
                previous_value: previousValue || null,
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

      toast({
        title: 'Sincronização concluída!',
        description: `${stats.vehiclesImported} veículos, ${stats.readingsImported} novos registros, ${stats.readingsUpdated} atualizados`,
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
