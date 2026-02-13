import { formatPtBRNumber } from '@/lib/ptBRNumber';

/**
 * Builds the data object mapped to the exact headers of the 'AbastecimentoCanteiro01' spreadsheet.
 * 
 * Actual header order (Column A → AJ):
 * id | DATA | HORA | TIPO | CATEGORIA | VEICULO | POTENCIA | DESCRICAO | MOTORISTA | EMPRESA | OBRA |
 * HORIMETRO ANTERIOR | HORIMETRO ATUAL | INTERVALO HORAS | KM ANTERIOR | KM ATUAL | INTERVALO KM |
 * QUANTIDADE | TIPO DE COMBUSTIVEL | LOCAL | ARLA | QUANTIDADE DE ARLA | FORNECEDOR | NOTA FISCAL |
 * VALOR UNITÁRIO | VALOR TOTAL | OBSERVAÇÃO | FOTO BOMBA | FOTO HORIMETRO | LOCAL DE ENTRADA |
 * LUBRIFICAR | LUBRIFICANTE | COMPLETAR ÓLEO | TIPO ÓLEO | QUANTIDADE ÓLEO | SOPRA FILTRO
 */

export interface FuelSheetRecord {
  id?: string;
  date: string;           // dd/mm/yyyy
  time: string;
  recordType: string;     // 'saida' | 'entrada' | 'Entrada' | 'Saida'
  category: string;
  vehicleCode: string;
  vehicleDescription: string;
  operatorName: string;
  company: string;
  workSite: string;
  horimeterPrevious: number;
  horimeterCurrent: number;
  kmPrevious: number;
  kmCurrent: number;
  fuelQuantity: number;
  fuelType: string;
  location: string;
  arlaQuantity: number;
  observations: string;
  photoPumpUrl?: string | null;
  photoHorimeterUrl?: string | null;
  // Equipment fields
  oilType?: string;
  oilQuantity?: number;
  filterBlowQuantity?: number;
  lubricant?: string;
  // Entry fields
  supplier?: string;
  invoiceNumber?: string;
  unitPrice?: number;
  entryLocation?: string;
}

const fmtNum = (v: any): string => {
  const n = Number(v);
  return n > 0 ? formatPtBRNumber(n, { decimals: 2 }) : '';
};

export function buildFuelSheetData(record: FuelSheetRecord): Record<string, any> {
  const tipo = record.recordType === 'entrada' || record.recordType === 'Entrada' ? 'Entrada' : 'Saida';

  const horPrev = Number(record.horimeterPrevious) || 0;
  const horCurr = Number(record.horimeterCurrent) || 0;
  const kmPrev = Number(record.kmPrevious) || 0;
  const kmCurr = Number(record.kmCurrent) || 0;

  // Calculate intervals
  const intervaloHoras = (horCurr > 0 && horPrev > 0 && horCurr > horPrev) 
    ? fmtNum(horCurr - horPrev) : '';
  const intervaloKm = (kmCurr > 0 && kmPrev > 0 && kmCurr > kmPrev) 
    ? fmtNum(kmCurr - kmPrev) : '';

  // Calculate total value
  const qty = Number(record.fuelQuantity) || 0;
  const price = Number(record.unitPrice) || 0;
  const totalValue = (qty > 0 && price > 0) ? fmtNum(qty * price) : '';

  return {
    'id': record.id || '',
    'DATA': record.date,
    'HORA': record.time || '',
    'TIPO': tipo,
    'CATEGORIA': record.category || '',
    'VEICULO': record.vehicleCode || '',
    'POTENCIA': '', // Not tracked in the system
    'DESCRICAO': record.vehicleDescription || '',
    'MOTORISTA': record.operatorName || '',
    'EMPRESA': record.company || '',
    'OBRA': record.workSite || '',
    'HORIMETRO ANTERIOR': fmtNum(horPrev),
    'HORIMETRO ATUAL': fmtNum(horCurr),
    'INTERVALO HORAS': intervaloHoras,
    'KM ANTERIOR': fmtNum(kmPrev),
    'KM ATUAL': fmtNum(kmCurr),
    'INTERVALO KM': intervaloKm,
    'QUANTIDADE': fmtNum(qty),
    'TIPO DE COMBUSTIVEL': record.fuelType || '',
    'LOCAL': record.location || '',
    'ARLA': (record.arlaQuantity && Number(record.arlaQuantity) > 0) ? 'TRUE' : 'FALSE',
    'QUANTIDADE DE ARLA': fmtNum(record.arlaQuantity),
    'FORNECEDOR': record.supplier || '',
    'NOTA FISCAL': record.invoiceNumber || '',
    'VALOR UNITÁRIO': fmtNum(price),
    'VALOR TOTAL': totalValue,
    'OBSERVAÇÃO': record.observations || '',
    'FOTO BOMBA': record.photoPumpUrl || '',
    'FOTO HORIMETRO': record.photoHorimeterUrl || '',
    'LOCAL DE ENTRADA': record.entryLocation || '',
    'LUBRIFICAR': record.lubricant ? 'TRUE' : 'FALSE',
    'LUBRIFICANTE': record.lubricant || '',
    'COMPLETAR ÓLEO': record.oilType ? 'TRUE' : 'FALSE',
    'TIPO ÓLEO': record.oilType || '',
    'QUANTIDADE ÓLEO': fmtNum(record.oilQuantity),
    'SOPRA FILTRO': fmtNum(record.filterBlowQuantity),
  };
}

/**
 * Converts a DB record (from field_fuel_records) to a FuelSheetRecord.
 */
export function dbRecordToSheetRecord(record: any): FuelSheetRecord {
  const [year, month, day] = (record.record_date || '').split('-');
  const formattedDate = day && month && year ? `${day}/${month}/${year}` : record.record_date;

  return {
    id: record.id || '',
    date: formattedDate,
    time: record.record_time || '',
    recordType: record.record_type || 'saida',
    category: record.category || '',
    vehicleCode: record.vehicle_code || '',
    vehicleDescription: record.vehicle_description || '',
    operatorName: record.operator_name || '',
    company: record.company || '',
    workSite: record.work_site || '',
    horimeterPrevious: Number(record.horimeter_previous) || 0,
    horimeterCurrent: Number(record.horimeter_current) || 0,
    kmPrevious: Number(record.km_previous) || 0,
    kmCurrent: Number(record.km_current) || 0,
    fuelQuantity: Number(record.fuel_quantity) || 0,
    fuelType: record.fuel_type || '',
    location: record.location || '',
    arlaQuantity: Number(record.arla_quantity) || 0,
    observations: record.observations || '',
    photoPumpUrl: record.photo_pump_url || '',
    photoHorimeterUrl: record.photo_horimeter_url || '',
    oilType: record.oil_type || '',
    oilQuantity: Number(record.oil_quantity) || 0,
    filterBlowQuantity: Number(record.filter_blow_quantity) || 0,
    lubricant: record.lubricant || '',
    supplier: record.supplier || '',
    invoiceNumber: record.invoice_number || '',
    unitPrice: Number(record.unit_price) || 0,
    entryLocation: record.entry_location || '',
  };
}
