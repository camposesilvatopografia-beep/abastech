import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/Layout/Sidebar';
import { TopBar } from '@/components/Layout/TopBar';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import logoWatermark from '@/assets/logo-abastech-full.png';

const Index = () => {
  const [activeItem, setActiveItem] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      }
    } catch {
      localStorage.removeItem('abastech_user');
      navigate('/login');
    }
  }, [navigate]);

  const renderContent = () => {
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
      case 'suporte':
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Central de Suporte</h2>
              <p className="text-muted-foreground">Em desenvolvimento</p>
            </div>
          </div>
        );
      default:
        return <DashboardContent />;
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
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
      
      <div className="flex-1 flex flex-col min-w-0 relative">
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
        <div className="relative z-10 flex-1 flex flex-col">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default Index;
