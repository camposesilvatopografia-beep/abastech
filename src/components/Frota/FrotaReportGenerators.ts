import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface VehicleData {
  codigo: string;
  descricao: string;
  empresa: string;
  categoria: string;
  status: string;
}

interface ObraSettings {
  nome?: string;
  cidade?: string;
}

interface ServiceOrderData {
  vehicle_code: string;
  vehicle_description: string | null;
  problem_description: string | null;
  status: string;
  entry_date: string | null;
  mechanic_name: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────

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

function renderNavyHeader(
  doc: jsPDF,
  line1: string,
  line2: string,
  line3?: string,
  headerHeight = 25
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(line1, pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(11);
  doc.text(line2, pageWidth / 2, 18, { align: 'center' });
  if (line3) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(line3, pageWidth / 2, 23, { align: 'center' });
  }
}

/**
 * Identify "main" companies (those that own at least `minThreshold` vehicles).
 * Others fall under "Terceiros".
 */
function classifyCompanies(
  vehicles: VehicleData[],
  minThreshold = 3
): { mainCompanies: string[]; terceirosCodes: Set<string> } {
  const countByCompany = new Map<string, number>();
  vehicles.forEach(v => {
    const emp = v.empresa || 'Não informada';
    countByCompany.set(emp, (countByCompany.get(emp) || 0) + 1);
  });

  const mainCompanies: string[] = [];
  const terceirosCompanies = new Set<string>();

  // Sort by count desc, then alphabetically
  const sorted = Array.from(countByCompany.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')
  );

  sorted.forEach(([company, count]) => {
    if (count >= minThreshold) {
      mainCompanies.push(company);
    } else {
      terceirosCompanies.add(company);
    }
  });

  // Build set of vehicle codes that belong to "Terceiros"
  const terceirosCodes = new Set<string>();
  vehicles.forEach(v => {
    if (terceirosCompanies.has(v.empresa || 'Não informada')) {
      terceirosCodes.add(v.codigo);
    }
  });

  return { mainCompanies: mainCompanies.sort((a, b) => a.localeCompare(b, 'pt-BR')), terceirosCodes };
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILIZAÇÃO PDF
// ═══════════════════════════════════════════════════════════════════════

export function exportMobilizacaoPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  obraSettings?: ObraSettings | null
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  renderNavyHeader(
    doc,
    obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI',
    'MOBILIZAÇÃO DE EQUIPAMENTOS',
    `ATUALIZADO EM: ${format(selectedDate, 'dd/MM/yyyy')}`
  );

  // Subtitle
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO GERAL DOS EQUIPAMENTOS ATIVOS POR GRUPO X EMPRESA', 14, 35);

  // Build summary: description x empresa
  const summaryMap = new Map<string, Map<string, { total: number; mobilizado: number }>>();

  vehicles.forEach(v => {
    const desc = v.descricao || v.categoria || 'Outros';
    const empresa = v.empresa || 'Não informada';
    const statusLower = (v.status || 'ativo').toLowerCase();

    if (!summaryMap.has(desc)) summaryMap.set(desc, new Map());
    const empresaMap = summaryMap.get(desc)!;
    if (!empresaMap.has(empresa)) empresaMap.set(empresa, { total: 0, mobilizado: 0 });
    const entry = empresaMap.get(empresa)!;
    entry.total++;
    if (['ativo', 'mobilizado'].includes(statusLower)) entry.mobilizado++;
  });

  const summaryRows: string[][] = [];
  let grandTotal = 0, grandMobilizado = 0, grandAMobilizar = 0;

  Array.from(summaryMap.keys())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(desc => {
      const empresaMap = summaryMap.get(desc)!;
      let isFirst = true;
      Array.from(empresaMap.keys()).sort().forEach(empresa => {
        const d = empresaMap.get(empresa)!;
        const aMobilizar = d.total - d.mobilizado;
        grandTotal += d.total;
        grandMobilizado += d.mobilizado;
        grandAMobilizar += aMobilizar;
        summaryRows.push([
          isFirst ? desc : '', empresa, d.total.toString(), d.mobilizado.toString(),
          aMobilizar > 0 ? aMobilizar.toString() : '',
        ]);
        isFirst = false;
      });
    });

  summaryRows.push([
    'TOTAL GERAL', '', grandTotal.toString(), grandMobilizado.toString(),
    grandAMobilizar > 0 ? grandAMobilizar.toString() : '',
  ]);

  autoTable(doc, {
    startY: 40,
    head: [['DESCRIÇÃO', 'EMPRESA', 'NECESSIDADE', 'MOBILIZADO', 'A MOBILIZAR']],
    body: summaryRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 65 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 0 && data.cell.text[0] !== '') {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ─── PAGE 2+: DETAIL BY EQUIPMENT TYPE ───
  const detailGroups = new Map<string, VehicleData[]>();
  vehicles.forEach(v => {
    const desc = v.descricao || v.categoria || 'Outros';
    if (!detailGroups.has(desc)) detailGroups.set(desc, []);
    detailGroups.get(desc)!.push(v);
  });

  doc.addPage();
  let currentY = 15;

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHAMENTO POR TIPO DE EQUIPAMENTO', pageWidth / 2, 12, { align: 'center' });
  currentY = 22;

  Array.from(detailGroups.keys())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(desc => {
      const items = detailGroups.get(desc)!;
      const sorted = [...items].sort((a, b) => a.empresa.localeCompare(b.empresa) || a.codigo.localeCompare(b.codigo));

      if (currentY > pageHeight - 40) { doc.addPage(); currentY = 15; }

      doc.setFillColor(71, 85, 105);
      doc.rect(14, currentY, pageWidth - 28, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`${desc.toUpperCase()} (${items.length})`, 16, currentY + 5);
      currentY += 9;

      const tableData = sorted.map((item, idx) => [
        (idx + 1).toString(), item.codigo, item.empresa,
        item.descricao, item.categoria || '-', (item.status || 'Ativo').toUpperCase(),
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [['ITEM', 'CÓDIGO', 'PROPRIETÁRIO', 'EQUIPAMENTO', 'CATEGORIA', 'STATUS']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fillColor: [148, 163, 184], textColor: 0, fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 25 },
          2: { cellWidth: 45 },
          3: { cellWidth: 55 },
          4: { cellWidth: 30 },
          5: { cellWidth: 25, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
      });

      currentY = (doc as any).lastAutoTable.finalY + 6;
    });

  addPageFooters(doc);
  doc.save(`Mobilizacao_Equipamentos_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════
// EFETIVO / APONTAMENTO DIÁRIO DE EQUIPAMENTOS
// Matches the user-uploaded PDF template exactly
// ═══════════════════════════════════════════════════════════════════════

export function exportEfetivoPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  maintenanceOrders: ServiceOrderData[],
  obraSettings?: ObraSettings | null
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ─── Header ───
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'AEROPORTO MARAGOGI', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(10);
  doc.text('APONTAMENTOS DIÁRIOS DE EQUIPAMENTOS', pageWidth / 2, 18, { align: 'center' });

  // Date line
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data: ${format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}`, 14, 30);

  // ─── Classify companies ───
  const { mainCompanies, terceirosCodes } = classifyCompanies(vehicles);
  const hasTerceiros = terceirosCodes.size > 0;

  // Build column headers: Item | Descrição | Total | ...companies... | (Terceiros) | Manutenção | Disponível no dia
  const headers: string[] = ['Item', 'Descrição', 'Total'];
  mainCompanies.forEach(c => headers.push(c));
  if (hasTerceiros) headers.push('Terceiros');
  headers.push('Manutenção', 'Disponível no dia');

  // Maintenance vehicle codes
  const maintenanceVehicleCodes = new Set(
    maintenanceOrders
      .filter(o => ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças'].includes(o.status))
      .map(o => o.vehicle_code)
  );

  // Also consider vehicles with status "manutenção" / "manutencao"
  vehicles.forEach(v => {
    const s = (v.status || '').toLowerCase();
    if (s === 'manutencao' || s === 'manutenção') {
      maintenanceVehicleCodes.add(v.codigo);
    }
  });

  // Group by description
  const descGroups = new Map<string, VehicleData[]>();
  vehicles.forEach(v => {
    const desc = v.descricao || v.categoria || 'Outros';
    if (!descGroups.has(desc)) descGroups.set(desc, []);
    descGroups.get(desc)!.push(v);
  });

  const sortedDescs = Array.from(descGroups.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Build rows
  const tableData: string[][] = [];
  let totalGeneral = 0;
  const companyTotals = new Map<string, number>();
  mainCompanies.forEach(c => companyTotals.set(c, 0));
  let totalTerceiros = 0;
  let totalMaintenance = 0;
  let totalAvailable = 0;

  sortedDescs.forEach((desc, idx) => {
    const items = descGroups.get(desc)!;
    const total = items.length;
    totalGeneral += total;

    const companyCounts: number[] = mainCompanies.map(company => {
      const count = items.filter(v => v.empresa === company).length;
      companyTotals.set(company, (companyTotals.get(company) || 0) + count);
      return count;
    });

    const terceirosCount = items.filter(v => terceirosCodes.has(v.codigo)).length;
    totalTerceiros += terceirosCount;

    const maintenanceCount = items.filter(v => maintenanceVehicleCodes.has(v.codigo)).length;
    totalMaintenance += maintenanceCount;

    const available = total - maintenanceCount;
    totalAvailable += available;

    const row: string[] = [
      (idx + 1).toString(),
      desc,
      total > 0 ? total.toString() : '',
      ...companyCounts.map(c => c > 0 ? c.toString() : ''),
    ];
    if (hasTerceiros) row.push(terceirosCount > 0 ? terceirosCount.toString() : '');
    row.push(
      maintenanceCount > 0 ? maintenanceCount.toString() : '',
      available > 0 ? available.toString() : '',
    );
    tableData.push(row);
  });

  // Total row
  const totalRow: string[] = [
    'Total',
    '',
    totalGeneral > 0 ? totalGeneral.toString() : '',
    ...mainCompanies.map(c => {
      const val = companyTotals.get(c) || 0;
      return val > 0 ? val.toString() : '';
    }),
  ];
  if (hasTerceiros) totalRow.push(totalTerceiros > 0 ? totalTerceiros.toString() : '');
  totalRow.push(
    totalMaintenance > 0 ? totalMaintenance.toString() : '',
    totalAvailable > 0 ? totalAvailable.toString() : '',
  );
  tableData.push(totalRow);

  // ─── Column widths ───
  const availWidth = pageWidth - 28;
  const itemW = 12;
  const descW = 50;
  const totalW = 14;
  const fixedW = itemW + descW + totalW;
  const dynamicCols = mainCompanies.length + (hasTerceiros ? 1 : 0) + 2; // + Manutenção + Disponível
  const dynamicW = Math.max(18, (availWidth - fixedW) / dynamicCols);

  const columnStyles: Record<number, any> = {
    0: { cellWidth: itemW, halign: 'center' },
    1: { cellWidth: descW },
    2: { cellWidth: totalW, halign: 'center', fontStyle: 'bold' },
  };

  let colIdx = 3;
  mainCompanies.forEach(() => {
    columnStyles[colIdx] = { cellWidth: dynamicW, halign: 'center' };
    colIdx++;
  });
  if (hasTerceiros) {
    columnStyles[colIdx] = { cellWidth: dynamicW, halign: 'center' };
    colIdx++;
  }
  const maintenanceColIdx = colIdx;
  columnStyles[colIdx] = { cellWidth: dynamicW, halign: 'center' };
  colIdx++;
  columnStyles[colIdx] = { cellWidth: dynamicW, halign: 'center' };

  autoTable(doc, {
    startY: 35,
    head: [headers],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 2 },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    columnStyles,
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      // Bold total row
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
      // Red text for Manutenção column values > 0
      if (data.column.index === maintenanceColIdx && data.section === 'body') {
        const val = parseInt(data.cell.text[0] || '0');
        if (val > 0 && data.row.index !== tableData.length - 1) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  let afterTableY = (doc as any).lastAutoTable.finalY + 8;

  // ─── Maintenance Summary (compact list matching PDF template) ───
  const activeMaintenanceOrders = maintenanceOrders.filter(
    o => ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças'].includes(o.status)
  );

  if (activeMaintenanceOrders.length > 0) {
    if (afterTableY > pageHeight - 50) {
      doc.addPage();
      afterTableY = 20;
    }

    // Section header
    doc.setFillColor(245, 158, 11);
    doc.rect(14, afterTableY, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO SIMPLIFICADO DE MANUTENÇÃO (${activeMaintenanceOrders.length})`, 16, afterTableY + 5.5);
    afterTableY += 12;

    // Compact list format: CODE | EMPRESA | DESCRIÇÃO | PROBLEMA | DATA
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');

    // Find the company for each maintenance vehicle
    const vehicleCompanyMap = new Map<string, string>();
    vehicles.forEach(v => {
      vehicleCompanyMap.set(v.codigo, v.empresa || '');
    });

    activeMaintenanceOrders.forEach(o => {
      if (afterTableY > pageHeight - 15) {
        doc.addPage();
        afterTableY = 20;
      }

      const company = vehicleCompanyMap.get(o.vehicle_code) || '';
      const problem = (o.problem_description || '-').substring(0, 50);
      const entryDate = o.entry_date || '-';

      // Bullet point style
      doc.setFont('helvetica', 'bold');
      doc.text('•', 16, afterTableY);
      doc.setFont('helvetica', 'normal');

      const line = `${o.vehicle_code}  ${company.toUpperCase()}  ${(o.vehicle_description || '').toUpperCase()}  ${problem.toUpperCase()}  ${entryDate}`;
      doc.text(line, 20, afterTableY);
      afterTableY += 5;
    });
  }

  addPageFooters(doc);
  doc.save(`Efetivo_Equipamentos_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}
