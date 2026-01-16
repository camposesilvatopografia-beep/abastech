import { useState, useEffect } from 'react';
import { Building2, Save, MapPin, FileText, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useObraSettings } from '@/hooks/useObraSettings';

export function ObraSettingsPage() {
  const { settings, loading, saving, updateSettings } = useObraSettings();
  const [nome, setNome] = useState('');
  const [subtitulo, setSubtitulo] = useState('');
  const [cidade, setCidade] = useState('');

  useEffect(() => {
    if (settings) {
      setNome(settings.nome || '');
      setSubtitulo(settings.subtitulo || '');
      setCidade(settings.cidade || '');
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings({
      nome,
      subtitulo,
      cidade,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            Configurações da Obra
          </h1>
          <p className="text-muted-foreground mt-1">
            Defina as informações que aparecerão em todos os relatórios exportados
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Main Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Informações Principais
            </CardTitle>
            <CardDescription>
              Estes dados serão exibidos no cabeçalho de todos os relatórios PDF
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Nome da Obra / Empresa
              </Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: CONSÓRCIO AERO MARAGOGI"
                className="h-12 text-lg font-semibold"
              />
              <p className="text-xs text-muted-foreground">
                Este nome aparecerá em destaque no cabeçalho dos relatórios
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitulo" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Subtítulo / Descrição da Obra
              </Label>
              <Input
                id="subtitulo"
                value={subtitulo}
                onChange={(e) => setSubtitulo(e.target.value)}
                placeholder="Ex: Obra: Sistema de Abastecimento de Água"
              />
              <p className="text-xs text-muted-foreground">
                Informação adicional exibida abaixo do nome
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cidade" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Cidade / Localização
              </Label>
              <Input
                id="cidade"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                placeholder="Ex: Maragogi-AL"
              />
              <p className="text-xs text-muted-foreground">
                Cidade e estado da obra
              </p>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="w-full gap-2 mt-4"
              size="lg"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </CardContent>
        </Card>

        {/* Preview Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="w-5 h-5 text-primary" />
              Prévia do Cabeçalho
            </CardTitle>
            <CardDescription>
              Visualize como as informações aparecerão nos relatórios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg overflow-hidden border">
              {/* PDF Header Preview */}
              <div className="bg-slate-800 text-white p-6 text-center space-y-2">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div className="w-12 h-12 bg-white/20 rounded flex items-center justify-center">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="w-12 h-12 bg-white/20 rounded flex items-center justify-center text-xs">
                    Logo
                  </div>
                </div>
                <h2 className="text-lg font-bold">
                  {nome || 'NOME DA OBRA'}
                </h2>
                <p className="text-sm opacity-90">
                  {subtitulo || 'Subtítulo da obra'}
                </p>
                <p className="text-xs opacity-75">
                  {cidade || 'Cidade-UF'}
                </p>
              </div>
              
              {/* PDF Body Preview */}
              <div className="bg-white p-4 space-y-2">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Data: 16/01/2026</span>
                  <span>Gerado: 16/01/2026 10:00</span>
                </div>
                <div className="bg-slate-700 text-white px-3 py-2 rounded text-sm font-medium">
                  SEÇÃO DO RELATÓRIO
                </div>
                <div className="bg-gray-100 h-16 rounded flex items-center justify-center text-gray-400 text-sm">
                  Conteúdo do relatório...
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h4 className="font-semibold text-foreground">Relatórios Afetados</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Estas configurações serão aplicadas automaticamente em todos os relatórios PDF do sistema:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>Relatório de Equipamentos Mobilizados (Frota)</li>
                <li>Relatório de Horímetros</li>
                <li>Relatório de Abastecimento</li>
                <li>Ordens de Serviço (Manutenção)</li>
                <li>Relatórios de Estoque</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
