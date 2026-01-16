import { useState, useMemo } from 'react';
import { 
  Truck, 
  ChevronDown, 
  ChevronUp, 
  Download, 
  Building2,
  Wrench,
  Users,
  Car,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface VehicleItem {
  codigo: string;
  descricao: string;
  empresa: string;
  categoria: string;
  status: string;
}

interface MobilizedEquipmentsViewProps {
  vehicles: VehicleItem[];
  selectedDate: Date;
  onVehicleClick?: (vehicle: VehicleItem) => void;
}

interface EquipmentCount {
  descricao: string;
  quantidade: number;
  items: VehicleItem[];
}

interface CompanyGroup {
  empresa: string;
  total: number;
  equipamentos: EquipmentCount[];
}

// Grouping order for special sections
const SPECIAL_SECTIONS = ['Consórcio', 'Terceiros', 'Terceiro', 'Veículos Leves'];

export function MobilizedEquipmentsView({ 
  vehicles, 
  selectedDate,
  onVehicleClick 
}: MobilizedEquipmentsViewProps) {
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [detailModal, setDetailModal] = useState<{ 
    open: boolean; 
    empresa: string; 
    equipamentos: EquipmentCount[] 
  } | null>(null);

  // Group vehicles by empresa and then by descricao for counting
  const companyGroups = useMemo<CompanyGroup[]>(() => {
    const groups = new Map<string, Map<string, VehicleItem[]>>();
    
    // Only active vehicles
    vehicles
      .filter(v => !v.status || v.status.toLowerCase() === 'ativo')
      .forEach(vehicle => {
        const empresa = vehicle.empresa || 'Não informada';
        const descricao = vehicle.descricao || vehicle.categoria || 'Outros';
        
        if (!groups.has(empresa)) {
          groups.set(empresa, new Map());
        }
        const empresaGroup = groups.get(empresa)!;
        
        if (!empresaGroup.has(descricao)) {
          empresaGroup.set(descricao, []);
        }
        empresaGroup.get(descricao)!.push(vehicle);
      });

    // Convert to array format
    const result: CompanyGroup[] = [];
    
    groups.forEach((equipMap, empresa) => {
      const equipamentos: EquipmentCount[] = [];
      let total = 0;
      
      equipMap.forEach((items, descricao) => {
        equipamentos.push({
          descricao,
          quantidade: items.length,
          items
        });
        total += items.length;
      });
      
      // Sort equipamentos by name
      equipamentos.sort((a, b) => a.descricao.localeCompare(b.descricao));
      
      result.push({ empresa, total, equipamentos });
    });

    // Sort: main companies first, then special sections, then others
    return result.sort((a, b) => {
      const aIsSpecial = SPECIAL_SECTIONS.some(s => a.empresa.toLowerCase().includes(s.toLowerCase()));
      const bIsSpecial = SPECIAL_SECTIONS.some(s => b.empresa.toLowerCase().includes(s.toLowerCase()));
      
      if (aIsSpecial && !bIsSpecial) return 1;
      if (!aIsSpecial && bIsSpecial) return -1;
      return a.empresa.localeCompare(b.empresa);
    });
  }, [vehicles]);

  // Regular companies (not special sections)
  const regularCompanies = companyGroups.filter(
    g => !SPECIAL_SECTIONS.some(s => g.empresa.toLowerCase().includes(s.toLowerCase()))
  );

  // Special section companies
  const specialCompanies = companyGroups.filter(
    g => SPECIAL_SECTIONS.some(s => g.empresa.toLowerCase().includes(s.toLowerCase()))
  );

  // Total count
  const totalGeral = companyGroups.reduce((sum, g) => sum + g.total, 0);

  // Get company color based on name
  const getCompanyColor = (empresa: string) => {
    const name = empresa.toLowerCase();
    if (name.includes('engemat')) return 'from-blue-500 to-blue-600';
    if (name.includes('barreto')) return 'from-emerald-500 to-emerald-600';
    if (name.includes('pereira')) return 'from-purple-500 to-purple-600';
    if (name.includes('consórcio') || name.includes('consorcio')) return 'from-amber-500 to-amber-600';
    if (name.includes('terceiro')) return 'from-rose-500 to-rose-600';
    if (name.includes('leve')) return 'from-cyan-500 to-cyan-600';
    return 'from-gray-500 to-gray-600';
  };

  const getCompanyIcon = (empresa: string) => {
    const name = empresa.toLowerCase();
    if (name.includes('leve')) return <Car className="w-5 h-5" />;
    if (name.includes('terceiro')) return <Users className="w-5 h-5" />;
    return <Wrench className="w-5 h-5" />;
  };

  // Open detail modal
  const handleCardClick = (group: CompanyGroup) => {
    setDetailModal({
      open: true,
      empresa: group.empresa,
      equipamentos: group.equipamentos
    });
  };

  // Export PDF in the same format as the uploaded document
  const exportToPDF = () => {
    const doc = new jsPDF('portrait');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header with red/burgundy theme
    doc.setFillColor(139, 0, 0); // Dark red
    doc.rect(0, 0, pageWidth, 30, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSTRUTORA CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 12, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text('EQUIPAMENTOS MOBILIZADOS', pageWidth / 2, 22, { align: 'center' });
    
    // Date and generation info
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Referência: ${format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`, 14, 40);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth - 60, 40);
    
    let currentY = 50;
    
    // Regular companies in a multi-column layout (up to 3 columns)
    if (regularCompanies.length > 0) {
      const colWidth = (pageWidth - 30) / Math.min(regularCompanies.length, 3);
      
      // Draw headers for each company
      regularCompanies.slice(0, 3).forEach((company, idx) => {
        const colX = 14 + (idx * colWidth);
        
        // Company header
        doc.setFillColor(139, 0, 0);
        doc.rect(colX, currentY, colWidth - 2, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(company.empresa, colX + 2, currentY + 5.5);
        doc.text('Qtd', colX + colWidth - 14, currentY + 5.5);
      });
      
      currentY += 10;
      
      // Find max rows needed
      const maxRows = Math.max(...regularCompanies.slice(0, 3).map(c => c.equipamentos.length));
      
      // Draw equipment rows
      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        regularCompanies.slice(0, 3).forEach((company, colIdx) => {
          const colX = 14 + (colIdx * colWidth);
          const equip = company.equipamentos[rowIdx];
          
          if (equip) {
            // Alternating row colors
            if (rowIdx % 2 === 0) {
              doc.setFillColor(248, 248, 248);
              doc.rect(colX, currentY, colWidth - 2, 6, 'F');
            }
            
            doc.setTextColor(60, 60, 60);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            
            // Truncate long names
            const displayName = equip.descricao.length > 22 
              ? equip.descricao.substring(0, 20) + '...'
              : equip.descricao;
            doc.text(displayName, colX + 2, currentY + 4);
            doc.text(equip.quantidade.toString(), colX + colWidth - 10, currentY + 4);
          }
        });
        currentY += 6;
      }
      
      // Totals row for each company
      regularCompanies.slice(0, 3).forEach((company, colIdx) => {
        const colX = 14 + (colIdx * colWidth);
        doc.setFillColor(220, 220, 220);
        doc.rect(colX, currentY, colWidth - 2, 7, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('Total', colX + 2, currentY + 5);
        doc.text(company.total.toString(), colX + colWidth - 10, currentY + 5);
      });
      
      currentY += 15;
    }
    
    // Special sections (Consórcio, Terceiros, Veículos Leves)
    specialCompanies.forEach(company => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
      
      // Section header
      doc.setFillColor(139, 0, 0);
      doc.rect(14, currentY, pageWidth - 28, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(company.empresa, 16, currentY + 5.5);
      
      currentY += 10;
      
      // Equipment table
      const tableData = company.equipamentos.map(e => [e.descricao, e.quantidade.toString()]);
      
      autoTable(doc, {
        startY: currentY,
        head: [['Equipamentos', 'Qtd']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [100, 100, 100], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 140 },
          1: { cellWidth: 20, halign: 'center' }
        },
        foot: [['Total', company.total.toString()]],
        footStyles: { fillColor: [220, 220, 220], textColor: [0, 0, 0], fontStyle: 'bold' },
        margin: { left: 14, right: 14 }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 10;
    });
    
    // Total Geral
    if (currentY > 260) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFillColor(139, 0, 0);
    doc.rect(14, currentY, pageWidth - 28, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Geral', 16, currentY + 8);
    doc.text(totalGeral.toString(), pageWidth - 30, currentY + 8);
    
    // Footer
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Sistema Abastech - Gestão de Frota', 14, pageHeight - 10);
    doc.text(`Página 1`, pageWidth - 25, pageHeight - 10);
    
    doc.save(`equipamentos-mobilizados-${format(selectedDate, 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Equipamentos Mobilizados</h2>
          <p className="text-sm text-muted-foreground">
            {format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
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

      {/* Main Companies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {regularCompanies.map(company => (
          <Card 
            key={company.empresa}
            className={cn(
              "cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]",
              expandedCompany === company.empresa && "ring-2 ring-primary"
            )}
            onClick={() => handleCardClick(company)}
          >
            <CardHeader className={cn(
              "bg-gradient-to-r text-white rounded-t-lg",
              getCompanyColor(company.empresa)
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  <CardTitle className="text-lg">{company.empresa}</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-white/20 text-white text-lg font-bold px-3">
                  {company.total}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {company.equipamentos.slice(0, 5).map(equip => (
                  <div 
                    key={equip.descricao}
                    className="flex items-center justify-between px-4 py-2 hover:bg-muted/50"
                  >
                    <span className="text-sm truncate flex-1">{equip.descricao}</span>
                    <Badge variant="outline" className="ml-2 shrink-0">
                      {equip.quantidade}
                    </Badge>
                  </div>
                ))}
                {company.equipamentos.length > 5 && (
                  <div className="px-4 py-2 text-center text-sm text-muted-foreground">
                    + {company.equipamentos.length - 5} mais...
                  </div>
                )}
              </div>
              <div className="px-4 py-3 bg-muted/30 border-t flex items-center justify-between">
                <span className="font-semibold text-sm">Total</span>
                <span className="font-bold text-lg text-primary">{company.total}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Special Sections */}
      {specialCompanies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {specialCompanies.map(company => (
            <Card 
              key={company.empresa}
              className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
              onClick={() => handleCardClick(company)}
            >
              <CardHeader className={cn(
                "bg-gradient-to-r text-white rounded-t-lg py-3",
                getCompanyColor(company.empresa)
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getCompanyIcon(company.empresa)}
                    <CardTitle className="text-base">{company.empresa}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="bg-white/20 text-white font-bold">
                    {company.total}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border max-h-40 overflow-y-auto">
                  {company.equipamentos.map(equip => (
                    <div 
                      key={equip.descricao}
                      className="flex items-center justify-between px-3 py-1.5 hover:bg-muted/50"
                    >
                      <span className="text-xs truncate flex-1">{equip.descricao}</span>
                      <Badge variant="outline" className="ml-2 shrink-0 text-xs">
                        {equip.quantidade}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Total Geral */}
      <Card className="bg-gradient-to-r from-red-600 to-red-700 text-white">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Truck className="w-10 h-10" />
              <div>
                <p className="text-red-200 text-sm font-medium">TOTAL GERAL</p>
                <p className="text-sm text-red-100">Todos os equipamentos mobilizados</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold">{totalGeral}</p>
              <p className="text-red-200 text-sm">unidades</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={detailModal?.open} onOpenChange={(open) => !open && setDetailModal(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {detailModal?.empresa}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted">
                  <TableHead>Equipamento / Descrição</TableHead>
                  <TableHead className="text-center w-20">Qtd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailModal?.equipamentos.map(equip => (
                  <TableRow 
                    key={equip.descricao}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      // Optionally expand to show individual items
                    }}
                  >
                    <TableCell className="font-medium">{equip.descricao}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-bold">
                        {equip.quantidade}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Show individual items if only one type selected */}
            {detailModal?.equipamentos.length === 1 && (
              <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                <h4 className="font-semibold mb-2">Detalhamento:</h4>
                <div className="space-y-1">
                  {detailModal.equipamentos[0].items.map(item => (
                    <div 
                      key={item.codigo}
                      className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted cursor-pointer"
                      onClick={() => onVehicleClick?.(item)}
                    >
                      <span className="font-mono text-sm text-primary">{item.codigo}</span>
                      <span className="text-sm text-muted-foreground">{item.categoria}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t pt-4 flex items-center justify-between">
            <span className="font-semibold">Total</span>
            <Badge className="text-lg px-4 py-1">
              {detailModal?.equipamentos.reduce((sum, e) => sum + e.quantidade, 0)}
            </Badge>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
