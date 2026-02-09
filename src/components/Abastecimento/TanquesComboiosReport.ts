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
  if (val === 0) return '0';
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

function sortRecords(records: FuelRecord[], sortByDescription?: boolean): FuelRecord[] {
  if (!sortByDescription) return records;
  return [...records].sort((a, b) =>
    String(a['DESCRICAO'] || a['DESCRIÇÃO'] || '').localeCompare(
      String(b['DESCRICAO'] || b['DESCRIÇÃO'] || ''),
      'pt-BR'
    )
  );
}

const FUEL_TABLE_HEAD = ['Data', 'Hora', 'Veículo', 'Descrição', 'Motorista', 'Diesel (L)', 'Arla (L)', 'Local'];

const FUEL_COL_STYLES: Record<number, any> = {
  0: { cellWidth: 22 },
  1: { cellWidth: 15 },
  2: { cellWidth: 22 },
  3: { cellWidth: 50 },
  4: { cellWidth: 40 },
  5: { cellWidth: 22, halign: 'right' },
  6: { cellWidth: 18, halign: 'right' },
  7: { cellWidth: 35 },
};

function buildFuelTableData(records: FuelRecord[]) {
  let totalDiesel = 0;
  let totalArla = 0;

  const body = records.map(row => {
    const qty = parseNumber(row['QUANTIDADE']);
    const arla = parseNumber(row['QUANTIDADE DE ARLA']);
    totalDiesel += qty;
    totalArla += arla;

    return [
      String(row['DATA'] || ''),
      String(row['HORA'] || ''),
      String(row['VEICULO'] || ''),
      String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
      String(row['MOTORISTA'] || ''),
      qty > 0 ? fmtNum(qty) : '-',
      arla > 0 ? fmtNum(arla) : '-',
      String(row['LOCAL'] || ''),
    ];
  });

  body.push([
    'TOTAL', '', '', '', '',
    fmtNum(totalDiesel),
    totalArla > 0 ? fmtNum(totalArla) : '-',
    '',
  ]);

  return { body, totalDiesel, totalArla };
}

function addPageFooters(doc: jsPDF) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7);
    doc.text('Sistema Abastech - Gestão de Frota', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeight - 8);
  }
}

function mapRecordForXLSX(row: FuelRecord) {
  return {
    'Data': String(row['DATA'] || ''),
    'Hora': String(row['HORA'] || ''),
    'Veículo': String(row['VEICULO'] || ''),
    'Descrição': String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
    'Motorista': String(row['MOTORISTA'] || ''),
    'Diesel (L)': parseNumber(row['QUANTIDADE']),
    'Arla (L)': parseNumber(row['QUANTIDADE DE ARLA']),
    'Local': String(row['LOCAL'] || ''),
  };
}

