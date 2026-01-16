import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Only show on field routes
  const isFieldRoute = location.pathname.startsWith('/apontamento') || location.pathname.startsWith('/campo');

  useEffect(() => {
    // Check if running as standalone (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if mobile
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt after a short delay only on field routes
      if (isFieldRoute) {
        setTimeout(() => {
          setShowPrompt(true);
        }, 3000);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      toast.success('Apontamento Campo instalado com sucesso!');
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [isFieldRoute]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // iOS doesn't support beforeinstallprompt, show manual instructions
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        toast.info('Para instalar: toque no ícone de compartilhar (📤) e depois em "Adicionar à Tela de Início"');
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        toast.success('Instalação iniciada!');
      }
      
      setDeferredPrompt(null);
      setShowPrompt(false);
    } catch (error) {
      console.error('Installation error:', error);
    }
  };

  const dismissPrompt = () => {
    setShowPrompt(false);
    // Don't show again for 24 hours
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  // Check if prompt was recently dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa_prompt_dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const hoursSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      if (hoursSinceDismissed < 24) {
        setShowPrompt(false);
      }
    }
  }, []);

  // Only show on field routes and when not installed
  if (isInstalled || !showPrompt || !isFieldRoute || !isMobile) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Smartphone className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Instalar Apontamento Campo</h3>
            <p className="text-xs opacity-90 mt-1">
              Instale o app para acesso rápido e funcionamento offline!
            </p>
          </div>
          <button 
            onClick={dismissPrompt}
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button 
            size="sm" 
            variant="secondary" 
            onClick={dismissPrompt}
            className="flex-1 bg-white/10 hover:bg-white/20 text-primary-foreground border-0"
          >
            Agora não
          </Button>
          <Button 
            size="sm" 
            onClick={handleInstall}
            className="flex-1 bg-white text-primary hover:bg-white/90"
          >
            <Download className="h-4 w-4 mr-1" />
            Instalar
          </Button>
        </div>
      </div>
    </div>
  );
}

