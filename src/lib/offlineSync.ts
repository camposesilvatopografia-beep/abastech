import { supabase } from '@/integrations/supabase/client';
import { offlineDB, OfflineRecord } from '@/hooks/useOfflineStorage';
import { formatPtBRNumber } from '@/lib/ptBRNumber';
import { getSheetData } from '@/lib/googleSheets';

/**
 * Syncs all pending offline records to Supabase and Google Sheets.
 * Returns { synced, failed } counts.
 */
export async function syncAllOfflineRecords(userId: string): Promise<{ synced: number; failed: number }> {
  const records = await offlineDB.getRecordsByUser(userId);
  if (records.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const record of records) {
    try {
      switch (record.type) {
        case 'fuel_record':
          await syncFuelRecord(record);
          break;
        case 'horimeter_reading':
          await syncHorimeterRecord(record);
          break;
        case 'service_order':
          await syncServiceOrderRecord(record);
          break;
      }
      await offlineDB.deleteRecord(record.id);
      synced++;
    } catch (err) {
      console.error(`Failed to sync record ${record.id}:`, err);
      record.syncAttempts += 1;
      record.lastSyncAttempt = new Date().toISOString();
      await offlineDB.updateRecord(record);
      failed++;
    }
  }

  return { synced, failed };
}

async function syncFuelRecord(record: OfflineRecord) {
  const data = record.data;

  // Insert into Supabase
  const { data: savedRecord, error } = await supabase.from('field_fuel_records').insert({
    vehicle_code: data.vehicle_code,
    vehicle_description: data.vehicle_description || null,
    record_date: data.record_date,
    record_time: data.record_time,
    fuel_quantity: data.fuel_quantity,
    fuel_type: data.fuel_type || null,
    arla_quantity: data.arla_quantity || null,
    horimeter_current: data.horimeter_current || null,
    horimeter_previous: data.horimeter_previous || null,
    km_current: data.km_current || null,
    km_previous: data.km_previous || null,
    operator_name: data.operator_name || null,
    location: data.location || null,
    observations: data.observations || null,
    user_id: record.userId,
    synced_to_sheet: false,
    category: data.category || null,
    company: data.company || null,
    oil_type: data.oil_type || null,
    oil_quantity: data.oil_quantity || null,
    lubricant: data.lubricant || null,
    filter_blow: data.filter_blow || false,
    filter_blow_quantity: data.filter_blow_quantity || null,
    supplier: data.supplier || null,
    unit_price: data.unit_price || null,
    invoice_number: data.invoice_number || null,
    record_type: data.record_type || 'abastecimento',
    work_site: data.work_site || null,
    entry_location: data.entry_location || null,
  }).select('id').single();

  if (error) throw error;

  // Sync to Google Sheets
  try {
    const [year, month, day] = (data.record_date || '').split('-');
    const formattedDate = day && month && year ? `${day}/${month}/${year}` : data.record_date;
    
    const fmtNum = (v: any) => {
      const n = Number(v);
      return n > 0 ? formatPtBRNumber(n, { decimals: 2 }) : '';
    };

    const sheetData: Record<string, any> = {
      'DATA': formattedDate,
      'HORA': data.record_time || '',
      'TIPO': data.record_type === 'entrada' || data.record_type === 'Entrada' ? 'Entrada' : 'Saida',
      'VEICULO': data.vehicle_code || '',
      'DESCRICAO': data.vehicle_description || '',
      'CATEGORIA': data.category || '',
      'MOTORISTA': data.operator_name || '',
      'EMPRESA': data.company || '',
      'OBRA': data.work_site || '',
      'HORIMETRO ANTERIOR': fmtNum(data.horimeter_previous),
      'HORIMETRO ATUAL': fmtNum(data.horimeter_current),
      'KM ANTERIOR': fmtNum(data.km_previous),
      'KM ATUAL': fmtNum(data.km_current),
      'QUANTIDADE': fmtNum(data.fuel_quantity),
      'TIPO DE COMBUSTIVEL': data.fuel_type || '',
      'LOCAL': data.location || '',
      'ARLA': (data.arla_quantity && Number(data.arla_quantity) > 0) ? 'TRUE' : 'FALSE',
      'QUANTIDADE DE ARLA': fmtNum(data.arla_quantity),
      'OBSERVAÇÃO': data.observations || '',
      'LUBRIFICAR': data.lubricant ? 'TRUE' : 'FALSE',
      'LUBRIFICANTE': data.lubricant || '',
      'COMPLETAR ÓLEO': data.oil_type ? 'TRUE' : 'FALSE',
      'TIPO ÓLEO': data.oil_type || '',
      'QUANTIDADE ÓLEO': fmtNum(data.oil_quantity),
      'SOPRA FILTRO': fmtNum(data.filter_blow_quantity),
      'FORNECEDOR': data.supplier || '',
      'NOTA FISCAL': data.invoice_number || '',
      'VALOR UNITÁRIO': fmtNum(data.unit_price),
      'LOCAL DE ENTRADA': data.entry_location || '',
    };

    const response = await supabase.functions.invoke('google-sheets', {
      body: { action: 'create', sheetName: 'AbastecimentoCanteiro01', data: sheetData },
    });

    if (!response.error && savedRecord?.id) {
      await supabase
        .from('field_fuel_records')
        .update({ synced_to_sheet: true })
        .eq('id', savedRecord.id);
    }
  } catch (syncErr) {
    console.warn('[OfflineSync] Sheet sync failed for fuel record (DB saved):', syncErr);
  }
}

