import { useState, useMemo, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  CheckCircle,
  Database,
  FileSpreadsheet,
  Search,
  Settings,
  Zap,
  Bot,
  Loader2,
  Sparkles,
  Save,
  RefreshCw,
  Wand2,
  Check,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useKpiMappings } from '@/hooks/useKpiMappings';

interface KPIDiagnosticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetName: string;
  sheetHeaders: string[];
  sheetRows: any[];
}

const DEFAULT_KPI_DEFINITIONS = [
  { id: 'estoqueAtual', label: 'Estoque Atual', type: 'number', description: 'Valor atual do estoque' },
  { id: 'estoqueAnterior', label: 'Estoque Anterior', type: 'number', description: 'Valor do estoque no dia anterior' },
  { id: 'entrada', label: 'Entradas', type: 'number', description: 'Total de entradas no período' },
  { id: 'saida', label: 'Saídas', type: 'number', description: 'Total de saídas no período' },
  { id: 'saidaComboios', label: 'Saída Comboios', type: 'number', description: 'Saída para comboios' },
  { id: 'saidaEquipamentos', label: 'Saída Equipamentos', type: 'number', description: 'Saída para equipamentos' },
  { id: 'data', label: 'Data', type: 'date', description: 'Data do registro' },
  { id: 'veiculo', label: 'Veículo', type: 'text', description: 'Código do veículo' },
  { id: 'quantidade', label: 'Quantidade', type: 'number', description: 'Quantidade de combustível' },
];

