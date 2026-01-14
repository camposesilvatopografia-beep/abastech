import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface StockLevels {
  estoqueDiesel: number;
  estoqueArla: number;
}

interface StockAlertConfig {
  dieselCritical: number;
  dieselWarning: number;
  arlaCritical: number;
  arlaWarning: number;
}

const DEFAULT_CONFIG: StockAlertConfig = {
  dieselCritical: 5000,   // Below 5,000L is critical
  dieselWarning: 10000,   // Below 10,000L is warning
  arlaCritical: 500,      // Below 500L is critical
  arlaWarning: 1000,      // Below 1,000L is warning
};

// Request notification permission
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('Browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// Send a push notification
function sendPushNotification(title: string, body: string, icon?: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'stock-alert',
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    
    // Trigger device vibration if supported
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    // Auto close after 10 seconds
    setTimeout(() => notification.close(), 10000);
  }
}

export function useStockAlerts(
  stockLevels: StockLevels,
  config: StockAlertConfig = DEFAULT_CONFIG
) {
  const lastAlertRef = useRef<{ diesel?: string; arla?: string }>({});
  const hasPermissionRef = useRef<boolean>(false);
  const initRef = useRef<boolean>(false);

  // Initialize notification permission
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      requestNotificationPermission().then((granted) => {
        hasPermissionRef.current = granted;
        if (!granted && 'Notification' in window) {
          toast.info('Ative as notificações para receber alertas de estoque', {
            duration: 5000,
            action: {
              label: 'Ativar',
              onClick: () => requestNotificationPermission(),
            },
          });
        }
      });
    }
  }, []);

  // Check stock levels and trigger alerts
  const checkStockLevels = useCallback(() => {
    const { estoqueDiesel, estoqueArla } = stockLevels;

    // Check Diesel stock
    if (estoqueDiesel > 0) {
      if (estoqueDiesel <= config.dieselCritical && lastAlertRef.current.diesel !== 'critical') {
        lastAlertRef.current.diesel = 'critical';
        
        const message = `⛽ CRÍTICO: Estoque Diesel em ${estoqueDiesel.toLocaleString('pt-BR')}L - Abastecer URGENTE!`;
        
        toast.error(message, {
          duration: 10000,
        });
        
        sendPushNotification(
          '🚨 ESTOQUE CRÍTICO - DIESEL',
          `Nível atual: ${estoqueDiesel.toLocaleString('pt-BR')}L\nAbaixo do mínimo de ${config.dieselCritical.toLocaleString('pt-BR')}L`,
        );
        
      } else if (estoqueDiesel <= config.dieselWarning && estoqueDiesel > config.dieselCritical && lastAlertRef.current.diesel !== 'warning') {
        lastAlertRef.current.diesel = 'warning';
        
        const message = `⛽ ATENÇÃO: Estoque Diesel em ${estoqueDiesel.toLocaleString('pt-BR')}L - Planejar reposição`;
        
        toast.warning(message, {
          duration: 8000,
        });
        
        sendPushNotification(
          '⚠️ ATENÇÃO - DIESEL BAIXO',
          `Nível atual: ${estoqueDiesel.toLocaleString('pt-BR')}L\nConsidere repor em breve`,
        );
        
      } else if (estoqueDiesel > config.dieselWarning && lastAlertRef.current.diesel) {
        // Stock recovered, reset alert state
        lastAlertRef.current.diesel = undefined;
      }
    }

    // Check ARLA stock
    if (estoqueArla > 0) {
      if (estoqueArla <= config.arlaCritical && lastAlertRef.current.arla !== 'critical') {
        lastAlertRef.current.arla = 'critical';
        
        const message = `💧 CRÍTICO: Estoque ARLA em ${estoqueArla.toLocaleString('pt-BR')}L - Abastecer URGENTE!`;
        
        toast.error(message, {
          duration: 10000,
        });
        
        sendPushNotification(
          '🚨 ESTOQUE CRÍTICO - ARLA',
          `Nível atual: ${estoqueArla.toLocaleString('pt-BR')}L\nAbaixo do mínimo de ${config.arlaCritical.toLocaleString('pt-BR')}L`,
        );
        
      } else if (estoqueArla <= config.arlaWarning && estoqueArla > config.arlaCritical && lastAlertRef.current.arla !== 'warning') {
        lastAlertRef.current.arla = 'warning';
        
        const message = `💧 ATENÇÃO: Estoque ARLA em ${estoqueArla.toLocaleString('pt-BR')}L - Planejar reposição`;
        
        toast.warning(message, {
          duration: 8000,
        });
        
        sendPushNotification(
          '⚠️ ATENÇÃO - ARLA BAIXO',
          `Nível atual: ${estoqueArla.toLocaleString('pt-BR')}L\nConsidere repor em breve`,
        );
        
      } else if (estoqueArla > config.arlaWarning && lastAlertRef.current.arla) {
        // Stock recovered, reset alert state
        lastAlertRef.current.arla = undefined;
      }
    }
  }, [stockLevels, config]);

  // Check levels whenever they change
  useEffect(() => {
    if (stockLevels.estoqueDiesel > 0 || stockLevels.estoqueArla > 0) {
      checkStockLevels();
    }
  }, [stockLevels.estoqueDiesel, stockLevels.estoqueArla, checkStockLevels]);

  // Manual check function
  const checkNow = useCallback(() => {
    // Reset alert states to allow re-triggering
    lastAlertRef.current = {};
    checkStockLevels();
    toast.success('Verificação de estoque realizada');
  }, [checkStockLevels]);

  // Get current alert status
  const getAlertStatus = useCallback(() => {
    const { estoqueDiesel, estoqueArla } = stockLevels;
    
    return {
      diesel: estoqueDiesel <= config.dieselCritical 
        ? 'critical' 
        : estoqueDiesel <= config.dieselWarning 
          ? 'warning' 
          : 'ok',
      arla: estoqueArla <= config.arlaCritical 
        ? 'critical' 
        : estoqueArla <= config.arlaWarning 
          ? 'warning' 
          : 'ok',
    };
  }, [stockLevels, config]);

  return {
    checkNow,
    getAlertStatus,
    hasPermission: hasPermissionRef.current,
    requestPermission: requestNotificationPermission,
  };
}
