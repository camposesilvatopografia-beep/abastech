import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

// ─── Types ─────────────────────────────────────────────────────────────

interface FuelRecord {
  [key: string]: any;
}

interface ObraSettings {
  nome?: string;
  cidade?: string;
}

export interface StockSummary {
  estoqueAnterior: number;
  entrada: number;
  saidaComboios: number;
  saidaEquipamentos: number;
  total: number;
  estoqueAtual: number;
}

export interface TanquesComboiosStockData {
  canteiro01: StockSummary;
  canteiro02: StockSummary;
  comboio01: StockSummary;
  comboio02: StockSummary;
  comboio03: StockSummary;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function fmtNum(val: number, decimals = 1): string {
  if (val === 0) return '-';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function classifyLocation(local: string): 'tanque' | 'comboio' | 'other' {
  const l = (local || '').toLowerCase();
  if (l.includes('tanque') || l.includes('canteiro')) return 'tanque';
  if (l.includes('comboio')) return 'comboio';
  return 'other';
}

function filterByType(rows: FuelRecord[], type: 'tanque' | 'comboio'): FuelRecord[] {
  return rows.filter(row => classifyLocation(String(row['LOCAL'] || '')) === type);
}

function isEntradaRecord(row: FuelRecord): boolean {
  const tipo = String(row['TIPO'] || row['tipo'] || '').toLowerCase();
  const fornecedor = String(row['FORNECEDOR'] || row['fornecedor'] || '').trim();
  const localEntrada = String(row['LOCAL DE ENTRADA'] || row['LOCAL_ENTRADA'] || '').trim();
  return tipo.includes('entrada') || fornecedor.length > 0 || localEntrada.length > 0;
}

function sortRecords(records: FuelRecord[], sortByDescription?: boolean): FuelRecord[] {
  if (!sortByDescription) return records;
  return [...records].sort((a, b) =>
    String(a['DESCRICAO'] || a['DESCRIÇÃO'] || '').localeCompare(
      String(b['DESCRICAO'] || b['DESCRIÇÃO'] || ''),
      'pt-BR'
    )
  );
}

function fmtPtBR(val: number, decimals = 2): string {
  if (val === 0) return '-';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─── Layout constants (landscape A4 = 297mm) ───────────────────────────

const PAGE_MARGIN = 10;
const LANDSCAPE_WIDTH = 297;
const USABLE_WIDTH = LANDSCAPE_WIDTH - (PAGE_MARGIN * 2); // 277mm

const FUEL_TABLE_HEAD = [
  '#', 'Código', 'Descrição', 'Motorista/Operador',
  'Hor/Km\nAnterior', 'Hor/Km\nAtual', 'Intervalo\n(h/km)',
  'Consumo\n(L/h ou km/L)', 'Qtd Diesel\n(Litros)'
];

// Column widths that fill 277mm landscape usable space — centered
const FUEL_COL_STYLES: Record<number, any> = {
  0: { cellWidth: 12, halign: 'center' },
  1: { cellWidth: 28, halign: 'center' },
  2: { cellWidth: 58, halign: 'center', overflow: 'linebreak' },
  3: { cellWidth: 52, halign: 'center', overflow: 'linebreak' },
  4: { cellWidth: 28, halign: 'center' },
  5: { cellWidth: 28, halign: 'center' },
  6: { cellWidth: 25, halign: 'center' },
  7: { cellWidth: 25, halign: 'center' },
  8: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
};

// ─── Header ────────────────────────────────────────────────────────────

function renderHeader(doc: jsPDF, title: string, selectedDate: Date, obraSettings?: ObraSettings | null): number {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Navy gradient header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Accent line
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 28, pageWidth, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 10, { align: 'center' });

  doc.setFontSize(10);
  doc.text(title, pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const cityStr = obraSettings?.cidade ? `${obraSettings.cidade} — ${dateStr}` : dateStr;
  doc.text(cityStr, pageWidth / 2, 24, { align: 'center' });

  return 35; // Y position after header
}

// ─── Fuel Data Tables ──────────────────────────────────────────────────
// (Stock summary tables removed — only fuel records are shown)

function buildFuelTableData(records: FuelRecord[]) {
  let totalDiesel = 0;
  let totalConsumo = 0;
  let countConsumo = 0;

  const body = records.map((row, index) => {
    const qty = parseNumber(row['QUANTIDADE']);
    const horAnterior = parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || 0);
    const horAtual = parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || 0);
    const kmAnterior = parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0);
    const kmAtual = parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || 0);

    const usaKm = kmAtual > 0 || kmAnterior > 0;
    const anterior = usaKm ? kmAnterior : horAnterior;
    const atual = usaKm ? kmAtual : horAtual;
    const intervalo = atual - anterior;

    let consumo = 0;
    if (qty > 0 && intervalo > 0) {
      consumo = usaKm ? intervalo / qty : qty / intervalo;
      totalConsumo += consumo;
      countConsumo++;
    }

    totalDiesel += qty;

    return [
      String(index + 1),
      String(row['VEICULO'] || ''),
      String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
      String(row['MOTORISTA'] || ''),
      anterior > 0 ? fmtPtBR(anterior) : '-',
      atual > 0 ? fmtPtBR(atual) : '-',
      intervalo > 0 ? fmtPtBR(intervalo) : '-',
      consumo > 0 ? fmtPtBR(consumo) : '-',
      qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : '-',
    ];
  });

  const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
  body.push([
    '', '', '', 'TOTAL',
    '', '', '',
    mediaConsumo > 0 ? `Média: ${fmtPtBR(mediaConsumo)}` : '-',
    totalDiesel > 0 ? totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L' : '-',
  ]);

  return { body, totalDiesel };
}

