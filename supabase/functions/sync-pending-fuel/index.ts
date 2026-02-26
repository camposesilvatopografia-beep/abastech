import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format number in pt-BR style
function fmtNum(v: any): string {
  const n = Number(v);
  if (!n || n === 0) return '';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mapVehicleToComboioLocation(vehicleCode: string, vehicleDescription?: string): string | null {
  const code = (vehicleCode || '').toUpperCase().trim();
  const desc = (vehicleDescription || '').toUpperCase().trim();

  const isComboio = code.startsWith('CC') || desc.includes('COMBOIO');
  if (!isComboio) return null;

  const match = code.match(/CC[- ]?(\d+)/);
  if (match) {
    const num = match[1].replace(/^0+/, '') || '0';
    return `Comboio ${num.padStart(2, '0')}`;
  }

  const descMatch = desc.match(/COMBOIO\s*(\d+)/);
  if (descMatch) {
    const num = descMatch[1].replace(/^0+/, '') || '0';
    return `Comboio ${num.padStart(2, '0')}`;
  }

  return 'Comboio';
}

function buildSheetData(record: any): Record<string, any> {
  const rt = (record.record_type || '').toLowerCase();
  const isCarregamento = rt === 'carregamento';
  const tipo = isCarregamento
    ? 'Carregamento'
    : (rt === 'entrada' ? 'Entrada' : 'Saida');

  const horPrev = Number(record.horimeter_previous) || 0;
  const horCurr = Number(record.horimeter_current) || 0;
  const kmPrev = Number(record.km_previous) || 0;
  const kmCurr = Number(record.km_current) || 0;
  const fuelQty = Number(record.fuel_quantity) || 0;
  const unitPrice = Number(record.unit_price) || 0;

  // Format date as dd/MM/yyyy
  let dateFormatted = record.record_date;
  if (record.record_date && record.record_date.includes('-')) {
    const [year, month, day] = record.record_date.split('-');
    dateFormatted = `${day}/${month}/${year}`;
  }

  // Format time as HH:MM
  const timeFormatted = record.record_time ? record.record_time.toString().slice(0, 5) : '';

  // LOCAL column: always populate when location is available
  const locationValue = (record.location || '').trim()
    || (tipo === 'Saida' ? (mapVehicleToComboioLocation(record.vehicle_code || '', record.vehicle_description || '') || '') : '');

  const localDoCarregamento = isCarregamento
    ? (record.entry_location || record.location || '')
    : '';
  const tanqueCarregado = isCarregamento
    ? (mapVehicleToComboioLocation(record.vehicle_code || '', record.vehicle_description || '') || record.vehicle_code || '')
    : '';

  return {
    'id': record.id || '',
    'DATA': dateFormatted,
    'HORA': timeFormatted,
    'TIPO': tipo,
    'LOCAL DO CARREGAMENTO': localDoCarregamento,
    'TANQUE CARREGADO': tanqueCarregado,
    'CATEGORIA': record.category || '',
    'VEICULO': record.vehicle_code || '',
    'POTENCIA': '',
    'DESCRICAO': record.vehicle_description || '',
    'MOTORISTA': record.operator_name || '',
    'EMPRESA': record.company || '',
    'OBRA': record.work_site || '',
    'HORIMETRO ANTERIOR': fmtNum(horPrev),
    'HORIMETRO ATUAL': fmtNum(horCurr),
    'INTERVALO HORAS': horCurr > horPrev ? fmtNum(horCurr - horPrev) : '',
    'KM ANTERIOR': fmtNum(kmPrev),
    'KM ATUAL': fmtNum(kmCurr),
    'INTERVALO KM': kmCurr > kmPrev ? fmtNum(kmCurr - kmPrev) : '',
    'QUANTIDADE': fmtNum(fuelQty),
    'TIPO DE COMBUSTIVEL': record.fuel_type || 'Diesel',
    'LOCAL': locationValue,
    'ARLA': Number(record.arla_quantity) > 0 ? 'Sim' : '',
    'QUANTIDADE DE ARLA': fmtNum(record.arla_quantity),
    'FORNECEDOR': record.supplier || '',
    'NOTA FISCAL': record.invoice_number || '',
    'VALOR UNITÁRIO': fmtNum(unitPrice),
    'VALOR TOTAL': unitPrice > 0 && fuelQty > 0 ? fmtNum(unitPrice * fuelQty) : '',
    'OBSERVAÇÃO': record.observations || '',
    'FOTO BOMBA': record.photo_pump_url || '',
    'FOTO HORIMETRO': record.photo_horimeter_url || '',
    'LOCAL DE ENTRADA': tipo === 'Entrada' ? (record.entry_location || record.supplier || record.location || '') : '',
    'LUBRIFICAR': Number(record.oil_quantity) > 0 ? 'Sim' : '',
    'LUBRIFICANTE': record.lubricant || '',
    'COMPLETAR ÓLEO': Number(record.oil_quantity) > 0 ? 'Sim' : '',
    'TIPO ÓLEO': record.oil_type || '',
    'QUANTIDADE ÓLEO': fmtNum(record.oil_quantity),
    'SOPRA FILTRO': record.filter_blow ? 'Sim' : '',
  };
}

// Normalize header: remove accents, lowercase, trim
function normalizeHeader(h: string): string {
  return (h || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all unsynced records (from ALL users — admin operation)
    // Use atomic lock: only select records that are still unsynced
    const { data: pendingRecords, error: fetchError } = await supabase
      .from('field_fuel_records')
      .select('*')
      .eq('synced_to_sheet', false)
      .order('record_date', { ascending: true })
      .order('record_time', { ascending: true })
      .limit(100);

    if (fetchError) throw fetchError;

    if (!pendingRecords || pendingRecords.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending records to sync', synced: 0, skipped: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingRecords.length} pending records to sync`);

    // --- Deduplication: fetch existing sheet data to check for duplicates ---
    let existingSheetIds = new Set<string>();
    let existingSheetKeys = new Set<string>();
    try {
      const { data: sheetResp, error: sheetErr } = await supabase.functions.invoke('google-sheets', {
        body: { action: 'getData', sheetName: 'AbastecimentoCanteiro01' },
      });

      if (!sheetErr && sheetResp?.rows) {
        const headers: string[] = (sheetResp.headers || []).map(normalizeHeader);
        const idCol = headers.indexOf('id');
        const dataCol = headers.indexOf('data');
        const horaCol = headers.indexOf('hora');
        const veiculoCol = headers.indexOf('veiculo');
        const qtdCol = headers.indexOf('quantidade');

        for (const row of sheetResp.rows) {
          const values = Object.values(row) as string[];
          // Collect IDs
          if (idCol >= 0 && values[idCol]) {
            existingSheetIds.add(String(values[idCol]).trim());
          }
          // Also check by normalized header keys from row object
          const rowId = row['id'] || row['ID'];
          if (rowId) existingSheetIds.add(String(rowId).trim());

          // Build composite key: vehicle+date+time+quantity
          const v = (row['VEICULO'] || row['veiculo'] || (veiculoCol >= 0 ? values[veiculoCol] : '') || '').toString().trim().toUpperCase();
          const d = (row['DATA'] || row['data'] || (dataCol >= 0 ? values[dataCol] : '') || '').toString().trim();
          const h = (row['HORA'] || row['hora'] || (horaCol >= 0 ? values[horaCol] : '') || '').toString().trim();
          const q = (row['QUANTIDADE'] || row['quantidade'] || (qtdCol >= 0 ? values[qtdCol] : '') || '').toString().trim();
          if (v && d && q) {
            existingSheetKeys.add(`${v}|${d}|${h}|${q}`);
          }
        }
        console.log(`Dedup: found ${existingSheetIds.size} IDs and ${existingSheetKeys.size} composite keys in sheet`);
      }
    } catch (dedupErr) {
      console.warn('Dedup sheet fetch failed, proceeding without dedup:', dedupErr);
    }

    let synced = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const record of pendingRecords) {
      try {
        // Re-check: fetch fresh record to confirm it's still unsynced (prevent race condition)
        const { data: freshRecord } = await supabase
          .from('field_fuel_records')
          .select('synced_to_sheet')
          .eq('id', record.id)
          .single();

        if (freshRecord?.synced_to_sheet) {
          console.log(`Record ${record.id} already synced (race condition avoided)`);
          skipped++;
          continue;
        }

        const sheetData = buildSheetData(record);

        // Check if this record already exists in the sheet (by ID or composite key)
        const recordId = (record.id || '').trim();
        const compositeKey = `${(record.vehicle_code || '').toUpperCase()}|${sheetData['DATA']}|${sheetData['HORA']}|${sheetData['QUANTIDADE']}`;

        if (existingSheetIds.has(recordId) || existingSheetKeys.has(compositeKey)) {
          console.log(`Record ${record.id} already exists in sheet (dedup), marking as synced`);
          await supabase
            .from('field_fuel_records')
            .update({ synced_to_sheet: true })
            .eq('id', record.id);
          skipped++;
          continue;
        }

        // Optimistic lock: mark as synced BEFORE sending to sheet
        const { error: lockError } = await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('id', record.id)
          .eq('synced_to_sheet', false);

        if (lockError) {
          console.warn(`Failed to lock record ${record.id}, skipping`);
          skipped++;
          continue;
        }

        // Call the google-sheets edge function to create the row
        const { data: gsResponse, error: gsError } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'create',
            sheetName: 'AbastecimentoCanteiro01',
            data: sheetData,
          },
        });

        if (gsError) {
          console.error(`Failed to sync record ${record.id}:`, gsError);
          // Revert the flag
          await supabase
            .from('field_fuel_records')
            .update({ synced_to_sheet: false })
            .eq('id', record.id);
          errors.push(`${record.vehicle_code} (${record.record_date}): ${gsError.message}`);
          failed++;
          continue;
        }

        synced++;
        // Add to local dedup sets to prevent duplicates within this batch
        existingSheetIds.add(recordId);
        existingSheetKeys.add(compositeKey);
        console.log(`Synced record ${record.id} (${record.vehicle_code} - ${record.record_date})`);

      } catch (err) {
        console.error(`Error syncing record ${record.id}:`, err);
        // Revert on error
        await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: false })
          .eq('id', record.id);
        errors.push(`${record.vehicle_code}: ${String(err)}`);
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        failed,
        skipped,
        total: pendingRecords.length,
        errors: errors.slice(0, 10),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('sync-pending-fuel error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
