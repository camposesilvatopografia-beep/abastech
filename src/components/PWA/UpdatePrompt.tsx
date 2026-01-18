import { useEffect, useState, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Sparkles, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function UpdatePrompt() {
  const location = useLocation();
  const [showBanner, setShowBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);

  // Only show on field routes
  const isFieldRoute = location.pathname.startsWith('/apontamento') || location.pathname.startsWith('/campo');

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log('[PWA] Service worker registered:', swUrl);
      
      // Check for updates immediately on registration
      if (r) {
        r.update();
        
        // Check for updates every 15 seconds for faster propagation
        setInterval(() => {
          console.log('[PWA] Checking for updates...');
          r.update();
        }, 15 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] SW registration error:', error);
    },
    onNeedRefresh() {
      console.log('[PWA] New content available - triggering update');
      // Auto-update with countdown on field routes
      if (isFieldRoute) {
        setShowBanner(true);
        startAutoUpdateCountdown();
      }
    },
    onOfflineReady() {
      console.log('[PWA] App ready for offline use');
      toast.success('App pronto para uso offline!', { duration: 2000 });
    },
  });

  // Auto-update countdown - will update automatically after 10 seconds
  const startAutoUpdateCountdown = useCallback(() => {
    setUpdateCountdown(10);
  }, []);

  useEffect(() => {
    if (updateCountdown === null) return;
    
    if (updateCountdown <= 0) {
      // Auto-update when countdown reaches 0
      handleUpdate();
      return;
    }

    const timer = setTimeout(() => {
      setUpdateCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [updateCountdown]);

  useEffect(() => {
    if (needRefresh && isFieldRoute) {
      setShowBanner(true);
      startAutoUpdateCountdown();
    }
  }, [needRefresh, isFieldRoute, startAutoUpdateCountdown]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setUpdateCountdown(null);
    
    try {
      await updateServiceWorker(true);
      // The page will reload automatically
    } catch (error) {
      console.error('[PWA] Update failed:', error);
      toast.error('Erro ao atualizar. Recarregue a página manualmente.');
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    setNeedRefresh(false);
    setUpdateCountdown(null);
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
                {updateCountdown !== null ? (
                  <>Atualizando automaticamente em <span className="font-bold text-white">{updateCountdown}s</span>...</>
                ) : isUpdating ? (
                  'Aplicando atualização...'
                ) : (
                  'Atualize agora para ter as últimas melhorias.'
                )}
              </p>
            </div>
            {!isUpdating && (
              <button 
                onClick={handleDismiss}
                className="p-1.5 hover:bg-white/20 rounded-full transition-colors text-white/80 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <div className="flex gap-2 mt-3">
            {!isUpdating && (
              <Button 
                size="sm" 
                variant="ghost"
                onClick={handleDismiss}
                className="flex-1 h-10 bg-white/10 hover:bg-white/20 text-white border-0"
              >
                Depois
              </Button>
            )}
            <Button 
              size="sm" 
              onClick={handleUpdate}
              disabled={isUpdating}
              className={cn(
                "h-10 bg-white text-blue-800 hover:bg-blue-50 font-semibold shadow-lg",
                isUpdating ? "flex-1" : "flex-1"
              )}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Atualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar Agora {updateCountdown !== null && `(${updateCountdown}s)`}
                </>
              )}
            </Button>
          </div>
          
          {/* Progress bar for auto-update countdown */}
          {updateCountdown !== null && (
            <div className="mt-3 h-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-1000 ease-linear"
                style={{ width: `${(updateCountdown / 10) * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