async function syncHorimeterRecord(record: OfflineRecord) {
  const data = record.data;

  const { data: inserted, error } = await supabase
    .from('horimeter_readings')
    .insert({
      vehicle_id: data.vehicle_id,
      reading_date: data.reading_date,
      current_value: data.current_value || 0,
      previous_value: data.previous_value || null,
      current_km: data.current_km || null,
      previous_km: data.previous_km || null,
      operator: data.operator || null,
      observations: data.observations || null,
      source: 'field',
    })
    .select('id')
    .single();

  if (error) throw error;

  // Sync to Google Sheets
  try {
    const fmtNum = (v: number) => v > 0 ? formatPtBRNumber(v, { decimals: 2 }) : '';
    const [year, month, day] = data.reading_date.split('-');
    const formattedDate = `${day}/${month}/${year}`;
    const prevHor = data.previous_value || 0;
    const currHor = data.current_value || 0;
    const prevKm = data.previous_km || 0;
    const currKm = data.current_km || 0;

    const sheetPayload: Record<string, string> = {
      'Data': formattedDate,
      'Veiculo': data.vehicle_code || '',
      'Categoria': data.vehicle_category || '',
      'Descricao': data.vehicle_name || '',
      'Empresa': data.vehicle_company || '',
      'Operador': data.operator || '',
      'Horimetro Anterior': prevHor > 0 ? fmtNum(prevHor) : '',
      'Horimetro Atual': fmtNum(currHor),
      'Intervalo H': (currHor > 0 && prevHor > 0) ? fmtNum(currHor - prevHor) : '',
      'Km Anterior': prevKm > 0 ? fmtNum(prevKm) : '',
      'Km Atual': currKm > 0 ? fmtNum(currKm) : '',
      'Total Km': (currKm > 0 && prevKm > 0) ? fmtNum(currKm - prevKm) : '',
    };

    // Map to real headers
    try {
      const sheetInfo = await getSheetData('Horimetros', { noCache: false });
      const headers = sheetInfo.headers || [];
      if (headers.length > 0) {
        const normalizeH = (h: string) => h.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[\s_.]/g, '');
        const normalizedMap = new Map(headers.map(h => [normalizeH(h), h]));
        const mapped: Record<string, string> = {};
        for (const [key, value] of Object.entries(sheetPayload)) {
          const actual = normalizedMap.get(normalizeH(key));
          mapped[actual || key] = value;
        }
        await supabase.functions.invoke('google-sheets', {
          body: { action: 'create', sheetName: 'Horimetros', data: mapped },
        });
      } else {
        await supabase.functions.invoke('google-sheets', {
          body: { action: 'create', sheetName: 'Horimetros', data: sheetPayload },
        });
      }
    } catch {
      await supabase.functions.invoke('google-sheets', {
        body: { action: 'create', sheetName: 'Horimetros', data: sheetPayload },
      });
    }
  } catch (syncErr) {
    console.warn('Sheet sync failed for horimeter (DB saved):', syncErr);
  }
}

async function syncServiceOrderRecord(record: OfflineRecord) {
  const data = record.data;
  
  const { error } = await supabase.from('service_orders').insert({
    order_number: data.order_number,
    order_date: data.order_date,
    vehicle_code: data.vehicle_code,
    vehicle_description: data.vehicle_description || null,
    order_type: data.order_type || 'Corretiva',
    priority: data.priority || 'Média',
    status: data.status || 'Aberta',
    problem_description: data.problem_description || null,
    solution_description: data.solution_description || null,
    mechanic_id: data.mechanic_id || null,
    mechanic_name: data.mechanic_name || null,
    estimated_hours: data.estimated_hours || null,
    actual_hours: data.actual_hours || null,
    parts_used: data.parts_used || null,
    parts_cost: data.parts_cost || null,
    labor_cost: data.labor_cost || null,
    total_cost: data.total_cost || null,
    notes: data.notes || null,
    created_by: data.created_by || null,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
    horimeter_current: data.horimeter_current || null,
    km_current: data.km_current || null,
    entry_date: data.entry_date || null,
    entry_time: data.entry_time || null,
    interval_days: data.interval_days || null,
  });

  if (error) throw error;
}

/**
 * Cache reference data for offline use (vehicles, suppliers, lubricants, etc.)
 */
export async function cacheReferenceData() {
  try {
    const [vehiclesRes, suppliersRes, lubricantsRes, oilTypesRes, mechanicsRes] = await Promise.all([
      supabase.from('vehicles').select('*').order('code'),
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
      supabase.from('lubricants').select('*').eq('active', true).order('name'),
      supabase.from('oil_types').select('*').eq('active', true).order('name'),
      supabase.from('mechanics').select('*').eq('active', true).order('name'),
    ]);

    if (vehiclesRes.data) await offlineDB.setCacheData('vehicles', vehiclesRes.data);
    if (suppliersRes.data) await offlineDB.setCacheData('suppliers', suppliersRes.data);
    if (lubricantsRes.data) await offlineDB.setCacheData('lubricants', lubricantsRes.data);
    if (oilTypesRes.data) await offlineDB.setCacheData('oil_types', oilTypesRes.data);
    if (mechanicsRes.data) await offlineDB.setCacheData('mechanics', mechanicsRes.data);

    console.log('[OfflineSync] Reference data cached successfully');
  } catch (err) {
    console.error('[OfflineSync] Failed to cache reference data:', err);
  }
}
