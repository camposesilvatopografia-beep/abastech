import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, X, Download, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ImportRow {
  Data: string;
  Veiculo: string;
  Categoria?: string;
  Descricao?: string;
  Empresa?: string;
  Operador?: string;
  Hor_Anterior?: number;
  Hor_Atual?: number;
  Km_Anterior?: number;
  Km_Atual?: number;
  Observacao?: string;
}

interface ParsedRow {
  DATA: string;
  HORA: string;
  VEICULO: string;
  CATEGORIA: string;
  DESCRICAO: string;
  EMPRESA: string;
  OPERADOR: string;
  HOR_ANTERIOR: string;
  HOR_ATUAL: string;
  KM_ANTERIOR: string;
  KM_ATUAL: string;
  OBSERVACAO: string;
  isValid: boolean;
  isDuplicate: boolean;
  existingRowIndex?: number;
  error?: string;
}

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function findValue(row: Record<string, any>, candidates: string[]): any {
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeKey(candidate);
    for (const key of Object.keys(row)) {
      if (normalizeKey(key) === normalizedCandidate) {
        return row[key];
      }
    }
  }
  return undefined;
}

function parseExcelDate(value: any): string {
  if (!value) return '';
  
  // If it's already a string in dd/MM/yyyy format
  if (typeof value === 'string') {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-');
      return `${day}/${month}/${year}`;
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
      const [day, month, year] = value.split('-');
      return `${day}/${month}/${year}`;
    }
  }
  
  // If it's an Excel serial date number
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return format(date, 'dd/MM/yyyy');
  }
  
  // Try to parse as Date
  if (value instanceof Date) {
    return format(value, 'dd/MM/yyyy');
  }
  
  return String(value);
}

function parseNumber(value: any): number {
  return parsePtBRNumber(value);
}

