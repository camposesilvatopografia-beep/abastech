import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Smartphone, CheckCircle, Share, PlusSquare, ArrowLeft, Wifi, WifiOff, Zap } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import logoFull from '@/assets/logo-abastech-full.png';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isFieldInstall = location.pathname.includes('/apontamento');

  useEffect(() => {
    // Check if running as standalone (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect device
    const userAgent = navigator.userAgent;
    setIsIOS(/iPhone|iPad|iPod/i.test(userAgent));
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(userAgent));

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('Installation error:', error);
    }
  };

  const handleBack = () => {
    navigate('/apontamento');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
            <img src={logoFull} alt="Abastech" className="h-16 object-contain" />
          </div>
        </div>

        {/* App Name */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">Apontamento Campo</h1>
          <p className="text-slate-400 text-sm">Sistema de Apropriação de Obras</p>
        </div>

        {isInstalled ? (
          <Card className="border-green-500/30 bg-green-500/10">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-4 bg-green-500/20 rounded-full w-fit">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle className="text-green-400">App Instalado!</CardTitle>
              <CardDescription className="text-slate-300">
                O aplicativo está pronto para uso. Você pode encontrá-lo na sua tela inicial.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleBack} className="w-full" variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Abrir Apontamento Campo
              </Button>
            </CardContent>
          </Card>
        ) : isIOS ? (
          <Card className="border-primary/30 bg-slate-800/50">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-4 bg-primary/20 rounded-full w-fit">
                <Smartphone className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-white">Instalar no iPhone</CardTitle>
              <CardDescription className="text-slate-300">
                Siga os passos abaixo para instalar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                    <Share className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">1. Toque no botão Compartilhar</p>
                    <p className="text-xs text-slate-400">Ícone na barra inferior do Safari</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-500/20 rounded-lg shrink-0">
                    <PlusSquare className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">2. Adicionar à Tela de Início</p>
                    <p className="text-xs text-slate-400">Role e toque nesta opção</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
                    <CheckCircle className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">3. Confirme "Adicionar"</p>
                    <p className="text-xs text-slate-400">O app aparecerá na tela inicial</p>
                  </div>
                </div>
              </div>
              
              <Button onClick={handleBack} className="w-full" variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/30 bg-slate-800/50">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-4 p-4 bg-primary/20 rounded-full w-fit">
                <Smartphone className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-white">Instalar Aplicativo</CardTitle>
              <CardDescription className="text-slate-300">
                Instale para acesso rápido e funcionamento offline
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deferredPrompt ? (
                <Button onClick={handleInstall} className="w-full h-14 text-lg" size="lg">
                  <Download className="h-6 w-6 mr-2" />
                  Instalar Agora
                </Button>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
                  <p className="text-amber-400 text-sm font-medium">
                    Instalação via menu do navegador:
                  </p>
                  <div className="text-slate-300 text-xs space-y-1">
                    <p>• Toque nos 3 pontos do navegador (⋮)</p>
                    <p>• Selecione "Instalar app" ou "Adicionar à tela inicial"</p>
                  </div>
                </div>
              )}
              
              <Button onClick={handleBack} className="w-full" variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-800/50 rounded-xl p-3">
            <div className="mx-auto mb-2 p-2 bg-green-500/20 rounded-lg w-fit">
              <Zap className="h-5 w-5 text-green-400" />
            </div>
            <p className="text-xs text-slate-300 font-medium">Acesso Rápido</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3">
            <div className="mx-auto mb-2 p-2 bg-blue-500/20 rounded-lg w-fit">
              <WifiOff className="h-5 w-5 text-blue-400" />
            </div>
            <p className="text-xs text-slate-300 font-medium">Modo Offline</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3">
            <div className="mx-auto mb-2 p-2 bg-amber-500/20 rounded-lg w-fit">
              <Wifi className="h-5 w-5 text-amber-400" />
            </div>
            <p className="text-xs text-slate-300 font-medium">Sincronização</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs mt-6">
          Versão Mobile • Abastech
        </p>
      </div>
    </div>
  );
}
