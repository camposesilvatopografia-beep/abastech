import { useState, useMemo } from 'react';
import { 
  Truck, 
  ChevronDown, 
  ChevronRight, 
  Download, 
  Building2,
  Wrench,
  Users,
  Car,
  Edit,
  Eye,
  Share2
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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

interface StatusGroup {
  status: string;
  total: number;
  companies: CompanyGroup[];
}

// Grouping order for special sections
const SPECIAL_SECTIONS = ['Consórcio', 'Terceiros', 'Terceiro', 'Veículos Leves'];

// Status labels and colors
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  'ativo': { label: 'ATIVOS', color: 'text-green-700', bgColor: 'bg-green-50' },
  'inativo': { label: 'INATIVOS', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  'em manutenção': { label: 'EM MANUTENÇÃO', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  'manutencao': { label: 'EM MANUTENÇÃO', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  'desmobilizado': { label: 'DESMOBILIZADOS', color: 'text-red-600', bgColor: 'bg-red-50' },
};

export function MobilizedEquipmentsView({ 
  vehicles, 
  selectedDate,
  onVehicleClick 
}: MobilizedEquipmentsViewProps) {
  const [detailModal, setDetailModal] = useState<{ 
    open: boolean; 
    empresa: string; 
    equipamentos: EquipmentCount[] 
  } | null>(null);
  const [expandedDescricao, setExpandedDescricao] = useState<string | null>(null);

  // Group vehicles by empresa and then by descricao for counting
  const companyGroups = useMemo<CompanyGroup[]>(() => {
    const groups = new Map<string, Map<string, VehicleItem[]>>();
    
    // Only active vehicles for main view
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

  // Group ALL vehicles by status for PDF export
  const statusGroups = useMemo<StatusGroup[]>(() => {
    const statusMap = new Map<string, Map<string, Map<string, VehicleItem[]>>>();
    
    vehicles.forEach(vehicle => {
      const status = (vehicle.status || 'ativo').toLowerCase();
      const empresa = vehicle.empresa || 'Não informada';
      const descricao = vehicle.descricao || vehicle.categoria || 'Outros';
      
      if (!statusMap.has(status)) {
        statusMap.set(status, new Map());
      }
      const statusGroup = statusMap.get(status)!;
      
      if (!statusGroup.has(empresa)) {
        statusGroup.set(empresa, new Map());
      }
      const empresaGroup = statusGroup.get(empresa)!;
      
      if (!empresaGroup.has(descricao)) {
        empresaGroup.set(descricao, []);
      }
      empresaGroup.get(descricao)!.push(vehicle);
    });

    const result: StatusGroup[] = [];
    
    statusMap.forEach((empresaMap, status) => {
      const companies: CompanyGroup[] = [];
      let statusTotal = 0;
      
      empresaMap.forEach((equipMap, empresa) => {
        const equipamentos: EquipmentCount[] = [];
        let companyTotal = 0;
        
        equipMap.forEach((items, descricao) => {
          equipamentos.push({
            descricao,
            quantidade: items.length,
            items
          });
          companyTotal += items.length;
        });
        
        equipamentos.sort((a, b) => a.descricao.localeCompare(b.descricao));
        companies.push({ empresa, total: companyTotal, equipamentos });
        statusTotal += companyTotal;
      });
      
      companies.sort((a, b) => a.empresa.localeCompare(b.empresa));
      result.push({ status, total: statusTotal, companies });
    });
    
    // Sort by status order: ativo first
    return result.sort((a, b) => {
      if (a.status === 'ativo') return -1;
      if (b.status === 'ativo') return 1;
      return a.status.localeCompare(b.status);
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

  // Total count (active only for main view)
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
    setExpandedDescricao(null);
  };

  // Toggle expand for equipment type
  const toggleExpand = (descricao: string) => {
    setExpandedDescricao(prev => prev === descricao ? null : descricao);
  };

  // Handle vehicle click for editing
  const handleVehicleClick = (vehicle: VehicleItem) => {
    setDetailModal(null);
    onVehicleClick?.(vehicle);
  };

  // Export PDF with ALL vehicles grouped by status
  const exportToPDF = () => {
    const doc = new jsPDF('portrait');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // Header with gray theme
    doc.setFillColor(70, 70, 80);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSTRUTORA CONSÓRCIO AERO MARAGOGI', pageWidth / 2, 10, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text('EQUIPAMENTOS MOBILIZADOS', pageWidth / 2, 18, { align: 'center' });
    
    // Date info
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}`, 14, 32);
    doc.text(`Gerado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth - 50, 32);
    
    let currentY = 38;
    
    // Export each status group
    statusGroups.forEach((statusGroup, statusIdx) => {
      const statusConfig = STATUS_CONFIG[statusGroup.status] || { 
        label: statusGroup.status.toUpperCase(), 
        color: 'text-gray-600',
        bgColor: 'bg-gray-100'
      };
      
      // Add new page if needed
      if (statusIdx > 0 && currentY > 40) {
        doc.addPage();
        currentY = 20;
      }
      
      // Status header
      const statusColor = statusGroup.status === 'ativo' ? [46, 125, 50] : 
                          statusGroup.status.includes('manut') ? [245, 158, 11] :
                          statusGroup.status === 'desmobilizado' ? [220, 38, 38] :
                          [100, 100, 100];
      
      doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.rect(14, currentY, pageWidth - 28, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${statusConfig.label} (${statusGroup.total})`, 16, currentY + 5.5);
      
      currentY += 12;
      
      // Companies in this status
      statusGroup.companies.forEach(company => {
        if (currentY > pageHeight - 40) {
          doc.addPage();
          currentY = 20;
        }
        
        // Company header
        doc.setFillColor(100, 100, 110);
        doc.rect(14, currentY, pageWidth - 28, 6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(company.empresa, 16, currentY + 4);
        doc.text(`Total: ${company.total}`, pageWidth - 35, currentY + 4);
        
        currentY += 7;
        
        // Equipment table for this company
        const tableData = company.equipamentos.map(e => [
          e.descricao,
          e.quantidade.toString()
        ]);
        
        autoTable(doc, {
          startY: currentY,
          head: [['Descrição', 'Qtd']],
          body: tableData,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { 
            fillColor: [150, 150, 160], 
            textColor: 255, 
            fontStyle: 'bold',
            fontSize: 7
          },
          columnStyles: {
            0: { cellWidth: pageWidth - 50 },
            1: { cellWidth: 15, halign: 'center' }
          },
          margin: { left: 14, right: 14 },
          alternateRowStyles: { fillColor: [250, 250, 250] },
        });
        
        currentY = (doc as any).lastAutoTable.finalY + 6;
      });
      
      currentY += 4;
    });
    
    // Total Geral at the end
    if (currentY > pageHeight - 25) {
      doc.addPage();
      currentY = 20;
    }
    
    const totalAll = vehicles.length;
    doc.setFillColor(70, 70, 80);
    doc.rect(14, currentY, pageWidth - 28, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL GERAL', 16, currentY + 7);
    doc.text(totalAll.toString(), pageWidth - 25, currentY + 7);
    
    // Footer on all pages
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text('Sistema Abastech - Gestão de Frota', 14, pageHeight - 8);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeight - 8);
    }
    
    return doc;
  };
  
  const downloadPDF = () => {
    const doc = exportToPDF();
    doc.save(`equipamentos-${format(selectedDate, 'yyyy-MM-dd')}.pdf`);
  };
  
  const shareViaWhatsApp = async () => {
    const doc = exportToPDF();
    const pdfBlob = doc.output('blob');
    const filename = `equipamentos-${format(selectedDate, 'yyyy-MM-dd')}.pdf`;

    if (navigator.share && navigator.canShare) {
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Equipamentos Mobilizados',
            text: `Relatório de Equipamentos - ${format(selectedDate, 'dd/MM/yyyy')}`,
          });
          return;
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Erro ao compartilhar:', error);
          }
        }
      }
    }

    // Fallback: download PDF and open WhatsApp
    doc.save(filename);
    const message = encodeURIComponent(
      `🚜 *Equipamentos Mobilizados*\n` +
      `📅 Data: ${format(selectedDate, 'dd/MM/yyyy')}\n` +
      `📊 Total: ${vehicles.length} equipamentos\n\n` +
      `Segue em anexo o relatório de equipamentos.`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
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
        <div className="flex gap-2">
          <Button 
            onClick={downloadPDF}
            variant="outline"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar PDF
          </Button>
          <Button 
            onClick={shareViaWhatsApp}
            variant="outline"
            className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </Button>
        </div>
      </div>

      {/* All Companies Grid - Unified layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Regular companies first */}
        {regularCompanies.map(company => (
          <Card 
            key={company.empresa}
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
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
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {company.equipamentos.map(equip => (
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
              </div>
              <div className="px-4 py-3 bg-muted/30 border-t flex items-center justify-between">
                <span className="font-semibold text-sm">Total</span>
                <span className="font-bold text-lg text-primary">{company.total}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {/* Special sections in same grid */}
        {specialCompanies.map(company => (
          <Card 
            key={company.empresa}
            className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]"
            onClick={() => handleCardClick(company)}
          >
            <CardHeader className={cn(
              "bg-gradient-to-r text-white rounded-t-lg",
              getCompanyColor(company.empresa)
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getCompanyIcon(company.empresa)}
                  <CardTitle className="text-lg">{company.empresa}</CardTitle>
                </div>
                <Badge variant="secondary" className="bg-white/20 text-white text-lg font-bold px-3">
                  {company.total}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {company.equipamentos.map(equip => (
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
              </div>
              <div className="px-4 py-3 bg-muted/30 border-t flex items-center justify-between">
                <span className="font-semibold text-sm">Total</span>
                <span className="font-bold text-lg text-primary">{company.total}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total Geral */}
      <Card className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Truck className="w-10 h-10" />
              <div>
                <p className="text-slate-300 text-sm font-medium">TOTAL GERAL</p>
                <p className="text-sm text-slate-400">Todos os equipamentos mobilizados</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-5xl font-bold">{totalGeral}</p>
              <p className="text-slate-300 text-sm">unidades</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Modal with Expandable Items */}
      <Dialog open={detailModal?.open} onOpenChange={(open) => !open && setDetailModal(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              {detailModal?.empresa}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-1">
              {/* Header row */}
              <div className="flex items-center justify-between px-4 py-2 bg-muted rounded-t-lg font-semibold text-sm">
                <span>Equipamento / Descrição</span>
                <span className="w-16 text-center">Qtd</span>
              </div>
              
              {detailModal?.equipamentos.map(equip => (
                <Collapsible 
                  key={equip.descricao}
                  open={expandedDescricao === equip.descricao}
                  onOpenChange={() => toggleExpand(equip.descricao)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/50 cursor-pointer border-b transition-colors">
                      <div className="flex items-center gap-2 flex-1">
                        {expandedDescricao === equip.descricao ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium">{equip.descricao}</span>
                      </div>
                      <Badge variant="secondary" className="font-bold w-16 justify-center">
                        {equip.quantidade}
                      </Badge>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="bg-muted/30 border-b">
                      {equip.items.map(item => (
                        <div 
                          key={item.codigo}
                          className="flex items-center justify-between py-2 px-6 hover:bg-muted/50 cursor-pointer transition-colors group"
                          onClick={() => handleVehicleClick(item)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm text-primary font-semibold">
                              {item.codigo}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {item.categoria}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={cn(
                                "text-xs",
                                item.status?.toLowerCase() === 'ativo' && "bg-green-50 text-green-700 border-green-200",
                                item.status?.toLowerCase().includes('manut') && "bg-amber-50 text-amber-700 border-amber-200",
                                item.status?.toLowerCase() === 'inativo' && "bg-gray-100 text-gray-600 border-gray-200",
                                item.status?.toLowerCase() === 'desmobilizado' && "bg-red-50 text-red-600 border-red-200"
                              )}
                            >
                              {item.status || 'Ativo'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVehicleClick(item);
                              }}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Editar
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-7 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleVehicleClick(item);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Ver
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
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
