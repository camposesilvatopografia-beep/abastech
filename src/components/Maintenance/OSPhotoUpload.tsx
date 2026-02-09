import { useState, useRef } from 'react';
import { Camera, X, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type PhotoKey = 'before' | 'after' | 'parts' | 'photo4' | 'photo5';

interface PhotoSlot {
  label: string;
  key: PhotoKey;
  icon: string;
}

const PHOTO_SLOTS: PhotoSlot[] = [
  { label: 'Antes', key: 'before', icon: '📷' },
  { label: 'Depois', key: 'after', icon: '✅' },
  { label: 'Peças', key: 'parts', icon: '🔧' },
  { label: 'Foto 4', key: 'photo4', icon: '📸' },
  { label: 'Foto 5', key: 'photo5', icon: '🖼️' },
];

interface OSPhotoUploadProps {
  photos: Record<PhotoKey, string | null>;
  onPhotoChange: (key: PhotoKey, url: string | null) => void;
  orderNumber?: string;
  vehicleCode?: string;
}

export function OSPhotoUpload({
  photos,
  onPhotoChange,
  orderNumber,
  vehicleCode,
}: OSPhotoUploadProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleUpload = async (key: PhotoKey, file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são permitidas');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 5MB');
      return;
    }

    setUploading(key);
    try {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || 'jpg';
      const prefix = vehicleCode || 'unknown';
      const orderPrefix = orderNumber || 'new';
      const filePath = `${prefix}/${orderPrefix}_${key}_${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('service-order-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('service-order-photos')
        .getPublicUrl(filePath);

      onPhotoChange(key, publicUrlData.publicUrl);
      toast.success(`Foto "${PHOTO_SLOTS.find(s => s.key === key)?.label}" enviada!`);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Erro ao enviar foto');
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = (key: PhotoKey) => {
    onPhotoChange(key, null);
  };

  // Count photos that have URLs
  const photoCount = Object.values(photos).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-primary" />
        Fotos da OS
        <span className="text-xs text-muted-foreground font-normal">
          ({photoCount}/5)
        </span>
      </Label>
      <div className="grid grid-cols-5 gap-2">
        {PHOTO_SLOTS.map((slot) => {
          const url = photos[slot.key];
          const isUploading = uploading === slot.key;

          return (
            <div key={slot.key} className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground text-center truncate">
                {slot.icon} {slot.label}
              </p>
              {url ? (
                <div className="relative group">
                  <img
                    src={url}
                    alt={`Foto ${slot.label}`}
                    className="w-full h-20 object-cover rounded-lg border-2 border-border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(url, '_blank')}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemove(slot.key)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRefs.current[slot.key]?.click()}
                  className={cn(
                    "w-full h-20 rounded-lg border-2 border-dashed border-muted-foreground/30",
                    "flex flex-col items-center justify-center gap-0.5",
                    "hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isUploading ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 text-muted-foreground/50" />
                      <span className="text-[9px] text-muted-foreground/60">Adicionar</span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={(el) => { fileInputRefs.current[slot.key] = el; }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(slot.key, file);
                  e.target.value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
