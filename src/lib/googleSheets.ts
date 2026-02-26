import { supabase } from "@/integrations/supabase/client";

export interface SheetRow {
  [key: string]: string | number | boolean | null;
  _rowIndex?: number;
}

export interface SheetData {
  headers: string[];
  rows: SheetRow[];
}

const MAX_CONCURRENT_REQUESTS = 2;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];
const inFlightReadRequests = new Map<string, Promise<any>>();
const lastSuccessfulSheetData = new Map<string, SheetData>();

function isRateLimitMessage(message: string) {
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("RATE_LIMIT_EXCEEDED")
  );
}

function queueRequest<T>(operation: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequests++;
      operation()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRequests--;
          const next = requestQueue.shift();
          if (next) next();
        });
    };

    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
      run();
      return;
    }

    requestQueue.push(run);
  });
}

function buildReadRequestKey(payload: any): string | null {
  if (!payload?.action) return null;
  if (payload.action === "getSheetNames") return "getSheetNames";
  if (payload.action === "getData" && payload.sheetName) {
    return `getData:${payload.sheetName}:${payload.noCache ? "noCache" : "cache"}`;
  }
  return null;
}

async function callGoogleSheetsFunction(payload: object): Promise<any> {
  const requestKey = buildReadRequestKey(payload as any);

  if (requestKey) {
    const existing = inFlightReadRequests.get(requestKey);
    if (existing) return existing;
  }

  const requestPromise = queueRequest(async () => {
    const { data, error } = await supabase.functions.invoke("google-sheets", {
      body: payload,
    });

    if (error) {
      console.error("Edge function error:", error);
      throw new Error(error.message || "Failed to communicate with Google Sheets");
    }

    if (data?.error) {
      console.error("API error:", data.error);
      throw new Error(data.error);
    }

    return data;
  });

  if (requestKey) {
    inFlightReadRequests.set(requestKey, requestPromise);
    requestPromise.finally(() => inFlightReadRequests.delete(requestKey));
  }

  return requestPromise;
}

export async function getSheetNames(): Promise<string[]> {
  return callGoogleSheetsFunction({ action: "getSheetNames" });
}

export async function getSheetData(
  sheetName: string,
  options?: { noCache?: boolean }
): Promise<SheetData> {
  try {
    const result = await callGoogleSheetsFunction({
      action: "getData",
      sheetName,
      noCache: options?.noCache ?? false,
    });

    const payload = {
      headers: result.headers || [],
      rows: result.rows || [],
    };

    lastSuccessfulSheetData.set(sheetName, payload);
    return payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRateLimitMessage(message)) {
      const stale = lastSuccessfulSheetData.get(sheetName);
      if (stale) return stale;
      return { headers: [], rows: [] };
    }
    throw err;
  }
}

export async function createRow(sheetName: string, data: Record<string, any>): Promise<void> {
  await callGoogleSheetsFunction({
    action: "create",
    sheetName,
    data,
  });
}

export async function updateRow(
  sheetName: string,
  rowIndex: number,
  data: Record<string, any>
): Promise<void> {
  await callGoogleSheetsFunction({
    action: "update",
    sheetName,
    rowIndex,
    data,
  });
}

export async function deleteRow(sheetName: string, rowIndex: number): Promise<void> {
  await callGoogleSheetsFunction({
    action: "delete",
    sheetName,
    rowIndex,
  });
}
