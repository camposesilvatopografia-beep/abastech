import { useState } from 'react';
import {
  Settings, Eye, EyeOff, GripVertical, RotateCcw, Save,
  Palette, Type, Columns, FileText, ChevronDown, ChevronRight,
  Bold, ArrowUp, ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  useAllReportConfigs,
  ReportConfig,
  ReportColumnConfig,
  ReportStyleConfig,
  DEFAULT_COLUMNS,
  DEFAULT_STYLE,
  DEFAULT_TITLES,
} from '@/hooks/useReportConfig';

const REPORT_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  lancamentos_tanques: { label: 'Lançamentos — Tanques', description: 'Relatório detalhado de abastecimentos nos tanques', icon: '⛽' },
  lancamentos_comboios: { label: 'Lançamentos — Comboios', description: 'Relatório detalhado de abastecimentos dos comboios', icon: '🚛' },
  horimetros_resumo: { label: 'Horímetros — Resumo', description: 'Relatório consolidado de horímetros por veículo', icon: '⏱️' },
  frota_mobilizacao: { label: 'Frota — Mobilização', description: 'Relatório de mobilização/desmobilização de equipamentos', icon: '🚜' },
  tanques_report: { label: 'Tanques (Estoque)', description: 'Relatório de estoque e movimentação dos tanques fixos', icon: '🛢️' },
};

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-8 h-8 rounded-md border border-border cursor-pointer shrink-0"
        style={{ backgroundColor: value }}
        onClick={() => document.getElementById(`color-${label}`)?.click()}
      />
      <input
        id={`color-${label}`}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground block">{value}</span>
      </div>
    </div>
  );
}

