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

const FUEL_TABLE_HEAD = [
  '', 'Código', 'Descrição', 'Motorista/Operador',
  'Hor/Km\nAnterior', 'Hor/Km\nAtual', 'Intervalo\n(h/km)',
  'Consumo', 'Qtd Diesel'
];

const FUEL_COL_STYLES: Record<number, any> = {
  0: { cellWidth: 10, halign: 'center' },
  1: { cellWidth: 25 },
  2: { cellWidth: 45 },
  3: { cellWidth: 45 },
  4: { cellWidth: 25, halign: 'right' },
  5: { cellWidth: 28, halign: 'right' },
  6: { cellWidth: 28, halign: 'right' },
  7: { cellWidth: 22, halign: 'right' },
  8: { cellWidth: 22, halign: 'right' },
};

function fmtPtBR(val: number, decimals = 2): string {
  if (val === 0) return '-';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

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
      (index + 1).toString() + '.',
      String(row['VEICULO'] || ''),
      String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
      String(row['MOTORISTA'] || ''),
      anterior > 0 ? fmtPtBR(anterior) : '-',
      atual > 0 ? fmtPtBR(atual) : '-',
      intervalo > 0 ? fmtPtBR(intervalo) : '-',
      consumo > 0 ? fmtPtBR(consumo) : '0,00',
      qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : '-',
    ];
  });

  const mediaConsumo = countConsumo > 0 ? totalConsumo / countConsumo : 0;
  body.push([
    '', '', '', 'TOTAL',
    '', '', '',
    mediaConsumo > 0 ? `Média: ${fmtPtBR(mediaConsumo)}` : '-',
    totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 }),
  ]);

  return { body, totalDiesel };
}

function buildEntradasTableData(records: FuelRecord[], locationType: 'tanque' | 'comboio') {
  let totalDiesel = 0;

  const body = records.map((row, index) => {
    const qty = parseNumber(row['QUANTIDADE']);
    totalDiesel += qty;

    const data = String(row['DATA'] || row['data'] || '');
    if (locationType === 'tanque') {
      const fornecedor = String(row['FORNECEDOR'] || row['fornecedor'] || 'N/I');
      return [
        (index + 1).toString() + '.',
        data,
        fornecedor,
        qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L' : '-',
      ];
    } else {
      const localEntrada = String(row['LOCAL DE ENTRADA'] || row['LOCAL_ENTRADA'] || 'N/I');
      return [
        (index + 1).toString() + '.',
        data,
        localEntrada,
        qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L' : '-',
      ];
    }
  });

  body.push([
    '', '', 'TOTAL ENTRADAS',
    totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) + ' L',
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

  // Check if need new page
  if (currentY > pageHeight - 60) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 139, 34);
  doc.text('ENTRADAS (Recebimentos)', 14, currentY + 4);
  currentY += 8;

  const thirdCol = locationType === 'tanque' ? 'Fornecedor' : 'Local de Entrada';
  const { body } = buildEntradasTableData(records, locationType);

  autoTable(doc, {
    startY: currentY,
    head: [['', 'Data', thirdCol, 'Quantidade']],
    body,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [34, 139, 34],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 30 },
      2: { cellWidth: 80 },
      3: { cellWidth: 40, halign: 'right' },
    },
    alternateRowStyles: { fillColor: [245, 255, 245] },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 240, 220];
      }
    },
    theme: 'grid',
    margin: { left: 14, right: 14 },
  });

  return (doc as any).lastAutoTable.finalY + 10;
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
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Separate Saídas and Entradas ──
  const saidas = sortRecords(fuelRecords.filter(r => !isEntradaRecord(r)), sortByDescription);
  const entradas = sortRecords(fuelRecords.filter(r => isEntradaRecord(r)), sortByDescription);

  // ── SAÍDAS (Abastecimentos) ──
  if (saidas.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 50, 50);
    doc.text(`SAÍDAS (Abastecimentos) — ${saidas.length} registros`, 14, currentY + 4);
    currentY += 8;

    const { body } = buildFuelTableData(saidas);

    autoTable(doc, {
      startY: currentY,
      head: [FUEL_TABLE_HEAD],
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [180, 50, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: FUEL_COL_STYLES,
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [255, 245, 245] },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 220, 220];
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── ENTRADAS (Recebimentos) ──
  currentY = renderEntradasTable(doc, entradas, currentY, 'tanque', pageHeight);

  if (saidas.length === 0 && entradas.length === 0) {
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
  const pageHeight = doc.internal.pageSize.getHeight();

  // ── Separate Saídas and Entradas ──
  const saidas = sortRecords(fuelRecords.filter(r => !isEntradaRecord(r)), sortByDescription);
  const entradas = sortRecords(fuelRecords.filter(r => isEntradaRecord(r)), sortByDescription);

  // ── SAÍDAS (Abastecimentos) ──
  if (saidas.length > 0) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 50, 50);
    doc.text(`SAÍDAS (Abastecimentos) — ${saidas.length} registros`, 14, currentY + 4);
    currentY += 8;

    const { body } = buildFuelTableData(saidas);

    autoTable(doc, {
      startY: currentY,
      head: [FUEL_TABLE_HEAD],
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: {
        fillColor: [180, 50, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: FUEL_COL_STYLES,
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [255, 245, 245] },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [230, 220, 220];
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── ENTRADAS (Recebimentos) ──
  currentY = renderEntradasTable(doc, entradas, currentY, 'comboio', pageHeight);

  if (saidas.length === 0 && entradas.length === 0) {
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
