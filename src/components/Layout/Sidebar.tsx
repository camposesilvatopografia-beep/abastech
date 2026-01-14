import { useState, useEffect } from 'react';
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
  Users,
  Calendar,
  Code2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import logoAbastech from '@/assets/logo-abastech-full.png';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  children?: { id: string; label: string }[];
}

interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
}

const menuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'abastecimento', label: 'Abastecimento', icon: Fuel },
  { id: 'estoques', label: 'Estoques', icon: Package },
  { id: 'frota', label: 'Frota', icon: Truck },
  { id: 'horimetros', label: 'Horímetros', icon: Clock },
  { id: 'manutencao', label: 'Manutenção', icon: Wrench },
  { id: 'calendario', label: 'Calendário Preventivas', icon: Calendar },
  { 
    id: 'cadastros', 
    label: 'Cadastros', 
    icon: FolderOpen,
    children: [
      { id: 'fornecedores', label: 'Fornecedores' },
      { id: 'lubrificantes', label: 'Lubrificantes' },
      { id: 'mecanicos', label: 'Mecânicos' },
      { id: 'tiposoleos', label: 'Tipos de Óleo' },
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
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('abastech_user');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        setCurrentUser(user);
        // If admin, check for pending requests
        if (user.role === 'admin') {
          checkPendingRequests();
        }
      } catch {
        setCurrentUser(null);
      }
    }
  }, []);

  // Check for pending approval requests (for admins)
  const checkPendingRequests = async () => {
    try {
      const { count } = await supabase
        .from('field_record_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      setPendingRequests(count || 0);
    } catch (err) {
      console.error('Error checking pending requests:', err);
    }
  };

  // Subscribe to realtime updates for pending requests
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;

    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'field_record_requests'
        },
        () => {
          checkPendingRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.role]);

  const handleLogout = () => {
    localStorage.removeItem('abastech_user');
    navigate('/login');
  };

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
    <aside className="w-60 bg-sidebar flex flex-col h-screen overflow-hidden">
      {/* Logo - Compacta */}
      <div className="p-3 flex items-center justify-center border-b border-sidebar-border bg-gradient-to-b from-sidebar-accent/50 to-transparent">
        <div className="relative group">
          <div className="absolute inset-0 blur-lg bg-amber-400/20 rounded-full scale-110 group-hover:bg-amber-400/30 transition-all duration-500" />
          <img 
            src={logoAbastech} 
            alt="Abastech" 
            className="relative z-10 h-14 w-auto object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      </div>

      {/* Navigation - Flex grow with no overflow */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-thin">
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
                "sidebar-item w-full py-2",
                activeItem === item.id && !item.children && "sidebar-item-active"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className="flex-1 text-left text-sm">{item.label}</span>
              {item.children && (
                expandedItems.includes(item.id) 
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronRight className="w-4 h-4" />
              )}
            </button>
            
            {item.children && expandedItems.includes(item.id) && (
              <div className="ml-6 mt-0.5 space-y-0.5">
                {item.children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => handleItemClick(child.id)}
                    className={cn(
                      "sidebar-item w-full text-xs py-1.5",
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

      {/* Admin Notifications */}
      {currentUser?.role === 'admin' && pendingRequests > 0 && (
        <div className="px-2 py-2 border-t border-sidebar-border">
          <button
            onClick={() => handleItemClick('aprovacoes')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 transition-colors"
          >
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-medium flex-1 text-left">Aprovações Pendentes</span>
            <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {pendingRequests}
            </span>
          </button>
        </div>
      )}

      {/* Field App Links */}
      <div className="px-2 py-1.5 border-t border-sidebar-border space-y-0.5">
        <Link
          to="/campo"
          className="sidebar-item w-full flex items-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary py-2"
        >
          <Smartphone className="w-4 h-4" />
          <span className="text-xs font-medium">Apontamento Campo</span>
        </Link>
        <Link
          to="/campo/usuarios"
          className="sidebar-item w-full flex items-center gap-2 hover:bg-sidebar-accent py-2"
        >
          <Users className="w-4 h-4" />
          <span className="text-xs">Usuários de Campo</span>
        </Link>
      </div>

      {/* User Profile - Compacto */}
      <div className="px-2 py-2 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-sidebar-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sidebar-foreground truncate">
              {currentUser?.name || 'Usuário'}
            </p>
            <p className="text-[10px] text-sidebar-muted truncate capitalize">
              {currentUser?.role || 'Operador'}
            </p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-1 hover:bg-sidebar-accent rounded flex-shrink-0"
            title="Sair"
          >
            <LogOut className="w-3.5 h-3.5 text-sidebar-muted" />
          </button>
        </div>
      </div>

      {/* Developer Credit - Mais compacto */}
      <div className="px-3 py-2 bg-sidebar-accent/50 border-t border-sidebar-border">
        <div className="flex items-center gap-1.5 justify-center text-sidebar-muted">
          <Code2 className="w-3 h-3" />
          <span className="text-[9px] font-medium tracking-wide">
            Dev: <span className="text-sidebar-foreground font-semibold">Jean Campos</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
