import { 
  FileText, 
  FileSpreadsheet, 
  Building2, 
  Download, 
  Fuel, 
  Truck, 
  ArrowDownUp,
  Calendar,
  BarChart3,
  Layers,
  Printer,
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
  onExportTanqueComboioPDF: () => void;
  onExportTanqueComboioXLSX: () => void;
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
  onExportTanqueComboioPDF,
  onExportTanqueComboioXLSX,
}: ReportsTabProps) {
  const dateLabel = startDate && endDate
    ? `${format(startDate, 'dd/MM/yyyy', { locale: ptBR })} — ${format(endDate, 'dd/MM/yyyy', { locale: ptBR })}`
    : startDate
      ? `A partir de ${format(startDate, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Printer className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Relatórios de Abastecimento</h2>
              <p className="text-sm text-muted-foreground">Gere relatórios detalhados de Tanques e Comboios</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
              <Calendar className="w-3.5 h-3.5" />
              {dateLabel}
            </Badge>
            <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
              <FileText className="w-3.5 h-3.5" />
              {filteredRowsCount.toLocaleString('pt-BR')} registros
            </Badge>
          </div>
        </div>

        <Separator className="my-4" />

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
        </div>
      </div>

      {/* Main reports: Tanques & Comboios side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tanques Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
                <Fuel className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Tanques</h3>
                <p className="text-blue-100 text-xs">Canteiro 01 e 02 — Estoque + Abastecimentos</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Relatório com resumo de estoque dos tanques fixos, tabela de saídas (abastecimentos realizados) e entradas (recebimentos de fornecedores).
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-blue-600 hover:bg-blue-700"
                onClick={onExportTanquesPDF}
                disabled={isExporting}
              >
                <FileText className="w-3.5 h-3.5" />
                Gerar PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={onExportTanquesXLSX}
                disabled={isExporting}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </Button>
            </div>
          </div>
        </div>

        {/* Comboios Card */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-base">Comboios</h3>
                <p className="text-emerald-100 text-xs">Comboios 01, 02 e 03 — Estoque + Abastecimentos</p>
              </div>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Relatório com resumo de estoque dos comboios móveis, tabela de saídas (abastecimentos em campo) e entradas (carregamentos nos tanques).
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={onExportComboiosPDF}
                disabled={isExporting}
              >
                <FileText className="w-3.5 h-3.5" />
                Gerar PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={onExportComboiosXLSX}
                disabled={isExporting}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tanque Comboio Report */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Tanque Comboio</h3>
              <p className="text-amber-100 text-xs">Veículos da categoria Tanque Comboio</p>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Relatório exclusivo dos veículos com categoria Tanque Comboio, com tabela de saídas e entradas.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700"
              onClick={onExportTanqueComboioPDF}
              disabled={isExporting}
            >
              <FileText className="w-3.5 h-3.5" />
              Gerar PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={onExportTanqueComboioXLSX}
              disabled={isExporting}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel
            </Button>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-white font-semibold text-sm">Relatório Combinado — Tanques + Comboios</h3>
              <p className="text-slate-300 text-xs">Ambos os relatórios em um único documento, em páginas separadas</p>
            </div>
          </div>
        </div>
        <div className="p-4 flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={onExportTanquesComboiosPDF}
            disabled={isExporting}
          >
            <FileText className="w-3.5 h-3.5" />
            PDF Combinado
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={onExportTanquesComboiosXLSX}
            disabled={isExporting}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel Combinado
          </Button>
        </div>
      </div>

      {/* Other exports - collapsible section */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Download className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Outros Relatórios</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Relatório Completo */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs">Rel. Completo</h4>
              <p className="text-[10px] text-muted-foreground">Todos os locais</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" className="h-7 px-2 text-xs" onClick={onExportPDF} disabled={isExporting}>PDF</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onExportXLSX} disabled={isExporting}>XLS</Button>
            </div>
          </div>

          {/* Por Empresa */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs">Por Empresa</h4>
              <p className="text-[10px] text-muted-foreground">Agrupado</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" className="h-7 px-2 text-xs bg-orange-600 hover:bg-orange-700" onClick={onExportPDFPorEmpresa} disabled={isExporting}>PDF</Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onExportPorEmpresaXLSX} disabled={isExporting}>XLS</Button>
            </div>
          </div>

          {/* Detalhado */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
            <BarChart3 className="w-4 h-4 text-violet-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-xs">Detalhado</h4>
              <p className="text-[10px] text-muted-foreground">Filtros ativos</p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button size="sm" className="h-7 px-2 text-xs bg-violet-600 hover:bg-violet-700" onClick={onExportDetailedPDF} disabled={isExporting}>PDF</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
