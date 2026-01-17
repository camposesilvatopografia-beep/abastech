import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Database, 
  FileSpreadsheet,
  ArrowRightLeft,
  Trash2,
  Plus,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface TestResult {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  details?: any;
  duration?: number;
}

export function SyncTestPage() {
  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef(false);

  const updateTest = useCallback((testId: string, update: Partial<TestResult>) => {
    setTests(prev => prev.map(t => t.id === testId ? { ...t, ...update } : t));
  }, []);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runTests = async () => {
    abortRef.current = false;
    setIsRunning(true);
    
    // Initialize all tests
    const initialTests: TestResult[] = [
      { id: 'create', name: '1. CREATE - Inserir registro no banco de dados', status: 'pending' },
      { id: 'sync', name: '2. SYNC - Sincronizar com Google Sheets', status: 'pending' },
      { id: 'read', name: '3. READ - Verificar registro na planilha', status: 'pending' },
      { id: 'delete-db', name: '4. DELETE DB - Excluir registro do banco', status: 'pending' },
      { id: 'delete-sheet', name: '5. DELETE SHEET - Excluir registro da planilha', status: 'pending' },
      { id: 'verify', name: '6. VERIFY - Confirmar exclusão em ambos', status: 'pending' },
    ];
    setTests(initialTests);

    const testVehicleCode = `TEST-${Date.now().toString(36).toUpperCase()}`;
    const testDate = format(new Date(), 'yyyy-MM-dd');
    const testTime = format(new Date(), 'HH:mm:ss');
    const testQuantity = Math.floor(Math.random() * 100) + 10;
    let createdRecordId: string | null = null;
    let sheetRowIndex: number | null = null;

    try {
      // ========== TEST 1: CREATE in Database ==========
      updateTest('create', { status: 'running' });
      const startCreate = Date.now();
      
      try {
        const { data: insertedRecord, error: insertError } = await supabase
          .from('field_fuel_records')
          .insert({
            vehicle_code: testVehicleCode,
            fuel_quantity: testQuantity,
            record_date: testDate,
            record_time: testTime,
            location: 'TEST_SYNC',
            operator_name: 'TESTE AUTOMATIZADO',
            observations: `Teste de sincronização - ${new Date().toISOString()}`,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        createdRecordId = insertedRecord.id;

        updateTest('create', {
          status: 'passed',
          message: `Registro criado: ${testVehicleCode}`,
          details: { id: createdRecordId, vehicle_code: testVehicleCode, quantity: testQuantity },
          duration: Date.now() - startCreate,
        });
      } catch (err: any) {
        updateTest('create', {
          status: 'failed',
          message: err.message || 'Erro ao criar registro',
          duration: Date.now() - startCreate,
        });
        throw err;
      }

      if (abortRef.current) return;

      // ========== TEST 2: SYNC to Google Sheets ==========
      updateTest('sync', { status: 'running' });
      const startSync = Date.now();
      
      try {
        const sheetData = {
          'DATA': new Date(testDate).toLocaleDateString('pt-BR'),
          'HORA': testTime.substring(0, 5),
          'VEICULO': testVehicleCode,
          'QUANTIDADE': testQuantity,
          'LOCAL': 'TEST_SYNC',
          'OPERADOR': 'TESTE AUTOMATIZADO',
          'OBSERVACAO': `Teste de sincronização`,
        };

        const { error: syncError } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'create',
            sheetName: 'AbastecimentoCanteiro01',
            data: sheetData,
          },
        });

        if (syncError) throw syncError;

        await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('id', createdRecordId);

        updateTest('sync', {
          status: 'passed',
          message: 'Registro sincronizado com planilha',
          details: sheetData,
          duration: Date.now() - startSync,
        });
      } catch (err: any) {
        updateTest('sync', {
          status: 'failed',
          message: err.message || 'Erro ao sincronizar',
          duration: Date.now() - startSync,
        });
      }

      if (abortRef.current) return;
      await sleep(2000);

      // ========== TEST 3: READ from Google Sheets ==========
      updateTest('read', { status: 'running' });
      const startRead = Date.now();
      
      try {
        const { data: sheetResponse, error: readError } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'getData',
            sheetName: 'AbastecimentoCanteiro01',
            noCache: true,
          },
        });

        if (readError) throw readError;

        const testDateBR = new Date(testDate).toLocaleDateString('pt-BR');
        const foundRow = sheetResponse?.rows?.find((row: any) => {
          const rowVehicle = String(row['VEICULO'] ?? row['Veiculo'] ?? '').trim().toUpperCase();
          const rowDate = String(row['DATA'] ?? row['Data'] ?? '').trim();
          return rowVehicle === testVehicleCode.toUpperCase() && 
                 (rowDate === testDateBR || rowDate.includes(testDateBR));
        });

        if (foundRow) {
          sheetRowIndex = foundRow._rowIndex;
          updateTest('read', {
            status: 'passed',
            message: `✅ Registro encontrado na planilha (linha ${foundRow._rowIndex})`,
            details: { 
              _rowIndex: foundRow._rowIndex,
              VEICULO: foundRow['VEICULO'] ?? foundRow['Veiculo'],
              DATA: foundRow['DATA'] ?? foundRow['Data'],
            },
            duration: Date.now() - startRead,
          });
        } else {
          updateTest('read', {
            status: 'failed',
            message: `Registro ${testVehicleCode} não encontrado na planilha`,
            details: { totalRows: sheetResponse?.rows?.length || 0 },
            duration: Date.now() - startRead,
          });
        }
      } catch (err: any) {
        updateTest('read', {
          status: 'failed',
          message: err.message || 'Erro ao ler planilha',
          duration: Date.now() - startRead,
        });
      }

      if (abortRef.current) return;

      // ========== TEST 4: DELETE from Database ==========
      updateTest('delete-db', { status: 'running' });
      const startDeleteDb = Date.now();
      
      try {
        if (!createdRecordId) throw new Error('ID do registro não encontrado');

        const { error: deleteError } = await supabase
          .from('field_fuel_records')
          .delete()
          .eq('id', createdRecordId);

        if (deleteError) throw deleteError;

        updateTest('delete-db', {
          status: 'passed',
          message: '✅ Registro excluído do banco de dados',
          duration: Date.now() - startDeleteDb,
        });
      } catch (err: any) {
        updateTest('delete-db', {
          status: 'failed',
          message: err.message || 'Erro ao excluir do banco',
          duration: Date.now() - startDeleteDb,
        });
      }

      if (abortRef.current) return;

      // ========== TEST 5: DELETE from Google Sheets ==========
      updateTest('delete-sheet', { status: 'running' });
      const startDeleteSheet = Date.now();
      
      try {
        // If we already have the row index from the READ test, use it
        let rowToDelete = sheetRowIndex;

        // Otherwise, find it again
        if (!rowToDelete) {
          const { data: sheetResponse } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'getData',
              sheetName: 'AbastecimentoCanteiro01',
              noCache: true,
            },
          });

          const testDateBR = new Date(testDate).toLocaleDateString('pt-BR');
          if (sheetResponse?.rows) {
            for (let i = 0; i < sheetResponse.rows.length; i++) {
              const row = sheetResponse.rows[i];
              const rowVehicle = String(row['VEICULO'] ?? row['Veiculo'] ?? '').trim().toUpperCase();
              const rowDate = String(row['DATA'] ?? row['Data'] ?? '').trim();
              if (rowVehicle === testVehicleCode.toUpperCase() && 
                  (rowDate === testDateBR || rowDate.includes(testDateBR))) {
                rowToDelete = row._rowIndex || (i + 2);
                break;
              }
            }
          }
        }

        if (rowToDelete && rowToDelete > 0) {
          const { error: sheetDeleteError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'delete',
              sheetName: 'AbastecimentoCanteiro01',
              rowIndex: rowToDelete,
            },
          });

          if (sheetDeleteError) throw sheetDeleteError;

          updateTest('delete-sheet', {
            status: 'passed',
            message: `✅ Linha ${rowToDelete} excluída da planilha`,
            duration: Date.now() - startDeleteSheet,
          });
        } else {
          updateTest('delete-sheet', {
            status: 'failed',
            message: 'Registro não encontrado na planilha para exclusão',
            duration: Date.now() - startDeleteSheet,
          });
        }
      } catch (err: any) {
        updateTest('delete-sheet', {
          status: 'failed',
          message: err.message || 'Erro ao excluir da planilha',
          duration: Date.now() - startDeleteSheet,
        });
      }

      if (abortRef.current) return;
      await sleep(2000);

      // ========== TEST 6: VERIFY DELETION ==========
      updateTest('verify', { status: 'running' });
      const startVerify = Date.now();
      
      try {
        // Check DB
        const { data: dbCheck } = await supabase
          .from('field_fuel_records')
          .select('id')
          .eq('id', createdRecordId || '')
          .maybeSingle();

        // Check Sheet
        const { data: sheetCheck } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'getData',
            sheetName: 'AbastecimentoCanteiro01',
            noCache: true,
          },
        });

        const testDateBR = new Date(testDate).toLocaleDateString('pt-BR');
        const stillInSheet = sheetCheck?.rows?.some((row: any) => {
          const rowVehicle = String(row['VEICULO'] ?? row['Veiculo'] ?? '').trim().toUpperCase();
          const rowDate = String(row['DATA'] ?? row['Data'] ?? '').trim();
          return rowVehicle === testVehicleCode.toUpperCase() && 
                 (rowDate === testDateBR || rowDate.includes(testDateBR));
        });

        const dbClean = !dbCheck;
        const sheetClean = !stillInSheet;

        if (dbClean && sheetClean) {
          updateTest('verify', {
            status: 'passed',
            message: '✅ Registro removido de ambos: DB e Planilha',
            details: { dbClean, sheetClean },
            duration: Date.now() - startVerify,
          });
        } else {
          updateTest('verify', {
            status: 'failed',
            message: `Limpeza incompleta: DB=${dbClean ? '✅' : '❌'}, Sheet=${sheetClean ? '✅' : '❌'}`,
            details: { dbClean, sheetClean },
            duration: Date.now() - startVerify,
          });
        }
      } catch (err: any) {
        updateTest('verify', {
          status: 'failed',
          message: err.message || 'Erro na verificação final',
          duration: Date.now() - startVerify,
        });
      }

      toast.success('Testes de sincronização concluídos!');
    } catch (err: any) {
      console.error('Test suite error:', err);
      toast.error('Erro durante os testes: ' + err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
      case 'running': return <Loader2 className="w-5 h-5 animate-spin text-amber-500" />;
      case 'passed': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed': return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-xs">Pendente</Badge>;
      case 'running': return <Badge className="bg-amber-500 text-xs">Executando</Badge>;
      case 'passed': return <Badge className="bg-green-500 text-xs">Passou</Badge>;
      case 'failed': return <Badge variant="destructive" className="text-xs">Falhou</Badge>;
    }
  };

  const passedCount = tests.filter(t => t.status === 'passed').length;
  const failedCount = tests.filter(t => t.status === 'failed').length;
  const totalTests = tests.length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-primary" />
            Testes de Sincronização
          </h1>
          <p className="text-muted-foreground mt-1">
            Verifica a integridade da sincronização entre Supabase e Google Sheets
          </p>
        </div>
        <Button 
          onClick={runTests} 
          disabled={isRunning}
          size="lg"
          className="gap-2"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Executando...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Executar Testes
            </>
          )}
        </Button>
      </div>

      {/* Summary */}
      {totalTests > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-green-500/10 border-green-500/30">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-500">{passedCount}</div>
                <div className="text-sm text-muted-foreground">Passou</div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="py-4 flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-500">{failedCount}</div>
                <div className="text-sm text-muted-foreground">Falhou</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 flex items-center gap-3">
              <RefreshCw className="w-8 h-8 text-primary" />
              <div>
                <div className="text-2xl font-bold">{totalTests}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Test Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
            <FileSpreadsheet className="w-5 h-5 text-green-500" />
            CRUD Sync Tests
          </CardTitle>
          <CardDescription>
            Testa sincronização de operações Create, Read, Update, Delete entre Supabase e Google Sheets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tests.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Clique em "Executar Testes" para iniciar</p>
            </div>
          )}

          {tests.map((test) => (
            <div 
              key={test.id} 
              className={`p-4 rounded-lg border transition-all ${
                test.status === 'running' ? 'bg-amber-500/5 border-amber-500/30 animate-pulse' :
                test.status === 'passed' ? 'bg-green-500/5 border-green-500/30' :
                test.status === 'failed' ? 'bg-red-500/5 border-red-500/30' :
                'bg-muted/30 border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(test.status)}
                  <span className="font-medium">{test.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {test.duration && (
                    <span className="text-xs text-muted-foreground">
                      {test.duration}ms
                    </span>
                  )}
                  {getStatusBadge(test.status)}
                </div>
              </div>
              {test.message && (
                <p className={`mt-2 text-sm ${
                  test.status === 'passed' ? 'text-green-600 dark:text-green-400' :
                  test.status === 'failed' ? 'text-red-600 dark:text-red-400' :
                  'text-muted-foreground'
                }`}>
                  {test.message}
                </p>
              )}
              {test.details && (
                <pre className="mt-2 p-2 bg-muted/50 rounded text-xs overflow-x-auto">
                  {JSON.stringify(test.details, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <h3 className="font-medium mb-2">Legenda dos Testes:</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-500" />
              <span>CREATE - Cria registro de teste</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-500" />
              <span>SYNC - Sincroniza com planilha</span>
            </div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-green-500" />
              <span>READ - Verifica na planilha</span>
            </div>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-500" />
              <span>DELETE - Remove de ambos</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span>VERIFY - Confirma limpeza</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
