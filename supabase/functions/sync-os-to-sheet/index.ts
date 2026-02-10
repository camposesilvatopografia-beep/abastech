import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- Google Sheets Auth (reused from google-sheets function) ----

async function createJWT(privateKeyPem: string, payload: object): Promise<string> {
  const base64url = (data: string) =>
    btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const headerB64 = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/[\r\n\s]/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  return `${signingInput}.${signatureB64}`;
}

function formatPrivateKey(rawKey: string): string {
  if (!rawKey) throw new Error("GOOGLE_PRIVATE_KEY is empty");

  const trimmed = rawKey.trim();
  if (trimmed.startsWith("{") && trimmed.includes("private_key")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.private_key === "string") rawKey = parsed.private_key;
    } catch { /* ignore */ }
  }

  let key = rawKey.replace(/\\\\n/g, "\\n").replace(/\\r/g, "").replace(/^\s*\"|\"\s*$/g, "").trim();
  key = key.replace(/\\n/g, "\n");

  if (key.includes("-----BEGIN PRIVATE KEY-----") && key.includes("-----END PRIVATE KEY-----")) return key;

  const cleanBase64 = key.replace(/[\r\n\s]/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(cleanBase64) && cleanBase64.length > 1000) {
    const formattedKey = cleanBase64.match(/.{1,64}/g)?.join("\n") || cleanBase64;
    return `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
  }

  const pemBlock = rawKey.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  if (pemBlock?.[0]) return pemBlock[0].replace(/\\n/g, "\n").replace(/\\r/g, "").trim();

  throw new Error("Invalid private key format");
}

async function getAccessToken(): Promise<string> {
  const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_PRIVATE_KEY");
  if (!serviceAccountEmail || !privateKeyRaw) throw new Error("Missing Google credentials");

  const privateKey = formatPrivateKey(privateKeyRaw);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await createJWT(privateKey, {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) throw new Error(`Token error: ${await tokenResponse.text()}`);
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

// ---- Sheet helpers ----

function formatRange(sheetName: string, cellRange = "A:ZZ"): string {
  if (/[^A-Za-z0-9_]/.test(sheetName)) {
    return `'${sheetName.replace(/'/g, "''")}'!${cellRange}`;
  }
  return `${sheetName}!${cellRange}`;
}

