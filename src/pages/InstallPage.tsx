import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Smartphone, Monitor, CheckCircle, Share, PlusSquare, ArrowLeft } from 'lucide-react';
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
  const isFieldInstall = location.pathname === '/apontamento/instalar';

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
    if (isFieldInstall) {
      navigate('/apontamento');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={logoFull} alt="Abastech" className="h-16 object-contain" />
        </div>

        {isInstalled ? (
          <Card className="border-green-500/30 bg-green-500/10">
            <CardHeader className="text-center">
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
                Voltar ao Sistema
              </Button>
            </CardContent>
          </Card>
        ) : isIOS ? (
          <Card className="border-primary/30 bg-slate-800/50">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-primary/20 rounded-full w-fit">
                <Smartphone className="h-12 w-12 text-primary" />
              </div>
              <CardTitle className="text-white">
                {isFieldInstall ? 'Instalar Apontamento Campo' : 'Instalar Abastech'}
              </CardTitle>
              <CardDescription className="text-slate-300">
                Siga os passos abaixo para instalar no iOS
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
                    <p className="text-xs text-slate-400">Ícone de compartilhar na barra do Safari</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-500/20 rounded-lg shrink-0">
                    <PlusSquare className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">2. Adicionar à Tela de Início</p>
                    <p className="text-xs text-slate-400">Role para baixo e toque nesta opção</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500/20 rounded-lg shrink-0">
                    <CheckCircle className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white text-sm">3. Confirme "Adicionar"</p>
                    <p className="text-xs text-slate-400">O app aparecerá na sua tela inicial</p>
                  </div>
                </div>
              </div>
              
              <Button onClick={handleBack} className="w-full" variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Sistema
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/30 bg-slate-800/50">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 p-4 bg-primary/20 rounded-full w-fit">
                {isMobile ? (
                  <Smartphone className="h-12 w-12 text-primary" />
                ) : (
                  <Monitor className="h-12 w-12 text-primary" />
                )}
              </div>
              <CardTitle className="text-white">
                {isFieldInstall ? 'Instalar Apontamento Campo' : 'Instalar Abastech'}
              </CardTitle>
              <CardDescription className="text-slate-300">
                {isMobile 
                  ? 'Instale o aplicativo para acesso rápido e funcionamento offline'
                  : 'Instale o sistema no seu computador para acesso direto'
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {deferredPrompt ? (
                <Button onClick={handleInstall} className="w-full" size="lg">
                  <Download className="h-5 w-5 mr-2" />
                  Instalar Agora
                </Button>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                  <p className="text-amber-400 text-sm">
                    O navegador não suporta instalação automática. 
                    Use o menu do navegador para adicionar à tela inicial.
                  </p>
                </div>
              )}
              
              <Button onClick={handleBack} className="w-full" variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Sistema
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="text-slate-400">
            <div className="mx-auto mb-2 p-2 bg-slate-800 rounded-lg w-fit">
              <Download className="h-5 w-5" />
            </div>
            <p className="text-xs">Acesso Rápido</p>
          </div>
          <div className="text-slate-400">
            <div className="mx-auto mb-2 p-2 bg-slate-800 rounded-lg w-fit">
              <Smartphone className="h-5 w-5" />
            </div>
            <p className="text-xs">Funciona Offline</p>
          </div>
          <div className="text-slate-400">
            <div className="mx-auto mb-2 p-2 bg-slate-800 rounded-lg w-fit">
              <CheckCircle className="h-5 w-5" />
            </div>
            <p className="text-xs">Atualizações Auto</p>
          </div>
        </div>
      </div>
    </div>
  );
}
