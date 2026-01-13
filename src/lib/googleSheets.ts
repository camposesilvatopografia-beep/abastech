import { supabase } from "@/integrations/supabase/client";

export interface SheetRow {
  [key: string]: string | number | boolean | null;
  _rowIndex?: number;
}

export interface SheetData {
  headers: string[];
  rows: SheetRow[];
}

interface GoogleSheetsResponse {
  success?: boolean;
  message?: string;
  error?: string;
  headers?: string[];
  rows?: SheetRow[];
}

async function callGoogleSheetsFunction(payload: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke('google-sheets', {
    body: payload,
  });

  if (error) {
    console.error('Edge function error:', error);
    throw new Error(error.message || 'Failed to communicate with Google Sheets');
  }

  if (data?.error) {
    console.error('API error:', data.error);
    throw new Error(data.error);
  }

  return data;
}

export async function getSheetNames(): Promise<string[]> {
  return callGoogleSheetsFunction({ action: 'getSheetNames' });
}

export async function getSheetData(sheetName: string): Promise<SheetData> {
  const result = await callGoogleSheetsFunction({
    action: 'getData',
    sheetName,
  });
  
  return {
    headers: result.headers || [],
    rows: result.rows || [],
  };
}

export async function createRow(sheetName: string, data: Record<string, any>): Promise<void> {
  await callGoogleSheetsFunction({
    action: 'create',
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
    action: 'update',
    sheetName,
    rowIndex,
    data,
  });
}

export async function deleteRow(sheetName: string, rowIndex: number): Promise<void> {
  await callGoogleSheetsFunction({
    action: 'delete',
    sheetName,
    rowIndex,
  });
}
