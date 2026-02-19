import { supabase } from '@/integrations/supabase/client';
import { offlineDB, OfflineRecord } from '@/hooks/useOfflineStorage';
import { formatPtBRNumber } from '@/lib/ptBRNumber';
import { getSheetData } from '@/lib/googleSheets';

/**
 * Enriches an offline fuel record with fresh data from the DB:
 * - Fills missing horimeter_previous / km_previous from the latest record
 * - Fills missing or incorrect operator_name from vehicle history
 */
async function enrichFuelRecord(data: Record<string, any>, userId: string): Promise<Record<string, any>> {
  const vehicleCode = data.vehicle_code;
  if (!vehicleCode) return data;

  const enriched = { ...data };

  try {
    // 1. Fix operator: if it matches the field user's own name, look up the correct driver
    const { data: fieldUser } = await supabase
      .from('field_users')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    const userOwnName = fieldUser?.name || '';
    const currentOp = (enriched.operator_name || '').trim();
    const needsOperatorFix = !currentOp || (userOwnName && currentOp.toLowerCase() === userOwnName.toLowerCase());

    if (needsOperatorFix) {
      // Try from recent fuel records
      const { data: recentFuel } = await supabase
        .from('field_fuel_records')
        .select('operator_name')
        .eq('vehicle_code', vehicleCode)
        .not('operator_name', 'is', null)
        .neq('operator_name', '')
        .order('created_at', { ascending: false })
        .limit(5);

      const correctOp = recentFuel?.find(r =>
        r.operator_name && r.operator_name.toLowerCase() !== userOwnName.toLowerCase()
      );

      if (correctOp?.operator_name) {
        enriched.operator_name = correctOp.operator_name;
      } else {
        // Fallback: horimeter readings
        const { data: vehicleRow } = await supabase
          .from('vehicles')
          .select('id')
          .eq('code', vehicleCode)
          .maybeSingle();

        if (vehicleRow?.id) {
          const { data: horRec } = await supabase
            .from('horimeter_readings')
            .select('operator')
            .eq('vehicle_id', vehicleRow.id)
            .not('operator', 'is', null)
            .neq('operator', '')
            .order('created_at', { ascending: false })
            .limit(1);

          if (horRec?.[0]?.operator) {
            enriched.operator_name = horRec[0].operator;
          }
        }
      }
    }

    // 2. Fill missing horimeter_previous and km_previous
    const horPrev = Number(enriched.horimeter_previous) || 0;
    const kmPrev = Number(enriched.km_previous) || 0;

    if (horPrev === 0 || kmPrev === 0) {
      // Get the most recent fuel record for this vehicle
      const { data: lastFuel } = await supabase
        .from('field_fuel_records')
        .select('horimeter_current, km_current')
        .eq('vehicle_code', vehicleCode)
        .not('horimeter_current', 'is', null)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(1);

      if (lastFuel?.[0]) {
        if (horPrev === 0 && Number(lastFuel[0].horimeter_current) > 0) {
          enriched.horimeter_previous = lastFuel[0].horimeter_current;
        }
        if (kmPrev === 0 && Number(lastFuel[0].km_current) > 0) {
          enriched.km_previous = lastFuel[0].km_current;
        }
      }

      // Also check horimeter_readings table for more recent data
      const { data: vehicleRow } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      if (vehicleRow?.id) {
        const { data: lastHor } = await supabase
          .from('horimeter_readings')
          .select('current_value, current_km')
          .eq('vehicle_id', vehicleRow.id)
          .order('reading_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        if (lastHor?.[0]) {
          const dbHor = Number(lastHor[0].current_value) || 0;
          const dbKm = Number(lastHor[0].current_km) || 0;
          // Use whichever is higher (more recent)
          if (dbHor > Number(enriched.horimeter_previous || 0)) {
            enriched.horimeter_previous = dbHor;
          }
          if (dbKm > Number(enriched.km_previous || 0)) {
            enriched.km_previous = dbKm;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[OfflineSync] Enrichment failed, using original data:', err);
  }

  return enriched;
}

/**
 * Enriches an offline horimeter record with fresh data from the DB
 */
async function enrichHorimeterRecord(data: Record<string, any>): Promise<Record<string, any>> {
  const vehicleId = data.vehicle_id;
  if (!vehicleId) return data;

  const enriched = { ...data };

  try {
    const prevVal = Number(enriched.previous_value) || 0;
    const prevKm = Number(enriched.previous_km) || 0;

    if (prevVal === 0 || prevKm === 0) {
      const { data: lastReading } = await supabase
        .from('horimeter_readings')
        .select('current_value, current_km')
        .eq('vehicle_id', vehicleId)
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

      if (lastReading?.[0]) {
        if (prevVal === 0 && Number(lastReading[0].current_value) > 0) {
          enriched.previous_value = lastReading[0].current_value;
        }
        if (prevKm === 0 && Number(lastReading[0].current_km) > 0) {
          enriched.previous_km = lastReading[0].current_km;
        }
      }
    }

    // Fix operator if missing
    if (!enriched.operator) {
      const { data: lastOp } = await supabase
        .from('horimeter_readings')
        .select('operator')
        .eq('vehicle_id', vehicleId)
        .not('operator', 'is', null)
        .neq('operator', '')
        .order('reading_date', { ascending: false })
        .limit(1);

      if (lastOp?.[0]?.operator) {
        enriched.operator = lastOp[0].operator;
      }
    }
  } catch (err) {
    console.warn('[OfflineSync] Horimeter enrichment failed:', err);
  }

  return enriched;
}

/**
 * Syncs all pending offline records to Supabase and Google Sheets.
 * Enriches each record with fresh DB data before inserting.
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
          // Enrich with fresh DB data before sync
          record.data = await enrichFuelRecord(record.data, userId);
          await syncFuelRecord(record);
          break;
        case 'horimeter_reading':
          record.data = await enrichHorimeterRecord(record.data);
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
  // IMPORTANT: Use ?? (nullish coalescing) instead of || for numeric fields
  // to preserve valid 0 values. Using || would convert 0 to null.
  const { data: savedRecord, error } = await supabase.from('field_fuel_records').insert({
    vehicle_code: data.vehicle_code,
    vehicle_description: data.vehicle_description || null,
    record_date: data.record_date,
    record_time: data.record_time,
    fuel_quantity: data.fuel_quantity ?? 0,
    fuel_type: data.fuel_type || null,
    arla_quantity: data.arla_quantity ?? null,
    horimeter_current: data.horimeter_current ?? null,
    horimeter_previous: data.horimeter_previous ?? null,
    km_current: data.km_current ?? null,
    km_previous: data.km_previous ?? null,
    operator_name: data.operator_name || null,
    location: data.location || null,
    observations: data.observations || null,
    user_id: record.userId,
    synced_to_sheet: false,
    category: data.category || null,
    company: data.company || null,
    oil_type: data.oil_type || null,
    oil_quantity: data.oil_quantity ?? null,
    lubricant: data.lubricant || null,
    filter_blow: data.filter_blow ?? false,
    filter_blow_quantity: data.filter_blow_quantity ?? null,
    supplier: data.supplier || null,
    unit_price: data.unit_price ?? null,
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
    
    const { buildFuelSheetData } = await import('@/lib/fuelSheetMapping');
    const sheetData = buildFuelSheetData({
      id: savedRecord?.id || '',
      date: formattedDate,
      time: data.record_time || '',
      recordType: data.record_type || 'saida',
      category: data.category || '',
      vehicleCode: data.vehicle_code || '',
      vehicleDescription: data.vehicle_description || '',
      operatorName: data.operator_name || '',
      company: data.company || '',
      workSite: data.work_site || '',
      horimeterPrevious: Number(data.horimeter_previous) || 0,
      horimeterCurrent: Number(data.horimeter_current) || 0,
      kmPrevious: Number(data.km_previous) || 0,
      kmCurrent: Number(data.km_current) || 0,
      fuelQuantity: Number(data.fuel_quantity) || 0,
      fuelType: data.fuel_type || '',
      location: data.location || '',
      arlaQuantity: Number(data.arla_quantity) || 0,
      observations: data.observations || '',
      oilType: data.oil_type || '',
      oilQuantity: Number(data.oil_quantity) || 0,
      filterBlowQuantity: Number(data.filter_blow_quantity) || 0,
      lubricant: data.lubricant || '',
      supplier: data.supplier || '',
      invoiceNumber: data.invoice_number || '',
      unitPrice: Number(data.unit_price) || 0,
      entryLocation: data.entry_location || '',
    });

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
      current_value: data.current_value ?? 0,
      previous_value: data.previous_value ?? null,
      current_km: data.current_km ?? null,
      previous_km: data.previous_km ?? null,
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
    const prevHor = Number(data.previous_value) || 0;
    const currHor = Number(data.current_value) || 0;
    const prevKm = Number(data.previous_km) || 0;
    const currKm = Number(data.current_km) || 0;

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
