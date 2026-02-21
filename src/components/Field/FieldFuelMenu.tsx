import { Fuel, Truck, FileText, ArrowLeft, ArrowRight, Package2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';

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
  onBack?: () => void;
}

export function FieldFuelMenu({ onNavigate, user, onBack }: FieldFuelMenuProps) {
  const { theme } = useTheme();

  const menuItems = [
    {
      key: 'fuel-abastecer' as const,
      label: 'Abastecer',
      description: 'Veículos e Equipamentos',
      icon: Fuel,
      gradient: 'from-emerald-500 to-emerald-700',
      shadow: 'shadow-emerald-500/30',
    },
    {
      key: 'fuel-comboio' as const,
      label: 'Carregar Comboio',
      description: 'Abastecimento do tanque do Comboio',
      icon: Truck,
      gradient: 'from-orange-500 to-orange-700',
      shadow: 'shadow-orange-500/30',
    },
    {
      key: 'fuel-registros' as const,
      label: 'Registros',
      description: 'Consultar registros por data',
      icon: FileText,
      gradient: 'from-blue-500 to-blue-700',
      shadow: 'shadow-blue-500/30',
    },
    {
      key: 'fuel-estoques' as const,
      label: 'Estoques',
      description: 'Painel de estoque por local',
      icon: Package2,
      gradient: 'from-purple-500 to-purple-700',
      shadow: 'shadow-purple-500/30',
    },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Header with back button and user name */}
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div className="flex-1 min-w-0">
          {user && (
            <h2 className={cn(
              "text-xl font-bold truncate",
              theme === 'dark' ? "text-white" : "text-slate-800"
            )}>
              {user.name}
            </h2>
          )}
          <p className="text-sm text-muted-foreground">Abastecimento • Selecione uma opção</p>
        </div>
      </div>

      {/* Menu items - full width list */}
      <div className="grid grid-cols-1 gap-3">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "flex items-center gap-4 p-4 rounded-2xl text-white shadow-lg active:scale-[0.98] transition-transform text-left",
                `bg-gradient-to-r ${item.gradient} ${item.shadow}`
              )}
            >
              <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Icon className="w-7 h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-base font-bold block">{item.label}</span>
                <span className="text-xs opacity-80">{item.description}</span>
              </div>
              <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
