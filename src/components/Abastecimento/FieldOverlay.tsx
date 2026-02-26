import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
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

  // Reset to dashboard when opening
  useEffect(() => {
    if (open) {
      setCurrentView((initialView as OverlayView) || 'dashboard');
    }
  }, [open, initialView]);

  if (!open || !fieldUser) return null;

  const goBack = () => setCurrentView('dashboard');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg h-[92vh] max-h-[940px] bg-background rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
          title="Voltar ao sistema"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="flex-1 overflow-auto">
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
  );
}
