import { useState, useMemo } from 'react';
import { Download, FileText, Search, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Vehicle, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { useToast } from '@/hooks/use-toast';

// Company logos as base64
const LOGO_CONSORCIO = '/logo-consorcio.png';
const LOGO_ABASTECH = '/logo-abastech.png';

// Predefined companies for quick export
const PREDEFINED_COMPANIES = ['Engemat', 'L. Pereira', 'A. Barreto'];

interface HorimeterHistoryTabProps {
  vehicles: Vehicle[];
  readings: HorimeterWithVehicle[];
  loading?: boolean;
}

interface VehicleSummary {
  index: number;
  veiculo: string;
  descricao: string;
  empresa: string;
  categoria: string;
  horAnterior: number;
  horAtual: number;
  kmAnterior: number;
  kmAtual: number;
  intervaloHor: number;
  intervaloKm: number;
  isEquipment: boolean;
}

function formatNumber(value: number): string {
  if (!value || value === 0) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatInterval(value: number): string {
  if (!value || value === 0) return '';
  // Remove + symbol, just show the number
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isEquipmentCategory(category: string): boolean {
  if (!category) return false;
  const lowerCat = category.toLowerCase();
  return lowerCat.includes('equipamento') || 
         lowerCat.includes('máquina') ||
         lowerCat.includes('maquina') ||
         lowerCat.includes('trator') ||
         lowerCat.includes('retroescavadeira') ||
         lowerCat.includes('escavadeira') ||
         lowerCat.includes('pá carregadeira') ||
         lowerCat.includes('rolo') ||
         lowerCat.includes('motoniveladora') ||
         lowerCat.includes('compactador') ||
         lowerCat.includes('gerador');
}

export function HorimeterHistoryTab({ vehicles, readings, loading }: HorimeterHistoryTabProps) {
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all');
  const { toast } = useToast();

  // Get unique companies
  const empresas = useMemo(() => {
    const unique = new Set<string>();
    vehicles.forEach(v => {
      if (v.company) unique.add(v.company);
    });
    return Array.from(unique).sort();
  }, [vehicles]);

  // Get unique categories
  const categorias = useMemo(() => {
    const unique = new Set<string>();
    vehicles.forEach(v => {
      if (v.category) unique.add(v.category);
    });
    return Array.from(unique).sort();
  }, [vehicles]);

  // Calculate vehicle summary from readings
  const vehicleSummary = useMemo<VehicleSummary[]>(() => {
    const summary = new Map<string, {
      veiculo: string;
      descricao: string;
      empresa: string;
      categoria: string;
      horAnterior: number;
      horAtual: number;
      kmAnterior: number;
      kmAtual: number;
      oldestDate: Date | null;
      newestDate: Date | null;
    }>();

    // Group readings by vehicle
    readings.forEach(reading => {
      const vehicle = reading.vehicle;
      if (!vehicle) return;

      const veiculo = vehicle.code;
      const existing = summary.get(veiculo);
      const readingDate = new Date(reading.reading_date);

      if (existing) {
        // Track oldest and newest readings
        if (!existing.oldestDate || readingDate < existing.oldestDate) {
          existing.oldestDate = readingDate;
          // Use this reading's previous values as the earliest
          if (reading.previous_value && reading.previous_value > 0) {
            existing.horAnterior = reading.previous_value;
          }
          if (reading.previous_km && reading.previous_km > 0) {
            existing.kmAnterior = reading.previous_km;
          }
        }
        if (!existing.newestDate || readingDate > existing.newestDate) {
          existing.newestDate = readingDate;
          // Use this reading's current values as the latest
          if (reading.current_value > existing.horAtual) {
            existing.horAtual = reading.current_value;
          }
          if (reading.current_km && reading.current_km > existing.kmAtual) {
            existing.kmAtual = reading.current_km;
          }
        }
      } else {
        summary.set(veiculo, {
          veiculo,
          descricao: vehicle.name || vehicle.description || '',
          empresa: vehicle.company || '',
          categoria: vehicle.category || '',
          horAnterior: reading.previous_value || 0,
          horAtual: reading.current_value || 0,
          kmAnterior: reading.previous_km || 0,
          kmAtual: reading.current_km || 0,
          oldestDate: readingDate,
          newestDate: readingDate,
        });
      }
    });

    // Also include vehicles with no readings
    vehicles.forEach(vehicle => {
      if (!summary.has(vehicle.code)) {
        summary.set(vehicle.code, {
          veiculo: vehicle.code,
          descricao: vehicle.name || vehicle.description || '',
          empresa: vehicle.company || '',
          categoria: vehicle.category || '',
          horAnterior: 0,
          horAtual: 0,
          kmAnterior: 0,
          kmAtual: 0,
          oldestDate: null,
          newestDate: null,
        });
      }
    });

    // Convert to array, calculate intervals, and apply filters
    const result = Array.from(summary.values())
      .map((item, idx) => ({
        index: idx + 1,
        veiculo: item.veiculo,
        descricao: item.descricao,
        empresa: item.empresa,
        categoria: item.categoria,
        horAnterior: item.horAnterior,
        horAtual: item.horAtual,
        kmAnterior: item.kmAnterior,
        kmAtual: item.kmAtual,
        intervaloHor: item.horAtual - item.horAnterior,
        intervaloKm: item.kmAtual - item.kmAnterior,
        isEquipment: isEquipmentCategory(item.categoria),
      }))
      .filter(item => {
        // Search filter
        if (search) {
          const searchLower = search.toLowerCase();
          if (!item.veiculo.toLowerCase().includes(searchLower) &&
              !item.descricao.toLowerCase().includes(searchLower) &&
              !item.empresa.toLowerCase().includes(searchLower)) {
            return false;
          }
        }
        // Empresa filter
        if (empresaFilter !== 'all' && item.empresa !== empresaFilter) {
          return false;
        }
        // Categoria filter
        if (categoriaFilter !== 'all' && item.categoria !== categoriaFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.veiculo.localeCompare(b.veiculo));

    // Re-index after filtering
    return result.map((item, idx) => ({ ...item, index: idx + 1 }));
  }, [vehicles, readings, search, empresaFilter, categoriaFilter]);

  // Get all data (unfiltered) for company exports
  const getAllVehicleSummary = useMemo(() => {
    const summary = new Map<string, {
      veiculo: string;
      descricao: string;
      empresa: string;
      categoria: string;
      horAnterior: number;
      horAtual: number;
      kmAnterior: number;
      kmAtual: number;
      oldestDate: Date | null;
      newestDate: Date | null;
    }>();

    readings.forEach(reading => {
      const vehicle = reading.vehicle;
      if (!vehicle) return;

      const veiculo = vehicle.code;
      const existing = summary.get(veiculo);
      const readingDate = new Date(reading.reading_date);

      if (existing) {
        if (!existing.oldestDate || readingDate < existing.oldestDate) {
          existing.oldestDate = readingDate;
          if (reading.previous_value && reading.previous_value > 0) {
            existing.horAnterior = reading.previous_value;
          }
          if (reading.previous_km && reading.previous_km > 0) {
            existing.kmAnterior = reading.previous_km;
          }
        }
        if (!existing.newestDate || readingDate > existing.newestDate) {
          existing.newestDate = readingDate;
          if (reading.current_value > existing.horAtual) {
            existing.horAtual = reading.current_value;
          }
          if (reading.current_km && reading.current_km > existing.kmAtual) {
            existing.kmAtual = reading.current_km;
          }
        }
      } else {
        summary.set(veiculo, {
          veiculo,
          descricao: vehicle.name || vehicle.description || '',
          empresa: vehicle.company || '',
          categoria: vehicle.category || '',
          horAnterior: reading.previous_value || 0,
          horAtual: reading.current_value || 0,
          kmAnterior: reading.previous_km || 0,
          kmAtual: reading.current_km || 0,
          oldestDate: readingDate,
          newestDate: readingDate,
        });
      }
    });

    vehicles.forEach(vehicle => {
      if (!summary.has(vehicle.code)) {
        summary.set(vehicle.code, {
          veiculo: vehicle.code,
          descricao: vehicle.name || vehicle.description || '',
          empresa: vehicle.company || '',
          categoria: vehicle.category || '',
          horAnterior: 0,
          horAtual: 0,
          kmAnterior: 0,
          kmAtual: 0,
          oldestDate: null,
          newestDate: null,
        });
      }
    });

    return Array.from(summary.values()).map(item => ({
      veiculo: item.veiculo,
      descricao: item.descricao,
      empresa: item.empresa,
      categoria: item.categoria,
      horAnterior: item.horAnterior,
      horAtual: item.horAtual,
      kmAnterior: item.kmAnterior,
      kmAtual: item.kmAtual,
      intervaloHor: item.horAtual - item.horAnterior,
      intervaloKm: item.kmAtual - item.kmAnterior,
      isEquipment: isEquipmentCategory(item.categoria),
    }));
  }, [vehicles, readings]);

  const generateCompanyPage = (
    doc: jsPDF,
    companyName: string,
    data: VehicleSummary[],
    isFirstPage: boolean
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    if (!isFirstPage) {
      doc.addPage();
    }

    // Header with soft gray background
    doc.setFillColor(70, 70, 80);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Try to add logos
    try {
      const img1 = new Image();
      img1.src = LOGO_CONSORCIO;
      doc.addImage(img1, 'PNG', 8, 4, 20, 16);
    } catch (e) {
      console.log('Logo consórcio não encontrado');
    }

    try {
      const img2 = new Image();
      img2.src = LOGO_ABASTECH;
      doc.addImage(img2, 'PNG', pageWidth - 28, 4, 20, 16);
    } catch (e) {
      console.log('Logo abastech não encontrado');
    }

    // Company name prominently
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(companyName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });

    // Subtitle
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Histórico de Horímetros', pageWidth / 2, 17, { align: 'center' });

    // Company and project info
    doc.setFontSize(8);
    doc.text('CONSÓRCIO AERO MARAGOGI - Obra: Sistema de Abastecimento de Água', pageWidth / 2, 24, { align: 'center' });

    // Date - below header
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    const dateStr = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
    doc.text(`Data: ${dateStr}`, pageWidth - 10, 34, { align: 'right' });

    // Separate equipment and vehicles
    const equipments = data.filter(item => item.isEquipment).sort((a, b) => a.veiculo.localeCompare(b.veiculo));
    const vehiclesList = data.filter(item => !item.isEquipment).sort((a, b) => a.veiculo.localeCompare(b.veiculo));

    let currentY = 36;
    const tableMargin = 6;
    
    // Calculate available height for tables
    const availableHeight = pageHeight - currentY - 15; // 15mm for footer
    const hasEquipments = equipments.length > 0;
    const hasVehicles = vehiclesList.length > 0;
    
    // Dynamic font size based on data volume
    const totalItems = equipments.length + vehiclesList.length;
    const fontSize = totalItems > 40 ? 6 : totalItems > 25 ? 7 : 8;
    const cellPadding = totalItems > 40 ? 1 : 1.5;

    // Equipments section
    if (hasEquipments) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'bold');
      doc.text(`EQUIPAMENTOS (${equipments.length})`, tableMargin, currentY);
      currentY += 3;

      const equipmentData = equipments.map((item, idx) => [
        (idx + 1).toString(),
        item.veiculo,
        item.descricao.substring(0, 30),
        formatNumber(item.horAnterior),
        formatNumber(item.horAtual),
        formatInterval(item.intervaloHor),
        formatNumber(item.kmAnterior),
        formatNumber(item.kmAtual),
        formatInterval(item.intervaloKm),
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [[
          '#',
          'Código',
          'Descrição',
          'Hor. Ant.',
          'Hor. Atual',
          'Int. (h)',
          'Km Ant.',
          'Km Atual',
          'Int. (km)',
        ]],
        body: equipmentData,
        theme: 'grid',
        tableWidth: pageWidth - (tableMargin * 2),
        margin: { left: tableMargin, right: tableMargin },
        styles: {
          fontSize: fontSize,
          cellPadding: cellPadding,
          halign: 'center',
          valign: 'middle',
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [100, 100, 110],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: fontSize,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 22, halign: 'left' },
          2: { cellWidth: 'auto', halign: 'left' },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
        },
      });

      currentY = (doc as any).lastAutoTable.finalY + 4;
    }

    // Vehicles section
    if (hasVehicles) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'bold');
      doc.text(`VEÍCULOS (${vehiclesList.length})`, tableMargin, currentY);
      currentY += 3;

      const vehicleData = vehiclesList.map((item, idx) => [
        (idx + 1).toString(),
        item.veiculo,
        item.descricao.substring(0, 30),
        formatNumber(item.horAnterior),
        formatNumber(item.horAtual),
        formatInterval(item.intervaloHor),
        formatNumber(item.kmAnterior),
        formatNumber(item.kmAtual),
        formatInterval(item.intervaloKm),
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [[
          '#',
          'Código',
          'Descrição',
          'Hor. Ant.',
          'Hor. Atual',
          'Int. (h)',
          'Km Ant.',
          'Km Atual',
          'Int. (km)',
        ]],
        body: vehicleData,
        theme: 'grid',
        tableWidth: pageWidth - (tableMargin * 2),
        margin: { left: tableMargin, right: tableMargin },
        styles: {
          fontSize: fontSize,
          cellPadding: cellPadding,
          halign: 'center',
          valign: 'middle',
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
        },
        headStyles: {
          fillColor: [120, 140, 160],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: fontSize,
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 22, halign: 'left' },
          2: { cellWidth: 'auto', halign: 'left' },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
          6: { cellWidth: 22, halign: 'right' },
          7: { cellWidth: 22, halign: 'right' },
          8: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        bodyStyles: {
          fillColor: [255, 255, 255],
        },
      });
    }

    // Footer - subtle line
    doc.setDrawColor(180, 180, 180);
    doc.line(tableMargin, pageHeight - 10, pageWidth - tableMargin, pageHeight - 10);
    
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `${companyName} | Total: ${data.length} itens`,
      tableMargin,
      pageHeight - 6
    );
    doc.text(
      'Sistema Abastech',
      pageWidth - tableMargin,
      pageHeight - 6,
      { align: 'right' }
    );
  };

  const exportToPDF = async (companyFilter?: string) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const dataToExport = companyFilter 
      ? vehicleSummary 
      : getAllVehicleSummary.filter(item => empresaFilter === 'all' || item.empresa === empresaFilter);

    if (dataToExport.length === 0) {
      toast({
        title: 'Nenhum dado',
        description: 'Não há dados para exportar com os filtros atuais.',
        variant: 'destructive',
      });
      return null;
    }

    const companyName = companyFilter || (empresaFilter !== 'all' ? empresaFilter : 'Todas as Empresas');
    
    generateCompanyPage(doc, companyName, dataToExport as VehicleSummary[], true);

    // Generate filename
    let filename = `horimetros-${format(new Date(), 'yyyy-MM-dd')}`;
    if (companyFilter || empresaFilter !== 'all') {
      filename += `-${(companyFilter || empresaFilter).replace(/\s+/g, '-')}`;
    }
    filename += '.pdf';

    return { doc, filename };
  };

  const exportAllCompanies = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    let isFirst = true;

    for (const company of PREDEFINED_COMPANIES) {
      const companyData = getAllVehicleSummary.filter(item => 
        item.empresa.toLowerCase().includes(company.toLowerCase())
      );

      if (companyData.length > 0) {
        generateCompanyPage(doc, company, companyData as VehicleSummary[], isFirst);
        isFirst = false;
      }
    }

    if (isFirst) {
      toast({
        title: 'Nenhum dado',
        description: 'Não há dados para as empresas selecionadas.',
        variant: 'destructive',
      });
      return;
    }

    const filename = `horimetros-completo-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(filename);
    
    toast({
      title: 'PDF Exportado',
      description: 'Relatório com todas as empresas gerado com sucesso.',
    });
  };

  const exportSingleCompany = async (company: string) => {
    const companyData = getAllVehicleSummary.filter(item => 
      item.empresa.toLowerCase().includes(company.toLowerCase())
    );

    if (companyData.length === 0) {
      toast({
        title: 'Nenhum dado',
        description: `Não há dados para ${company}.`,
        variant: 'destructive',
      });
      return;
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    generateCompanyPage(doc, company, companyData as VehicleSummary[], true);

    const filename = `horimetros-${company.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(filename);

    toast({
      title: 'PDF Exportado',
      description: `Relatório de ${company} gerado com sucesso.`,
    });
  };

  const exportCurrentFilter = async () => {
    const result = await exportToPDF();
    if (result) {
      result.doc.save(result.filename);
      toast({
        title: 'PDF Exportado',
        description: 'Relatório gerado com sucesso.',
      });
    }
  };

  const shareViaWhatsApp = async (company?: string) => {
    const result = await exportToPDF(company);
    if (!result) return;

    // Generate blob
    const pdfBlob = result.doc.output('blob');

    // Check if Web Share API is supported
    if (navigator.share && navigator.canShare) {
      const file = new File([pdfBlob], result.filename, { type: 'application/pdf' });
      
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Relatório de Horímetros',
            text: `Relatório de Horímetros - ${company || 'Geral'} - ${format(new Date(), 'dd/MM/yyyy')}`,
          });
          toast({
            title: 'Compartilhado',
            description: 'Relatório enviado com sucesso.',
          });
          return;
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Erro ao compartilhar:', error);
          }
        }
      }
    }

    // Fallback: download PDF and open WhatsApp with message
    result.doc.save(result.filename);
    
    const message = encodeURIComponent(
      `📊 *Relatório de Horímetros*\n` +
      `📅 Data: ${format(new Date(), 'dd/MM/yyyy')}\n` +
      `🏢 Empresa: ${company || 'Todas'}\n\n` +
      `Segue em anexo o relatório de horímetros.`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
    
    toast({
      title: 'PDF baixado',
      description: 'Anexe o PDF baixado na conversa do WhatsApp.',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Separate for display
  const equipmentsSummary = vehicleSummary.filter(item => item.isEquipment);
  const vehiclesSummary = vehicleSummary.filter(item => !item.isEquipment);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Histórico de Horímetros
          </h3>
          <p className="text-sm text-muted-foreground">
            Resumo consolidado por veículo/equipamento
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Quick export buttons for predefined companies */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="w-4 h-4" />
                Exportar PDF
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={exportCurrentFilter}>
                <Download className="w-4 h-4 mr-2" />
                Filtro Atual
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={exportAllCompanies}>
                <FileText className="w-4 h-4 mr-2" />
                Todas Empresas (Separado)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PREDEFINED_COMPANIES.map(company => (
                <DropdownMenuItem key={company} onClick={() => exportSingleCompany(company)}>
                  <Download className="w-4 h-4 mr-2" />
                  {company}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* WhatsApp share */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50">
                <Share2 className="w-4 h-4" />
                WhatsApp
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => shareViaWhatsApp()}>
                <Share2 className="w-4 h-4 mr-2" />
                Enviar Filtro Atual
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PREDEFINED_COMPANIES.map(company => (
                <DropdownMenuItem key={company} onClick={() => shareViaWhatsApp(company)}>
                  <Share2 className="w-4 h-4 mr-2" />
                  {company}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar veículo, descrição ou empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Empresas</SelectItem>
            {empresas.map(emp => (
              <SelectItem key={emp} value={emp}>{emp}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            {categorias.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Equipments Table */}
      {equipmentsSummary.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            EQUIPAMENTOS ({equipmentsSummary.length})
          </h4>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-600 hover:bg-slate-600">
                    <TableHead className="text-white font-bold text-center w-12">#</TableHead>
                    <TableHead className="text-white font-bold">Código</TableHead>
                    <TableHead className="text-white font-bold">Descrição</TableHead>
                    <TableHead className="text-white font-bold">Empresa</TableHead>
                    <TableHead className="text-white font-bold text-right">Hor. Ant.</TableHead>
                    <TableHead className="text-white font-bold text-right">Hor. Atual</TableHead>
                    <TableHead className="text-white font-bold text-right">Int. (h)</TableHead>
                    <TableHead className="text-white font-bold text-right">Km Ant.</TableHead>
                    <TableHead className="text-white font-bold text-right">Km Atual</TableHead>
                    <TableHead className="text-white font-bold text-right">Int. (km)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipmentsSummary.map((item, idx) => (
                    <TableRow key={item.veiculo} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <TableCell className="text-center font-medium text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-semibold text-primary">{item.veiculo}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell className="font-medium">{item.empresa}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.horAnterior)}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.horAtual)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-amber-600">
                        {formatInterval(item.intervaloHor)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.kmAnterior)}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.kmAtual)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-blue-600">
                        {formatInterval(item.intervaloKm)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Vehicles Table */}
      {vehiclesSummary.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            VEÍCULOS ({vehiclesSummary.length})
          </h4>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-500 hover:bg-slate-500">
                    <TableHead className="text-white font-bold text-center w-12">#</TableHead>
                    <TableHead className="text-white font-bold">Código</TableHead>
                    <TableHead className="text-white font-bold">Descrição</TableHead>
                    <TableHead className="text-white font-bold">Empresa</TableHead>
                    <TableHead className="text-white font-bold text-right">Hor. Ant.</TableHead>
                    <TableHead className="text-white font-bold text-right">Hor. Atual</TableHead>
                    <TableHead className="text-white font-bold text-right">Int. (h)</TableHead>
                    <TableHead className="text-white font-bold text-right">Km Ant.</TableHead>
                    <TableHead className="text-white font-bold text-right">Km Atual</TableHead>
                    <TableHead className="text-white font-bold text-right">Int. (km)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehiclesSummary.map((item, idx) => (
                    <TableRow key={item.veiculo} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                      <TableCell className="text-center font-medium text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-semibold text-primary">{item.veiculo}</TableCell>
                      <TableCell>{item.descricao}</TableCell>
                      <TableCell className="font-medium">{item.empresa}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.horAnterior)}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.horAtual)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-amber-600">
                        {formatInterval(item.intervaloHor)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.kmAnterior)}</TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(item.kmAtual)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-blue-600">
                        {formatInterval(item.intervaloKm)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {vehicleSummary.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Nenhum registro encontrado
        </div>
      )}

      {/* Summary - only count, no totals */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{vehicleSummary.length}</strong> itens no total
        </span>
        <span>
          <strong className="text-red-600">{equipmentsSummary.length}</strong> equipamentos
        </span>
        <span>
          <strong className="text-blue-600">{vehiclesSummary.length}</strong> veículos
        </span>
      </div>
    </div>
  );
}
