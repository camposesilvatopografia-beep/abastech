import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';

interface FuelRecord {
  [key: string]: any;
}

interface ObraSettings {
  nome?: string;
  cidade?: string;
}

function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function classifyLocation(local: string): 'tanque' | 'comboio' | 'other' {
  const l = (local || '').toLowerCase();
  if (l.includes('tanque') || l.includes('canteiro')) return 'tanque';
  if (l.includes('comboio')) return 'comboio';
  return 'other';
}

/**
 * PDF: Relatório Geral separado por Tanques e Comboios
 */
export function exportTanquesComboiosPDF(
  rows: FuelRecord[],
  selectedDate: Date,
  obraSettings?: ObraSettings | null,
  sortByDescription?: boolean
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Classify records
  const tanqueRecords: FuelRecord[] = [];
  const comboioRecords: FuelRecord[] = [];

  rows.forEach(row => {
    const local = String(row['LOCAL'] || '');
    const type = classifyLocation(local);
    if (type === 'tanque') tanqueRecords.push(row);
    else if (type === 'comboio') comboioRecords.push(row);
  });

  // Sort if needed
  const sortFn = sortByDescription
    ? (a: FuelRecord, b: FuelRecord) =>
        String(a['DESCRICAO'] || a['DESCRIÇÃO'] || '').localeCompare(
          String(b['DESCRICAO'] || b['DESCRIÇÃO'] || ''),
          'pt-BR'
        )
    : undefined;

  if (sortFn) {
    tanqueRecords.sort(sortFn);
    comboioRecords.sort(sortFn);
  }

  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'RELATÓRIO DE ABASTECIMENTO', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(11);
  doc.text('TANQUES E COMBOIOS', pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(obraSettings?.cidade || '', pageWidth / 2, 23, { align: 'center' });

  // Date info
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth - 70, 33);

  let currentY = 38;

  // Helper to render a section
  const renderSection = (title: string, records: FuelRecord[], color: number[]) => {
    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 20;
    }

    // Section header
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(14, currentY, pageWidth - 28, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${title} (${records.length} registros)`, 16, currentY + 7);
    currentY += 14;

    if (records.length === 0) {
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text('Nenhum registro encontrado para esta categoria', 16, currentY);
      currentY += 10;
      return;
    }

    // Calculate totals
    let totalDiesel = 0;
    let totalArla = 0;

    const tableData = records.map(row => {
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
        qty > 0 ? qty.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '-',
        arla > 0 ? arla.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '-',
        String(row['LOCAL'] || ''),
      ];
    });

    // Add total row
    tableData.push([
      'TOTAL', '', '', '', '',
      totalDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 1 }),
      totalArla > 0 ? totalArla.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : '-',
      '',
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Data', 'Hora', 'Veículo', 'Descrição', 'Motorista', 'Diesel (L)', 'Arla (L)', 'Local']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: {
        fillColor: [color[0], color[1], color[2]],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 15 },
        2: { cellWidth: 22 },
        3: { cellWidth: 50 },
        4: { cellWidth: 40 },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 35 },
      },
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fillColor = [color[0], color[1], color[2]];
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  };

  // Render sections
  renderSection('TANQUES (Tanque Canteiro 01 e 02)', tanqueRecords, [30, 64, 175]);
  renderSection('COMBOIOS (Comboio 01, 02 e 03)', comboioRecords, [22, 101, 52]);

  // Summary at end
  if (currentY > pageHeight - 50) {
    doc.addPage();
    currentY = 20;
  }

  const totalTanqueDiesel = tanqueRecords.reduce((s, r) => s + parseNumber(r['QUANTIDADE']), 0);
  const totalComboioDiesel = comboioRecords.reduce((s, r) => s + parseNumber(r['QUANTIDADE']), 0);

  doc.setFillColor(30, 41, 59);
  doc.rect(14, currentY, pageWidth - 28, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO GERAL', 16, currentY + 7);
  currentY += 14;

  autoTable(doc, {
    startY: currentY,
    head: [['Categoria', 'Registros', 'Total Diesel (L)']],
    body: [
      ['Tanques', tanqueRecords.length.toString(), totalTanqueDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 1 })],
      ['Comboios', comboioRecords.length.toString(), totalComboioDiesel.toLocaleString('pt-BR', { minimumFractionDigits: 1 })],
      ['TOTAL', (tanqueRecords.length + comboioRecords.length).toString(), (totalTanqueDiesel + totalComboioDiesel).toLocaleString('pt-BR', { minimumFractionDigits: 1 })],
    ],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.row.index === 2) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7);
    doc.text('Sistema Abastech - Gestão de Frota', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeight - 8);
  }

  doc.save(`Abastecimento_Tanques_Comboios_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

/**
 * XLSX: Relatório Tanques e Comboios
 */
export function exportTanquesComboiosXLSX(
  rows: FuelRecord[],
  selectedDate: Date,
  sortByDescription?: boolean
) {
  const tanqueRecords: FuelRecord[] = [];
  const comboioRecords: FuelRecord[] = [];

  rows.forEach(row => {
    const local = String(row['LOCAL'] || '');
    const type = classifyLocation(local);
    if (type === 'tanque') tanqueRecords.push(row);
    else if (type === 'comboio') comboioRecords.push(row);
  });

  const sortFn = sortByDescription
    ? (a: FuelRecord, b: FuelRecord) =>
        String(a['DESCRICAO'] || a['DESCRIÇÃO'] || '').localeCompare(
          String(b['DESCRICAO'] || b['DESCRIÇÃO'] || ''),
          'pt-BR'
        )
    : undefined;

  if (sortFn) {
    tanqueRecords.sort(sortFn);
    comboioRecords.sort(sortFn);
  }

  const mapRecord = (row: FuelRecord) => ({
    'Data': String(row['DATA'] || ''),
    'Hora': String(row['HORA'] || ''),
    'Veículo': String(row['VEICULO'] || ''),
    'Descrição': String(row['DESCRICAO'] || row['DESCRIÇÃO'] || ''),
    'Motorista': String(row['MOTORISTA'] || ''),
    'Diesel (L)': parseNumber(row['QUANTIDADE']),
    'Arla (L)': parseNumber(row['QUANTIDADE DE ARLA']),
    'Local': String(row['LOCAL'] || ''),
  });

  const workbook = XLSX.utils.book_new();

  // Tanques sheet
  const tanqueData = tanqueRecords.map(mapRecord);
  const tanqueSheet = XLSX.utils.json_to_sheet(tanqueData);
  tanqueSheet['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(workbook, tanqueSheet, 'Tanques');

  // Comboios sheet
  const comboioData = comboioRecords.map(mapRecord);
  const comboioSheet = XLSX.utils.json_to_sheet(comboioData);
  comboioSheet['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(workbook, comboioSheet, 'Comboios');

  XLSX.writeFile(workbook, `Tanques_Comboios_${format(selectedDate, 'dd-MM-yyyy')}.xlsx`);
}
