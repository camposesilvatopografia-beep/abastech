import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { X, QrCode, Loader2, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface QRCodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

// Create beep sound using Web Audio API
const playBeepSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 1200; // Frequency in Hz
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
    
    // Also vibrate if supported
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  } catch (err) {
    console.error('Error playing beep:', err);
  }
};

export function QRCodeScanner({ isOpen, onClose, onScan }: QRCodeScannerProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === Html5QrcodeScannerState.SCANNING) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannerRef.current) return;
    
    setIsStarting(true);
    setError(null);
    hasScannedRef.current = false;
    
    try {
      const scannerId = 'qr-scanner-reader';
      
      // Ensure the container has the correct ID
      containerRef.current.id = scannerId;
      
      const html5QrCode = new Html5Qrcode(scannerId);
      scannerRef.current = html5QrCode;
      
      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          // Prevent multiple scans
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          
          // Play beep sound
          if (soundEnabled) {
            playBeepSound();
          }
          
          // Callback with scanned code
          onScan(decodedText);
          
          // Close scanner after a short delay
          setTimeout(() => {
            onClose();
          }, 300);
        },
        () => {
          // QR code not found in this frame - ignore
        }
      );
      
      setIsStarting(false);
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      setError(
        err.message?.includes('NotAllowedError') || err.message?.includes('Permission')
          ? 'Permissão de câmera negada. Por favor, permita o acesso à câmera.'
          : err.message?.includes('NotFoundError')
          ? 'Nenhuma câmera encontrada no dispositivo.'
          : 'Erro ao iniciar o scanner. Tente novamente.'
      );
      setIsStarting(false);
    }
  }, [onScan, onClose, soundEnabled]);

  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        startScanner();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [isOpen, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              Scanner QR Code
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="h-8 w-8"
                title={soundEnabled ? 'Desativar som' : 'Ativar som'}
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          {/* Scanner Container */}
          <div
            ref={containerRef}
            className={cn(
              "w-full aspect-square bg-black relative overflow-hidden",
              isStarting && "flex items-center justify-center"
            )}
          >
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                <Loader2 className="w-8 h-8 animate-spin text-white mb-2" />
                <p className="text-white text-sm">Iniciando câmera...</p>
              </div>
            )}
          </div>

          {/* Scanning Overlay */}
          {!isStarting && !error && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 border-2 border-primary rounded-lg relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
                
                {/* Scanning line animation */}
                <div className="absolute left-2 right-2 h-0.5 bg-primary animate-pulse" 
                     style={{ 
                       top: '50%',
                       animation: 'scan-line 2s linear infinite'
                     }} 
                />
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-4">
              <p className="text-destructive text-center mb-4">{error}</p>
              <Button onClick={startScanner} variant="secondary">
                Tentar Novamente
              </Button>
            </div>
          )}
        </div>

        <div className="p-4 pt-2 text-center">
          <p className="text-sm text-muted-foreground">
            Aponte a câmera para o QR Code do veículo
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
