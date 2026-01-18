import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function UpdatePrompt() {
  const location = useLocation();
  const [showBanner, setShowBanner] = useState(false);

  // Only show on field routes
  const isFieldRoute = location.pathname.startsWith('/apontamento') || location.pathname.startsWith('/campo');

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 60 seconds
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('SW registration error:', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowBanner(true);
    }
  }, [needRefresh]);

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setNeedRefresh(false);
  };

  if (!showBanner || !isFieldRoute) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] animate-in slide-in-from-top-2 duration-300">
      <div className={cn(
        "mx-2 mt-2 rounded-xl shadow-2xl overflow-hidden",
        "bg-gradient-to-r from-blue-800 via-blue-700 to-blue-800"
      )}>
        {/* Animated shimmer effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
        
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-lg animate-pulse">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-white text-sm">Nova Versão Disponível!</h3>
              <p className="text-xs text-blue-100 mt-1">
                Atualize agora para ter as últimas melhorias e correções.
              </p>
            </div>
            <button 
              onClick={handleDismiss}
              className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="flex gap-2 mt-3">
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleDismiss}
              className="flex-1 h-10 bg-white/10 hover:bg-white/20 text-white border-0"
            >
              Depois
            </Button>
            <Button 
              size="sm" 
              onClick={handleUpdate}
              className="flex-1 h-10 bg-white text-blue-800 hover:bg-blue-50 font-semibold shadow-lg"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar Agora
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
