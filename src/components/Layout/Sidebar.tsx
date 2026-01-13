import { useState } from 'react';
import { 
  LayoutDashboard, 
  Fuel, 
  Package, 
  Truck, 
  Clock, 
  Wrench, 
  FolderOpen, 
  Bell, 
  HelpCircle,
  ChevronDown,
  ChevronRight,
  LogOut,
  User,
  Smartphone,
  Users
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  children?: { id: string; label: string }[];
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'abastecimento', label: 'Abastecimento', icon: Fuel },
  { id: 'estoques', label: 'Estoques', icon: Package },
  { id: 'frota', label: 'Frota', icon: Truck },
  { id: 'horimetros', label: 'Horímetros', icon: Clock },
  { id: 'manutencao', label: 'Manutenção', icon: Wrench },
  { 
    id: 'cadastros', 
    label: 'Cadastros', 
    icon: FolderOpen,
    children: [
      { id: 'lubrificantes', label: 'Lubrificantes' },
      { id: 'usuarios', label: 'Usuários' },
    ]
  },
  { id: 'alertas', label: 'Alertas', icon: Bell },
  { id: 'suporte', label: 'Central de Suporte', icon: HelpCircle },
];

interface SidebarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
  onClose?: () => void;
}

export function Sidebar({ activeItem, onItemClick, onClose }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>(['cadastros']);

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };

  const handleItemClick = (id: string) => {
    onItemClick(id);
    onClose?.();
  };

  return (
    <aside className="w-60 bg-sidebar flex flex-col h-screen">
      {/* Logo */}
      <div className="p-4 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <div className="w-2 h-2 rounded-full bg-yellow-500" />
        <div className="w-2 h-2 rounded-full bg-green-500" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {menuItems.map((item) => (
          <div key={item.id}>
            <button
              onClick={() => {
                if (item.children) {
                  toggleExpand(item.id);
                } else {
                  handleItemClick(item.id);
                }
              }}
              className={cn(
                "sidebar-item w-full",
                activeItem === item.id && !item.children && "sidebar-item-active"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1 text-left text-sm">{item.label}</span>
              {item.children && (
                expandedItems.includes(item.id) 
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />
              )}
            </button>
            
            {item.children && expandedItems.includes(item.id) && (
              <div className="ml-8 mt-1 space-y-1">
                {item.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleItemClick(child.id)}
                    className={cn(
                      "sidebar-item w-full text-sm",
                      activeItem === child.id && "sidebar-item-active"
                    )}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Field App Links */}
      <div className="px-3 py-2 border-t border-sidebar-border space-y-1">
        <Link
          to="/campo"
          className="sidebar-item w-full flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary"
        >
          <Smartphone className="w-5 h-5" />
          <span className="text-sm font-medium">Apontamento Campo</span>
        </Link>
        <Link
          to="/campo/usuarios"
          className="sidebar-item w-full flex items-center gap-2 hover:bg-sidebar-accent"
        >
          <Users className="w-5 h-5" />
          <span className="text-sm">Usuários de Campo</span>
        </Link>
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center">
            <User className="w-5 h-5 text-sidebar-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">Jean</p>
            <p className="text-xs text-sidebar-muted truncate">Administrador Pri...</p>
          </div>
          <button className="p-1 hover:bg-sidebar-accent rounded">
            <LogOut className="w-4 h-4 text-sidebar-muted" />
          </button>
        </div>
      </div>
    </aside>
  );
}
