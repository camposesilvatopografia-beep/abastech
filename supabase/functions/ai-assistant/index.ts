import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Create Supabase client to fetch context data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch real-time data for context
    const [vehiclesResult, ordersResult, readingsResult, recordsResult, obraResult] = await Promise.all([
      supabase.from('vehicles').select('*').limit(200),
      supabase.from('service_orders').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('horimeter_readings').select('*').order('reading_date', { ascending: false }).limit(200),
      supabase.from('field_fuel_records').select('*').order('record_date', { ascending: false }).limit(200),
      supabase.from('obra_settings').select('*').limit(1).maybeSingle(),
    ]);

    const vehicles = vehiclesResult.data || [];
    const orders = ordersResult.data || [];
    const readings = readingsResult.data || [];
    const fuelRecords = recordsResult.data || [];
    const obraSettings = obraResult.data;

    // Calculate summary stats
    const totalVehicles = vehicles.length;
    const activeVehicles = vehicles.filter((v: any) => v.status === 'Ativo' || !v.status).length;
    const inMaintenanceVehicles = vehicles.filter((v: any) => v.status === 'Em Manutenção').length;
    
    const vehiclesByCompany: Record<string, number> = {};
    vehicles.forEach((v: any) => {
      const company = v.company || 'Não informado';
      vehiclesByCompany[company] = (vehiclesByCompany[company] || 0) + 1;
    });

    const ordersInMaintenance = orders.filter((o: any) => 
      o.status === 'Em Manutenção' || o.status === 'Em Andamento' || o.status === 'Aberta'
    ).length;
    
    const totalFuelLiters = fuelRecords.reduce((sum: number, r: any) => sum + (r.fuel_quantity || 0), 0);
    const totalArla = fuelRecords.reduce((sum: number, r: any) => sum + (r.arla_quantity || 0), 0);

    // Get today's data
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = fuelRecords.filter((r: any) => r.record_date === today);
    const todayFuel = todayRecords.reduce((sum: number, r: any) => sum + (r.fuel_quantity || 0), 0);

    // Build system prompt - NotebookLM style: concise, data-driven, direct
    const systemPrompt = `Você é o Abastech Analytics - um assistente de análise de dados especializado em gestão de frotas.

REGRAS IMPORTANTES:
1. Respostas CURTAS e DIRETAS - máximo 2-3 frases quando possível
2. Use NÚMEROS e DADOS concretos sempre
3. Formate valores: 1.234,56 (padrão brasileiro)
4. Sem introduções longas - vá direto ao ponto
5. Se não souber, diga "Não tenho essa informação no momento"

DADOS ATUAIS DO SISTEMA:

📊 FROTA:
- Total: ${totalVehicles} veículos/equipamentos
- Ativos: ${activeVehicles}
- Em manutenção: ${inMaintenanceVehicles}
- Por empresa: ${Object.entries(vehiclesByCompany).map(([k, v]) => `${k}: ${v}`).join(', ')}

🔧 MANUTENÇÃO:
- Ordens abertas/em andamento: ${ordersInMaintenance}
- Total de OS registradas: ${orders.length}

⛽ ABASTECIMENTO:
- Total diesel registrado: ${totalFuelLiters.toLocaleString('pt-BR')} litros
- Total ARLA: ${totalArla.toLocaleString('pt-BR')} litros
- Hoje (${today}): ${todayFuel.toLocaleString('pt-BR')} litros

📋 OBRA: ${obraSettings?.nome || 'Não configurada'} - ${obraSettings?.cidade || ''}

VEÍCULOS CADASTRADOS:
${vehicles.slice(0, 30).map((v: any) => `• ${v.code}: ${v.name || v.description || '-'} (${v.company || 'N/I'}) [${v.status || 'Ativo'}]`).join('\n')}

ÚLTIMAS OS:
${orders.slice(0, 10).map((o: any) => `• OS ${o.order_number}: ${o.vehicle_code} - ${o.status} - ${o.problem_description?.substring(0, 40) || 'Sem desc.'}`).join('\n')}

ÚLTIMOS ABASTECIMENTOS:
${fuelRecords.slice(0, 10).map((r: any) => `• ${r.record_date}: ${r.vehicle_code} - ${r.fuel_quantity}L - ${r.location || 'N/I'}`).join('\n')}

Responda como um analista experiente: objetivo, preciso, sem enrolação.`;

    console.log("Sending request to AI Gateway with context data");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Aguarde alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione créditos ao workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Erro no gateway de IA: ${response.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("AI Gateway response OK, streaming...");

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("AI assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});