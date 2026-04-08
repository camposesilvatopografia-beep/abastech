import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SheetRow = Record<string, string | number | boolean | null>;

const normalizeText = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const normalizeOrderNumber = (value: string | null | undefined) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/^OS-HIST-/i, "");

const isFinished = (value: string | null | undefined) => {
  const normalized = normalizeText(value);
  return normalized.includes("finaliz") || normalized.includes("conclu");
};

const mapStatus = (status: string | null | undefined, situacao: string | null | undefined) => {
  const normalized = normalizeText(status);
  if (isFinished(situacao) || isFinished(status)) return "Finalizada";
  if (normalized.includes("andamento")) return "Em Andamento";
  if (normalized.includes("aguardando") && normalized.includes("aprov")) return "Aguardando Aprovação";
  if (normalized.includes("aguardando")) return "Aguardando Peças";
  if (normalized.includes("orcamento")) return "Em Orçamento";
  if (normalized.includes("pausada")) return "Pausada";
  if (normalized.includes("cancelada")) return "Cancelada";
  return "Aberta";
};

const parseBrazilianDate = (value: string | null | undefined) => {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.includes("-") && text.length >= 10) return text.slice(0, 10);
  const parts = text.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const normalizeTime = (value: string | null | undefined) => {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.slice(0, 5);
};

const formatRange = (sheetName: string, cellRange = "A:Q") => {
  if (/[^A-Za-z0-9_]/.test(sheetName)) {
    return `'${sheetName.replace(/'/g, "''")}'!${cellRange}`;
  }
  return `${sheetName}!${cellRange}`;
};

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
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  return `${signingInput}.${signatureB64}`;
}

