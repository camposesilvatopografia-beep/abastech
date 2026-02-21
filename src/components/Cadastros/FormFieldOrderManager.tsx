import { useState, useEffect, useCallback } from 'react';
import { GripVertical, Eye, EyeOff, Save, Loader2, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FieldOrderItem {
  id: string;
  form_type: string;
  field_id: string;
  field_label: string;
  sort_order: number;
  visible: boolean;
}

const FORM_TYPES = [
  { value: 'saida', label: 'Abastecimento (Saída)' },
  { value: 'entrada', label: 'Entrada de Combustível' },
];

export function FormFieldOrderManager() {
  const [fields, setFields] = useState<FieldOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('saida');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const fetchFields = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('form_field_order')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      toast.error('Erro ao carregar configuração dos campos');
      console.error(error);
    } else {
      setFields((data || []) as unknown as FieldOrderItem[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  const currentFields = fields
    .filter(f => f.form_type === activeTab)
    .sort((a, b) => a.sort_order - b.sort_order);

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    const updated = [...currentFields];
    const [moved] = updated.splice(draggedIdx, 1);
    updated.splice(idx, 0, moved);

    // Update sort_order
    const reordered = updated.map((f, i) => ({ ...f, sort_order: i + 1 }));
    
    setFields(prev => {
      const others = prev.filter(f => f.form_type !== activeTab);
      return [...others, ...reordered];
    });
    setDraggedIdx(idx);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const toggleVisibility = (fieldId: string) => {
    setFields(prev =>
      prev.map(f =>
        f.form_type === activeTab && f.field_id === fieldId
          ? { ...f, visible: !f.visible }
          : f
      )
    );
  };

  const moveField = (idx: number, direction: 'up' | 'down') => {
    const updated = [...currentFields];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= updated.length) return;

    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    const reordered = updated.map((f, i) => ({ ...f, sort_order: i + 1 }));

    setFields(prev => {
      const others = prev.filter(f => f.form_type !== activeTab);
      return [...others, ...reordered];
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = fields.map(f => ({
        id: f.id,
        form_type: f.form_type,
        field_id: f.field_id,
        field_label: f.field_label,
        sort_order: f.sort_order,
        visible: f.visible,
      }));

      for (const item of updates) {
        const { error } = await supabase
          .from('form_field_order')
          .update({ sort_order: item.sort_order, visible: item.visible })
          .eq('id', item.id);

        if (error) throw error;
      }

      toast.success('Ordem dos campos salva com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar configuração');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    await fetchFields();
    toast.info('Configuração recarregada');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Ordem dos Campos (Formulários Mobile)</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-1" />
              Resetar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            {FORM_TYPES.map(ft => (
              <TabsTrigger key={ft.value} value={ft.value}>
                {ft.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {FORM_TYPES.map(ft => (
            <TabsContent key={ft.value} value={ft.value}>
              <div className="space-y-1">
                {currentFields.map((field, idx) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing",
                      draggedIdx === idx
                        ? "bg-primary/10 border-primary shadow-md"
                        : "bg-card border-border hover:border-primary/40",
                      !field.visible && "opacity-50"
                    )}
                  >
                    <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                    
                    <span className="text-sm font-medium flex-1">
                      {field.sort_order}. {field.field_label}
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={idx === 0}
                        onClick={() => moveField(idx, 'up')}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={idx === currentFields.length - 1}
                        onClick={() => moveField(idx, 'down')}
                      >
                        ↓
                      </Button>
                      
                      <Switch
                        checked={field.visible}
                        onCheckedChange={() => toggleVisibility(field.field_id)}
                      />
                      {field.visible ? (
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}

                {currentFields.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum campo configurado para este formulário.
                  </p>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
