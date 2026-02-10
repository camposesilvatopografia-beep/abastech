import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SheetRow {
  [key: string]: string | number | boolean | null;
}

// -----------------------------
// In-memory caching & coalescing
// -----------------------------
// Goal: drastically reduce calls to sheets.googleapis.com to avoid 429 quota spikes.
// Notes:
// - Edge function instances keep memory across requests for a while, so this cache helps a lot.
// - We cache reads briefly (seconds) and metadata longer (minutes).

const SHEET_DATA_TTL_MS = 15_000; // short TTL to feel "real-time" but avoid bursts
// When the client explicitly requests noCache, we still keep a *tiny* TTL to coalesce bursts,
// but avoid serving stale values for long.
const NO_CACHE_TTL_MS = 1_500;

const METADATA_TTL_MS = 5 * 60_000;
const HEADER_TTL_MS = 5 * 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const sheetDataCache = new Map<string, CacheEntry<any[][]>>();
const sheetDataInFlight = new Map<string, Promise<any[][]>>();

const metadataCache = new Map<string, CacheEntry<any>>();
const metadataInFlight = new Map<string, Promise<any>>();

const headerCache = new Map<string, CacheEntry<any[]>>();
const headerInFlight = new Map<string, Promise<any[]>>();

let accessTokenCache: CacheEntry<string> | null = null;
let accessTokenInFlight: Promise<string> | null = null;

function nowMs() {
  return Date.now();
}

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  map.set(key, { value, expiresAt: nowMs() + ttlMs });
}

function invalidateSheetCaches(sheetId: string, sheetName: string) {
  const needle1 = `${sheetId}:`;
  const needle2 = `!`;
  for (const key of sheetDataCache.keys()) {
    if (!key.startsWith(needle1)) continue;
    // Key includes the range, which includes the sheet name before '!'
    if (key.includes(needle2) && (key.includes(`${sheetName}!`) || key.includes(`'${sheetName.replace(/'/g, "''")}')`))) {
      sheetDataCache.delete(key);
    }
  }
  // Header cache keys are `${sheetId}:${sheetName}:headers:*`
  for (const key of headerCache.keys()) {
    if (key.startsWith(`${sheetId}:${sheetName}:headers:`)) headerCache.delete(key);
  }
  // Metadata cache is per sheetId only
  metadataCache.delete(sheetId);
}

function detectRateLimit(errorText: string) {
  return (
    errorText.includes('"code": 429') ||
    errorText.includes("RESOURCE_EXHAUSTED") ||
    errorText.includes("RATE_LIMIT_EXCEEDED")
  );
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// Create JWT manually
async function createJWT(privateKeyPem: string, payload: object): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };

  const encoder = new TextEncoder();

  // Base64url encode
  const base64url = (data: string) => {
    return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Extract the base64 content between headers (PKCS8)
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/[\r\n\s]/g, "");

  console.log("PEM contents length after cleanup:", pemContents.length);

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
    encoder.encode(signingInput)
  );

  const signatureB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));

  return `${signingInput}.${signatureB64}`;
}

