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
  logo_url?: string | null;
}

/**
 * Helper: fetch an image URL and return a base64 data URL.
 * Returns null if loading fails.
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
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
// Professional navy-blue themed layout matching the system design
// ═══════════════════════════════════════════════════════════════════════

export async function exportEfetivoPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  maintenanceOrders: ServiceOrderData[],
  obraSettings?: ObraSettings | null
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();

  // ─── Load logo if available ───
  let logoBase64: string | null = null;
  if (obraSettings?.logo_url) {
    logoBase64 = await fetchImageAsBase64(obraSettings.logo_url);
  }

  // ─── Navy Blue Header ───
  const headerH = logoBase64 ? 30 : 28;
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, headerH, 'F');

  // Accent bar
  doc.setFillColor(56, 189, 248);
  doc.rect(0, headerH, pageWidth, 1.5, 'F');

  // Logo on the left
  let textStartX = 14;
  if (logoBase64) {
    try {
      const logoW = 22;
      const logoH = 22;
      doc.addImage(logoBase64, 'PNG', 10, 4, logoW, logoH);
      textStartX = 36;
    } catch {
      // Fallback: no logo
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI', textStartX, 11);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('APONTAMENTO DIÁRIO DE EQUIPAMENTOS', textStartX, 19);

  if (obraSettings?.cidade) {
    doc.setFontSize(7);
    doc.text(obraSettings.cidade, textStartX, 25);
  }

  // Date on the right
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const formattedDate = format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  doc.text(formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1), pageWidth - 14, 11, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 14, 18, { align: 'right' });

  // ─── Classify companies ───
  const { mainCompanies, terceirosCodes } = classifyCompanies(vehicles);
  const hasTerceiros = terceirosCodes.size > 0;

  // Build column headers
  const headers: string[] = ['Item', 'Descrição', 'Total\nMobilizado'];
  mainCompanies.forEach(c => headers.push(c));
  if (hasTerceiros) headers.push('Terceiros');
  headers.push('Manutenção', 'Disponível\nno dia');

  // Maintenance vehicle codes
  const maintenanceVehicleCodes = new Set(
    maintenanceOrders
      .filter(o => ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças'].includes(o.status))
      .map(o => o.vehicle_code)
  );

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
    '',
    'TOTAL GERAL',
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
  const availWidth = pageWidth - 28; // 14mm margin each side
  const itemW = 12;
  const descW = 52;
  const totalMobW = 20;
  const fixedW = itemW + descW + totalMobW;
  const dynamicCols = mainCompanies.length + (hasTerceiros ? 1 : 0) + 2;
  const dynamicW = Math.max(18, Math.min(30, (availWidth - fixedW) / dynamicCols));

  const columnStyles: Record<number, any> = {
    0: { cellWidth: itemW, halign: 'center' },
    1: { cellWidth: descW, fontStyle: 'bold' },
    2: { cellWidth: totalMobW, halign: 'center', fontStyle: 'bold' },
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
  const availableColIdx = colIdx;
  columnStyles[colIdx] = { cellWidth: dynamicW, halign: 'center', fontStyle: 'bold' };

  autoTable(doc, {
    startY: headerH + 5,
    head: [headers],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
      textColor: [30, 41, 59],
      font: 'helvetica',
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      lineColor: [51, 65, 85],
      lineWidth: 0.3,
      cellPadding: 2.5,
    },
    columnStyles,
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    didParseCell: (data) => {
      // Total row - navy background
      if (data.row.index === tableData.length - 1) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8;
      }
      // Manutenção column - red accent for values > 0
      if (data.column.index === maintenanceColIdx && data.section === 'body') {
        const val = parseInt(data.cell.text[0] || '0');
        if (val > 0 && data.row.index !== tableData.length - 1) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [254, 242, 242];
        }
      }
      // Disponível column - green accent for values > 0
      if (data.column.index === availableColIdx && data.section === 'body') {
        const val = parseInt(data.cell.text[0] || '0');
        if (val > 0 && data.row.index !== tableData.length - 1) {
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      // Total Mobilizado column - blue accent
      if (data.column.index === 2 && data.section === 'body' && data.row.index !== tableData.length - 1) {
        const val = parseInt(data.cell.text[0] || '0');
        if (val > 0) {
          data.cell.styles.textColor = [30, 64, 175];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  let afterTableY = (doc as any).lastAutoTable.finalY + 6;

  // ─── Relatório Simplificado de Manutenção ───
  const activeMaintenanceOrders = maintenanceOrders.filter(
    o => ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças'].includes(o.status)
  );

  if (activeMaintenanceOrders.length > 0) {
    // Section header with navy accent
    doc.setFillColor(51, 65, 85);
    doc.rect(14, afterTableY, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO SIMPLIFICADO DE MANUTENÇÃO (${activeMaintenanceOrders.length})`, 17, afterTableY + 5.5);
    afterTableY += 10;

    const vehicleInfoMap = new Map<string, { empresa: string; descricao: string }>();
    vehicles.forEach(v => {
      vehicleInfoMap.set(v.codigo, { empresa: v.empresa || '', descricao: v.descricao || '' });
    });

    const maintenanceTableData = activeMaintenanceOrders.map(o => {
      const info = vehicleInfoMap.get(o.vehicle_code);
      return [
        o.vehicle_code,
        info?.empresa || '',
        info?.descricao || o.vehicle_description || '',
        o.problem_description || '-',
        o.entry_date ? format(new Date(o.entry_date + 'T12:00:00'), 'dd/MM/yyyy') : '-',
      ];
    });

    autoTable(doc, {
      startY: afterTableY,
      head: [['Código', 'Empresa', 'Equipamento', 'Problema', 'Entrada']],
      body: maintenanceTableData,
      theme: 'grid',
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
        lineColor: [51, 65, 85],
      },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'bold' },
        1: { cellWidth: 40 },
        2: { cellWidth: 48 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 22, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [241, 245, 249] },
    });
  }

  addPageFooters(doc);
  doc.save(`Efetivo_Equipamentos_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILIZADOS PDF - Equipment with status mobilizado/ativo
// ═══════════════════════════════════════════════════════════════════════

export function exportMobilizadosPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  obraSettings?: ObraSettings | null
) {
  const mobilized = vehicles.filter(v => {
    const s = (v.status || 'ativo').toLowerCase();
    return s === 'mobilizado' || s === 'ativo';
  });

  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  renderNavyHeader(
    doc,
    obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI',
    'RELATÓRIO DE EQUIPAMENTOS MOBILIZADOS',
    `${format(selectedDate, 'dd/MM/yyyy')} — Total: ${mobilized.length} equipamentos`
  );

  // ─── Summary by Company ───
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO POR EMPRESA', 14, 35);

  const companyMap = new Map<string, Map<string, VehicleData[]>>();
  mobilized.forEach(v => {
    const emp = v.empresa || 'Não informada';
    const desc = v.descricao || v.categoria || 'Outros';
    if (!companyMap.has(emp)) companyMap.set(emp, new Map());
    const descMap = companyMap.get(emp)!;
    if (!descMap.has(desc)) descMap.set(desc, []);
    descMap.get(desc)!.push(v);
  });

  // Summary table
  const summaryRows: string[][] = [];
  let grandTotal = 0;

  Array.from(companyMap.keys())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(emp => {
      const descMap = companyMap.get(emp)!;
      const empTotal = Array.from(descMap.values()).reduce((s, arr) => s + arr.length, 0);
      grandTotal += empTotal;
      let isFirst = true;
      Array.from(descMap.keys()).sort().forEach(desc => {
        const count = descMap.get(desc)!.length;
        summaryRows.push([
          isFirst ? emp : '',
          desc,
          count.toString(),
        ]);
        isFirst = false;
      });
      summaryRows.push(['', `Subtotal ${emp}`, empTotal.toString()]);
    });

  summaryRows.push(['TOTAL GERAL', '', grandTotal.toString()]);

  autoTable(doc, {
    startY: 40,
    head: [['EMPRESA', 'DESCRIÇÃO', 'QTD']],
    body: summaryRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold' },
      1: { cellWidth: 80 },
      2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      const lastRow = summaryRows.length - 1;
      // Total row
      if (data.row.index === lastRow) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
      // Subtotal rows
      const rowText = summaryRows[data.row.index]?.[1] || '';
      if (rowText.startsWith('Subtotal')) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ─── Detail pages: by Company -> Description -> Vehicle codes ───
  doc.addPage();
  let currentY = 15;

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHAMENTO DOS EQUIPAMENTOS MOBILIZADOS', pageWidth / 2, 12, { align: 'center' });
  currentY = 22;

  Array.from(companyMap.keys())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(emp => {
      const descMap = companyMap.get(emp)!;

      if (currentY > pageHeight - 40) { doc.addPage(); currentY = 15; }

      // Company header
      doc.setFillColor(30, 41, 59);
      doc.rect(14, currentY, pageWidth - 28, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const empTotal = Array.from(descMap.values()).reduce((s, arr) => s + arr.length, 0);
      doc.text(`${emp.toUpperCase()} (${empTotal})`, 16, currentY + 5.5);
      currentY += 11;

      Array.from(descMap.keys()).sort().forEach(desc => {
        const items = descMap.get(desc)!;
        const sorted = [...items].sort((a, b) => a.codigo.localeCompare(b.codigo));

        if (currentY > pageHeight - 30) { doc.addPage(); currentY = 15; }

        doc.setFillColor(71, 85, 105);
        doc.rect(14, currentY, pageWidth - 28, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(`${desc.toUpperCase()} (${items.length})`, 16, currentY + 5);
        currentY += 9;

        const tableData = sorted.map((item, idx) => [
          (idx + 1).toString(),
          item.codigo,
          item.descricao,
          item.categoria || '-',
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['#', 'CÓDIGO', 'EQUIPAMENTO', 'CATEGORIA']],
          body: tableData,
          theme: 'grid',
          styles: { fontSize: 6.5, cellPadding: 1.5 },
          headStyles: { fillColor: [148, 163, 184], textColor: 0, fontStyle: 'bold', fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 25 },
            2: { cellWidth: 65 },
            3: { cellWidth: 35 },
          },
          margin: { left: 14, right: 14 },
          alternateRowStyles: { fillColor: [249, 250, 251] },
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;
      });

      currentY += 4;
    });

  addPageFooters(doc);
  doc.save(`Mobilizados_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════
// DESMOBILIZADOS PDF - Equipment with status desmobilizado/inativo
// ═══════════════════════════════════════════════════════════════════════

export function exportDesmobilizadosPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  obraSettings?: ObraSettings | null
) {
  const demobilized = vehicles.filter(v => {
    const s = (v.status || '').toLowerCase();
    return s === 'desmobilizado' || s === 'inativo';
  });

  if (demobilized.length === 0) {
    return false; // Signal no data
  }

  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  renderNavyHeader(
    doc,
    obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI',
    'RELATÓRIO DE EQUIPAMENTOS DESMOBILIZADOS',
    `${format(selectedDate, 'dd/MM/yyyy')} — Total: ${demobilized.length} equipamentos`
  );

  // ─── Summary by Company ───
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO POR EMPRESA', 14, 35);

  const companyMap = new Map<string, Map<string, VehicleData[]>>();
  demobilized.forEach(v => {
    const emp = v.empresa || 'Não informada';
    const desc = v.descricao || v.categoria || 'Outros';
    if (!companyMap.has(emp)) companyMap.set(emp, new Map());
    const descMap = companyMap.get(emp)!;
    if (!descMap.has(desc)) descMap.set(desc, []);
    descMap.get(desc)!.push(v);
  });

  const summaryRows: string[][] = [];
  let grandTotal = 0;

  Array.from(companyMap.keys())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(emp => {
      const descMap = companyMap.get(emp)!;
      const empTotal = Array.from(descMap.values()).reduce((s, arr) => s + arr.length, 0);
      grandTotal += empTotal;
      let isFirst = true;
      Array.from(descMap.keys()).sort().forEach(desc => {
        const count = descMap.get(desc)!.length;
        summaryRows.push([
          isFirst ? emp : '',
          desc,
          count.toString(),
          '', // Status column
        ]);
        isFirst = false;
      });
    });

  summaryRows.push(['TOTAL GERAL', '', grandTotal.toString(), '']);

  autoTable(doc, {
    startY: 40,
    head: [['EMPRESA', 'DESCRIÇÃO', 'QTD', 'STATUS']],
    body: summaryRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [153, 27, 27], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold' },
      1: { cellWidth: 70 },
      2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 25, halign: 'center' },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [254, 242, 242] },
    didParseCell: (data) => {
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = [153, 27, 27];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ─── Detail pages ───
  doc.addPage();
  let currentY = 15;

  doc.setFillColor(153, 27, 27);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHAMENTO DOS EQUIPAMENTOS DESMOBILIZADOS', pageWidth / 2, 12, { align: 'center' });
  currentY = 22;

  Array.from(companyMap.keys())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .forEach(emp => {
      const descMap = companyMap.get(emp)!;

      if (currentY > pageHeight - 40) { doc.addPage(); currentY = 15; }

      // Company header - dark red theme
      doc.setFillColor(153, 27, 27);
      doc.rect(14, currentY, pageWidth - 28, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const empTotal = Array.from(descMap.values()).reduce((s, arr) => s + arr.length, 0);
      doc.text(`${emp.toUpperCase()} (${empTotal})`, 16, currentY + 5.5);
      currentY += 11;

      Array.from(descMap.keys()).sort().forEach(desc => {
        const items = descMap.get(desc)!;
        const sorted = [...items].sort((a, b) => a.codigo.localeCompare(b.codigo));

        if (currentY > pageHeight - 30) { doc.addPage(); currentY = 15; }

        doc.setFillColor(185, 28, 28);
        doc.rect(14, currentY, pageWidth - 28, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(`${desc.toUpperCase()} (${items.length})`, 16, currentY + 5);
        currentY += 9;

        const tableData = sorted.map((item, idx) => [
          (idx + 1).toString(),
          item.codigo,
          item.descricao,
          item.categoria || '-',
          (item.status || '-').toUpperCase(),
        ]);

        autoTable(doc, {
          startY: currentY,
          head: [['#', 'CÓDIGO', 'EQUIPAMENTO', 'CATEGORIA', 'STATUS']],
          body: tableData,
          theme: 'grid',
          styles: { fontSize: 6.5, cellPadding: 1.5 },
          headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold', fontSize: 7 },
          columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 25 },
            2: { cellWidth: 60 },
            3: { cellWidth: 30 },
            4: { cellWidth: 25, halign: 'center' },
          },
          margin: { left: 14, right: 14 },
          alternateRowStyles: { fillColor: [254, 242, 242] },
        });

        currentY = (doc as any).lastAutoTable.finalY + 5;
      });

      currentY += 4;
    });

  addPageFooters(doc);
  doc.save(`Desmobilizados_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
  return true;
}
