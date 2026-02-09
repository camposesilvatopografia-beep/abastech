import { 
  FileText, 
  FileSpreadsheet, 
  Building2, 
  Download, 
  MapPin, 
  Fuel, 
  Truck, 
  ArrowDownUp,
  Calendar,
  BarChart3,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportsTabProps {
  isExporting: boolean;
  filteredRowsCount: number;
  startDate: Date | undefined;
  endDate: Date | undefined;
  sortByDescription: boolean;
  onToggleSortByDescription: () => void;
  onExportPDF: () => void;
  onExportXLSX: () => void;
  onExportPDFPorEmpresa: () => void;
  onExportPorEmpresaXLSX: () => void;
  onExportDetailedPDF: () => void;
  onExportTanquesPDF: () => void;
  onExportTanquesXLSX: () => void;
  onExportComboiosPDF: () => void;
  onExportComboiosXLSX: () => void;
  onExportTanquesComboiosPDF: () => void;
  onExportTanquesComboiosXLSX: () => void;
}

interface ReportItem {
  title: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  category: 'geral' | 'tanques' | 'combinado';
  onPDF: () => void;
  onXLSX?: () => void;
  pdfLabel?: string;
  pdfClassName?: string;
}

export function ReportsTab({
  isExporting,
  filteredRowsCount,
  startDate,
  endDate,
  sortByDescription,
  onToggleSortByDescription,
  onExportPDF,
  onExportXLSX,
  onExportPDFPorEmpresa,
  onExportPorEmpresaXLSX,
  onExportDetailedPDF,
  onExportTanquesPDF,
  onExportTanquesXLSX,
  onExportComboiosPDF,
  onExportComboiosXLSX,
  onExportTanquesComboiosPDF,
  onExportTanquesComboiosXLSX,
}: ReportsTabProps) {
  const dateLabel = startDate && endDate
    ? `${format(startDate, 'dd/MM/yyyy', { locale: ptBR })} — ${format(endDate, 'dd/MM/yyyy', { locale: ptBR })}`
    : startDate
      ? `A partir de ${format(startDate, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

  const reports: ReportItem[] = [
    {
      title: 'Relatório Completo',
      description: 'Todos os abastecimentos agrupados por local, com assinaturas',
      icon: FileText,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
      category: 'geral',
      onPDF: onExportPDF,
      onXLSX: onExportXLSX,
    },
    {
      title: 'Relatório por Empresa',
      description: 'Registros agrupados por empresa (ex: Consórcio, Terceiros)',
      icon: Building2,
      iconColor: 'text-orange-600',
      iconBg: 'bg-orange-500/10',
      category: 'geral',
      onPDF: onExportPDFPorEmpresa,
      onXLSX: onExportPorEmpresaXLSX,
      pdfClassName: 'bg-orange-600 hover:bg-orange-700',
    },
    {
      title: 'Relatório Detalhado',
      description: 'Exportação completa com todos os filtros ativos aplicados',
      icon: Download,
      iconColor: 'text-violet-600',
      iconBg: 'bg-violet-500/10',
      category: 'geral',
      onPDF: onExportDetailedPDF,
      pdfClassName: 'bg-violet-600 hover:bg-violet-700',
    },
    {
      title: 'Tanques (01 e 02)',
      description: 'Resumo de estoque + registros dos tanques fixos',
      icon: Fuel,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-500/10',
      category: 'tanques',
      onPDF: onExportTanquesPDF,
      onXLSX: onExportTanquesXLSX,
      pdfClassName: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      title: 'Comboios (01, 02 e 03)',
      description: 'Resumo de estoque + registros dos comboios móveis',
      icon: Truck,
      iconColor: 'text-emerald-600',
      iconBg: 'bg-emerald-500/10',
      category: 'tanques',
      onPDF: onExportComboiosPDF,
      onXLSX: onExportComboiosXLSX,
      pdfClassName: 'bg-emerald-600 hover:bg-emerald-700',
    },
    {
      title: 'Tanques + Comboios',
      description: 'Relatório combinado: tanques e comboios em páginas separadas',
      icon: Layers,
      iconColor: 'text-slate-600',
      iconBg: 'bg-slate-500/10',
      category: 'combinado',
      onPDF: onExportTanquesComboiosPDF,
      onXLSX: onExportTanquesComboiosXLSX,
    },
  ];

  const geralReports = reports.filter(r => r.category === 'geral');
  const tanquesReports = reports.filter(r => r.category === 'tanques');
  const combinadoReports = reports.filter(r => r.category === 'combinado');

  const renderReportRow = (report: ReportItem) => (
    <div
      key={report.title}
      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
    >
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', report.iconBg)}>
        <report.icon className={cn('w-5 h-5', report.iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-sm">{report.title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{report.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className={cn('gap-1.5', report.pdfClassName || '')}
          onClick={report.onPDF}
          disabled={isExporting}
        >
          <FileText className="w-3.5 h-3.5" />
          PDF
        </Button>
        {report.onXLSX && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={report.onXLSX}
            disabled={isExporting}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel
          </Button>
        )}
      </div>
    </div>
  );

  const renderSection = (title: string, icon: React.ElementType, reports: ReportItem[]) => {
    const Icon = icon;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
          <Badge variant="secondary" className="text-xs">{reports.length}</Badge>
        </div>
        <div className="space-y-2">
          {reports.map(renderReportRow)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with context info */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Central de Relatórios</h2>
              <p className="text-sm text-muted-foreground">Exporte dados de abastecimento em PDF ou Excel</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Context badges */}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium">{dateLabel}</span>
            </div>
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium">{filteredRowsCount.toLocaleString('pt-BR')} registros</span>
            </div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Sort toggle */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Ordenação:</span>
          <Button
            variant={sortByDescription ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleSortByDescription}
            className="gap-2 h-8"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
            {sortByDescription ? 'Alfabética por Descrição ✓' : 'Padrão (por data)'}
          </Button>
          {sortByDescription && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Todos os relatórios serão ordenados alfabeticamente pela descrição do veículo
            </span>
          )}
        </div>
      </div>

      {/* Report sections */}
      {renderSection('Relatórios Gerais', FileText, geralReports)}
      {renderSection('Tanques & Comboios', Fuel, tanquesReports)}
      {renderSection('Combinados', Layers, combinadoReports)}
    </div>
  );
}