function formatPrivateKey(rawKey: string): string {
  if (!rawKey) {
    throw new Error("GOOGLE_PRIVATE_KEY is empty");
  }

  // Some users paste the entire service-account JSON instead of just private_key.
  const trimmed = rawKey.trim();
  if (trimmed.startsWith("{") && trimmed.includes("private_key")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.private_key === "string") {
        rawKey = parsed.private_key;
      }
    } catch {
      // ignore
    }
  }

  console.log("Raw key first 50 chars:", rawKey.substring(0, 50));
  console.log("Raw key last 50 chars:", rawKey.substring(Math.max(0, rawKey.length - 50)));

  // Normalize common escape sequences and accidental quoting.
  let key = rawKey
    .replace(/\\\\n/g, "\\n") // double-escaped
    .replace(/\\r/g, "")
    .replace(/^\s*\"|\"\s*$/g, "")
    .trim();

  // Convert literal "\n" to real newlines
  key = key.replace(/\\n/g, "\n");

  const hasPkcs8 =
    key.includes("-----BEGIN PRIVATE KEY-----") && key.includes("-----END PRIVATE KEY-----");

  if (hasPkcs8) {
    console.log("Key has PEM headers");
    return key;
  }

  // If key is just base64 content without headers, wrap it.
  const cleanBase64 = key.replace(/[\r\n\s]/g, "");
  if (/^[A-Za-z0-9+/=]+$/.test(cleanBase64) && cleanBase64.length > 1000) {
    console.log("Key appears to be raw base64, adding PEM headers");
    const formattedKey = cleanBase64.match(/.{1,64}/g)?.join("\n") || cleanBase64;
    return `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
  }

  // Heuristic: find any PEM block inside a larger string (e.g., pasted JSON with extra fields)
  const pemBlock = rawKey.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/);
  if (pemBlock?.[0]) {
    console.log("Extracted PEM block from larger text");
    return pemBlock[0].replace(/\\n/g, "\n").replace(/\\r/g, "").trim();
  }

  console.log("Could not parse key format");
  throw new Error(
    'Invalid private key format. Use the exact value of the "private_key" field from your service account JSON (including BEGIN/END lines).'
  );
}

async function getAccessToken(): Promise<string> {
  // Fast path: valid cached token
  if (accessTokenCache && accessTokenCache.expiresAt > nowMs() + 60_000) {
    return accessTokenCache.value;
  }

  // Coalesce concurrent requests
  if (accessTokenInFlight) return accessTokenInFlight;

  accessTokenInFlight = (async () => {
    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKeyRaw = Deno.env.get("GOOGLE_PRIVATE_KEY");

    if (!serviceAccountEmail || !privateKeyRaw) {
      throw new Error(
        "Missing Google Service Account credentials. Please configure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY."
      );
    }

    console.log("Service Account Email:", serviceAccountEmail);
    console.log("Private Key raw length:", privateKeyRaw.length);

    const privateKey = formatPrivateKey(privateKeyRaw);
    console.log("Private key formatted, length:", privateKey.length);

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    try {
      const jwt = await createJWT(privateKey, payload);
      console.log("JWT created successfully");

      // Exchange JWT for access token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Token exchange failed:", errorText);
        throw new Error(`Failed to get access token: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      console.log("Access token obtained successfully");

      const token = tokenData.access_token as string;
      const expiresInSec = Number(tokenData.expires_in ?? 3600);
      accessTokenCache = {
        value: token,
        expiresAt: nowMs() + Math.max(60_000, expiresInSec * 1000),
      };

      return token;
    } catch (error) {
      console.error("Error creating JWT or getting token:", error);
      throw error;
    } finally {
      accessTokenInFlight = null;
    }
  })();

  return accessTokenInFlight;
}

// Helper to format sheet range - wraps sheet name in single quotes if it contains special characters
function formatRange(sheetName: string, cellRange: string = "A:ZZ"): string {
  // If sheet name has spaces or special characters, wrap in single quotes
  if (/[^A-Za-z0-9_]/.test(sheetName)) {
    return `'${sheetName.replace(/'/g, "''")}'!${cellRange}`;
  }
  return `${sheetName}!${cellRange}`;
}

async function fetchSheetValues(accessToken: string, sheetId: string, range: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get sheet data:", errorText);
    throw new Error(`Failed to get sheet data: ${errorText}`);
  }

  const data = await response.json();
  return data.values || [];
}