async function fetchSheetValues(token: string, sheetId: string, range: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheet read error: ${await res.text()}`);
  const data = await res.json();
  return data.values || [];
}

async function clearSheetData(token: string, sheetId: string, range: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:clear`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Sheet clear error: ${await res.text()}`);
}

async function ensureSheetRows(token: string, sheetId: string, sheetName: string, neededRows: number): Promise<void> {
  // Get metadata to find current row count and sheet gid
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) throw new Error(`Metadata error: ${await metaRes.text()}`);
  const meta = await metaRes.json();

  const sheet = meta.sheets?.find((s: any) => s.properties?.title === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);

  const currentRows = sheet.properties.gridProperties.rowCount;
  const sheetGid = sheet.properties.sheetId;

  if (currentRows >= neededRows) return;

  const rowsToAdd = neededRows - currentRows + 100; // Add extra buffer
  console.log(`Expanding sheet from ${currentRows} to ${currentRows + rowsToAdd} rows`);

  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  const res = await fetch(batchUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        appendDimension: {
          sheetId: sheetGid,
          dimension: "ROWS",
          length: rowsToAdd,
        },
      }],
    }),
  });
  if (!res.ok) throw new Error(`Expand rows error: ${await res.text()}`);
}

async function batchUpdateValues(token: string, sheetId: string, range: string, values: any[][]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error(`Sheet batch update error: ${await res.text()}`);
}

// ---- Date formatting ----

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return "";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "";
  }
}

function formatTime(timeStr: string | null | undefined, dateStr: string | null | undefined): string {
  if (timeStr) return timeStr.length >= 5 ? timeStr.substring(0, 5) : timeStr;
  if (dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "";
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    } catch {
      return "";
    }
  }
  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    if (!sheetId) throw new Error("GOOGLE_SHEET_ID not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting batch OS sync...");

    // 1. Fetch ALL service orders from DB (paginated to avoid 1000 row limit)
    let allOrders: any[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    
    while (true) {
      const { data: page, error: pageErr } = await supabase
        .from("service_orders")
        .select("*")
        .order("entry_date", { ascending: true, nullsFirst: true })
        .order("order_date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      
      if (pageErr) throw new Error(`DB error: ${pageErr.message}`);
      if (!page || page.length === 0) break;
      
      allOrders = allOrders.concat(page);
      offset += page.length;
      
      if (page.length < PAGE_SIZE) break;
    }
    
    const orders = allOrders;
    console.log(`Fetched ${orders.length} orders from DB (paginated)`);

    // 2. Fetch Veiculo sheet for Motorista/Empresa lookup
    const accessToken = await getAccessToken();
    
    const veiculoData = await fetchSheetValues(accessToken, sheetId, formatRange("Veiculo", "A1:ZZ"));
    const veiculoHeaders = veiculoData[0] || [];
    const veiculoRows = veiculoData.slice(1);

    // Build lookup map: vehicle code -> { Motorista, Empresa }
    const codeIdx = veiculoHeaders.findIndex((h: string) =>
      ["CODIGO", "CÓDIGO", "Codigo", "Código", "COD"].includes(String(h).trim())
    );
    const motoristaIdx = veiculoHeaders.findIndex((h: string) =>
      ["MOTORISTA", "Motorista", "OPERADOR", "Operador"].includes(String(h).trim())
    );
    const empresaIdx = veiculoHeaders.findIndex((h: string) =>
      ["EMPRESA", "Empresa"].includes(String(h).trim())
    );

    const vehicleLookup = new Map<string, { motorista: string; empresa: string }>();
    for (const row of veiculoRows) {
      const code = String(row[codeIdx] || "").trim().toUpperCase().replace(/\s+/g, "");
      if (code) {
        vehicleLookup.set(code, {
          motorista: motoristaIdx >= 0 ? String(row[motoristaIdx] || "").trim() : "",
          empresa: empresaIdx >= 0 ? String(row[empresaIdx] || "").trim() : "",
        });
      }
    }
    console.log(`Built vehicle lookup with ${vehicleLookup.size} entries`);

    // 3. Read current sheet headers
    const osSheetName = "Ordem_Servico";
    const headerData = await fetchSheetValues(accessToken, sheetId, formatRange(osSheetName, "A1:ZZ1"));
    const headers = headerData[0] || [];
    if (headers.length === 0) throw new Error("No headers found in Ordem_Servico sheet");
    console.log(`Sheet headers: ${headers.join(", ")}`);

    // 4. Ensure sheet has enough rows, then clear existing data (keep header)
    await ensureSheetRows(accessToken, sheetId, osSheetName, orders.length + 2);
    await clearSheetData(accessToken, sheetId, formatRange(osSheetName, "A2:ZZ"));
    console.log("Cleared existing sheet data");

    // 5. Build all rows
    const allRows: any[][] = [];
    for (const order of orders || []) {
      const normalizedCode = String(order.vehicle_code || "").trim().toUpperCase().replace(/\s+/g, "");
      const vehicleInfo = vehicleLookup.get(normalizedCode);

      const isFinalized = String(order.status || "").includes("Finalizada");

      // Calculate downtime (Horas_Parado)
      let horasParado = '';
      if (order.entry_date && order.entry_time) {
        try {
          const entryDateStr = String(order.entry_date).includes('T') ? String(order.entry_date).split('T')[0] : String(order.entry_date);
          const entryDateTime = new Date(`${entryDateStr}T${order.entry_time}`);
          const endRef = isFinalized && order.end_date ? new Date(order.end_date) : new Date();
          if (!isNaN(entryDateTime.getTime()) && !isNaN(endRef.getTime())) {
            const diffMs = endRef.getTime() - entryDateTime.getTime();
            if (diffMs > 0) {
              const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
              const days = Math.floor(totalHours / 24);
              const hours = totalHours % 24;
              horasParado = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
            }
          }
        } catch { /* ignore */ }
      }

      const rowMap: Record<string, string> = {
        "Data": formatDate(order.entry_date || order.order_date),
        "Veiculo": order.vehicle_code || "",
        "Empresa": vehicleInfo?.empresa || "",
        "Motorista": vehicleInfo?.motorista || order.created_by || "",
        "Potencia": order.vehicle_description || "",
        "Problema": order.problem_description || "",
        "Servico": order.solution_description || "",
        "Mecanico": order.mechanic_name || "",
        "Data_Entrada": formatDate(order.entry_date),
        "Data_Saida": isFinalized ? formatDate(order.end_date || "") : "",
        "Hora_Entrada": formatTime(order.entry_time, null),
        "Hora_Saida": isFinalized ? formatTime(null, order.end_date) : "",
        "Horas_Parado": isFinalized ? horasParado : "",
        "Observacao": order.notes || "",
        "Status": order.status || "",
      };

      // Map to exact header positions
      const row = headers.map((h: string) => rowMap[String(h).trim()] ?? "");
      allRows.push(row);
    }

    console.log(`Prepared ${allRows.length} rows for sheet`);

    // 6. Batch write in chunks of 500 (Sheets API limit is ~10MB per request)
    const CHUNK_SIZE = 500;
    let written = 0;

    for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
      const chunk = allRows.slice(i, i + CHUNK_SIZE);
      const startRow = i + 2; // Row 1 is header
      const endRow = startRow + chunk.length - 1;
      const range = formatRange(osSheetName, `A${startRow}:ZZ${endRow}`);

      await batchUpdateValues(accessToken, sheetId, range, chunk);
      written += chunk.length;
      console.log(`Written ${written}/${allRows.length} rows`);

      // Small delay between chunks to avoid rate limits
      if (i + CHUNK_SIZE < allRows.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const result = {
      success: true,
      totalOrders: orders?.length || 0,
      rowsWritten: written,
      message: `${written} ordens de serviço sincronizadas com sucesso na planilha ${osSheetName}`,
    };

    console.log("Batch sync completed:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Batch sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
