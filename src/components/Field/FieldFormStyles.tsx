// Estilos otimizados para formulário de campo ao sol
// Classes reutilizáveis para alta visibilidade em ambiente externo

export const fieldFormStyles = {
  // Container de campo principal - borda grossa, sombra forte
  fieldCard: "bg-white dark:bg-slate-800 rounded-2xl border-2 border-slate-300 dark:border-slate-600 p-5 space-y-4 shadow-lg",
  
  // Card com destaque colorido (veículo, quantidade, etc)
  fieldCardHighlight: "bg-white dark:bg-slate-800 rounded-2xl border-3 p-5 space-y-4 shadow-xl",
  
  // Label com fundo sólido para máxima legibilidade
  fieldLabel: "flex items-center gap-3 text-lg font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-xl -mx-1",
  
  // Label simples sem fundo
  fieldLabelSimple: "flex items-center gap-2 text-base font-bold text-slate-700 dark:text-slate-200",
  
  // Input grande para fácil toque
  fieldInput: "h-16 text-2xl font-bold text-center border-2 border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/30 bg-white dark:bg-slate-900",
  
  // Input médio
  fieldInputMedium: "h-14 text-xl font-semibold text-center border-2 border-slate-300 dark:border-slate-600 focus:border-primary focus:ring-2 focus:ring-primary/30",
  
  // Select trigger grande
  fieldSelect: "h-16 text-xl font-semibold border-2 border-slate-300 dark:border-slate-600",
  
  // Botão de ação grande
  fieldButton: "h-16 text-xl font-bold shadow-lg",
  
  // Badge de informação
  fieldBadge: "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold",
  
  // Indicador obrigatório
  required: "text-red-500 text-xl ml-1",
  
  // Container de info anterior (horímetro/km anterior)
  infoCard: "bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-300 dark:border-blue-700 p-4 rounded-xl",
  
  // Grid de informações
  infoGrid: "grid grid-cols-2 gap-3",
  
  // Item de info individual
  infoItem: "bg-white/80 dark:bg-slate-800/80 rounded-lg p-3 border border-slate-200 dark:border-slate-700",
  
  // Label de info
  infoLabel: "text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1",
  
  // Valor de info
  infoValue: "text-lg font-bold text-slate-800 dark:text-slate-100",
};

// Cores para diferentes tipos de campos
export const fieldColors = {
  vehicle: {
    border: "border-blue-400 dark:border-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    label: "bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200",
    icon: "text-blue-600 dark:text-blue-400",
  },
  fuel: {
    border: "border-amber-400 dark:border-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    label: "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200",
    icon: "text-amber-600 dark:text-amber-400",
  },
  horimeter: {
    border: "border-emerald-400 dark:border-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    label: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  operator: {
    border: "border-purple-400 dark:border-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    label: "bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200",
    icon: "text-purple-600 dark:text-purple-400",
  },
  photo: {
    border: "border-rose-400 dark:border-rose-600",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    label: "bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200",
    icon: "text-rose-600 dark:text-rose-400",
  },
  location: {
    border: "border-teal-400 dark:border-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    label: "bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-200",
    icon: "text-teal-600 dark:text-teal-400",
  },
};
