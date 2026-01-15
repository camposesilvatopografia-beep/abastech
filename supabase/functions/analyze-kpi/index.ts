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

Sua tarefa é analisar os cabeçalhos e dados de uma planilha e:
1. Identificar inconsistências nos dados
2. Sugerir mapeamentos corretos entre colunas da planilha e KPIs do sistema
3. Fornecer correções específicas

KPIs disponíveis no sistema (use EXATAMENTE estes IDs):
- estoqueAtual: Estoque Atual (valor numérico do estoque atual)
- estoqueAnterior: Estoque Anterior (valor do dia anterior)
- entrada: Entradas (total de entradas)
- saida: Saídas (total de saídas)
- saidaComboios: Saída para Comboios (transferências internas)
- saidaEquipamentos: Saída para Equipamentos (abastecimento de máquinas)
- data: Data do registro
- veiculo: Código do veículo
- quantidade: Quantidade de combustível

IMPORTANTE: Você DEVE retornar sua resposta em formato JSON válido com a seguinte estrutura:
{
  "analysis": "Texto da análise em português...",
  "suggestedMappings": {
    "estoqueAtual": "Nome exato da coluna na planilha",
    "estoqueAnterior": "Nome exato da coluna na planilha",
    "entrada": "Nome exato da coluna na planilha",
    "saida": "Nome exato da coluna na planilha",
    "data": "Nome exato da coluna na planilha"
  },
  "corrections": [
    {
      "type": "mapping" | "data" | "formula",
      "description": "Descrição da correção",
      "action": "Ação a ser tomada"
    }
  ],
  "issues": [
    {
      "severity": "error" | "warning" | "info",
      "message": "Descrição do problema",
      "solution": "Como resolver"
    }
  ]
}

Use APENAS os nomes de colunas que existem nos cabeçalhos fornecidos. Não invente nomes.
Responda APENAS com o JSON, sem texto adicional antes ou depois.`;

    const userPrompt = `Analise esta planilha "${sheetName}":

CABEÇALHOS E AMOSTRAS DE DADOS:
${JSON.stringify(headersSummary, null, 2)}

MAPEAMENTOS ATUAIS DE KPI:
${JSON.stringify(currentMappings || {}, null, 2)}

TOTAL DE REGISTROS: ${rows.length}

Analise os dados e retorne o JSON com:
1. Análise textual das inconsistências
2. Mapeamentos sugeridos (apenas para colunas que existem!)
3. Lista de correções necessárias
4. Lista de problemas identificados`;

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
    const rawContent = aiResponse.choices?.[0]?.message?.content || "";
    
    console.log('Raw AI response:', rawContent);

    // Parse the JSON response from AI
    let parsedResponse;
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanContent = rawContent.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();
      
      parsedResponse = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Fallback: return the raw text as analysis
      parsedResponse = {
        analysis: rawContent,
        suggestedMappings: {},
        corrections: [],
        issues: []
      };
    }

    // Validate suggested mappings against actual headers
    const validHeaders = headers.map((h: string) => h.trim());
    const validatedMappings: Record<string, string> = {};
    
    if (parsedResponse.suggestedMappings) {
      for (const [kpiId, columnName] of Object.entries(parsedResponse.suggestedMappings)) {
        if (typeof columnName === 'string' && validHeaders.includes(columnName.trim())) {
          validatedMappings[kpiId] = columnName.trim();
        }
      }
    }

    console.log('AI analysis completed successfully');
    console.log('Validated mappings:', validatedMappings);

    return new Response(JSON.stringify({ 
      success: true,
      analysis: parsedResponse.analysis || rawContent,
      suggestedMappings: validatedMappings,
      corrections: parsedResponse.corrections || [],
      issues: parsedResponse.issues || [],
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