function formatPrivateKey(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.startsWith("{") && trimmed.includes("private_key")) {
    const parsed = JSON.parse(trimmed);
    rawKey = parsed.private_key;
  }

  let key = rawKey.replace(/\\\\n/g, "\\n").replace(/\\r/g, "").replace(/^\s*\"|\"\s*$/g, "").trim();
  key = key.replace(/\\n/g, "\n");
  if (key.includes("-----BEGIN PRIVATE KEY-----")) return key;

  const cleanBase64 = key.replace(/[\r\n\s]/g, "");
  const formattedKey = cleanBase64.match(/.{1,64}/g)?.join("\n") || cleanBase64;
  return `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
}

async function getAccessToken() {
  const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_PRIVATE_KEY");
  if (!serviceAccountEmail || !privateKeyRaw) throw new Error("Missing Google credentials");

  const privateKey = formatPrivateKey(privateKeyRaw);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await createJWT(privateKey, {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) throw new Error(`Token error: ${await response.text()}`);
  const data = await response.json();
  return data.access_token as string;
}

async function getSheetRows(sheetName: string): Promise<SheetRow[]> {
  const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
  if (!sheetId) throw new Error("GOOGLE_SHEET_ID not configured");

  const token = await getAccessToken();
  const range = formatRange(sheetName, "A:Q");
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) throw new Error(`Sheet read error: ${await response.text()}`);
  const data = await response.json();
  const values = (data.values || []) as string[][];
  if (!values.length) return [];

  const headers = values[0];
  return values.slice(1).map((row, index) => {
    const record: SheetRow = { _rowIndex: index + 2 };
    headers.forEach((header, i) => {
      record[header] = row[i] ?? "";
    });
    return record;
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pruneMissing = true } = await req.json().catch(() => ({ pruneMissing: true }));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const sheetRows = await getSheetRows("Ordem_Servico");
    const usableRows = sheetRows.filter((row) => normalizeOrderNumber(String(row["IdOrdem"] || "")) && String(row["Veiculo"] || "").trim());

    let allDbOrders: any[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id, order_number, vehicle_code, vehicle_description, order_date, order_type, priority, status, problem_description, solution_description, mechanic_name, notes, created_by, created_at, entry_date, entry_time, start_date, end_date")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!data?.length) break;
      allDbOrders = allDbOrders.concat(data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    const dbByKey = new Map<string, any[]>();
    allDbOrders.forEach((order) => {
      const key = normalizeOrderNumber(order.order_number);
      if (!key) return;
      const list = dbByKey.get(key) || [];
      list.push(order);
      dbByKey.set(key, list);
    });

    const pickPreferred = (items: any[]) => {
      if (!items.length) return null;
      const score = (order: any) => {
        let total = 0;
        if (normalizeOrderNumber(order.order_number) === order.order_number) total += 100;
        if (order.problem_description) total += 10;
        if (order.solution_description) total += 6;
        if (order.entry_date) total += 4;
        if (order.end_date) total += 3;
        return total;
      };
      return [...items].sort((a, b) => {
        const diff = score(b) - score(a);
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })[0];
    };

    let inserted = 0;
    let updated = 0;
    const sheetKeys = new Set<string>();
    const idsToDelete = new Set<string>();

    for (const row of usableRows) {
      const orderNumber = normalizeOrderNumber(String(row["IdOrdem"] || ""));
      const vehicleCode = String(row["Veiculo"] || "").trim();
      sheetKeys.add(orderNumber);

      const existingItems = dbByKey.get(orderNumber) || [];
      const preferred = pickPreferred(existingItems);
      existingItems.forEach((item) => {
        if (preferred && item.id !== preferred.id) idsToDelete.add(item.id);
      });

      const orderDate = parseBrazilianDate(String(row["Data"] || ""));
      const entryDate = parseBrazilianDate(String(row["Data_Entrada"] || ""));
      const exitDate = parseBrazilianDate(String(row["Data_Saida"] || ""));
      const sheetStatus = String(row["Status"] || "");
      const sheetSituacao = String(row["Situação"] || row["Situacao"] || "");
      const status = mapStatus(sheetStatus, sheetSituacao);
      const entryTime = normalizeTime(String(row["Hora_Entrada"] || ""));
      const exitTime = normalizeTime(String(row["Hora_Saida"] || ""));
      const problem = String(row["Problema"] || "").trim();
      const payload = {
        order_number: orderNumber,
        order_date: orderDate || entryDate || preferred?.order_date || new Date().toISOString().slice(0, 10),
        vehicle_code: vehicleCode,
        vehicle_description: String(row["Potencia"] || "").trim() || preferred?.vehicle_description || null,
        order_type: normalizeText(problem).includes("preventiva") ? "Preventiva" : (preferred?.order_type || "Corretiva"),
        priority: preferred?.priority || "Média",
        status,
        problem_description: problem || preferred?.problem_description || null,
        solution_description: String(row["Servico"] || "").trim() || preferred?.solution_description || null,
        mechanic_name: String(row["Mecanico"] || "").trim() || preferred?.mechanic_name || null,
        notes: String(row["Observacao"] || "").trim() || preferred?.notes || null,
        created_by: String(row["Motorista"] || "").trim() || preferred?.created_by || null,
        entry_date: entryDate || preferred?.entry_date || null,
        entry_time: entryTime || preferred?.entry_time || null,
        start_date: (entryDate || preferred?.entry_date)
          ? `${entryDate || preferred?.entry_date}T${entryTime || preferred?.entry_time || "00:00"}:00`
          : preferred?.start_date || null,
        end_date: status === "Finalizada"
          ? (exitDate ? `${exitDate}T${exitTime || "00:00"}:00` : preferred?.end_date || null)
          : null,
      };

      if (preferred?.id) {
        const { error } = await supabase.from("service_orders").update(payload).eq("id", preferred.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await supabase.from("service_orders").insert(payload);
        if (error) throw error;
        inserted++;
      }
    }

    if (pruneMissing) {
      for (const order of allDbOrders) {
        const key = normalizeOrderNumber(order.order_number);
        if (key && !sheetKeys.has(key)) idsToDelete.add(order.id);
      }
    }

    let deleted = 0;
    const ids = Array.from(idsToDelete);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabase.from("service_orders").delete().in("id", chunk);
      if (error) throw error;
      deleted += chunk.length;
    }

    return new Response(JSON.stringify({
      success: true,
      sheetRows: usableRows.length,
      inserted,
      updated,
      deleted,
      duplicatesRemoved: Math.max(0, deleted - (pruneMissing ? allDbOrders.filter((o) => !sheetKeys.has(normalizeOrderNumber(o.order_number))).length : 0)),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});