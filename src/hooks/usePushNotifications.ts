import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    if ('Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      toast.error('Notificações não são suportadas neste navegador');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        toast.success('Notificações ativadas!');
        return true;
      } else if (result === 'denied') {
        toast.error('Notificações foram bloqueadas');
        return false;
      }
      return false;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback((options: NotificationOptions) => {
    if (!isSupported) {
      console.log('Notifications not supported, using toast fallback');
      toast.info(options.body, { description: options.title });
      return;
    }

    if (permission !== 'granted') {
      console.log('Notification permission not granted, using toast fallback');
      toast.info(options.body, { description: options.title });
      return;
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      // Auto close after 5 seconds
      setTimeout(() => notification.close(), 5000);
    } catch (error) {
      console.error('Error showing notification:', error);
      // Fallback to toast
      toast.info(options.body, { description: options.title });
    }
  }, [isSupported, permission]);

  const notifySyncComplete = useCallback((count: number) => {
    showNotification({
      title: 'Sincronização Concluída',
      body: `${count} registro(s) sincronizado(s) com sucesso!`,
      tag: 'sync-complete',
      icon: '/favicon.ico',
    });
  }, [showNotification]);

  const notifyOffline = useCallback(() => {
    showNotification({
      title: 'Conexão Perdida',
      body: 'Você está offline. Registros serão sincronizados ao reconectar.',
      tag: 'offline',
      requireInteraction: true,
    });
  }, [showNotification]);

  const notifyOnline = useCallback(() => {
    showNotification({
      title: 'Conexão Restabelecida',
      body: 'Sincronizando registros pendentes...',
      tag: 'online',
    });
  }, [showNotification]);

  return {
    isSupported,
    permission,
    requestPermission,
    showNotification,
    notifySyncComplete,
    notifyOffline,
    notifyOnline,
  };
}
