import { useState, useRef } from 'react';
import { Camera, X, ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PhotoSlot {
  label: string;
  key: 'before' | 'after' | 'parts';
  icon: string;
  color: string;
}

const PHOTO_SLOTS: PhotoSlot[] = [
  { label: 'Antes', key: 'before', icon: '📷', color: 'text-amber-500' },
  { label: 'Depois', key: 'after', icon: '✅', color: 'text-green-500' },
  { label: 'Peças', key: 'parts', icon: '🔧', color: 'text-blue-500' },
];

interface OSPhotoUploadProps {
  photoBeforeUrl: string | null;
  photoAfterUrl: string | null;
  photoPartsUrl: string | null;
  onPhotoChange: (key: 'before' | 'after' | 'parts', url: string | null) => void;
  orderNumber?: string;
  vehicleCode?: string;
}

export function OSPhotoUpload({
  photoBeforeUrl,
  photoAfterUrl,
  photoPartsUrl,
  onPhotoChange,
  orderNumber,
  vehicleCode,
}: OSPhotoUploadProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getUrl = (key: 'before' | 'after' | 'parts') => {
    switch (key) {
      case 'before': return photoBeforeUrl;
      case 'after': return photoAfterUrl;
      case 'parts': return photoPartsUrl;
    }
  };

  const handleUpload = async (key: 'before' | 'after' | 'parts', file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são permitidas');
      return;
    }

    // Validate file size (max 5MB)
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

  const handleRemove = (key: 'before' | 'after' | 'parts') => {
    onPhotoChange(key, null);
  };

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-primary" />
        Fotos da OS
      </Label>
      <div className="grid grid-cols-3 gap-3">
        {PHOTO_SLOTS.map((slot) => {
          const url = getUrl(slot.key);
          const isUploading = uploading === slot.key;

          return (
            <div key={slot.key} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground text-center">
                {slot.icon} {slot.label}
              </p>
              {url ? (
                <div className="relative group">
                  <img
                    src={url}
                    alt={`Foto ${slot.label}`}
                    className="w-full h-24 object-cover rounded-lg border-2 border-border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(url, '_blank')}
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
                    "w-full h-24 rounded-lg border-2 border-dashed border-muted-foreground/30",
                    "flex flex-col items-center justify-center gap-1",
                    "hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5 text-muted-foreground/50" />
                      <span className="text-[10px] text-muted-foreground/60">Adicionar</span>
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
