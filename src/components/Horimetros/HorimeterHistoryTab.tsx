import { useState, useMemo } from 'react';
import { Download, FileText, Search, Filter } from 'lucide-react';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Vehicle, HorimeterWithVehicle } from '@/hooks/useHorimeters';

// Company logos as base64
const LOGO_CONSORCIO = '/logo-consorcio.png';
const LOGO_ABASTECH = '/logo-abastech.png';

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
}

function formatNumber(value: number): string {
  if (!value || value === 0) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function HorimeterHistoryTab({ vehicles, readings, loading }: HorimeterHistoryTabProps) {
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all');

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

  const exportToPDF = async () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Header with red background
    doc.setFillColor(180, 30, 30);
    doc.rect(0, 0, pageWidth, 30, 'F');

    // Try to add logos
    try {
      // Left logo - Consórcio
      const img1 = new Image();
      img1.src = LOGO_CONSORCIO;
      doc.addImage(img1, 'PNG', 10, 5, 25, 20);
    } catch (e) {
      console.log('Logo consórcio não encontrado');
    }

    try {
      // Right logo - Abastech
      const img2 = new Image();
      img2.src = LOGO_ABASTECH;
      doc.addImage(img2, 'PNG', pageWidth - 35, 5, 25, 20);
    } catch (e) {
      console.log('Logo abastech não encontrado');
    }

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Histórico de Horímetros', pageWidth / 2, 15, { align: 'center' });

    // Company and project info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 22, { align: 'center' });
    doc.text('Obra: Sistema de Abastecimento de Água', pageWidth / 2, 27, { align: 'center' });

    // Subtitle with date and filters
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    const dateStr = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    let filterInfo = `Gerado em: ${dateStr}`;
    if (empresaFilter !== 'all') {
      filterInfo += ` | Empresa: ${empresaFilter}`;
    }
    if (categoriaFilter !== 'all') {
      filterInfo += ` | Categoria: ${categoriaFilter}`;
    }
    doc.text(filterInfo, pageWidth / 2, 37, { align: 'center' });

    // Table
    const tableData = vehicleSummary.map(item => [
      item.index.toString() + '.',
      item.veiculo,
      item.descricao,
      item.empresa,
      formatNumber(item.horAnterior),
      formatNumber(item.horAtual),
      formatNumber(item.intervaloHor),
      formatNumber(item.kmAnterior),
      formatNumber(item.kmAtual),
      formatNumber(item.intervaloKm),
    ]);

    autoTable(doc, {
      startY: 42,
      head: [[
        '#',
        'Veículo',
        'Descrição',
        'Empresa',
        'Hor. Anterior',
        'Hor. Atual',
        'Intervalo (h)',
        'Km Anterior',
        'Km Atual',
        'Intervalo (km)',
      ]],
      body: tableData,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2,
        halign: 'center',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [180, 30, 30],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22, halign: 'left' },
        2: { cellWidth: 40, halign: 'left' },
        3: { cellWidth: 25, halign: 'left' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 22, halign: 'right' },
        7: { cellWidth: 25, halign: 'right' },
        8: { cellWidth: 25, halign: 'right' },
        9: { cellWidth: 25, halign: 'right' },
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
      didDrawPage: (data) => {
        // Footer on each page
        const pageNumber = data.pageNumber;
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(
          `Página ${pageNumber}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
        doc.text(
          'Sistema Abastech - Gestão de Frota',
          10,
          pageHeight - 8
        );
      },
    });

    // Summary section at the end
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    if (finalY < pageHeight - 30) {
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total de Veículos/Equipamentos: ${vehicleSummary.length}`, 14, finalY);
      
      const totalIntervaloHor = vehicleSummary.reduce((sum, item) => sum + item.intervaloHor, 0);
      const totalIntervaloKm = vehicleSummary.reduce((sum, item) => sum + item.intervaloKm, 0);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Intervalo Horímetros: ${formatNumber(totalIntervaloHor)} h`, 14, finalY + 5);
      doc.text(`Total Intervalo KM: ${formatNumber(totalIntervaloKm)} km`, 14, finalY + 10);
    }

    // Generate filename
    let filename = `historico-horimetros-${format(new Date(), 'yyyy-MM-dd')}`;
    if (empresaFilter !== 'all') {
      filename += `-${empresaFilter.replace(/\s+/g, '-')}`;
    }
    filename += '.pdf';

    doc.save(filename);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

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
        <Button 
          onClick={exportToPDF}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
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

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-red-600 hover:bg-red-600">
                <TableHead className="text-white font-bold text-center w-12">#</TableHead>
                <TableHead className="text-white font-bold">Veículo</TableHead>
                <TableHead className="text-white font-bold">Descrição</TableHead>
                <TableHead className="text-white font-bold">Empresa</TableHead>
                <TableHead className="text-white font-bold text-right">Hor. Anterior</TableHead>
                <TableHead className="text-white font-bold text-right">Hor. Atual</TableHead>
                <TableHead className="text-white font-bold text-right">Intervalo (h)</TableHead>
                <TableHead className="text-white font-bold text-right">Km Anterior</TableHead>
                <TableHead className="text-white font-bold text-right">Km Atual</TableHead>
                <TableHead className="text-white font-bold text-right">Intervalo (km)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleSummary.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado
                  </TableCell>
                </TableRow>
              ) : (
                vehicleSummary.map((item, idx) => (
                  <TableRow key={item.veiculo} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                    <TableCell className="text-center font-medium">{item.index}.</TableCell>
                    <TableCell className="font-semibold text-primary">{item.veiculo}</TableCell>
                    <TableCell>{item.descricao}</TableCell>
                    <TableCell>{item.empresa}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(item.horAnterior)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(item.horAtual)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-amber-600">
                      {formatNumber(item.intervaloHor)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(item.kmAnterior)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(item.kmAtual)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-blue-600">
                      {formatNumber(item.intervaloKm)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{vehicleSummary.length}</strong> veículos/equipamentos
        </span>
        <span>
          Total Intervalo Hor.: <strong className="text-amber-600">
            {formatNumber(vehicleSummary.reduce((sum, item) => sum + item.intervaloHor, 0))} h
          </strong>
        </span>
        <span>
          Total Intervalo Km: <strong className="text-blue-600">
            {formatNumber(vehicleSummary.reduce((sum, item) => sum + item.intervaloKm, 0))} km
          </strong>
        </span>
      </div>
    </div>
  );
}
