import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/Layout/Sidebar';
import { TopBar } from '@/components/Layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { DashboardContent } from '@/components/Dashboard/DashboardContent';
import { AbastecimentoPage } from '@/components/Pages/AbastecimentoPage';
import { EstoquesPage } from '@/components/Pages/EstoquesPage';
import { FrotaPage } from '@/components/Pages/FrotaPage';
import { HorimetrosPageDB } from '@/components/Pages/HorimetrosPageDB';
import { ManutencaoPage } from '@/components/Pages/ManutencaoPage';
import { MaintenanceCalendarPage } from '@/components/Pages/MaintenanceCalendarPage';
import { AlertasPage } from '@/components/Pages/AlertasPage';
import OilTypesPage from '@/components/Pages/OilTypesPage';
import LubricantsPage from '@/components/Pages/LubricantsPage';
import SystemUsersPage from '@/components/Pages/SystemUsersPage';
import SuppliersPage from '@/components/Pages/SuppliersPage';
import MechanicsPage from '@/components/Pages/MechanicsPage';
import { ApprovalRequestsPage } from '@/components/Pages/ApprovalRequestsPage';
import { RequestHistoryPage } from '@/components/Pages/RequestHistoryPage';
import { ObraSettingsPage } from '@/components/Pages/ObraSettingsPage';
import { SyncTestPage } from '@/components/Pages/SyncTestPage';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import logoWatermark from '@/assets/logo-abastech-full.png';

const Index = () => {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null);
  const [permissions, setPermissions] = useState<{ module_id: string; can_view: boolean }[]>([]);
  const [userPerms, setUserPerms] = useState<{ module_id: string; can_view: boolean }[]>([]);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Check authentication on mount
  useEffect(() => {
    const stored = localStorage.getItem('abastech_user');
    if (!stored) {
      navigate('/login');
      return;
    }
    
    try {
      const userData = JSON.parse(stored);
      const loginTime = new Date(userData.loginAt).getTime();
      const now = Date.now();
      const hoursElapsed = (now - loginTime) / (1000 * 60 * 60);
      
      if (hoursElapsed > 24) {
        localStorage.removeItem('abastech_user');
        navigate('/login');
        return;
      }
      
      setCurrentUser({ id: userData.id, role: userData.role });
      
      // Fetch permissions
      const fetchPerms = async () => {
        const [roleRes, userRes] = await Promise.all([
          supabase.from('role_permissions').select('module_id, can_view').eq('role', userData.role),
          supabase.from('user_permissions').select('module_id, can_view').eq('user_id', userData.id),
        ]);
        if (roleRes.data) setPermissions(roleRes.data as any[]);
        if (userRes.data) setUserPerms(userRes.data as any[]);
      };
      fetchPerms();
    } catch {
      localStorage.removeItem('abastech_user');
      navigate('/login');
    }
  }, [navigate]);

  const canViewModule = useCallback((moduleId: string): boolean => {
    if (!currentUser) return true; // still loading, allow
    if (currentUser.role === 'admin') return true;
    const userPerm = userPerms.find(p => p.module_id === moduleId);
    if (userPerm) return userPerm.can_view;
    const perm = permissions.find(p => p.module_id === moduleId);
    return perm?.can_view ?? false;
  }, [currentUser, permissions, userPerms]);

  const renderContent = () => {
    // Map activeItem to module_id for permission check
    const moduleMap: Record<string, string> = {
      dashboard: 'dashboard',
      abastecimento: 'abastecimento',
      frota: 'frota',
      horimetros: 'horimetros',
      manutencao: 'manutencao',
      calendario: 'calendario',
      alertas: 'alertas',
      fornecedores: 'fornecedores',
      lubrificantes: 'lubrificantes',
      mecanicos: 'mecanicos',
      tiposoleos: 'tiposoleos',
      usuarios: 'usuarios',
      obra: 'obra',
    };

    const moduleId = moduleMap[activeItem];
    if (moduleId && !canViewModule(moduleId)) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground">Você não tem permissão para acessar este módulo.</p>
          </div>
        </div>
      );
    }

    switch (activeItem) {
      case 'dashboard':
        return <DashboardContent />;
      case 'abastecimento':
        return <AbastecimentoPage />;
      case 'estoques':
        return <EstoquesPage />;
      case 'frota':
        return <FrotaPage />;
      case 'horimetros':
        return <HorimetrosPageDB />;
      case 'manutencao':
        return <ManutencaoPage />;
      case 'calendario':
        return <MaintenanceCalendarPage />;
      case 'alertas':
        return <AlertasPage />;
      case 'fornecedores':
        return <SuppliersPage />;
      case 'lubrificantes':
        return <LubricantsPage />;
      case 'mecanicos':
        return <MechanicsPage />;
      case 'tiposoleos':
        return <OilTypesPage />;
      case 'usuarios':
        return <SystemUsersPage />;
      case 'aprovacoes':
        return <ApprovalRequestsPage />;
      case 'historico-solicitacoes':
        return <RequestHistoryPage />;
      case 'obra':
        return <ObraSettingsPage />;
      case 'sync-tests':
        return <SyncTestPage />;
      default:
        return <DashboardContent />;
    }
  };

  return (
    <div className="h-screen bg-background flex overflow-hidden">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <Sidebar activeItem={activeItem} onItemClick={setActiveItem} />
      )}
      
      {/* Mobile Sidebar Sheet */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="p-0 w-60">
            <Sidebar 
              activeItem={activeItem} 
              onItemClick={setActiveItem}
              onClose={() => setSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>
      )}
      
      <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
        {/* Watermark Background */}
        <div 
          className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] z-0"
          aria-hidden="true"
        >
          <img 
            src={logoWatermark} 
            alt="" 
            className="w-[600px] max-w-[80%] h-auto"
          />
        </div>
        
        <TopBar 
          onMenuClick={() => setSidebarOpen(true)}
          showMenuButton={isMobile}
        />
        <div className="relative z-10 flex-1 flex flex-col overflow-y-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default Index;