function ColumnEditor({
  columns,
  onChange,
}: {
  columns: ReportColumnConfig[];
  onChange: (cols: ReportColumnConfig[]) => void;
}) {
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newCols = [...sorted];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newCols.length) return;
    const tempOrder = newCols[index].order;
    newCols[index] = { ...newCols[index], order: newCols[swapIdx].order };
    newCols[swapIdx] = { ...newCols[swapIdx], order: tempOrder };
    onChange(newCols);
  };

  const toggleVisibility = (key: string) => {
    onChange(columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c));
  };

  const updateLabel = (key: string, label: string) => {
    onChange(columns.map(c => c.key === key ? { ...c, label } : c));
  };

  const updateWidth = (key: string, width: number) => {
    onChange(columns.map(c => c.key === key ? { ...c, width } : c));
  };

  const updateColumnStyle = (key: string, prop: string, value: any) => {
    onChange(columns.map(c => c.key === key ? { ...c, [prop]: value } : c));
  };

  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {sorted.map((col, idx) => (
        <div key={col.key}>
          <div
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg border border-border transition-colors",
              !col.visible && "opacity-50 bg-muted/30"
            )}
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === 0} onClick={() => moveColumn(idx, 'up')}>
                <ArrowUp className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={idx === sorted.length - 1} onClick={() => moveColumn(idx, 'down')}>
                <ArrowDown className="w-3 h-3" />
              </Button>
            </div>

            <Input
              value={col.label}
              onChange={(e) => updateLabel(col.key, e.target.value)}
              className="h-7 text-xs flex-1 min-w-0"
            />

            <div className="flex items-center gap-1.5 shrink-0">
              <Label className="text-[10px] text-muted-foreground">Larg:</Label>
              <Input
                type="number"
                value={col.width || ''}
                onChange={(e) => updateWidth(col.key, Number(e.target.value) || 0)}
                className="h-7 w-14 text-xs"
                placeholder="auto"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setExpandedCol(expandedCol === col.key ? null : col.key)}
              title="Estilos da coluna"
            >
              <Palette className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => toggleVisibility(col.key)}
            >
              {col.visible ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
            </Button>
          </div>

          {/* Per-column style panel */}
          {expandedCol === col.key && (
            <div className="ml-8 mr-2 mt-1 mb-2 p-3 rounded-lg border border-dashed border-border bg-muted/20 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Estilos — {col.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Font color */}
                <div className="space-y-1">
                  <Label className="text-[10px]">Cor do texto</Label>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-6 h-6 rounded border border-border cursor-pointer shrink-0"
                      style={{ backgroundColor: col.fontColor || '#000000' }}
                      onClick={() => document.getElementById(`fc-${col.key}`)?.click()}
                    />
                    <input
                      id={`fc-${col.key}`}
                      type="color"
                      value={col.fontColor || '#000000'}
                      onChange={(e) => updateColumnStyle(col.key, 'fontColor', e.target.value)}
                      className="sr-only"
                    />
                    <span className="text-[10px] text-muted-foreground">{col.fontColor || 'padrão'}</span>
                  </div>
                </div>

                {/* Bg color */}
                <div className="space-y-1">
                  <Label className="text-[10px]">Cor de fundo</Label>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-6 h-6 rounded border border-border cursor-pointer shrink-0"
                      style={{ backgroundColor: col.bgColor || '#FFFFFF' }}
                      onClick={() => document.getElementById(`bg-${col.key}`)?.click()}
                    />
                    <input
                      id={`bg-${col.key}`}
                      type="color"
                      value={col.bgColor || '#FFFFFF'}
                      onChange={(e) => updateColumnStyle(col.key, 'bgColor', e.target.value)}
                      className="sr-only"
                    />
                    <span className="text-[10px] text-muted-foreground">{col.bgColor || 'padrão'}</span>
                  </div>
                </div>

                {/* Font size */}
                <div className="space-y-1">
                  <Label className="text-[10px]">Fonte (pt)</Label>
                  <Input
                    type="number"
                    value={col.fontSize || ''}
                    onChange={(e) => updateColumnStyle(col.key, 'fontSize', Number(e.target.value) || undefined)}
                    className="h-7 w-16 text-xs"
                    placeholder="padrão"
                    min={5}
                    max={16}
                  />
                </div>

                {/* Bold */}
                <div className="space-y-1">
                  <Label className="text-[10px]">Negrito</Label>
                  <Switch
                    checked={col.bold || false}
                    onCheckedChange={(v) => updateColumnStyle(col.key, 'bold', v)}
                  />
                </div>
              </div>
              {(col.fontColor || col.bgColor || col.fontSize || col.bold) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={() => {
                    onChange(columns.map(c => c.key === col.key
                      ? { ...c, fontColor: undefined, bgColor: undefined, fontSize: undefined, bold: undefined }
                      : c
                    ));
                  }}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Limpar estilos desta coluna
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ReportConfigEditor({
  reportType,
  config,
  onSave,
}: {
  reportType: string;
  config: ReportConfig;
  onSave: (config: ReportConfig) => void;
}) {
  const [localConfig, setLocalConfig] = useState<ReportConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);
  const info = REPORT_LABELS[reportType];

  const updateStyle = (key: keyof ReportStyleConfig, value: any) => {
    setLocalConfig(prev => ({
      ...prev,
      style: { ...prev.style, [key]: value },
    }));
    setHasChanges(true);
  };

  const updateColumns = (cols: ReportColumnConfig[]) => {
    setLocalConfig(prev => ({ ...prev, columns: cols }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(localConfig);
    setHasChanges(false);
  };

  const handleReset = () => {
    const defaultConfig: ReportConfig = {
      columns: DEFAULT_COLUMNS[reportType] || [],
      style: { ...DEFAULT_STYLE, titleText: DEFAULT_TITLES[reportType] || '' },
    };
    setLocalConfig(defaultConfig);
    setHasChanges(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{info?.icon}</span>
          <div>
            <h3 className="font-semibold text-sm">{info?.label || reportType}</h3>
            <p className="text-xs text-muted-foreground">{info?.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && <Badge variant="secondary" className="text-[10px]">Alterações pendentes</Badge>}
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleReset}>
            <RotateCcw className="w-3.5 h-3.5" />
            Padrão
          </Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={!hasChanges}>
            <Save className="w-3.5 h-3.5" />
            Salvar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="style" className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-xs">
          <TabsTrigger value="style" className="gap-1.5 text-xs">
            <Palette className="w-3.5 h-3.5" />
            Estilos
          </TabsTrigger>
          <TabsTrigger value="columns" className="gap-1.5 text-xs">
            <Columns className="w-3.5 h-3.5" />
            Colunas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="style" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Title */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Título e Texto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs">Título do Relatório</Label>
                  <Input
                    value={localConfig.style.titleText}
                    onChange={(e) => updateStyle('titleText', e.target.value)}
                    className="h-8 text-xs mt-1"
                    placeholder={DEFAULT_TITLES[reportType]}
                  />
                </div>
                <div>
                  <Label className="text-xs">Tamanho da fonte do cabeçalho: {localConfig.style.headerFontSize}pt</Label>
                  <Slider
                    value={[localConfig.style.headerFontSize]}
                    onValueChange={([v]) => updateStyle('headerFontSize', v)}
                    min={6} max={14} step={0.5}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label className="text-xs">Tamanho da fonte do corpo: {localConfig.style.bodyFontSize}pt</Label>
                  <Slider
                    value={[localConfig.style.bodyFontSize]}
                    onValueChange={([v]) => updateStyle('bodyFontSize', v)}
                    min={6} max={12} step={0.5}
                    className="mt-2"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Bold className="w-3.5 h-3.5" />
                    Corpo em negrito
                  </Label>
                  <Switch
                    checked={localConfig.style.bodyBold}
                    onCheckedChange={(v) => updateStyle('bodyBold', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Exibir logo no cabeçalho</Label>
                  <Switch
                    checked={localConfig.style.showLogo}
                    onCheckedChange={(v) => updateStyle('showLogo', v)}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Colors */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  Cores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ColorInput label="Fundo do Cabeçalho" value={localConfig.style.headerBgColor} onChange={(v) => updateStyle('headerBgColor', v)} />
                <ColorInput label="Texto do Cabeçalho" value={localConfig.style.headerTextColor} onChange={(v) => updateStyle('headerTextColor', v)} />
                <Separator />
                <ColorInput label="Linha par (cor 1)" value={localConfig.style.alternateRowColor1} onChange={(v) => updateStyle('alternateRowColor1', v)} />
                <ColorInput label="Linha ímpar (cor 2)" value={localConfig.style.alternateRowColor2} onChange={(v) => updateStyle('alternateRowColor2', v)} />
                <Separator />
                <ColorInput label="Linha de Total" value={localConfig.style.totalRowColor} onChange={(v) => updateStyle('totalRowColor', v)} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="columns" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Columns className="w-4 h-4" />
                Colunas do Relatório
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Reordene, renomeie, ajuste largura e oculte colunas. Largura em mm (deixe vazio para automático).
              </p>
            </CardHeader>
            <CardContent>
              <ColumnEditor columns={localConfig.columns} onChange={updateColumns} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ReportConfigPage() {
  const { configs, loading, saveConfig, reportTypes } = useAllReportConfigs();
  const [expandedReport, setExpandedReport] = useState<string | null>(reportTypes[0] || null);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-6 space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Configuração de Relatórios</h1>
          <p className="text-sm text-muted-foreground">Personalize estilos, colunas e rótulos de todos os relatórios PDF</p>
        </div>
      </div>

      <Separator />

      {/* Report list */}
      <div className="space-y-3">
        {reportTypes.map((type) => {
          const info = REPORT_LABELS[type];
          const isExpanded = expandedReport === type;

          return (
            <div key={type} className="bg-card rounded-xl border border-border overflow-hidden">
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                onClick={() => setExpandedReport(isExpanded ? null : type)}
              >
                <span className="text-lg">{info?.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{info?.label || type}</h3>
                  <p className="text-xs text-muted-foreground">{info?.description}</p>
                </div>
                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </button>

              {isExpanded && configs[type] && (
                <div className="border-t border-border p-4">
                  <ReportConfigEditor
                    reportType={type}
                    config={configs[type]}
                    onSave={(config) => saveConfig(type, config)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