function renderSaidasTable(doc: jsPDF, records: FuelRecord[], currentY: number, pageHeight: number): number {
  if (records.length === 0) return currentY;

  if (currentY > pageHeight - 50) {
    doc.addPage();
    currentY = 15;
  }

  // Section title with red accent
  doc.setFillColor(180, 50, 50);
  doc.roundedRect(PAGE_MARGIN, currentY - 1, 4, 7, 1, 1, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 50, 50);
  doc.text(`SAÍDAS (Abastecimentos) — ${records.length} registros`, PAGE_MARGIN + 7, currentY + 4);
  currentY += 10;

  const { body } = buildFuelTableData(records);

  autoTable(doc, {
    startY: currentY,
    head: [FUEL_TABLE_HEAD],
    body,
    theme: 'grid',
    tableWidth: USABLE_WIDTH,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: [200, 200, 210],
      lineWidth: 0.25,
      overflow: 'linebreak',
      halign: 'center',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [153, 27, 27],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 11,
    },
    columnStyles: FUEL_COL_STYLES,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    alternateRowStyles: { fillColor: [254, 242, 242] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 200, 200];
        data.cell.styles.fontSize = 8;
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

// ─── Entradas Table ────────────────────────────────────────────────────

function buildEntradasTableData(records: FuelRecord[], locationType: 'tanque' | 'comboio') {
  let totalDiesel = 0;

  const body = records.map((row, index) => {
    const qty = parseNumber(row['QUANTIDADE']);
    totalDiesel += qty;

    const data = String(row['DATA'] || row['data'] || '');
    if (locationType === 'tanque') {
      const fornecedor = String(row['FORNECEDOR'] || row['fornecedor'] || 'N/I');
      return [
        String(index + 1),
        data,
        fornecedor,
        qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L' : '-',
      ];
    } else {
      const localEntrada = String(row['LOCAL DE ENTRADA'] || row['LOCAL_ENTRADA'] || 'N/I');
      return [
        String(index + 1),
        data,
        localEntrada,
        qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L' : '-',
      ];
    }
  });

  body.push([
    '', '', 'TOTAL ENTRADAS',
    totalDiesel > 0 ? totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L' : '-',
  ]);

  return { body, totalDiesel };
}

function renderEntradasTable(
  doc: jsPDF,
  records: FuelRecord[],
  currentY: number,
  locationType: 'tanque' | 'comboio',
  pageHeight: number,
): number {
  if (records.length === 0) return currentY;

  if (currentY > pageHeight - 50) {
    doc.addPage();
    currentY = 15;
  }

  // Section title with green accent
  doc.setFillColor(34, 139, 34);
  doc.roundedRect(PAGE_MARGIN, currentY - 1, 4, 7, 1, 1, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 139, 34);
  doc.text(`ENTRADAS (Recebimentos) — ${records.length} registros`, PAGE_MARGIN + 7, currentY + 4);
  currentY += 10;

  const thirdCol = locationType === 'tanque' ? 'Fornecedor' : 'Local de Entrada';
  const { body } = buildEntradasTableData(records, locationType);

  // Entradas table fills full width
  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Data', thirdCol, 'Quantidade (L)']],
    body,
    theme: 'grid',
    tableWidth: USABLE_WIDTH,
    styles: {
      fontSize: 9,
      cellPadding: 3.5,
      lineColor: [200, 210, 200],
      lineWidth: 0.25,
      halign: 'center',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [22, 101, 52],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'center',
      valign: 'middle',
      minCellHeight: 11,
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 40, halign: 'center' },
      2: { halign: 'center' },
      3: { cellWidth: 50, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    alternateRowStyles: { fillColor: [240, 253, 244] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [200, 235, 210];
        data.cell.styles.fontSize = 8.5;
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

// ─── Page Footer ───────────────────────────────────────────────────────

function addPageFooters(doc: jsPDF) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Divider line
    doc.setDrawColor(200, 200, 210);
    doc.setLineWidth(0.3);
    doc.line(PAGE_MARGIN, pageHeight - 12, pageWidth - PAGE_MARGIN, pageHeight - 12);
    // Footer text
    doc.setTextColor(140, 140, 150);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema Abastech — Gestão de Frota e Abastecimento', PAGE_MARGIN, pageHeight - 7);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - PAGE_MARGIN, pageHeight - 7, { align: 'right' });
  }
}

// ─── XLSX helpers ──────────────────────────────────────────────────────

function mapRecordForXLSX(row: FuelRecord) {
  const horAnterior = parseNumber(row['HORIMETRO ANTERIOR'] || row['HOR_ANTERIOR'] || 0);
  const horAtual = parseNumber(row['HORIMETRO ATUAL'] || row['HOR_ATUAL'] || 0);
  const kmAnterior = parseNumber(row['KM ANTERIOR'] || row['KM_ANTERIOR'] || 0);
  const kmAtual = parseNumber(row['KM ATUAL'] || row['KM_ATUAL'] || 0);
  const qty = parseNumber(row['QUANTIDADE']);

  const usaKm = kmAtual > 0 || kmAnterior > 0;
  const anterior = usaKm ? kmAnterior : horAnterior;
  const atual = usaKm ? kmAtual : horAtual;
  const intervalo = atual - anterior;
  let consumo = 0;
  if (qty > 0 && intervalo > 0) {
    consumo = usaKm ? intervalo / qty : qty / intervalo;
  }

  return {
    'Código': String(row['VEICULO'] || ''),
    'Descrição': String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
    'Motorista/Operador': String(row['MOTORISTA'] || ''),
    'Hor/Km Anterior': anterior > 0 ? anterior : '',
    'Hor/Km Atual': atual > 0 ? atual : '',
    'Intervalo': intervalo > 0 ? intervalo : '',
    'Consumo': consumo > 0 ? consumo : '',
    'Diesel (L)': qty,
  };
}

const XLSX_COL_WIDTHS = [
  { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
];

// ═══════════════════════════════════════════════════════════════════════
// PAGE — RELATÓRIO GERAL DOS TANQUES
// ═══════════════════════════════════════════════════════════════════════

function renderTanquesPage(
  doc: jsPDF,
  fuelRecords: FuelRecord[],
  stockData: TanquesComboiosStockData,
  selectedDate: Date,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean,
) {
  let currentY = renderHeader(doc, 'RELATÓRIO GERAL DOS TANQUES', selectedDate, obraSettings);
  const pageHeight = doc.internal.pageSize.getHeight();

  // Separate Saídas and Entradas
  const saidas = sortRecords(fuelRecords.filter(r => !isEntradaRecord(r)), sortByDescription);
  const entradas = sortRecords(fuelRecords.filter(r => isEntradaRecord(r)), sortByDescription);

  // SAÍDAS
  currentY = renderSaidasTable(doc, saidas, currentY, pageHeight);

  // ENTRADAS
  currentY = renderEntradasTable(doc, entradas, currentY, 'tanque', pageHeight);

  if (saidas.length === 0 && entradas.length === 0) {
    doc.setTextColor(120, 120, 130);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum registro de abastecimento encontrado para Tanques nesta data.', PAGE_MARGIN, currentY + 4);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PAGE — RELATÓRIO GERAL DOS COMBOIOS
// ═══════════════════════════════════════════════════════════════════════

function renderComboiosPage(
  doc: jsPDF,
  fuelRecords: FuelRecord[],
  stockData: TanquesComboiosStockData,
  selectedDate: Date,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean,
) {
  let currentY = renderHeader(doc, 'RELATÓRIO GERAL DOS COMBOIOS', selectedDate, obraSettings);
  const pageHeight = doc.internal.pageSize.getHeight();

  // Separate Saídas and Entradas
  const saidas = sortRecords(fuelRecords.filter(r => !isEntradaRecord(r)), sortByDescription);
  const entradas = sortRecords(fuelRecords.filter(r => isEntradaRecord(r)), sortByDescription);

  // SAÍDAS
  currentY = renderSaidasTable(doc, saidas, currentY, pageHeight);

  // ENTRADAS
  currentY = renderEntradasTable(doc, entradas, currentY, 'comboio', pageHeight);

  if (saidas.length === 0 && entradas.length === 0) {
    doc.setTextColor(120, 120, 130);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum registro de abastecimento encontrado para Comboios nesta data.', PAGE_MARGIN, currentY + 4);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/** PDF: Relatório dos Tanques — with stock summary */
export function exportTanquesPDF(
  rows: FuelRecord[],
  selectedDate: Date,
  stockData: TanquesComboiosStockData,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean
) {
  const doc = new jsPDF('landscape');
  const tanqueRecords = filterByType(rows, 'tanque');
  renderTanquesPage(doc, tanqueRecords, stockData, selectedDate, obraSettings, sortByDescription);
  addPageFooters(doc);
  doc.save(`Relatorio_Tanques_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

/** PDF: Relatório dos Comboios — with stock summary */
export function exportComboiosPDF(
  rows: FuelRecord[],
  selectedDate: Date,
  stockData: TanquesComboiosStockData,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean
) {
  const doc = new jsPDF('landscape');
  const comboioRecords = filterByType(rows, 'comboio');
  renderComboiosPage(doc, comboioRecords, stockData, selectedDate, obraSettings, sortByDescription);
  addPageFooters(doc);
  doc.save(`Relatorio_Comboios_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

/** PDF: Tanques + Comboios — Combined report */
export function exportTanquesComboiosPDF(
  rows: FuelRecord[],
  selectedDate: Date,
  stockData: TanquesComboiosStockData,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean
) {
  const doc = new jsPDF('landscape');

  const tanqueRecords = filterByType(rows, 'tanque');
  const comboioRecords = filterByType(rows, 'comboio');

  renderTanquesPage(doc, tanqueRecords, stockData, selectedDate, obraSettings, sortByDescription);

  doc.addPage();
  renderComboiosPage(doc, comboioRecords, stockData, selectedDate, obraSettings, sortByDescription);

  addPageFooters(doc);
  doc.save(`Tanques_Comboios_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

// ─── XLSX Exports ──────────────────────────────────────────────────────

/** XLSX: Only Tanques */
export function exportTanquesXLSX(
  rows: FuelRecord[],
  selectedDate: Date,
  sortByDescription?: boolean
) {
  const records = sortRecords(filterByType(rows, 'tanque'), sortByDescription);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(records.map(mapRecordForXLSX));
  sheet['!cols'] = XLSX_COL_WIDTHS;
  XLSX.utils.book_append_sheet(workbook, sheet, 'Tanques');
  XLSX.writeFile(workbook, `Abastecimento_Tanques_${format(selectedDate, 'dd-MM-yyyy')}.xlsx`);
}

/** XLSX: Only Comboios */
export function exportComboiosXLSX(
  rows: FuelRecord[],
  selectedDate: Date,
  sortByDescription?: boolean
) {
  const records = sortRecords(filterByType(rows, 'comboio'), sortByDescription);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(records.map(mapRecordForXLSX));
  sheet['!cols'] = XLSX_COL_WIDTHS;
  XLSX.utils.book_append_sheet(workbook, sheet, 'Comboios');
  XLSX.writeFile(workbook, `Abastecimento_Comboios_${format(selectedDate, 'dd-MM-yyyy')}.xlsx`);
}

/** XLSX: Tanques + Comboios (two sheets) */
export function exportTanquesComboiosXLSX(
  rows: FuelRecord[],
  selectedDate: Date,
  sortByDescription?: boolean
) {
  const tanqueRecords = sortRecords(filterByType(rows, 'tanque'), sortByDescription);
  const comboioRecords = sortRecords(filterByType(rows, 'comboio'), sortByDescription);

  const workbook = XLSX.utils.book_new();

  const tanqueSheet = XLSX.utils.json_to_sheet(tanqueRecords.map(mapRecordForXLSX));
  tanqueSheet['!cols'] = XLSX_COL_WIDTHS;
  XLSX.utils.book_append_sheet(workbook, tanqueSheet, 'Tanques');

  const comboioSheet = XLSX.utils.json_to_sheet(comboioRecords.map(mapRecordForXLSX));
  comboioSheet['!cols'] = XLSX_COL_WIDTHS;
  XLSX.utils.book_append_sheet(workbook, comboioSheet, 'Comboios');

  XLSX.writeFile(workbook, `Tanques_Comboios_${format(selectedDate, 'dd-MM-yyyy')}.xlsx`);
}
