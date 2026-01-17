import { useState, useCallback } from 'react';
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
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  details?: any;
  duration?: number;
}

interface TestSuite {
  name: string;
  description: string;
  tests: TestResult[];
  status: 'idle' | 'running' | 'completed';
}

export function SyncTestPage() {
  const [suites, setSuites] = useState<TestSuite[]>([
    {
      name: 'CRUD Sync Tests',
      description: 'Testa sincronização de operações Create, Read, Update, Delete entre Supabase e Google Sheets',
      tests: [],
      status: 'idle',
    },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [testRecordId, setTestRecordId] = useState<string | null>(null);

  const updateTest = useCallback((suiteIndex: number, testIndex: number, update: Partial<TestResult>) => {
    setSuites(prev => {
      const newSuites = [...prev];
      if (newSuites[suiteIndex]?.tests[testIndex]) {
        newSuites[suiteIndex].tests[testIndex] = {
          ...newSuites[suiteIndex].tests[testIndex],
          ...update,
        };
      }
      return newSuites;
    });
  }, []);

  const addTest = useCallback((suiteIndex: number, test: TestResult) => {
    setSuites(prev => {
      const newSuites = [...prev];
      if (newSuites[suiteIndex]) {
        newSuites[suiteIndex].tests = [...newSuites[suiteIndex].tests, test];
      }
      return newSuites;
    });
    return newSuites => newSuites[suiteIndex]?.tests.length - 1 || 0;
  }, []);

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runTests = async () => {
    setIsRunning(true);
    setSuites(prev => prev.map(s => ({ ...s, tests: [], status: 'running' as const })));

    const testVehicleCode = `TEST-${Date.now().toString(36).toUpperCase()}`;
    const testDate = format(new Date(), 'yyyy-MM-dd');
    const testTime = format(new Date(), 'HH:mm:ss');
    const testQuantity = Math.floor(Math.random() * 100) + 10;
    let createdRecordId: string | null = null;

    try {
      // ========== TEST 1: CREATE in Database ==========
      const test1Idx = 0;
      setSuites(prev => {
        const newSuites = [...prev];
        newSuites[0].tests.push({
          name: '1. CREATE - Inserir registro no banco de dados',
          status: 'running',
        });
        return newSuites;
      });

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
        setTestRecordId(createdRecordId);

        updateTest(0, test1Idx, {
          status: 'passed',
          message: `Registro criado: ${testVehicleCode}`,
          details: { id: createdRecordId, vehicle_code: testVehicleCode },
          duration: Date.now() - startCreate,
        });
      } catch (err: any) {
        updateTest(0, test1Idx, {
          status: 'failed',
          message: err.message || 'Erro ao criar registro',
          duration: Date.now() - startCreate,
        });
        throw err;
      }

      // ========== TEST 2: SYNC to Google Sheets ==========
      const test2Idx = 1;
      setSuites(prev => {
        const newSuites = [...prev];
        newSuites[0].tests.push({
          name: '2. SYNC - Sincronizar com Google Sheets',
          status: 'running',
        });
        return newSuites;
      });

      const startSync = Date.now();
      try {
        // Simulate what FieldFuelForm does - sync to sheet
        const sheetData = {
          'DATA': new Date(testDate).toLocaleDateString('pt-BR'),
          'HORA': testTime.substring(0, 5),
          'VEICULO': testVehicleCode,
          'QUANTIDADE': testQuantity,
          'LOCAL': 'TEST_SYNC',
          'OPERADOR': 'TESTE AUTOMATIZADO',
          'OBSERVACAO': `Teste de sincronização - ${new Date().toISOString()}`,
        };

        const { error: syncError } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'create',
            sheetName: 'AbastecimentoCanteiro01',
            data: sheetData,
          },
        });

        if (syncError) throw syncError;

        // Mark as synced in DB
        await supabase
          .from('field_fuel_records')
          .update({ synced_to_sheet: true })
          .eq('id', createdRecordId);

        updateTest(0, test2Idx, {
          status: 'passed',
          message: 'Registro sincronizado com planilha',
          details: sheetData,
          duration: Date.now() - startSync,
        });
      } catch (err: any) {
        updateTest(0, test2Idx, {
          status: 'failed',
          message: err.message || 'Erro ao sincronizar',
          duration: Date.now() - startSync,
        });
        // Continue to cleanup even if sync failed
      }

      // Wait a bit for Sheet to process
      await sleep(2000);

      // ========== TEST 3: READ from Google Sheets ==========
      const test3Idx = 2;
      setSuites(prev => {
        const newSuites = [...prev];
        newSuites[0].tests.push({
          name: '3. READ - Verificar registro na planilha',
          status: 'running',
        });
        return newSuites;
      });

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
          updateTest(0, test3Idx, {
            status: 'passed',
            message: `Registro encontrado na planilha (linha ${foundRow._rowIndex})`,
            details: { 
              _rowIndex: foundRow._rowIndex,
              VEICULO: foundRow['VEICULO'] ?? foundRow['Veiculo'],
              DATA: foundRow['DATA'] ?? foundRow['Data'],
            },
            duration: Date.now() - startRead,
          });
        } else {
          updateTest(0, test3Idx, {
            status: 'failed',
            message: `Registro ${testVehicleCode} não encontrado na planilha`,
            details: { totalRows: sheetResponse?.rows?.length || 0 },
            duration: Date.now() - startRead,
          });
        }
      } catch (err: any) {
        updateTest(0, test3Idx, {
          status: 'failed',
          message: err.message || 'Erro ao ler planilha',
          duration: Date.now() - startRead,
        });
      }

      // ========== TEST 4: DELETE from Database ==========
      const test4Idx = 3;
      setSuites(prev => {
        const newSuites = [...prev];
        newSuites[0].tests.push({
          name: '4. DELETE - Excluir registro do banco',
          status: 'running',
        });
        return newSuites;
      });

      const startDelete = Date.now();
      try {
        if (!createdRecordId) throw new Error('ID do registro não encontrado');

        const { error: deleteError } = await supabase
          .from('field_fuel_records')
          .delete()
          .eq('id', createdRecordId);

        if (deleteError) throw deleteError;

        updateTest(0, test4Idx, {
          status: 'passed',
          message: 'Registro excluído do banco de dados',
          duration: Date.now() - startDelete,
        });
      } catch (err: any) {
        updateTest(0, test4Idx, {
          status: 'failed',
          message: err.message || 'Erro ao excluir do banco',
          duration: Date.now() - startDelete,
        });
      }

      // ========== TEST 5: DELETE from Google Sheets ==========
      const test5Idx = 4;
      setSuites(prev => {
        const newSuites = [...prev];
        newSuites[0].tests.push({
          name: '5. SYNC DELETE - Excluir registro da planilha',
          status: 'running',
        });
        return newSuites;
      });

      const startSheetDelete = Date.now();
      try {
        // First, find the row in the sheet
        const { data: sheetResponse } = await supabase.functions.invoke('google-sheets', {
          body: {
            action: 'getData',
            sheetName: 'AbastecimentoCanteiro01',
            noCache: true,
          },
        });

        const testDateBR = new Date(testDate).toLocaleDateString('pt-BR');
        let rowIndex = -1;
        
        if (sheetResponse?.rows) {
          for (let i = 0; i < sheetResponse.rows.length; i++) {
            const row = sheetResponse.rows[i];
            const rowVehicle = String(row['VEICULO'] ?? row['Veiculo'] ?? '').trim().toUpperCase();
            const rowDate = String(row['DATA'] ?? row['Data'] ?? '').trim();
            if (rowVehicle === testVehicleCode.toUpperCase() && 
                (rowDate === testDateBR || rowDate.includes(testDateBR))) {
              rowIndex = row._rowIndex || (i + 2);
              break;
            }
          }
        }

        if (rowIndex > 0) {
          const { error: sheetDeleteError } = await supabase.functions.invoke('google-sheets', {
            body: {
              action: 'delete',
              sheetName: 'AbastecimentoCanteiro01',
              rowIndex: rowIndex,
            },
          });

          if (sheetDeleteError) throw sheetDeleteError;

          updateTest(0, test5Idx, {
            status: 'passed',
            message: `Linha ${rowIndex} excluída da planilha`,
            duration: Date.now() - startSheetDelete,
          });
        } else {
          updateTest(0, test5Idx, {
            status: 'failed',
            message: 'Registro não encontrado na planilha para exclusão',
            duration: Date.now() - startSheetDelete,
          });
        }
      } catch (err: any) {
        updateTest(0, test5Idx, {
          status: 'failed',
          message: err.message || 'Erro ao excluir da planilha',
          duration: Date.now() - startSheetDelete,
        });
      }

      // Wait and verify deletion
      await sleep(2000);

      // ========== TEST 6: VERIFY DELETION ==========
      const test6Idx = 5;
      setSuites(prev => {
        const newSuites = [...prev];
        newSuites[0].tests.push({
          name: '6. VERIFY - Confirmar exclusão em ambos',
          status: 'running',
        });
        return newSuites;
      });

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
          updateTest(0, test6Idx, {
            status: 'passed',
            message: '✅ Registro removido de ambos: DB e Planilha',
            details: { dbClean, sheetClean },
            duration: Date.now() - startVerify,
          });
        } else {
          updateTest(0, test6Idx, {
            status: 'failed',
            message: `Limpeza incompleta: DB=${dbClean ? '✅' : '❌'}, Sheet=${sheetClean ? '✅' : '❌'}`,
            details: { dbClean, sheetClean },
            duration: Date.now() - startVerify,
          });
        }
      } catch (err: any) {
        updateTest(0, test6Idx, {
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
      setSuites(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
      setIsRunning(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return <div className="w-4 h-4 rounded-full bg-muted" />;
      case 'running': return <Loader2 className="w-4 h-4 animate-spin text-amber-500" />;
      case 'passed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return <Badge variant="outline">Pendente</Badge>;
      case 'running': return <Badge className="bg-amber-500">Executando</Badge>;
      case 'passed': return <Badge className="bg-green-500">Passou</Badge>;
      case 'failed': return <Badge variant="destructive">Falhou</Badge>;
    }
  };

  const passedCount = suites[0]?.tests.filter(t => t.status === 'passed').length || 0;
  const failedCount = suites[0]?.tests.filter(t => t.status === 'failed').length || 0;
  const totalTests = suites[0]?.tests.length || 0;

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
        <div className="flex gap-4">
          <Card className="flex-1 bg-green-500/10 border-green-500/30">
            <CardContent className="py-4 flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-green-500">{passedCount}</div>
                <div className="text-sm text-muted-foreground">Passou</div>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 bg-red-500/10 border-red-500/30">
            <CardContent className="py-4 flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-500">{failedCount}</div>
                <div className="text-sm text-muted-foreground">Falhou</div>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1">
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

      {/* Test Suites */}
      {suites.map((suite, suiteIdx) => (
        <Card key={suiteIdx}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
              <FileSpreadsheet className="w-5 h-5 text-green-500" />
              {suite.name}
            </CardTitle>
            <CardDescription>{suite.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {suite.tests.length === 0 && suite.status === 'idle' && (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Clique em "Executar Testes" para iniciar</p>
              </div>
            )}

            {suite.tests.map((test, testIdx) => (
              <div 
                key={testIdx} 
                className={`p-4 rounded-lg border transition-all ${
                  test.status === 'running' ? 'bg-amber-500/5 border-amber-500/30' :
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
      ))}

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