export function KPIDiagnosticsModal({
  open,
  onOpenChange,
  sheetName,
  sheetHeaders,
  sheetRows,
}: KPIDiagnosticsModalProps) {
  const [search, setSearch] = useState('');
  const [selectedTab, setSelectedTab] = useState('diagnostics');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiSuggestedMappings, setAiSuggestedMappings] = useState<Record<string, string>>({});
  const [aiCorrections, setAiCorrections] = useState<Array<{ type: string; description: string; action: string }>>([]);
  const [aiIssues, setAiIssues] = useState<Array<{ severity: string; message: string; solution: string }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [localMappings, setLocalMappings] = useState<Record<string, string>>({});

  // Use the persistent KPI mappings hook
  const { 
    mappings: savedMappings, 
    loading: loadingMappings, 
    saving, 
    updateMapping: saveMapping,
    saveAllMappings,
    refreshMappings 
  } = useKpiMappings(sheetName);

  // Sync local state with saved mappings when loaded
  useEffect(() => {
    if (!loadingMappings) {
      setLocalMappings(savedMappings);
    }
  }, [savedMappings, loadingMappings]);

  // Analyze headers and detect potential column types
  const headerAnalysis = useMemo(() => {
    return sheetHeaders.map(header => {
      const trimmedHeader = header.trim();
      const lowerHeader = trimmedHeader.toLowerCase();
      
      // Sample values from first 10 rows
      const sampleValues = sheetRows.slice(0, 10).map(row => row[header]).filter(Boolean);
      
      // Detect type
      let detectedType: 'number' | 'date' | 'text' = 'text';
      let confidence = 'low';
      
      // Check if mostly numbers
      const numericCount = sampleValues.filter(v => {
        const num = String(v).replace(/[.,]/g, '');
        return !isNaN(Number(num));
      }).length;
      
      if (numericCount > sampleValues.length * 0.7) {
        detectedType = 'number';
        confidence = 'high';
      }
      
      // Check if date-like
      const datePatterns = [/\d{2}\/\d{2}\/\d{4}/, /\d{4}-\d{2}-\d{2}/];
      const dateCount = sampleValues.filter(v => 
        datePatterns.some(p => p.test(String(v)))
      ).length;
      
      if (dateCount > sampleValues.length * 0.5) {
        detectedType = 'date';
        confidence = 'high';
      }
      
      // Suggest KPI mapping based on header name
      let suggestedKpi: string | null = null;
      if (lowerHeader.includes('estoque') && lowerHeader.includes('atual')) {
        suggestedKpi = 'estoqueAtual';
      } else if (lowerHeader.includes('estoque') && lowerHeader.includes('anterior')) {
        suggestedKpi = 'estoqueAnterior';
      } else if (lowerHeader.includes('entrada')) {
        suggestedKpi = 'entrada';
      } else if (lowerHeader.includes('saida') || lowerHeader.includes('saída')) {
        suggestedKpi = 'saida';
      } else if (lowerHeader.includes('data')) {
        suggestedKpi = 'data';
      } else if (lowerHeader.includes('veiculo') || lowerHeader.includes('veículo')) {
        suggestedKpi = 'veiculo';
      } else if (lowerHeader.includes('quantidade') || lowerHeader.includes('qtd')) {
        suggestedKpi = 'quantidade';
      }
      
      return {
        original: header,
        trimmed: trimmedHeader,
        detectedType,
        confidence,
        suggestedKpi,
        sampleValues: sampleValues.slice(0, 3),
        isEmpty: sampleValues.length === 0,
      };
    });
  }, [sheetHeaders, sheetRows]);

  // Diagnostic issues
  const issues = useMemo(() => {
    const problems: Array<{ type: 'warning' | 'error'; message: string; suggestion: string }> = [];
    
    // Check for unmapped KPIs
    DEFAULT_KPI_DEFINITIONS.forEach(kpi => {
      if (!localMappings[kpi.id]) {
        const suggestedColumn = headerAnalysis.find(h => h.suggestedKpi === kpi.id);
        problems.push({
          type: 'warning',
          message: `KPI "${kpi.label}" não está mapeado`,
          suggestion: suggestedColumn 
            ? `Sugestão: usar coluna "${suggestedColumn.trimmed}"` 
            : 'Nenhuma coluna compatível encontrada',
        });
      }
    });
    
    // Check for empty columns
    headerAnalysis.filter(h => h.isEmpty).forEach(h => {
      problems.push({
        type: 'warning',
        message: `Coluna "${h.trimmed}" está vazia`,
        suggestion: 'Verifique se a planilha está preenchida corretamente',
      });
    });
    
    // Check for headers with leading/trailing spaces
    headerAnalysis.filter(h => h.original !== h.trimmed).forEach(h => {
      problems.push({
        type: 'error',
        message: `Coluna "${h.original}" tem espaços extras`,
        suggestion: 'Remova espaços no início/fim do nome da coluna na planilha',
      });
    });
    
    return problems;
  }, [headerAnalysis, localMappings]);

  const filteredHeaders = useMemo(() => {
    if (!search) return headerAnalysis;
    const searchLower = search.toLowerCase();
    return headerAnalysis.filter(h => 
      h.trimmed.toLowerCase().includes(searchLower) ||
      h.suggestedKpi?.toLowerCase().includes(searchLower)
    );
  }, [headerAnalysis, search]);

  // AI Analysis function
  const handleAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('analyze-kpi', {
        body: {
          headers: sheetHeaders,
          rows: sheetRows,
          currentMappings: localMappings,
          sheetName,
        }
      });

      if (error) throw error;
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setAiAnalysis(data.analysis);
      setAiSuggestedMappings(data.suggestedMappings || {});
      setAiCorrections(data.corrections || []);
      setAiIssues(data.issues || []);
      setSelectedTab('ai');
      
      const mappingsCount = Object.keys(data.suggestedMappings || {}).length;
      toast.success(`Análise IA concluída! ${mappingsCount} mapeamentos sugeridos.`);
    } catch (error) {
      console.error('AI analysis error:', error);
      toast.error('Erro ao analisar dados. Tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle local mapping update
  const handleLocalMappingChange = (kpiId: string, columnName: string) => {
    setLocalMappings(prev => ({ ...prev, [kpiId]: columnName }));
  };

  // Save all mappings to database
  const handleSaveAllMappings = async () => {
    await saveAllMappings(localMappings);
  };

  // Apply AI suggested mappings
  const handleApplyAiMappings = async () => {
    if (Object.keys(aiSuggestedMappings).length === 0) {
      toast.error('Nenhum mapeamento sugerido pela IA');
      return;
    }

    // Merge AI suggestions with existing mappings (AI takes precedence)
    const mergedMappings = { ...localMappings, ...aiSuggestedMappings };
    setLocalMappings(mergedMappings);
    
    // Save to database
    await saveAllMappings(mergedMappings);
    
    toast.success(`${Object.keys(aiSuggestedMappings).length} mapeamentos aplicados com sucesso!`);
  };

  // Apply a single AI suggested mapping
  const handleApplySingleMapping = (kpiId: string, columnName: string) => {
    setLocalMappings(prev => ({ ...prev, [kpiId]: columnName }));
    saveMapping(kpiId, columnName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Diagnóstico e Mapeamento de KPIs
            <Badge variant="outline" className="ml-2">{sheetName}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="diagnostics" className="gap-2">
              <Zap className="w-4 h-4" />
              Diagnóstico
              {issues.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-5 flex items-center justify-center">
                  {issues.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Bot className="w-4 h-4" />
              Assistente IA
            </TabsTrigger>
            <TabsTrigger value="mapping" className="gap-2">
              <Database className="w-4 h-4" />
              Mapeamento
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diagnostics" className="mt-4">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {issues.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle className="w-12 h-12 text-success mb-3" />
                    <h3 className="text-lg font-semibold">Nenhum problema detectado</h3>
                    <p className="text-sm text-muted-foreground">
                      Os KPIs estão corretamente mapeados com a planilha
                    </p>
                  </div>
                ) : (
                  issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "p-3 rounded-lg border",
                        issue.type === 'error' 
                          ? "bg-destructive/10 border-destructive/30" 
                          : "bg-warning/10 border-warning/30"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={cn(
                          "w-4 h-4 mt-0.5 shrink-0",
                          issue.type === 'error' ? "text-destructive" : "text-warning"
                        )} />
                        <div>
                          <p className="font-medium">{issue.message}</p>
                          <p className="text-sm text-muted-foreground">{issue.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="ai" className="mt-4">
            <div className="space-y-4">
              {!aiAnalysis && !isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Assistente de Análise IA</h3>
                  <p className="text-sm text-muted-foreground max-w-md mb-6">
                    O assistente IA irá analisar os dados da planilha, identificar inconsistências 
                    e sugerir correções baseadas em padrões detectados.
                  </p>
                  <Button onClick={handleAiAnalysis} className="gap-2">
                    <Bot className="w-4 h-4" />
                    Iniciar Análise IA
                  </Button>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Analisando dados...</h3>
                  <p className="text-sm text-muted-foreground">
                    O assistente está processando {sheetRows.length} registros
                  </p>
                </div>
              )}

              {aiAnalysis && !isAnalyzing && (
                <ScrollArea className="h-[380px]">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 text-primary" />
                        <span className="font-semibold">Análise do Assistente IA</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleAiAnalysis}
                          disabled={isAnalyzing}
                          className="gap-2"
                        >
                          <Sparkles className="w-4 h-4" />
                          Nova Análise
                        </Button>
                      </div>
                    </div>

                    {/* AI Suggested Mappings - Apply Button */}
                    {Object.keys(aiSuggestedMappings).length > 0 && (
                      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Wand2 className="w-5 h-5 text-primary" />
                            <span className="font-semibold text-primary">Mapeamentos Sugeridos pela IA</span>
                            <Badge variant="secondary">{Object.keys(aiSuggestedMappings).length}</Badge>
                          </div>
                          <Button 
                            onClick={handleApplyAiMappings}
                            disabled={saving}
                            size="sm"
                            className="gap-2"
                          >
                            {saving ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                            Aplicar Todos
                          </Button>
                        </div>
                        
                        <div className="grid gap-2">
                          {Object.entries(aiSuggestedMappings).map(([kpiId, columnName]) => {
                            const kpiDef = DEFAULT_KPI_DEFINITIONS.find(k => k.id === kpiId);
                            const isApplied = localMappings[kpiId] === columnName;
                            
                            return (
                              <div 
                                key={kpiId}
                                className={cn(
                                  "flex items-center justify-between p-2 rounded-md",
                                  isApplied ? "bg-success/10" : "bg-background"
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="font-mono">
                                    {kpiDef?.label || kpiId}
                                  </Badge>
                                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-mono text-sm">{columnName}</span>
                                </div>
                                {isApplied ? (
                                  <Badge variant="default" className="gap-1">
                                    <Check className="w-3 h-3" />
                                    Aplicado
                                  </Badge>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleApplySingleMapping(kpiId, columnName)}
                                    className="gap-1 text-xs"
                                  >
                                    Aplicar
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* AI Issues */}
                    {aiIssues.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Problemas Identificados</h4>
                        {aiIssues.map((issue, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "p-3 rounded-lg border",
                              issue.severity === 'error' 
                                ? "bg-destructive/10 border-destructive/30" 
                                : issue.severity === 'warning'
                                ? "bg-warning/10 border-warning/30"
                                : "bg-muted/50 border-muted"
                            )}
                          >
                            <p className="font-medium text-sm">{issue.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{issue.solution}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AI Corrections */}
                    {aiCorrections.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Correções Recomendadas</h4>
                        {aiCorrections.map((correction, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-muted/50 border">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">{correction.type}</Badge>
                              <span className="font-medium text-sm">{correction.description}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{correction.action}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Raw Analysis Text */}
                    <div className="bg-muted/50 rounded-lg p-4 prose prose-sm dark:prose-invert max-w-none">
                      <h4 className="font-semibold text-sm mb-2">Análise Detalhada</h4>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {aiAnalysis}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              )}
            </div>
          </TabsContent>

          <TabsContent value="mapping" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar colunas..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  onClick={handleSaveAllMappings}
                  disabled={saving || loadingMappings}
                  className="gap-2"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar Mapeamentos
                </Button>
                <Button
                  variant="outline"
                  onClick={refreshMappings}
                  disabled={loadingMappings}
                  className="gap-2"
                >
                  <RefreshCw className={cn("w-4 h-4", loadingMappings && "animate-spin")} />
                </Button>
              </div>

              <ScrollArea className="h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coluna na Planilha</TableHead>
                      <TableHead>Tipo Detectado</TableHead>
                      <TableHead>Amostra</TableHead>
                      <TableHead>Mapear para KPI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHeaders.map((header, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm">
                          {header.trimmed}
                          {header.original !== header.trimmed && (
                            <Badge variant="destructive" className="ml-2 text-xs">espaços</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            header.detectedType === 'number' ? 'default' :
                            header.detectedType === 'date' ? 'secondary' : 'outline'
                          }>
                            {header.detectedType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {header.sampleValues.join(', ') || '-'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={Object.entries(localMappings).find(([_, col]) => col === header.trimmed)?.[0] || ''}
                            onValueChange={(kpiId) => handleLocalMappingChange(kpiId, header.trimmed)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Selecionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Nenhum</SelectItem>
                              {DEFAULT_KPI_DEFINITIONS.map(kpi => (
                                <SelectItem key={kpi.id} value={kpi.id}>
                                  {kpi.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Mostrando últimos 10 registros da planilha "{sheetName}"
                </p>
                <Badge variant="outline">{sheetRows.length} registros total</Badge>
              </div>
              
              <ScrollArea className="h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {sheetHeaders.slice(0, 8).map((header, idx) => (
                        <TableHead key={idx} className="text-xs">
                          {header.trim()}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sheetRows.slice(-10).reverse().map((row, idx) => (
                      <TableRow key={idx}>
                        {sheetHeaders.slice(0, 8).map((header, colIdx) => (
                          <TableCell key={colIdx} className="text-xs truncate max-w-[120px]">
                            {String(row[header] || '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between gap-2 mt-4 pt-4 border-t">
          <Button 
            variant="default" 
            onClick={handleAiAnalysis}
            disabled={isAnalyzing}
            className="gap-2"
          >
            {isAnalyzing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bot className="w-4 h-4" />
            )}
            {isAnalyzing ? 'Analisando...' : 'Análise IA'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}