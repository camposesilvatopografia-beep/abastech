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
    const { messages, context } = await req.json();
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

    // Calculate some summary stats
    const totalVehicles = vehicles.length;
    const vehiclesByStatus = vehicles.reduce((acc: Record<string, number>, v: any) => {
      const status = v.status || 'Ativo';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    
    const vehiclesByCompany = vehicles.reduce((acc: Record<string, number>, v: any) => {
      const company = v.company || 'Não informado';
      acc[company] = (acc[company] || 0) + 1;
      return acc;
    }, {});

    const ordersInMaintenance = orders.filter((o: any) => o.status === 'Em Manutenção' || o.status === 'Em Andamento').length;
    const totalFuelLiters = fuelRecords.reduce((sum: number, r: any) => sum + (r.fuel_quantity || 0), 0);

    // Build comprehensive system prompt
    const systemPrompt = `Você é o Assistente IA do Sistema Abastech - uma plataforma completa de gestão de frotas, abastecimento e manutenção.

## Informações da Obra/Projeto
${obraSettings ? `
- Nome: ${obraSettings.nome}
- Subtítulo: ${obraSettings.subtitulo || 'Não definido'}
- Cidade: ${obraSettings.cidade || 'Não definida'}
` : 'Configurações da obra não encontradas.'}

## Resumo do Sistema
- **Total de Veículos/Equipamentos**: ${totalVehicles}
- **Por Status**: ${JSON.stringify(vehiclesByStatus)}
- **Por Empresa**: ${JSON.stringify(vehiclesByCompany)}
- **Ordens de Serviço em Manutenção**: ${ordersInMaintenance}
- **Total de Combustível Registrado**: ${totalFuelLiters.toLocaleString('pt-BR')} litros

## Veículos/Equipamentos Cadastrados (últimos ${vehicles.length})
${vehicles.slice(0, 50).map((v: any) => `- ${v.code}: ${v.name || v.description || 'Sem descrição'} | Empresa: ${v.company || 'N/I'} | Status: ${v.status || 'Ativo'}`).join('\n')}

## Últimas Ordens de Serviço (${orders.length} registros)
${orders.slice(0, 20).map((o: any) => `- OS ${o.order_number}: ${o.vehicle_code} | ${o.status} | ${o.problem_description?.substring(0, 50) || 'Sem descrição'}`).join('\n')}

## Últimos Registros de Horímetro (${readings.length} leituras)
${readings.slice(0, 20).map((r: any) => `- ${r.reading_date}: Veículo ${r.vehicle_id?.substring(0, 8)} | ${r.current_value}h | Operador: ${r.operator || 'N/I'}`).join('\n')}

## Últimos Abastecimentos (${fuelRecords.length} registros)
${fuelRecords.slice(0, 20).map((r: any) => `- ${r.record_date}: ${r.vehicle_code} | ${r.fuel_quantity}L | Local: ${r.location || 'N/I'}`).join('\n')}

## Módulos do Sistema
1. **Dashboard**: Visão geral de estoque e movimentações
2. **Abastecimento**: Registro de entradas/saídas de combustível, gestão de estoques
3. **Horímetros**: Controle de horas trabalhadas dos equipamentos
4. **Manutenção**: Ordens de serviço, histórico de reparos
5. **Frota**: Cadastro de veículos e equipamentos mobilizados
6. **Alertas**: Notificações de inconsistências e manutenções pendentes

## Instruções
- Responda sempre em português brasileiro
- Seja objetivo e preciso nas respostas
- Use os dados reais do sistema quando relevante
- Formate números no padrão brasileiro (1.234,56)
- Sugira ações práticas quando apropriado
- Se não tiver informação suficiente, diga claramente`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
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
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
