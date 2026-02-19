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

function buildSheetData(record: any): Record<string, any> {
  const tipo = record.record_type === 'entrada' || record.record_type === 'Entrada' ? 'Entrada' : 'Saida';
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

  return {
    'id': record.id || '',
    'DATA': dateFormatted,
    'HORA': timeFormatted,
    'TIPO': tipo,
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
    'LOCAL': record.location || '',
    'ARLA': Number(record.arla_quantity) > 0 ? 'Sim' : '',
    'QUANTIDADE DE ARLA': fmtNum(record.arla_quantity),
    'FORNECEDOR': record.supplier || '',
    'NOTA FISCAL': record.invoice_number || '',
    'VALOR UNITÁRIO': fmtNum(unitPrice),
    'VALOR TOTAL': unitPrice > 0 && fuelQty > 0 ? fmtNum(unitPrice * fuelQty) : '',
    'OBSERVAÇÃO': record.observations || '',
    'FOTO BOMBA': record.photo_pump_url || '',
    'FOTO HORIMETRO': record.photo_horimeter_url || '',
    'LOCAL DE ENTRADA': record.entry_location || '',
    'LUBRIFICAR': Number(record.oil_quantity) > 0 ? 'Sim' : '',
    'LUBRIFICANTE': record.lubricant || '',
    'COMPLETAR ÓLEO': Number(record.oil_quantity) > 0 ? 'Sim' : '',
    'TIPO ÓLEO': record.oil_type || '',
    'QUANTIDADE ÓLEO': fmtNum(record.oil_quantity),
    'SOPRA FILTRO': record.filter_blow ? 'Sim' : '',
  };
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
        JSON.stringify({ success: true, message: 'No pending records to sync', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${pendingRecords.length} pending records to sync`);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const record of pendingRecords) {
      try {
        const sheetData = buildSheetData(record);

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
          errors.push(`${record.vehicle_code} (${record.record_date}): ${gsError.message}`);
          failed++;
          continue;
        }

        // Mark as synced
        const { error: updateError } = await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('id', record.id);

        if (updateError) {
          console.error(`Failed to update sync status for ${record.id}:`, updateError);
        } else {
          synced++;
          console.log(`Synced record ${record.id} (${record.vehicle_code} - ${record.record_date})`);
        }
      } catch (err) {
        console.error(`Error syncing record ${record.id}:`, err);
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
