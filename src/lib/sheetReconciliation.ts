import { getSheetData } from '@/lib/googleSheets';

interface DbFuelRecordForSheetMatch {
  id: string;
  record_date: string;
  record_time: string;
  vehicle_code: string;
  fuel_quantity: number;
  record_type?: string | null;
  synced_to_sheet?: boolean | null;
}

const SHEET_NAME = 'AbastecimentoCanteiro01';
const SNAPSHOT_TTL_MS = 3000;

let snapshotCache: {
  expiresAt: number;
  ids: Set<string>;
  compositeKeys: Set<string>;
} | null = null;

let snapshotInFlight: Promise<{ ids: Set<string>; compositeKeys: Set<string> }> | null = null;

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ');

const normalizeVehicle = (value: unknown): string =>
  normalizeText(value)
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '');

const normalizeType = (value: unknown): 'entrada' | 'saida' | 'carregamento' => {
  const t = normalizeText(value).toLowerCase();
  if (t === 'carregamento') return 'carregamento';
  if (t.includes('entrada')) return 'entrada';
  return 'saida';
};

const toYyyyMmDd = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // dd/MM/yyyy
  if (raw.includes('/')) {
    const [day, month, year] = raw.split('/');
    if (day && month && year) {
      return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // yyyy-MM-dd or ISO
  if (raw.length >= 10 && raw.includes('-')) {
    return raw.slice(0, 10);
  }

  return '';
};

const toHm = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const [h = '', m = ''] = raw.split(':');
  if (!h) return '';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
};

const parsePtBrNumber = (value: unknown): number => {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const qtyKey = (value: unknown): string => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
};

const buildDbCompositeKey = (record: DbFuelRecordForSheetMatch): string => {
  return [
    toYyyyMmDd(record.record_date),
    toHm(record.record_time),
    normalizeVehicle(record.vehicle_code),
    qtyKey(record.fuel_quantity),
    normalizeType(record.record_type),
  ].join('|');
};

const buildSheetCompositeKey = (row: Record<string, any>): string => {
  const date = toYyyyMmDd(row['DATA'] ?? row['Data']);
  const time = toHm(row['HORA'] ?? row['Hora']);
  const vehicle = normalizeVehicle(
    row['VEICULO'] ?? row['Veiculo'] ?? row['VEÍCULO'] ?? row['CODIGO'] ?? row['Codigo'] ?? row['Código']
  );
  const quantity = qtyKey(parsePtBrNumber(row['QUANTIDADE'] ?? row['Quantidade']));
  const tipo = normalizeType(row['TIPO'] ?? row['Tipo']);

  return [date, time, vehicle, quantity, tipo].join('|');
};

async function getSheetSnapshot(): Promise<{ ids: Set<string>; compositeKeys: Set<string> }> {
  const now = Date.now();
  if (snapshotCache && snapshotCache.expiresAt > now) {
    return { ids: snapshotCache.ids, compositeKeys: snapshotCache.compositeKeys };
  }

  if (snapshotInFlight) return snapshotInFlight;

  snapshotInFlight = (async () => {
    const sheetData = await getSheetData(SHEET_NAME, { noCache: true });

    const ids = new Set<string>();
    const compositeKeys = new Set<string>();

    for (const row of sheetData.rows || []) {
      const id = String(row['id'] ?? row['ID'] ?? row['Id'] ?? '').trim();
      if (id) ids.add(id);

      const key = buildSheetCompositeKey(row as Record<string, any>);
      if (key !== '||||') compositeKeys.add(key);
    }

    snapshotCache = {
      expiresAt: Date.now() + SNAPSHOT_TTL_MS,
      ids,
      compositeKeys,
    };

    return { ids, compositeKeys };
  })();

  try {
    return await snapshotInFlight;
  } finally {
    snapshotInFlight = null;
  }
}

export async function filterRecordsExistingInSheet<T extends DbFuelRecordForSheetMatch>(
  records: T[]
): Promise<T[]> {
  if (!records.length || !navigator.onLine) return records;

  try {
    const { ids, compositeKeys } = await getSheetSnapshot();

    // Safety guard: if sheet came empty/unreadable, don't hide local records.
    if (ids.size === 0 && compositeKeys.size === 0) {
      return records;
    }

    return records.filter((record) => {
      if (record.synced_to_sheet === false) return true;

      const id = String(record.id || '').trim();
      if (id && ids.has(id)) return true;

      const key = buildDbCompositeKey(record);
      return compositeKeys.has(key);
    });
  } catch (error) {
    console.warn('[sheetReconciliation] Failed to reconcile with sheet, keeping DB records.', error);
    return records;
  }
}
