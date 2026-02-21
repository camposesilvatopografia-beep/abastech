import { Fuel, Truck, FileText, ArrowRight, Package2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface FieldFuelMenuProps {
  onNavigate: (view: 'fuel-abastecer' | 'fuel-comboio' | 'fuel-registros' | 'fuel-estoques') => void;
}

export function FieldFuelMenu({ onNavigate }: FieldFuelMenuProps) {
  const { theme } = useTheme();

  return (
    <div className="space-y-4 p-4">
      <div className={cn(
        "text-center py-2",
        theme === 'dark' ? "text-slate-200" : "text-slate-700"
      )}>
        <h2 className="text-lg font-bold">Abastecimento</h2>
        <p className="text-xs text-muted-foreground">Selecione uma opção</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {/* Abastecer - Veículos e Equipamentos */}
        <button
          onClick={() => onNavigate('fuel-abastecer')}
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-transform text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Fuel className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold block">Abastecer</span>
            <span className="text-xs opacity-80">Veículos e Equipamentos</span>
          </div>
          <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
        </button>

        {/* Carregar Comboio */}
        <button
          onClick={() => onNavigate('fuel-comboio')}
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-700 text-white shadow-lg shadow-orange-500/30 active:scale-[0.98] transition-transform text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Truck className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold block">Carregar Comboio</span>
            <span className="text-xs opacity-80">Abastecimento do tanque do Comboio</span>
          </div>
          <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
        </button>

        {/* Registros */}
        <button
          onClick={() => onNavigate('fuel-registros')}
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-transform text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <FileText className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold block">Registros</span>
            <span className="text-xs opacity-80">Consultar registros por data</span>
          </div>
          <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
        </button>

        {/* Estoques */}
        <button
          onClick={() => onNavigate('fuel-estoques')}
          className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/30 active:scale-[0.98] transition-transform text-left"
        >
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
            <Package2 className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-base font-bold block">Estoques</span>
            <span className="text-xs opacity-80">Painel de estoque por local</span>
          </div>
          <ArrowRight className="w-5 h-5 opacity-60 shrink-0" />
        </button>
      </div>
    </div>
  );
}
