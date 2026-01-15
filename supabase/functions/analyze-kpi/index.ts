import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { headers, rows, currentMappings, sheetName } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Prepare data summary for AI analysis
    const sampleRows = rows.slice(0, 15);
    const headersSummary = headers.map((h: string) => {
      const values = sampleRows.map((r: any) => r[h]).filter(Boolean).slice(0, 5);
      return { header: h.trim(), sampleValues: values };
    });

    const systemPrompt = `Você é um assistente especialista em análise de dados de planilhas do Google Sheets para um sistema de gestão de frotas e abastecimento.

Sua tarefa é analisar os cabeçalhos e dados de uma planilha e identificar:
1. Inconsistências nos dados (valores fora do padrão, datas inválidas, valores negativos onde não deveriam, etc.)
2. Problemas de mapeamento entre colunas e KPIs
3. Sugestões de correção baseadas em padrões detectados
4. Recomendações para melhorar a qualidade dos dados

Contexto do sistema:
- O sistema gerencia abastecimento de veículos/equipamentos
- KPIs principais: Estoque Atual, Estoque Anterior, Entradas, Saídas, Quantidade, Data, Veículo
- Valores numéricos devem ser positivos
- Datas devem estar no formato DD/MM/YYYY ou YYYY-MM-DD
- Códigos de veículos seguem padrões específicos

Responda SEMPRE em português brasileiro de forma clara e objetiva.`;

    const userPrompt = `Analise esta planilha "${sheetName}":

CABEÇALHOS E AMOSTRAS DE DADOS:
${JSON.stringify(headersSummary, null, 2)}

MAPEAMENTOS ATUAIS DE KPI:
${JSON.stringify(currentMappings || {}, null, 2)}

TOTAL DE REGISTROS: ${rows.length}

Por favor, forneça:
1. Lista de inconsistências detectadas (se houver)
2. Problemas de mapeamento identificados
3. Sugestões de correção específicas
4. Recomendações gerais para melhorar a qualidade dos dados

Seja específico e prático nas sugestões.`;

    console.log('Calling Lovable AI for KPI analysis...');
    
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
          { role: "user", content: userPrompt }
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Limite de requisições excedido. Tente novamente em alguns segundos." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "Créditos insuficientes. Adicione créditos à sua conta." 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const analysis = aiResponse.choices?.[0]?.message?.content || "Não foi possível gerar análise.";

    console.log('AI analysis completed successfully');

    return new Response(JSON.stringify({ 
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('Error in analyze-kpi:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Erro desconhecido" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
