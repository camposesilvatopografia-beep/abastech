import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
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

export type AlertLevel = 'critical' | 'warning' | 'ok';

interface AlertStatus {
  diesel: AlertLevel;
  arla: AlertLevel;
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

// Generate WhatsApp message for stock alert
export function generateWhatsAppStockAlert(
  estoqueDiesel: number,
  estoqueArla: number,
  alertStatus: AlertStatus
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  let message = `🚨 *ALERTA DE ESTOQUE CRÍTICO*\n`;
  message += `📅 ${dateStr} às ${timeStr}\n\n`;
  
  if (alertStatus.diesel === 'critical') {
    message += `⛽ *DIESEL: ${estoqueDiesel.toLocaleString('pt-BR')}L*\n`;
    message += `❗ NÍVEL CRÍTICO - Abastecer URGENTE!\n\n`;
  } else if (alertStatus.diesel === 'warning') {
    message += `⛽ Diesel: ${estoqueDiesel.toLocaleString('pt-BR')}L\n`;
    message += `⚠️ Nível baixo - Planejar reposição\n\n`;
  } else {
    message += `⛽ Diesel: ${estoqueDiesel.toLocaleString('pt-BR')}L ✅\n\n`;
  }
  
  if (alertStatus.arla === 'critical') {
    message += `💧 *ARLA: ${estoqueArla.toLocaleString('pt-BR')}L*\n`;
    message += `❗ NÍVEL CRÍTICO - Abastecer URGENTE!\n\n`;
  } else if (alertStatus.arla === 'warning') {
    message += `💧 Arla: ${estoqueArla.toLocaleString('pt-BR')}L\n`;
    message += `⚠️ Nível baixo - Planejar reposição\n\n`;
  } else {
    message += `💧 Arla: ${estoqueArla.toLocaleString('pt-BR')}L ✅\n\n`;
  }
  
  message += `_Enviado via Abastech_`;
  
  return message;
}

// Open WhatsApp with stock alert message
export function shareStockAlertWhatsApp(
  estoqueDiesel: number,
  estoqueArla: number,
  alertStatus: AlertStatus,
  phoneNumber?: string
) {
  const message = generateWhatsAppStockAlert(estoqueDiesel, estoqueArla, alertStatus);
  const encodedMessage = encodeURIComponent(message);
  
  const url = phoneNumber 
    ? `https://wa.me/${phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`
    : `https://wa.me/?text=${encodedMessage}`;
  
  window.open(url, '_blank');
}

export function useStockAlerts(
  stockLevels: StockLevels,
  config: StockAlertConfig = DEFAULT_CONFIG
) {
  const lastAlertRef = useRef<{ diesel?: string; arla?: string }>({});
  const [hasPermission, setHasPermission] = useState(false);
  const initRef = useRef<boolean>(false);

  // Calculate alert status based on current stock levels
  const alertStatus = useMemo((): AlertStatus => {
    const { estoqueDiesel, estoqueArla } = stockLevels;
    
    return {
      diesel: estoqueDiesel > 0 && estoqueDiesel <= config.dieselCritical 
        ? 'critical' 
        : estoqueDiesel > 0 && estoqueDiesel <= config.dieselWarning 
          ? 'warning' 
          : 'ok',
      arla: estoqueArla > 0 && estoqueArla <= config.arlaCritical 
        ? 'critical' 
        : estoqueArla > 0 && estoqueArla <= config.arlaWarning 
          ? 'warning' 
          : 'ok',
    };
  }, [stockLevels.estoqueDiesel, stockLevels.estoqueArla, config]);

  // Initialize notification permission
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      requestNotificationPermission().then((granted) => {
        setHasPermission(granted);
        if (!granted && 'Notification' in window) {
          toast.info('Ative as notificações para receber alertas de estoque', {
            duration: 5000,
            action: {
              label: 'Ativar',
              onClick: () => {
                requestNotificationPermission().then(setHasPermission);
              },
            },
          });
        }
      });
    }
  }, []);

  // Check stock levels and trigger alerts
  const triggerAlerts = useCallback(() => {
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
        lastAlertRef.current.arla = undefined;
      }
    }
  }, [stockLevels, config]);

  // Check levels whenever they change
  useEffect(() => {
    if (stockLevels.estoqueDiesel > 0 || stockLevels.estoqueArla > 0) {
      triggerAlerts();
    }
  }, [stockLevels.estoqueDiesel, stockLevels.estoqueArla, triggerAlerts]);

  // Manual check function - re-triggers alerts
  const checkNow = useCallback(() => {
    lastAlertRef.current = {};
    triggerAlerts();
    toast.success('Verificação de estoque realizada');
  }, [triggerAlerts]);

  // Share via WhatsApp
  const shareWhatsApp = useCallback((phoneNumber?: string) => {
    shareStockAlertWhatsApp(
      stockLevels.estoqueDiesel,
      stockLevels.estoqueArla,
      alertStatus,
      phoneNumber
    );
  }, [stockLevels, alertStatus]);

  return {
    checkNow,
    alertStatus,
    hasPermission,
    requestPermission: requestNotificationPermission,
    shareWhatsApp,
  };
}