async function getSheetData(accessToken: string, sheetId: string, range: string): Promise<any[][]> {
  const key = `${sheetId}:${range}`;

  const cached = cacheGet(sheetDataCache, key);
  if (cached) return cached;

  const inFlight = sheetDataInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      // Small retry for bursty 429 (does NOT fix quota, but smooths spikes)
      try {
        const values = await fetchSheetValues(accessToken, sheetId, range);
        cacheSet(sheetDataCache, key, values, SHEET_DATA_TTL_MS);
        return values;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (detectRateLimit(msg)) {
          await sleep(900);
          const values = await fetchSheetValues(accessToken, sheetId, range);
          cacheSet(sheetDataCache, key, values, SHEET_DATA_TTL_MS);
          return values;
        }
        throw e;
      }
    } finally {
      sheetDataInFlight.delete(key);
    }
  })();

  sheetDataInFlight.set(key, promise);
  return promise;
}

async function appendRow(accessToken: string, sheetId: string, range: string, values: any[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    range
  )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to append row:", errorText);
    throw new Error(`Failed to append row: ${errorText}`);
  }
}

async function updateRow(accessToken: string, sheetId: string, range: string, values: any[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
    range
  )}?valueInputOption=USER_ENTERED`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to update row:", errorText);
    throw new Error(`Failed to update row: ${errorText}`);
  }
}

async function getSpreadsheetMetadata(accessToken: string, sheetId: string): Promise<any> {
  const cached = cacheGet(metadataCache, sheetId);
  if (cached) return cached;

  const inFlight = metadataInFlight.get(sheetId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get spreadsheet metadata: ${errorText}`);
      }

      const metadata = await response.json();
      cacheSet(metadataCache, sheetId, metadata, METADATA_TTL_MS);
      return metadata;
    } finally {
      metadataInFlight.delete(sheetId);
    }
  })();

  metadataInFlight.set(sheetId, promise);
  return promise;
}

async function getHeaders(accessToken: string, sheetId: string, sheetName: string, headerRange: string) {
  const key = `${sheetId}:${sheetName}:headers:${headerRange}`;
  const cached = cacheGet(headerCache, key);
  if (cached) return cached;

  const inFlight = headerInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const headerData = await getSheetData(accessToken, sheetId, formatRange(sheetName, headerRange));
      const headerRow = headerData?.[0] ?? [];
      cacheSet(headerCache, key, headerRow, HEADER_TTL_MS);
      return headerRow;
    } finally {
      headerInFlight.delete(key);
    }
  })();

  headerInFlight.set(key, promise);
  return promise;
}

async function deleteRow(accessToken: string, sheetId: string, sheetName: string, rowIndex: number): Promise<void> {
  const metadata = await getSpreadsheetMetadata(accessToken, sheetId);
  const sheet = metadata.sheets?.find((s: any) => s.properties?.title === sheetName);

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  const sheetGid = sheet.properties.sheetId;
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;

  const response = await fetch(batchUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetGid,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to delete row:", errorText);
    throw new Error(`Failed to delete row: ${errorText}`);
  }
}

