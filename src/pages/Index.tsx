import { useState } from 'react';
import { Sidebar } from '@/components/Layout/Sidebar';
import { TopBar } from '@/components/Layout/TopBar';
import { DashboardContent } from '@/components/Dashboard/DashboardContent';
import { AbastecimentoPage } from '@/components/Pages/AbastecimentoPage';
import { EstoquesPage } from '@/components/Pages/EstoquesPage';
import { FrotaPage } from '@/components/Pages/FrotaPage';
import { HorimetrosPage } from '@/components/Pages/HorimetrosPage';
import { ManutencaoPage } from '@/components/Pages/ManutencaoPage';
import { AlertasPage } from '@/components/Pages/AlertasPage';
import { CadastroPage } from '@/components/Pages/CadastroPage';

const Index = () => {
  const [activeItem, setActiveItem] = useState('dashboard');

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
        return <HorimetrosPage />;
      case 'manutencao':
        return <ManutencaoPage />;
      case 'alertas':
        return <AlertasPage />;
      case 'lubrificantes':
        return <CadastroPage sheetName="Lubrificantes" title="Lubrificantes" subtitle="Cadastro de lubrificantes e óleos" />;
      case 'usuarios':
        return <CadastroPage sheetName="Usuarios" title="Usuários" subtitle="Cadastro de usuários do sistema" />;
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
      <Sidebar activeItem={activeItem} onItemClick={setActiveItem} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {renderContent()}
      </div>
    </div>
  );
};

export default Index;
