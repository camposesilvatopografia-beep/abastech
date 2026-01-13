import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SheetRow {
  [key: string]: string | number | boolean | null;
}

async function getAccessToken(): Promise<string> {
  const serviceAccountEmail = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKeyRaw = Deno.env.get('GOOGLE_PRIVATE_KEY');
  
  if (!serviceAccountEmail || !privateKeyRaw) {
    throw new Error('Missing Google Service Account credentials');
  }

  // Handle the private key format (replace literal \n with actual newlines)
  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // Import the private key
  const pemContent = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    payload,
    cryptoKey
  );

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token exchange failed:', errorText);
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function getSheetData(accessToken: string, sheetId: string, range: string): Promise<any[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get sheet data:', errorText);
    throw new Error(`Failed to get sheet data: ${errorText}`);
  }

  const data = await response.json();
  return data.values || [];
}

async function appendRow(accessToken: string, sheetId: string, range: string, values: any[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to append row:', errorText);
    throw new Error(`Failed to append row: ${errorText}`);
  }
}

async function updateRow(accessToken: string, sheetId: string, range: string, values: any[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to update row:', errorText);
    throw new Error(`Failed to update row: ${errorText}`);
  }
}

async function deleteRow(accessToken: string, sheetId: string, sheetName: string, rowIndex: number): Promise<void> {
  // First, get the sheet's gid
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  const metaResponse = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaResponse.ok) {
    throw new Error('Failed to get spreadsheet metadata');
  }

  const metadata = await metaResponse.json();
  const sheet = metadata.sheets?.find((s: any) => s.properties?.title === sheetName);
  
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  const sheetGid = sheet.properties.sheetId;

  // Delete the row using batchUpdate
  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
  
  const response = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetGid,
            dimension: 'ROWS',
            startIndex: rowIndex,
            endIndex: rowIndex + 1,
          },
        },
      }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to delete row:', errorText);
    throw new Error(`Failed to delete row: ${errorText}`);
  }
}

async function getSheetNames(accessToken: string, sheetId: string): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get spreadsheet metadata');
  }

  const metadata = await response.json();
  return metadata.sheets?.map((s: any) => s.properties?.title) || [];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const sheetId = Deno.env.get('GOOGLE_SHEET_ID');
    if (!sheetId) {
      throw new Error('GOOGLE_SHEET_ID not configured');
    }

    const accessToken = await getAccessToken();
    const { action, sheetName, data, rowIndex, range } = await req.json();

    console.log(`Processing action: ${action} for sheet: ${sheetName}`);

    let result: any;

    switch (action) {
      case 'getSheetNames':
        result = await getSheetNames(accessToken, sheetId);
        break;

      case 'getData':
        const sheetRange = range || `${sheetName}!A:ZZ`;
        const rawData = await getSheetData(accessToken, sheetId, sheetRange);
        
        if (rawData.length === 0) {
          result = { headers: [], rows: [] };
        } else {
          const headers = rawData[0];
          const rows = rawData.slice(1).map((row, index) => {
            const obj: SheetRow = { _rowIndex: index + 2 }; // +2 because 1-indexed and header row
            headers.forEach((header: string, colIndex: number) => {
              obj[header] = row[colIndex] ?? '';
            });
            return obj;
          });
          result = { headers, rows };
        }
        break;

      case 'create':
        if (!sheetName || !data) {
          throw new Error('sheetName and data are required for create action');
        }
        // Get headers first
        const createHeaders = await getSheetData(accessToken, sheetId, `${sheetName}!1:1`);
        if (createHeaders.length === 0) {
          throw new Error('No headers found in sheet');
        }
        const headerRow = createHeaders[0];
        const newRowValues = headerRow.map((header: string) => data[header] ?? '');
        await appendRow(accessToken, sheetId, `${sheetName}!A:ZZ`, newRowValues);
        result = { success: true, message: 'Row created successfully' };
        break;

      case 'update':
        if (!sheetName || !data || rowIndex === undefined) {
          throw new Error('sheetName, data, and rowIndex are required for update action');
        }
        // Get headers first
        const updateHeaders = await getSheetData(accessToken, sheetId, `${sheetName}!1:1`);
        if (updateHeaders.length === 0) {
          throw new Error('No headers found in sheet');
        }
        const updateHeaderRow = updateHeaders[0];
        const updateValues = updateHeaderRow.map((header: string) => data[header] ?? '');
        await updateRow(accessToken, sheetId, `${sheetName}!A${rowIndex}`, updateValues);
        result = { success: true, message: 'Row updated successfully' };
        break;

      case 'delete':
        if (!sheetName || rowIndex === undefined) {
          throw new Error('sheetName and rowIndex are required for delete action');
        }
        await deleteRow(accessToken, sheetId, sheetName, rowIndex - 1); // Convert to 0-indexed
        result = { success: true, message: 'Row deleted successfully' };
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`Action ${action} completed successfully`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error in google-sheets function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
