import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, X, Loader2 } from 'lucide-react';

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  fileName?: string;
  loading?: boolean;
}

export function PdfPreviewModal({ open, onClose, pdfUrl, fileName = 'relatorio.pdf', loading }: PdfPreviewModalProps) {
  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = fileName;
    a.click();
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0 [&>button.absolute]:hidden">
        <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0 shrink-0">
          <DialogTitle className="text-sm font-semibold">Pré-visualização do Relatório</DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handlePrint} disabled={!pdfUrl}>
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </Button>
            <Button size="sm" className="gap-1.5 h-8" onClick={handleDownload} disabled={!pdfUrl}>
              <Download className="w-3.5 h-3.5" />
              Baixar PDF
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-muted overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Nenhum PDF para exibir
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
