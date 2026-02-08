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

/**
 * PDF: Mobilização de Equipamentos
 * Page 1: Summary table (Descrição x Empresa x Necessidade/Mobilizado/A Mobilizar)
 * Page 2+: Detail per equipment type
 */
export function exportMobilizacaoPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  obraSettings?: ObraSettings | null
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ======= PAGE 1: SUMMARY =======
  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(11);
  doc.text('MOBILIZAÇÃO DE EQUIPAMENTOS', pageWidth / 2, 18, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`ATUALIZADO EM: ${format(selectedDate, 'dd/MM/yyyy')}`, pageWidth / 2, 23, { align: 'center' });

  // Subtitle
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMO GERAL DOS EQUIPAMENTOS ATIVOS POR GRUPO X EMPRESA', 14, 35);

  // Build summary data: group by descricao, then by empresa
  const summaryMap = new Map<string, Map<string, { total: number; mobilizado: number }>>();

  vehicles.forEach(v => {
    const desc = v.descricao || v.categoria || 'Outros';
    const empresa = v.empresa || 'Não informada';
    const statusLower = (v.status || 'ativo').toLowerCase();

    if (!summaryMap.has(desc)) {
      summaryMap.set(desc, new Map());
    }
    const empresaMap = summaryMap.get(desc)!;
    if (!empresaMap.has(empresa)) {
      empresaMap.set(empresa, { total: 0, mobilizado: 0 });
    }
    const entry = empresaMap.get(empresa)!;
    entry.total++;
    if (['ativo', 'mobilizado'].includes(statusLower)) {
      entry.mobilizado++;
    }
  });

  // Build table rows
  const summaryRows: string[][] = [];
  let grandTotal = 0;
  let grandMobilizado = 0;
  let grandAMobilizar = 0;

  const sortedDescs = Array.from(summaryMap.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  sortedDescs.forEach(desc => {
    const empresaMap = summaryMap.get(desc)!;
    const sortedEmpresas = Array.from(empresaMap.keys()).sort();
    let isFirst = true;

    sortedEmpresas.forEach(empresa => {
      const data = empresaMap.get(empresa)!;
      const aMobilizar = data.total - data.mobilizado;
      grandTotal += data.total;
      grandMobilizado += data.mobilizado;
      grandAMobilizar += aMobilizar;

      summaryRows.push([
        isFirst ? desc : '',
        empresa,
        data.total.toString(),
        data.mobilizado.toString(),
        aMobilizar > 0 ? aMobilizar.toString() : '',
      ]);
      isFirst = false;
    });
  });

  // Total row
  summaryRows.push([
    'TOTAL GERAL',
    '',
    grandTotal.toString(),
    grandMobilizado.toString(),
    grandAMobilizar > 0 ? grandAMobilizar.toString() : '',
  ]);

  autoTable(doc, {
    startY: 40,
    head: [['DESCRIÇÃO', 'EMPRESA', 'NECESSIDADE', 'MOBILIZADO', 'A MOBILIZAR']],
    body: summaryRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
    },
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
      // Bold total row
      if (data.row.index === summaryRows.length - 1) {
        data.cell.styles.fillColor = [30, 41, 59];
        data.cell.styles.textColor = 255;
        data.cell.styles.fontStyle = 'bold';
      }
      // Bold description cells
      if (data.column.index === 0 && data.cell.text[0] !== '') {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ======= PAGE 2+: DETAIL BY EQUIPMENT TYPE =======
  // Group by descricao, then list each vehicle
  const detailGroups = new Map<string, VehicleData[]>();
  vehicles.forEach(v => {
    const desc = v.descricao || v.categoria || 'Outros';
    if (!detailGroups.has(desc)) {
      detailGroups.set(desc, []);
    }
    detailGroups.get(desc)!.push(v);
  });

  doc.addPage();
  let currentY = 15;

  // Header on detail pages
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 18, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALHAMENTO POR TIPO DE EQUIPAMENTO', pageWidth / 2, 12, { align: 'center' });
  currentY = 22;

  const sortedDetailDescs = Array.from(detailGroups.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  sortedDetailDescs.forEach(desc => {
    const items = detailGroups.get(desc)!;
    const sortedItems = [...items].sort((a, b) => a.empresa.localeCompare(b.empresa) || a.codigo.localeCompare(b.codigo));

    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = 15;
    }

    // Equipment type header
    doc.setFillColor(71, 85, 105);
    doc.rect(14, currentY, pageWidth - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${desc.toUpperCase()} (${items.length})`, 16, currentY + 5);
    currentY += 9;

    const tableData = sortedItems.map((item, idx) => [
      (idx + 1).toString(),
      item.codigo,
      item.empresa,
      item.descricao,
      item.categoria || '-',
      (item.status || 'Ativo').toUpperCase(),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['ITEM', 'CÓDIGO', 'PROPRIETÁRIO', 'EQUIPAMENTO', 'CATEGORIA', 'STATUS']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: {
        fillColor: [148, 163, 184],
        textColor: 0,
        fontStyle: 'bold',
        fontSize: 7,
      },
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

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7);
    doc.text('Sistema Abastech - Gestão de Frota', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeight - 8);
  }

  doc.save(`Mobilizacao_Equipamentos_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}

/**
 * PDF: Efetivo / Apontamento Diário de Equipamentos
 * Single landscape page with columns per company + Manutenção + Disponível
 */
export function exportEfetivoPDF(
  vehicles: VehicleData[],
  selectedDate: Date,
  maintenanceOrders: ServiceOrderData[],
  obraSettings?: ObraSettings | null
) {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Header
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(obraSettings?.nome?.toUpperCase() || 'AEROPORTO MARAGOGI', pageWidth / 2, 10, { align: 'center' });
  doc.setFontSize(10);
  doc.text('APONTAMENTOS DIÁRIOS DE EQUIPAMENTOS', pageWidth / 2, 18, { align: 'center' });

  // Date info
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data: ${format(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}`, 14, 30);

  // Get unique companies
  const companiesSet = new Set<string>();
  vehicles.forEach(v => {
    if (v.empresa) companiesSet.add(v.empresa);
  });
  const companies = Array.from(companiesSet).sort();

  // Get vehicles in maintenance (from service_orders)
  const maintenanceVehicleCodes = new Set(
    maintenanceOrders
      .filter(o => ['Em Manutenção', 'Em Andamento', 'Aberta', 'Aguardando Peças'].includes(o.status))
      .map(o => o.vehicle_code)
  );

  // Group by description
  const descGroups = new Map<string, VehicleData[]>();
  vehicles.forEach(v => {
    const desc = v.descricao || v.categoria || 'Outros';
    if (!descGroups.has(desc)) {
      descGroups.set(desc, []);
    }
    descGroups.get(desc)!.push(v);
  });

  const sortedDescs = Array.from(descGroups.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Build table
  const headers = ['Item', 'Descrição', 'Total', ...companies, 'Manutenção', 'Disponível no dia'];

  const tableData: string[][] = [];
  let totalGeneral = 0;
  const companyTotals = new Map<string, number>();
  companies.forEach(c => companyTotals.set(c, 0));
  let totalMaintenance = 0;
  let totalAvailable = 0;

  sortedDescs.forEach((desc, idx) => {
    const items = descGroups.get(desc)!;
    const total = items.length;
    totalGeneral += total;

    const companyCounts: number[] = companies.map(company => {
      const count = items.filter(v => v.empresa === company).length;
      companyTotals.set(company, (companyTotals.get(company) || 0) + count);
      return count;
    });

    const maintenanceCount = items.filter(v => maintenanceVehicleCodes.has(v.codigo)).length;
    totalMaintenance += maintenanceCount;

    const available = total - maintenanceCount;
    totalAvailable += available;

    tableData.push([
      (idx + 1).toString(),
      desc,
      total.toString(),
      ...companyCounts.map(c => c > 0 ? c.toString() : ''),
      maintenanceCount > 0 ? maintenanceCount.toString() : '',
      available > 0 ? available.toString() : '',
    ]);
  });

  // Total row
  tableData.push([
    'Total',
    '',
    totalGeneral.toString(),
    ...companies.map(c => {
      const val = companyTotals.get(c) || 0;
      return val > 0 ? val.toString() : '';
    }),
    totalMaintenance > 0 ? totalMaintenance.toString() : '',
    totalAvailable > 0 ? totalAvailable.toString() : '',
  ]);

  // Column widths
  const availWidth = pageWidth - 28;
  const fixedCols = 3; // Item, Descrição, Total
  const dynamicCols = companies.length + 2; // companies + Manutenção + Disponível
  const itemW = 12;
  const descW = 50;
  const totalW = 15;
  const dynamicW = Math.max(18, (availWidth - itemW - descW - totalW) / dynamicCols);

  const columnStyles: Record<number, any> = {
    0: { cellWidth: itemW, halign: 'center' },
    1: { cellWidth: descW },
    2: { cellWidth: totalW, halign: 'center', fontStyle: 'bold' },
  };

  companies.forEach((_, i) => {
    columnStyles[3 + i] = { cellWidth: dynamicW, halign: 'center' };
  });
  columnStyles[3 + companies.length] = { cellWidth: dynamicW, halign: 'center' };
  columnStyles[4 + companies.length] = { cellWidth: dynamicW, halign: 'center' };

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
      // Red background for Manutenção column header and values > 0
      const maintenanceColIdx = 3 + companies.length;
      if (data.column.index === maintenanceColIdx && data.section === 'body') {
        const val = parseInt(data.cell.text[0] || '0');
        if (val > 0) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  let afterTableY = (doc as any).lastAutoTable.finalY + 10;

  // ============ MAINTENANCE SUMMARY ============
  if (maintenanceOrders.length > 0) {
    if (afterTableY > pageHeight - 50) {
      doc.addPage();
      afterTableY = 20;
    }

    doc.setFillColor(245, 158, 11);
    doc.rect(14, afterTableY, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`RELATÓRIO SIMPLIFICADO DE MANUTENÇÃO (${maintenanceOrders.length})`, 16, afterTableY + 5.5);
    afterTableY += 10;

    const maintenanceData = maintenanceOrders.map(o => [
      o.vehicle_code,
      o.vehicle_description || '-',
      (o.problem_description || '-').substring(0, 60),
      o.entry_date || '-',
    ]);

    autoTable(doc, {
      startY: afterTableY,
      head: [['Código', 'Descrição', 'Problema', 'Data Entrada']],
      body: maintenanceData,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 2 },
      headStyles: {
        fillColor: [217, 119, 6],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
      },
      margin: { left: 14, right: 14 },
      alternateRowStyles: { fillColor: [254, 252, 232] },
    });
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(7);
    doc.text('Sistema Abastech - Gestão de Frota', 14, pageHeight - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeight - 8);
  }

  doc.save(`Efetivo_Equipamentos_${format(selectedDate, 'dd-MM-yyyy')}.pdf`);
}
