import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FieldFuelForm } from '@/components/Field/FieldFuelForm';
import { FieldComboioForm } from '@/components/Field/FieldComboioForm';
import { FieldTanqueForm } from '@/components/Field/FieldTanqueForm';
import { FieldArlaForm } from '@/components/Field/FieldArlaForm';
import { FieldArlaOnlyForm } from '@/components/Field/FieldArlaOnlyForm';
import { FieldFuelMenu } from '@/components/Field/FieldFuelMenu';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

type FieldOverlayView = 'menu' | 'fuel-abastecer' | 'fuel-comboio' | 'fuel-tanque' | 'fuel-arla' | 'fuel-arla-only';

interface FieldOverlayProps {
  open: boolean;
  onClose: () => void;
  location: string;
  adminUser: { id: string; name: string; username: string; role: string } | null;
  initialView?: string;
}

export function FieldOverlay({ open, onClose, location, adminUser, initialView }: FieldOverlayProps) {
  const [currentView, setCurrentView] = useState<FieldOverlayView>('menu');

  // Build a field user from the admin user with the selected location
  const fieldUser = useMemo((): FieldUser | null => {
    if (!adminUser) return null;
    return {
      id: adminUser.id,
      name: adminUser.name,
      username: adminUser.username,
      role: adminUser.role || 'admin',
      assigned_locations: [location],
    };
  }, [adminUser, location]);

  // Set initial view when opening
  useEffect(() => {
    if (open && initialView) {
      setCurrentView(initialView as FieldOverlayView);
    } else if (open) {
      // Auto-detect best view based on location
      if (location.toLowerCase().includes('comboio')) {
        setCurrentView('fuel-comboio');
      } else {
        setCurrentView('fuel-abastecer');
      }
    }
  }, [open, initialView, location]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setCurrentView('menu');
    }
  }, [open]);

  if (!open || !fieldUser) return null;

  const handleBack = () => {
    setCurrentView('menu');
  };

  const handleFormSuccess = () => {
    // After successful save, go back to menu or close
    setCurrentView('menu');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg h-[90vh] max-h-[900px] bg-background rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Location badge */}
        <div className="absolute top-3 left-3 z-10 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-semibold">
          ⊕ {location}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {currentView === 'menu' ? (
            <div className="min-h-full bg-gradient-to-br from-slate-100 via-slate-50 to-white dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
              <div className="pt-12 pb-4">
                <h2 className="text-xl font-bold text-foreground mb-1">Lançar como {location}</h2>
                <p className="text-sm text-muted-foreground">Selecione o tipo de lançamento</p>
              </div>
              <div className="space-y-3">
                {location.toLowerCase().includes('comboio') ? (
                  <>
                    <MenuButton
                      label="Abastecer Veículo"
                      description="Saída de combustível para veículo/equipamento"
                      color="from-green-600 to-green-700"
                      onClick={() => setCurrentView('fuel-abastecer')}
                    />
                    <MenuButton
                      label="Carregar Comboio"
                      description="Entrada/saída de diesel no comboio"
                      color="from-orange-600 to-orange-700"
                      onClick={() => setCurrentView('fuel-comboio')}
                    />
                    <MenuButton
                      label="Abastecer Apenas Arla"
                      description="Registro somente de Arla"
                      color="from-cyan-600 to-cyan-700"
                      onClick={() => setCurrentView('fuel-arla-only')}
                    />
                  </>
                ) : (
                  <>
                    <MenuButton
                      label="Abastecer Veículo"
                      description="Saída de combustível para veículo/equipamento"
                      color="from-green-600 to-green-700"
                      onClick={() => setCurrentView('fuel-abastecer')}
                    />
                    <MenuButton
                      label="Carregar Tanque Diesel"
                      description="Entrada de diesel no tanque"
                      color="from-blue-600 to-blue-700"
                      onClick={() => setCurrentView('fuel-tanque')}
                    />
                    <MenuButton
                      label="Carregar Tanque Arla"
                      description="Entrada de Arla no tanque"
                      color="from-cyan-600 to-cyan-700"
                      onClick={() => setCurrentView('fuel-arla')}
                    />
                    <MenuButton
                      label="Abastecer Apenas Arla"
                      description="Registro somente de Arla (saída)"
                      color="from-teal-600 to-teal-700"
                      onClick={() => setCurrentView('fuel-arla-only')}
                    />
                  </>
                )}
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="w-full mt-4 text-muted-foreground"
                >
                  Voltar ao Sistema
                </Button>
              </div>
            </div>
          ) : currentView === 'fuel-abastecer' ? (
            <FieldFuelForm user={fieldUser} onLogout={onClose} onBack={handleBack} />
          ) : currentView === 'fuel-comboio' ? (
            <FieldComboioForm user={fieldUser} onBack={handleBack} />
          ) : currentView === 'fuel-tanque' ? (
            <FieldTanqueForm user={fieldUser} onBack={handleBack} />
          ) : currentView === 'fuel-arla' ? (
            <FieldArlaForm user={fieldUser} onBack={handleBack} />
          ) : currentView === 'fuel-arla-only' ? (
            <FieldArlaOnlyForm user={fieldUser} onBack={handleBack} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MenuButton({ label, description, color, onClick }: { label: string; description: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-5 py-4 rounded-xl bg-gradient-to-r text-white shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]",
        color,
      )}
    >
      <div className="font-bold text-base">{label}</div>
      <div className="text-white/80 text-xs mt-0.5">{description}</div>
    </button>
  );
}
