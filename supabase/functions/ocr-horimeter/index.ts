import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image, type = 'horimeter' } = await req.json();

    if (!image) {
      throw new Error('No image data provided');
    }

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Different prompts based on type
    const prompts: Record<string, string> = {
      horimeter: `Analise esta imagem de um horímetro ou odômetro de veículo/equipamento.
                
TAREFA: Extraia APENAS o valor numérico mostrado no display/mostrador.

REGRAS:
- Retorne SOMENTE o número, sem texto adicional
- Use ponto (.) como separador decimal se houver
- Se houver múltiplos números, identifique o principal (geralmente o maior ou mais proeminente)
- Se não conseguir identificar claramente, retorne "ERRO"

Exemplos de resposta correta:
- 12345.6
- 8750
- 15230.5

Qual é o valor mostrado?`,
      
      quantity: `Analise esta imagem de uma bomba de combustível ou medidor de litros.
                
TAREFA: Extraia APENAS o valor numérico de LITROS ou QUANTIDADE mostrado no display.

REGRAS:
- Retorne SOMENTE o número de litros, sem texto adicional
- Use ponto (.) como separador decimal se houver
- Identifique o valor total de litros abastecidos (geralmente mostrado em destaque)
- Ignore valores de preço (R$) - foque apenas na quantidade em litros
- Se não conseguir identificar claramente, retorne "ERRO"

Exemplos de resposta correta:
- 150.5
- 75
- 200.35

Qual é a quantidade em litros mostrada?`
    };

    const promptText = prompts[type] || prompts.horimeter;

    // Call Lovable AI Gateway with vision model
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText
              },
              {
                type: 'image_url',
                image_url: {
                  url: image
                }
              }
            ]
          }
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      throw new Error(`AI Gateway error: ${errorText}`);
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content?.trim() || '';

    console.log('OCR result:', extractedText);

    // Parse the extracted value
    let value: number | null = null;
    
    if (extractedText && extractedText !== 'ERRO') {
      // Clean the response - remove any non-numeric characters except . and ,
      const cleanedText = extractedText
        .replace(/[^\d.,]/g, '')
        .replace(',', '.');
      
      const parsed = parseFloat(cleanedText);
      if (!isNaN(parsed) && parsed > 0) {
        value = parsed;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: value !== null,
        value,
        rawText: extractedText 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        value: null 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
