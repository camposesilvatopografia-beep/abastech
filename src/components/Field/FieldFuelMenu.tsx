import { Fuel, Truck, FileText, ArrowRight, Package2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useMemo } from 'react';

interface FieldUser {
  id: string;
  name: string;
  username: string;
  role: string;
  assigned_locations?: string[];
}

interface FieldFuelMenuProps {
  onNavigate: (view: 'fuel-abastecer' | 'fuel-comboio' | 'fuel-registros' | 'fuel-estoques') => void;
  user?: FieldUser;
}

export function FieldFuelMenu({ onNavigate, user }: FieldFuelMenuProps) {
  const { theme } = useTheme();

  // Only show "Carregar Comboio" for tanque/canteiro users (not comboio-only users)
  const showCarregarComboio = useMemo(() => {
    if (!user?.assigned_locations?.length) return true; // fallback: show
    const locs = user.assigned_locations;
    const hasTanque = locs.some(loc => {
      const l = loc.toLowerCase();
      return l.includes('tanque') || l.includes('canteiro');
    });
    return hasTanque;
  }, [user?.assigned_locations]);

  const menuItems = [
    {
      key: 'fuel-abastecer' as const,
      label: 'Abastecer',
      description: 'Veículos e Equipamentos',
      icon: Fuel,
      gradient: 'from-emerald-500 to-teal-600',
      shadow: 'shadow-emerald-500/25',
      iconBg: 'bg-emerald-400/30',
      show: true,
    },
    {
      key: 'fuel-comboio' as const,
      label: 'Carregar Comboio',
      description: 'Abastecimento do tanque do Comboio',
      icon: Truck,
      gradient: 'from-orange-500 to-amber-600',
      shadow: 'shadow-orange-500/25',
      iconBg: 'bg-orange-400/30',
      show: showCarregarComboio,
    },
    {
      key: 'fuel-registros' as const,
      label: 'Registros',
      description: 'Consultar registros por data',
      icon: FileText,
      gradient: 'from-blue-500 to-indigo-600',
      shadow: 'shadow-blue-500/25',
      iconBg: 'bg-blue-400/30',
      show: true,
    },
    {
      key: 'fuel-estoques' as const,
      label: 'Estoques',
      description: 'Painel de estoque por local',
      icon: Package2,
      gradient: 'from-purple-500 to-violet-600',
      shadow: 'shadow-purple-500/25',
      iconBg: 'bg-purple-400/30',
      show: true,
    },
  ];

  const visibleItems = menuItems.filter(item => item.show);

  return (
    <div className="p-4 space-y-5">
      {/* User welcome area */}
      <div className={cn(
        "rounded-2xl p-5 text-center",
        theme === 'dark'
          ? "bg-gradient-to-br from-slate-800 to-slate-700 border border-slate-600"
          : "bg-gradient-to-br from-white to-slate-50 border border-slate-200 shadow-sm"
      )}>
        <div className={cn(
          "w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center",
          theme === 'dark' ? "bg-blue-600/30" : "bg-blue-100"
        )}>
          <User className={cn("w-7 h-7", theme === 'dark' ? "text-blue-400" : "text-blue-600")} />
        </div>
        {user && (
          <h2 className={cn(
            "text-xl font-bold mb-0.5",
            theme === 'dark' ? "text-white" : "text-slate-800"
          )}>
            {user.name}
          </h2>
        )}
        <p className="text-sm text-muted-foreground">Abastecimento • Selecione uma opção</p>
      </div>

      {/* Menu Grid - 2 columns for KPI-like layout */}
      <div className={cn(
        "grid gap-3",
        visibleItems.length <= 2 ? "grid-cols-2" : "grid-cols-2"
      )}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "relative flex flex-col items-center gap-2 p-5 rounded-2xl text-white active:scale-[0.97] transition-all duration-200 text-center",
                `bg-gradient-to-br ${item.gradient} shadow-lg ${item.shadow}`
              )}
            >
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", item.iconBg)}>
                <Icon className="w-6 h-6" />
              </div>
              <span className="text-sm font-bold leading-tight">{item.label}</span>
              <span className="text-[10px] opacity-75 leading-tight">{item.description}</span>
              <ArrowRight className="w-4 h-4 opacity-50 absolute top-3 right-3" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