export function ImportModal({ open, onOpenChange, onSuccess }: ImportModalProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [overwriteDuplicates, setOverwriteDuplicates] = useState(false);
  const [existingRecordsMap, setExistingRecordsMap] = useState<Map<string, number>>(new Map());
  const [importStats, setImportStats] = useState<{
    total: number;
    success: number;
    failed: number;
    skipped: number;
    updated: number;
  } | null>(null);

  // Fetch existing records to check for duplicates (with rowIndex for updates)
  const fetchExistingRecords = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('google-sheets', {
        body: {
          action: 'getData',
          sheetName: 'Horimetros',
        },
      });

      if (error) {
        console.error('Error fetching existing records:', error);
        return new Map<string, number>();
      }

      const recordsMap = new Map<string, number>();
      if (data?.rows) {
        data.rows.forEach((row: any) => {
          const date = String(row.DATA || '').trim();
          const vehicle = String(row.VEICULO || '').trim().toUpperCase();
          const rowIndex = row._rowIndex;
          if (date && vehicle && rowIndex) {
            recordsMap.set(`${date}|${vehicle}`, rowIndex);
          }
        });
      }
      return recordsMap;
    } catch (error) {
      console.error('Error fetching existing records:', error);
      return new Map<string, number>();
    }
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParsedRows([]);
    setImportStats(null);
    setIsLoading(true);

    // Fetch existing records first
    const existingMap = await fetchExistingRecords();
    setExistingRecordsMap(existingMap);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
        
        // Parse and validate rows
        const parsed: ParsedRow[] = jsonData.map((row, index) => {
          const data = parseExcelDate(findValue(row, ['Data', 'DATA', 'date']));
          const veiculo = String(findValue(row, ['Veiculo', 'VEICULO', 'VEÍCULO', 'Equipamento', 'EQUIPAMENTO']) || '').trim();
          const categoria = String(findValue(row, ['Categoria', 'CATEGORIA', 'Tipo', 'TIPO']) || '').trim();
          const descricao = String(findValue(row, ['Descricao', 'DESCRICAO', 'DESCRIÇÃO', 'Descrição']) || '').trim();
          const empresa = String(findValue(row, ['Empresa', 'EMPRESA']) || '').trim();
          const operador = String(findValue(row, ['Operador', 'OPERADOR', 'Motorista', 'MOTORISTA']) || '').trim();
          
          const horAnterior = parseNumber(findValue(row, ['Hor_Anterior', 'HOR_ANTERIOR', 'HORANTERIOR', 'Horimetro_Anterior']));
          const horAtual = parseNumber(findValue(row, ['Hor_Atual', 'HOR_ATUAL', 'HORATUAL', 'Horimetro_Atual', 'HORIMETRO', 'Horas', 'HORAS']));
          const kmAnterior = parseNumber(findValue(row, ['Km_Anterior', 'KM_ANTERIOR', 'KMANTERIOR', 'Quilometragem_Anterior']));
          const kmAtual = parseNumber(findValue(row, ['Km_Atual', 'KM_ATUAL', 'KMATUAL', 'Quilometragem_Atual', 'KM', 'Quilometragem']));
          const observacao = String(findValue(row, ['Observacao', 'OBSERVACAO', 'OBSERVAÇÃO', 'Obs', 'OBS']) || '').trim();

          let isValid = true;
          let isDuplicate = false;
          let existingRowIndex: number | undefined;
          let error: string | undefined;

          if (!data) {
            isValid = false;
            error = 'Data inválida';
          } else if (!veiculo) {
            isValid = false;
            error = 'Veículo não informado';
          } else if (horAtual === 0 && kmAtual === 0) {
            isValid = false;
            error = 'Horímetro/KM atual não informado';
          } else {
            // Check for duplicate
            const key = `${data}|${veiculo.toUpperCase()}`;
            if (existingMap.has(key)) {
              isDuplicate = true;
              existingRowIndex = existingMap.get(key);
            }
          }

          return {
            DATA: data,
            HORA: format(new Date(), 'HH:mm'),
            VEICULO: veiculo,
            CATEGORIA: categoria,
            DESCRICAO: descricao,
            EMPRESA: empresa,
            OPERADOR: operador,
            HOR_ANTERIOR: horAnterior > 0 ? horAnterior.toString().replace('.', ',') : '',
            HOR_ATUAL: horAtual > 0 ? horAtual.toString().replace('.', ',') : '',
            KM_ANTERIOR: kmAnterior > 0 ? kmAnterior.toString().replace('.', ',') : '',
            KM_ATUAL: kmAtual > 0 ? kmAtual.toString().replace('.', ',') : '',
            OBSERVACAO: observacao,
            isValid,
            isDuplicate,
            existingRowIndex,
            error,
          };
        });

        setParsedRows(parsed);
        
        const validCount = parsed.filter(r => r.isValid && !r.isDuplicate).length;
        const duplicateCount = parsed.filter(r => r.isDuplicate && r.isValid).length;
        const errorCount = parsed.filter(r => !r.isValid).length;
        
        toast({
          title: 'Arquivo processado',
          description: `${validCount} novos, ${duplicateCount} duplicados, ${errorCount} com erros`,
        });
      } catch (error) {
        console.error('Error parsing file:', error);
        toast({
          title: 'Erro ao processar arquivo',
          description: 'Verifique se o arquivo está no formato correto',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  }, [toast, fetchExistingRecords]);

  const handleImport = async () => {
    // Get rows to import: valid non-duplicates + duplicates if overwrite enabled
    const newRows = parsedRows.filter(r => r.isValid && !r.isDuplicate);
    const duplicateRows = parsedRows.filter(r => r.isValid && r.isDuplicate);
    const rowsToImport = overwriteDuplicates ? [...newRows, ...duplicateRows] : newRows;
    const skippedCount = overwriteDuplicates ? 0 : duplicateRows.length;
    
    if (rowsToImport.length === 0) {
      toast({
        title: 'Nenhum registro para importar',
        description: skippedCount > 0 
          ? `${skippedCount} registros duplicados foram ignorados. Ative "Sobrescrever duplicados" para atualizá-los.` 
          : 'Não há registros válidos para importar',
        variant: 'destructive',
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    
    let success = 0;
    let updated = 0;
    let failed = 0;

    // Track imported records to avoid duplicates within the same import
    const importedInSession = new Set<string>();

    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      const key = `${row.DATA}|${row.VEICULO.toUpperCase()}`;
      
      // Skip if already imported in this session
      if (importedInSession.has(key)) {
        continue;
      }
      
      try {
        const rowData = {
          DATA: row.DATA,
          HORA: row.HORA,
          VEICULO: row.VEICULO,
          CATEGORIA: row.CATEGORIA,
          DESCRICAO: row.DESCRICAO,
          EMPRESA: row.EMPRESA,
          OPERADOR: row.OPERADOR,
          Hor_Anterior: row.HOR_ANTERIOR,
          Hor_Atual: row.HOR_ATUAL,
          Km_Anterior: row.KM_ANTERIOR,
          Km_Atual: row.KM_ATUAL,
          OBSERVACAO: row.OBSERVACAO,
        };

        // If it's a duplicate and we're overwriting, use update action
        if (row.isDuplicate && row.existingRowIndex) {
          const { error } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'update',
              sheetName: 'Horimetros',
              rowIndex: row.existingRowIndex,
              data: rowData,
            },
          });

          if (error) {
            failed++;
          } else {
            updated++;
            importedInSession.add(key);
          }
        } else {
          const { error } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'create',
              sheetName: 'Horimetros',
              data: rowData,
            },
          });

          if (error) {
            failed++;
          } else {
            success++;
            importedInSession.add(key);
          }
        }
      } catch (error) {
        console.error('Error importing row:', error);
        failed++;
      }

      setImportProgress(Math.round(((i + 1) / rowsToImport.length) * 100));
    }

    setImportStats({
      total: rowsToImport.length,
      success,
      failed,
      skipped: skippedCount,
      updated,
    });

    setIsImporting(false);

    const descriptions: string[] = [];
    if (success > 0) descriptions.push(`${success} novos`);
    if (updated > 0) descriptions.push(`${updated} atualizados`);
    if (failed > 0) descriptions.push(`${failed} falharam`);
    if (skippedCount > 0) descriptions.push(`${skippedCount} ignorados`);

    if (failed === 0) {
      toast({
        title: 'Importação concluída!',
        description: descriptions.join(', '),
      });
      onSuccess?.();
    } else {
      toast({
        title: 'Importação parcial',
        description: descriptions.join(', '),
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedRows([]);
    setImportStats(null);
    setImportProgress(0);
    setOverwriteDuplicates(false);
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        Data: '01/01/2024',
        Veiculo: 'EQ-001',
        Categoria: 'Equipamento',
        Descricao: 'Escavadeira',
        Empresa: 'Empresa XYZ',
        Operador: 'João Silva',
        Hor_Anterior: 1000,
        Hor_Atual: 1050,
        Km_Anterior: '',
        Km_Atual: '',
        Observacao: 'Manutenção preventiva realizada',
      },
      {
        Data: '01/01/2024',
        Veiculo: 'VE-001',
        Categoria: 'Veículo',
        Descricao: 'Caminhão Basculante',
        Empresa: 'Empresa XYZ',
        Operador: 'Pedro Santos',
        Hor_Anterior: '',
        Hor_Atual: '',
        Km_Anterior: 50000,
        Km_Atual: 50150,
        Observacao: '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horimetros');
    
    ws['!cols'] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 30 },
    ];

    XLSX.writeFile(wb, 'template_horimetros.xlsx');
  };

  const newCount = parsedRows.filter(r => r.isValid && !r.isDuplicate).length;
  const duplicateCount = parsedRows.filter(r => r.isValid && r.isDuplicate).length;
  const errorCount = parsedRows.filter(r => !r.isValid).length;
  const totalToImport = overwriteDuplicates ? newCount + duplicateCount : newCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Importar Horímetros em Massa
          </DialogTitle>
          <DialogDescription>
            Faça upload de um arquivo Excel (.xlsx) com os dados dos horímetros
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Baixe o modelo para preencher corretamente</span>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Baixar Modelo
            </Button>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">Arquivo Excel</Label>
            <Input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              disabled={isLoading || isImporting}
            />
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-sm">Processando arquivo...</span>
            </div>
          )}

          {/* Parsed Results */}
          {parsedRows.length > 0 && !isLoading && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">{newCount} novos</span>
                </div>
                {duplicateCount > 0 && (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-blue-500" />
                    <span className="text-sm">{duplicateCount} duplicados</span>
                  </div>
                )}
                {errorCount > 0 && (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm">{errorCount} com erros</span>
                  </div>
                )}
              </div>

              {/* Overwrite Option */}
              {duplicateCount > 0 && (
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label htmlFor="overwrite" className="text-sm font-medium">
                      Sobrescrever duplicados
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Atualizar {duplicateCount} registro(s) existentes com os novos dados
                    </p>
                  </div>
                  <Switch
                    id="overwrite"
                    checked={overwriteDuplicates}
                    onCheckedChange={setOverwriteDuplicates}
                  />
                </div>
              )}

              {/* Preview Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Data</th>
                        <th className="p-2 text-left">Veículo</th>
                        <th className="p-2 text-left">Hor/Km Atual</th>
                        <th className="p-2 text-left">Operador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 50).map((row, index) => (
                        <tr 
                          key={index} 
                          className={
                            !row.isValid 
                              ? 'bg-destructive/10' 
                              : row.isDuplicate 
                                ? 'bg-blue-500/10' 
                                : ''
                          }
                        >
                          <td className="p-2">
                            {row.isValid ? (
                              row.isDuplicate ? (
                                <RefreshCw className="w-4 h-4 text-blue-500" />
                              ) : (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )
                            ) : (
                              <span className="flex items-center gap-1 text-destructive">
                                <X className="w-4 h-4" />
                                <span className="truncate max-w-[100px]">{row.error}</span>
                              </span>
                            )}
                          </td>
                          <td className="p-2">{row.DATA}</td>
                          <td className="p-2">{row.VEICULO}</td>
                          <td className="p-2">
                            {row.HOR_ATUAL || row.KM_ATUAL || '-'}
                          </td>
                          <td className="p-2">{row.OPERADOR || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 50 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted/50">
                    Mostrando 50 de {parsedRows.length} registros
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Import Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importando registros...</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          {/* Import Stats */}
          {importStats && (
            <div className="p-4 rounded-lg bg-muted/30 space-y-2">
              <h4 className="font-medium">Resultado da Importação</h4>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div>
                  <div className="text-xl font-bold">{importStats.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-green-500">{importStats.success}</div>
                  <div className="text-xs text-muted-foreground">Novos</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-blue-500">{importStats.updated}</div>
                  <div className="text-xs text-muted-foreground">Atualizados</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-destructive">{importStats.failed}</div>
                  <div className="text-xs text-muted-foreground">Falhas</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-yellow-500">{importStats.skipped}</div>
                  <div className="text-xs text-muted-foreground">Ignorados</div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isImporting}>
              {importStats ? 'Fechar' : 'Cancelar'}
            </Button>
            {parsedRows.length > 0 && totalToImport > 0 && !importStats && (
              <Button onClick={handleImport} disabled={isImporting || isLoading}>
                {isImporting ? 'Importando...' : `Importar ${totalToImport} registro${totalToImport !== 1 ? 's' : ''}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