const XLSX_COL_WIDTHS = [
  { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
];

// ═══════════════════════════════════════════════════════════════════════
// PAGE 1 — RELATÓRIO GERAL DOS TANQUES
// ═══════════════════════════════════════════════════════════════════════

function renderTanquesPage(
  doc: jsPDF,
  fuelRecords: FuelRecord[],
  stockData: TanquesComboiosStockData,
  selectedDate: Date,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean,
  color: number[] = [30, 64, 175]
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(11);
  doc.text('RELATÓRIO GERAL DOS TANQUES', pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(format(selectedDate, "d 'de' MMM. 'de' yyyy", { locale: ptBR }), pageWidth / 2, 23, { align: 'center' });

  // ── Resumo Geral (stock summary) ──
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo Geral', 14, 34);

  const c01 = stockData.canteiro01;
  const c02 = stockData.canteiro02;

  const summaryHead = ['Descrição', 'Estoque Anterior', 'Entrada', 'Saída p/ Comboios', 'Saída p/ Equipamentos', 'Total', 'Estoque Atual'];
  const summaryBody = [
    ['Tanque Canteiro 01', fmtNum(c01.estoqueAnterior, 1), fmtNum(c01.entrada, 2), fmtNum(c01.saidaComboios), fmtNum(c01.saidaEquipamentos), fmtNum(c01.total, 2), fmtNum(c01.estoqueAtual, 2)],
    ['Tanque Canteiro 02', fmtNum(c02.estoqueAnterior, 1), fmtNum(c02.entrada, 2), fmtNum(c02.saidaComboios), fmtNum(c02.saidaEquipamentos), fmtNum(c02.total, 2), fmtNum(c02.estoqueAtual, 2)],
    [
      'Total geral',
      fmtNum(c01.estoqueAnterior + c02.estoqueAnterior, 1),
      fmtNum(c01.entrada + c02.entrada, 2),
      fmtNum(c01.saidaComboios + c02.saidaComboios),
      fmtNum(c01.saidaEquipamentos + c02.saidaEquipamentos),
      fmtNum(c01.total + c02.total, 2),
      fmtNum(c01.estoqueAtual + c02.estoqueAtual, 2),
    ],
  ];

  autoTable(doc, {
    startY: 38,
    head: [summaryHead],
    body: summaryBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.row.index === summaryBody.length - 1) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;

  // ── Fuel records detail ──
  const sorted = sortRecords(fuelRecords, sortByDescription);

  if (sorted.length > 0) {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(14, currentY, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`TANQUES 01 e 02 — ${sorted.length} registros`, 16, currentY + 5.5);
    currentY += 10;

    const { body } = buildFuelTableData(sorted);

    autoTable(doc, {
      startY: currentY,
      head: [FUEL_TABLE_HEAD],
      body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [color[0], color[1], color[2]], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: FUEL_COL_STYLES,
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fillColor = [color[0], color[1], color[2]];
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  } else {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum registro de abastecimento encontrado para Tanques.', 14, currentY + 4);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PAGE 2 — RELATÓRIO GERAL DOS COMBOIOS
// ═══════════════════════════════════════════════════════════════════════

function renderComboiosPage(
  doc: jsPDF,
  fuelRecords: FuelRecord[],
  stockData: TanquesComboiosStockData,
  selectedDate: Date,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean,
  color: number[] = [22, 101, 52]
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header ──
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(11);
  doc.text('RELATÓRIO GERAL DOS COMBOIOS', pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(format(selectedDate, "d 'de' MMM. 'de' yyyy", { locale: ptBR }), pageWidth / 2, 23, { align: 'center' });

  // ── Resumo Geral (stock summary) ──
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo Geral', 14, 34);

  const cb1 = stockData.comboio01;
  const cb2 = stockData.comboio02;
  const cb3 = stockData.comboio03;

  const summaryHead = ['Descrição', 'Estoque Anterior', 'Entrada', 'Saída', 'Estoque Atual'];
  const summaryBody = [
    ['Comboio 01', fmtNum(cb1.estoqueAnterior), fmtNum(cb1.entrada, 2), fmtNum(cb1.total, 2), fmtNum(cb1.estoqueAtual)],
    ['Comboio 02', fmtNum(cb2.estoqueAnterior), fmtNum(cb2.entrada, 2), fmtNum(cb2.total, 2), fmtNum(cb2.estoqueAtual)],
    ['Comboio 03', fmtNum(cb3.estoqueAnterior), fmtNum(cb3.entrada, 2), fmtNum(cb3.total, 2), fmtNum(cb3.estoqueAtual)],
    [
      'Total geral',
      fmtNum(cb1.estoqueAnterior + cb2.estoqueAnterior + cb3.estoqueAnterior),
      fmtNum(cb1.entrada + cb2.entrada + cb3.entrada, 2),
      fmtNum(cb1.total + cb2.total + cb3.total, 2),
      fmtNum(cb1.estoqueAtual + cb2.estoqueAtual + cb3.estoqueAtual),
    ],
  ];

  autoTable(doc, {
    startY: 38,
    head: [summaryHead],
    body: summaryBody,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 45, fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.row.index === summaryBody.length - 1) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;

  // ── Fuel records detail ──
  const sorted = sortRecords(fuelRecords, sortByDescription);

  if (sorted.length > 0) {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(14, currentY, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`COMBOIOS 01, 02 e 03 — ${sorted.length} registros`, 16, currentY + 5.5);
    currentY += 10;

    const { body } = buildFuelTableData(sorted);

    autoTable(doc, {
      startY: currentY,
      head: [FUEL_TABLE_HEAD],
      body,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [color[0], color[1], color[2]], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: FUEL_COL_STYLES,
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fillColor = [color[0], color[1], color[2]];
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  } else {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhum registro de abastecimento encontrado para Comboios.', 14, currentY + 4);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/** PDF: Relatório dos Tanques (page 1) — with stock summary */
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

/** PDF: Relatório dos Comboios (page 2) — with stock summary */
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

/** PDF: Tanques (Page 1) + Comboios (Page 2) — Combined report */
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

  // Page 1 — Tanques
  renderTanquesPage(doc, tanqueRecords, stockData, selectedDate, obraSettings, sortByDescription);

  // Page 2 — Comboios
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
