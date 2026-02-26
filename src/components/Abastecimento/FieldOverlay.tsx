import { useState, useEffect, useMemo } from 'react';
import { X, Tablet, Loader2 } from 'lucide-react';
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
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { supabase } from '@/integrations/supabase/client';

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
  const { canView } = useRolePermissions();
  const [realFieldUser, setRealFieldUser] = useState<FieldUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  // Fetch the actual field_user for this location so inserts use a valid FK
  useEffect(() => {
    if (!open || !location) {
      setRealFieldUser(null);
      return;
    }

    const fetchFieldUser = async () => {
      setLoadingUser(true);
      try {
        const { data } = await supabase
          .from('field_users')
          .select('id, name, username, role, assigned_locations')
          .eq('active', true)
          .contains('assigned_locations', [location])
          .limit(1)
          .single();

        if (data) {
          setRealFieldUser({
            id: data.id,
            name: data.name,
            username: data.username,
            role: 'operador',
            assigned_locations: [location],
          });
        } else {
          // Fallback: use admin info but this may fail FK constraints
          console.warn('[FieldOverlay] No field_user found for location:', location);
          if (adminUser) {
            setRealFieldUser({
              id: adminUser.id,
              name: adminUser.name,
              username: adminUser.username,
              role: 'operador',
              assigned_locations: [location],
            });
          }
        }
      } catch (err) {
        console.error('[FieldOverlay] Error fetching field user:', err);
        if (adminUser) {
          setRealFieldUser({
            id: adminUser.id,
            name: adminUser.name,
            username: adminUser.username,
            role: 'operador',
            assigned_locations: [location],
          });
        }
      } finally {
        setLoadingUser(false);
      }
    };

    fetchFieldUser();
  }, [open, location, adminUser]);

  useEffect(() => {
    if (open) {
      setCurrentView((initialView as OverlayView) || 'dashboard');
    }
  }, [open, initialView]);

  if (!open) return null;

  const goBack = () => setCurrentView('dashboard');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Phone-like frame */}
      <div className="relative flex flex-col items-center">
        {/* Top bar label */}
        <div className="flex items-center gap-2 mb-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-white text-xs font-medium">
          <Tablet className="w-3.5 h-3.5" />
          <span>Visualização Tablet — {location}</span>
          <button onClick={onClose} className="ml-2 hover:text-white/60 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Device frame */}
        <div className={cn(
          "w-[620px] h-[90vh] max-h-[960px] rounded-[2rem] border-[5px] border-slate-800 bg-slate-800 shadow-2xl overflow-hidden",
          "ring-1 ring-slate-700"
        )}>
          {/* Top bezel */}
          <div className="relative h-5 bg-slate-800 flex items-center justify-center">
            <div className="w-2 h-2 bg-slate-600 rounded-full" />
          </div>

          {/* Screen content */}
          <div className="flex-1 h-[calc(100%-1.25rem)] overflow-auto bg-background rounded-b-[1.75rem]">
            {loadingUser || !realFieldUser ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Carregando usuário do local...</span>
              </div>
            ) : currentView === 'dashboard' ? (
              <FieldDashboard
                user={realFieldUser}
                onNavigateToForm={() => setCurrentView('fuel-abastecer')}
                onNavigateToHorimeter={() => setCurrentView('horimeter')}
                onNavigateToOS={() => setCurrentView('os')}
                onNavigateToFuelView={(view) => setCurrentView(view)}
                isAdmin={false}
                canViewModule={canView}
              />
            ) : currentView === 'fuel-abastecer' ? (
              <FieldFuelForm user={realFieldUser} onLogout={onClose} onBack={goBack} />
            ) : currentView === 'fuel-comboio' ? (
              <FieldComboioForm user={realFieldUser} onBack={goBack} />
            ) : currentView === 'fuel-tanque' ? (
              <FieldTanqueForm user={realFieldUser} onBack={goBack} />
            ) : currentView === 'fuel-arla' ? (
              <FieldArlaForm user={realFieldUser} onBack={goBack} />
            ) : currentView === 'fuel-arla-only' ? (
              <FieldArlaOnlyForm user={realFieldUser} onBack={goBack} />
            ) : currentView === 'fuel-registros' ? (
              <FieldFuelRecords user={realFieldUser} onBack={goBack} />
            ) : currentView === 'fuel-estoques' ? (
              <FieldStockView onBack={goBack} assignedLocations={realFieldUser.assigned_locations} />
            ) : currentView === 'horimeter' ? (
              <FieldHorimeterForm user={realFieldUser} onBack={goBack} />
            ) : currentView === 'os' ? (
              <FieldServiceOrderForm user={realFieldUser} onBack={goBack} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
