import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSheetSync } from '@/hooks/useHorimeters';
import { Download, Upload, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

interface SyncModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SyncModal({ open, onOpenChange, onSuccess }: SyncModalProps) {
  const { syncing, progress, syncFromSheet, exportToSheet } = useSheetSync();
  const [result, setResult] = useState<{
    type: 'import' | 'export';
    vehiclesImported?: number;
    readingsImported?: number;
    readingsUpdated?: number;
    exported?: number;
    errors: number;
  } | null>(null);

  const handleImport = async () => {
    setResult(null);
    try {
      const stats = await syncFromSheet();
      setResult({
        type: 'import',
        ...stats,
      });
      onSuccess?.();
    } catch (err) {
      // Error handled in hook
    }
  };

  const handleExport = async () => {
    setResult(null);
    try {
      const stats = await exportToSheet();
      setResult({
        type: 'export',
        ...stats,
      });
    } catch (err) {
      // Error handled in hook
    }
  };

  const handleClose = () => {
    if (!syncing) {
      setResult(null);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 text-primary ${syncing ? 'animate-spin' : ''}`} />
            Sincronização com Planilha
          </DialogTitle>
          <DialogDescription>
            Importe dados da planilha Google Sheets ou exporte do sistema para a planilha
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Import Section */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <Download className="w-5 h-5 text-blue-500 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium">Importar da Planilha</h4>
                <p className="text-sm text-muted-foreground">
                  Sincroniza veículos e horímetros da planilha para o banco de dados local
                </p>
              </div>
            </div>
            <Button
              onClick={handleImport}
              disabled={syncing}
              className="w-full"
            >
              {syncing && result?.type === undefined ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Importar Dados
                </>
              )}
            </Button>
          </div>

          {/* Export Section */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-start gap-3">
              <Upload className="w-5 h-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium">Exportar para Planilha</h4>
                <p className="text-sm text-muted-foreground">
                  Envia os registros do sistema para a planilha Google Sheets
                </p>
              </div>
            </div>
            <Button
              onClick={handleExport}
              disabled={syncing}
              variant="outline"
              className="w-full"
            >
              {syncing && result?.type === 'export' ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Exportar Dados
                </>
              )}
            </Button>
          </div>

          {/* Progress */}
          {syncing && progress > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progresso</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Results */}
          {result && !syncing && (
            <div className={`p-4 rounded-lg ${result.errors > 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.errors > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
                <span className="font-medium">
                  {result.type === 'import' ? 'Importação' : 'Exportação'} concluída
                </span>
              </div>
              
              <div className="text-sm space-y-1">
                {result.type === 'import' && (
                  <>
                    <p>• Veículos: {result.vehiclesImported}</p>
                    <p>• Novos registros: {result.readingsImported}</p>
                    <p>• Atualizados: {result.readingsUpdated}</p>
                  </>
                )}
                {result.type === 'export' && (
                  <p>• Exportados: {result.exported}</p>
                )}
                {result.errors > 0 && (
                  <p className="text-yellow-600">• Erros: {result.errors}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
