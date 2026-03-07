import { useState } from 'react';
import { FileText, FileSpreadsheet, Download, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface HorimeterReportsTabProps {
  onExportPDF: () => void;
  onExportExcel: () => void;
  onExportMissingPDF: () => void;
  onExportMissingWhatsApp: () => void;
  recordCount: number;
  missingCount: number;
}

export function HorimeterReportsTab({
  onExportPDF,
  onExportExcel,
  onExportMissingPDF,
  onExportMissingWhatsApp,
  recordCount,
  missingCount,
}: HorimeterReportsTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Relatório Completo PDF */}
      <Card className="border hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório de Horímetros</CardTitle>
              <CardDescription className="text-xs">Resumo + histórico por veículo (PDF)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            Gera um PDF completo com resumo geral por veículo e páginas detalhadas de cada equipamento.
            Utiliza os filtros ativos ({recordCount} registros).
          </p>
          <Button onClick={onExportPDF} className="w-full gap-2" variant="outline">
            <Download className="w-4 h-4" />
            Exportar PDF
          </Button>
        </CardContent>
      </Card>

      {/* Excel */}
      <Card className="border hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">Exportar Excel</CardTitle>
              <CardDescription className="text-xs">Planilha com todos os lançamentos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            Exporta todos os registros filtrados para uma planilha Excel (.xlsx) com todas as colunas disponíveis.
          </p>
          <Button onClick={onExportExcel} className="w-full gap-2" variant="outline">
            <Download className="w-4 h-4" />
            Exportar Excel
          </Button>
        </CardContent>
      </Card>

      {/* Faltantes PDF */}
      <Card className="border hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Relatório de Faltantes</CardTitle>
              <CardDescription className="text-xs">Veículos sem leitura no dia (PDF)</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            Lista os {missingCount} veículo(s) que não possuem lançamento de horímetro na data de referência.
          </p>
          <Button onClick={onExportMissingPDF} className="w-full gap-2" variant="outline">
            <Download className="w-4 h-4" />
            Exportar PDF Faltantes
          </Button>
        </CardContent>
      </Card>

      {/* Faltantes WhatsApp */}
      <Card className="border hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-base">Faltantes via WhatsApp</CardTitle>
              <CardDescription className="text-xs">Envia lista de faltantes por WhatsApp</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-3">
            Gera uma mensagem formatada com os {missingCount} veículo(s) faltantes e abre o WhatsApp para envio.
          </p>
          <Button onClick={onExportMissingWhatsApp} className="w-full gap-2" variant="outline">
            <MessageCircle className="w-4 h-4" />
            Enviar WhatsApp
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
