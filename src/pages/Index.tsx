import { useState } from 'react';
import { Sidebar } from '@/components/Layout/Sidebar';
import { TopBar } from '@/components/Layout/TopBar';
import { DashboardContent } from '@/components/Dashboard/DashboardContent';

const Index = () => {
  const [activeItem, setActiveItem] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar activeItem={activeItem} onItemClick={setActiveItem} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <DashboardContent />
      </div>
    </div>
  );
};

export default Index;