async function getSheetNames(accessToken: string, sheetId: string): Promise<string[]> {
  const metadata = await getSpreadsheetMetadata(accessToken, sheetId);
  return metadata.sheets?.map((s: any) => s.properties?.title) || [];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID");
    if (!sheetId) {
      throw new Error("GOOGLE_SHEET_ID not configured");
    }

    const body = await req.json();
    const { action, sheetName, data, rowIndex, range, noCache } = body;

    console.log(`Processing action: ${action} for sheet: ${sheetName || "N/A"}`);

    const accessToken = await getAccessToken();

    let result: any;

    switch (action) {
      case "getSheetNames":
        result = await getSheetNames(accessToken, sheetId);
        break;

      case "getData": {
        const sheetRange = range || formatRange(sheetName);

        // Optionally bypass in-memory cache to ensure “immediate” UI updates.
        // We still keep a tiny TTL for coalescing bursty refreshes.
        const rawData = noCache
          ? await (async () => {
              const values = await fetchSheetValues(accessToken, sheetId, sheetRange);
              cacheSet(sheetDataCache, `${sheetId}:${sheetRange}`, values, NO_CACHE_TTL_MS);
              return values;
            })()
          : await getSheetData(accessToken, sheetId, sheetRange);

        if (rawData.length === 0) {
          result = { headers: [], rows: [] };
        } else {
          const headers = rawData[0];
          const rows = rawData.slice(1).map((row, index) => {
            const obj: SheetRow = { _rowIndex: index + 2 };
            headers.forEach((header: string, colIndex: number) => {
              obj[header] = row[colIndex] ?? "";
            });
            return obj;
          });
          result = { headers, rows };
        }
        break;
      }

      case "create": {
        if (!sheetName || !data) {
          throw new Error("sheetName and data are required for create action");
        }

        // Read headers from row 1 starting from column A to include all columns
        // Google Sheets append detects the full table range (including col A if it has data),
        // so we must include column A in our values to prevent column displacement.
        const headerRow = await getHeaders(accessToken, sheetId, sheetName, "A1:ZZ1");
        if (headerRow.length === 0) {
          throw new Error("No headers found in sheet");
        }

        console.log("Headers found:", headerRow);

        // Map data to ALL headers (including column A)
        // Try exact match first, then trimmed, then normalized (no accents/spaces) for resilience
        const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s_.]/g, '');
        const dataByNormalized = new Map<string, string>();
        for (const [k, v] of Object.entries(data)) {
          dataByNormalized.set(normalize(k), String(v ?? ''));
        }
        const newRowValues = headerRow.map((header: string) => {
          // 1. Exact match
          if (data[header] !== undefined) return data[header];
          // 2. Trimmed match
          const trimmed = String(header).trim();
          if (data[trimmed] !== undefined) return data[trimmed];
          // 3. Normalized match (accent/space insensitive)
          const norm = normalize(header);
          if (dataByNormalized.has(norm)) return dataByNormalized.get(norm);
          return "";
        });
        console.log("Values to append:", newRowValues);

        // Append starting from column A to match the full table range
        await appendRow(accessToken, sheetId, formatRange(sheetName, "A:ZZ"), newRowValues);

        invalidateSheetCaches(sheetId, sheetName);
        result = { success: true, message: "Row created successfully" };
        break;
      }

      case "update": {
        if (!sheetName || !data || rowIndex === undefined) {
          throw new Error("sheetName, data, and rowIndex are required for update action");
        }

        const updateHeaderRow = await getHeaders(accessToken, sheetId, sheetName, "1:1");
        if (updateHeaderRow.length === 0) {
          throw new Error("No headers found in sheet");
        }

        const normalizeU = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s_.]/g, '');
        const dataByNormalizedU = new Map<string, string>();
        for (const [k, v] of Object.entries(data)) {
          dataByNormalizedU.set(normalizeU(k), String(v ?? ''));
        }
        const updateValues = updateHeaderRow.map((header: string) => {
          if (data[header] !== undefined) return data[header];
          const trimmed = String(header).trim();
          if (data[trimmed] !== undefined) return data[trimmed];
          const norm = normalizeU(header);
          if (dataByNormalizedU.has(norm)) return dataByNormalizedU.get(norm);
          return "";
        });
        await updateRow(accessToken, sheetId, formatRange(sheetName, `A${rowIndex}`), updateValues);

        invalidateSheetCaches(sheetId, sheetName);
        result = { success: true, message: "Row updated successfully" };
        break;
      }

      case "delete": {
        if (!sheetName || rowIndex === undefined) {
          throw new Error("sheetName and rowIndex are required for delete action");
        }

        await deleteRow(accessToken, sheetId, sheetName, rowIndex - 1);

        invalidateSheetCaches(sheetId, sheetName);
        result = { success: true, message: "Row deleted successfully" };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`Action ${action} completed successfully`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    // IMPORTANT: if Google returns 429, surface it clearly (still 500 to client invoke, but with a consistent message)
    console.error("Error in google-sheets function:", errorMessage);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
