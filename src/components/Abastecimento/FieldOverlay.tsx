import { useState, useEffect, useMemo } from 'react';
import { X, Smartphone } from 'lucide-react';
import { FieldFuelForm } from '@/components/Field/FieldFuelForm';
import { FieldComboioForm } from '@/components/Field/FieldComboioForm';
import { FieldTanqueForm } from '@/components/Field/FieldTanqueForm';
import { FieldArlaForm } from '@/components/Field/FieldArlaForm';
import { FieldArlaOnlyForm } from '@/components/Field/FieldArlaOnlyForm';
import { FieldFuelRecords } from '@/components/Field/FieldFuelRecords';
import { FieldStockView } from '@/components/Field/FieldStockView';
import { FieldDashboard } from '@/components/Field/FieldDashboard';
import { FieldHorimeterForm } from '@/components/Field/FieldHorimeterForm';
import { FieldServiceOrderForm } from '@/components/Field/FieldServiceOrderForm';
import { cn } from '@/lib/utils';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

type OverlayView = 'dashboard' | 'fuel-abastecer' | 'fuel-comboio' | 'fuel-tanque' | 'fuel-arla' | 'fuel-arla-only' | 'fuel-registros' | 'fuel-estoques' | 'horimeter' | 'os';

interface FieldOverlayProps {
  open: boolean;
  onClose: () => void;
  location: string;
  adminUser: { id: string; name: string; username: string; role: string } | null;
  initialView?: string;
}

export function FieldOverlay({ open, onClose, location, adminUser, initialView }: FieldOverlayProps) {
  const [currentView, setCurrentView] = useState<OverlayView>('dashboard');

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

  useEffect(() => {
    if (open) {
      setCurrentView((initialView as OverlayView) || 'dashboard');
    }
  }, [open, initialView]);

  if (!open || !fieldUser) return null;

  const goBack = () => setCurrentView('dashboard');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Phone-like frame */}
      <div className="relative flex flex-col items-center">
        {/* Top bar label */}
        <div className="flex items-center gap-2 mb-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-medium">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Visualização Mobile — {location}</span>
          <button onClick={onClose} className="ml-2 hover:text-white/60 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Device frame */}
        <div className={cn(
          "w-[400px] h-[85vh] max-h-[860px] rounded-[2.5rem] border-[6px] border-slate-800 bg-slate-800 shadow-2xl overflow-hidden",
          "ring-1 ring-slate-700"
        )}>
          {/* Notch */}
          <div className="relative h-7 bg-slate-800 flex items-center justify-center">
            <div className="w-24 h-4 bg-slate-900 rounded-b-xl" />
          </div>

          {/* Screen content */}
          <div className="flex-1 h-[calc(100%-1.75rem)] overflow-auto bg-background rounded-b-[2rem]">
            {currentView === 'dashboard' ? (
              <FieldDashboard
                user={fieldUser}
                onNavigateToForm={() => setCurrentView('fuel-abastecer')}
                onNavigateToHorimeter={() => setCurrentView('horimeter')}
                onNavigateToOS={() => setCurrentView('os')}
                onNavigateToFuelView={(view) => setCurrentView(view)}
                isAdmin={true}
                canViewModule={() => true}
              />
            ) : currentView === 'fuel-abastecer' ? (
              <FieldFuelForm user={fieldUser} onLogout={onClose} onBack={goBack} />
            ) : currentView === 'fuel-comboio' ? (
              <FieldComboioForm user={fieldUser} onBack={goBack} />
            ) : currentView === 'fuel-tanque' ? (
              <FieldTanqueForm user={fieldUser} onBack={goBack} />
            ) : currentView === 'fuel-arla' ? (
              <FieldArlaForm user={fieldUser} onBack={goBack} />
            ) : currentView === 'fuel-arla-only' ? (
              <FieldArlaOnlyForm user={fieldUser} onBack={goBack} />
            ) : currentView === 'fuel-registros' ? (
              <FieldFuelRecords user={fieldUser} onBack={goBack} />
            ) : currentView === 'fuel-estoques' ? (
              <FieldStockView onBack={goBack} assignedLocations={fieldUser.assigned_locations} />
            ) : currentView === 'horimeter' ? (
              <FieldHorimeterForm user={fieldUser} onBack={goBack} />
            ) : currentView === 'os' ? (
              <FieldServiceOrderForm user={fieldUser} onBack={goBack} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
