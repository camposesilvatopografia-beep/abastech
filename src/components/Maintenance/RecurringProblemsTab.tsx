import { useMemo, useState } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  Wrench, 
  ChevronDown,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ServiceOrder {
  id: string;
  order_number: string;
  vehicle_code: string;
  vehicle_description: string | null;
  order_date: string;
  order_type: string;
  priority: string;
  status: string;
  problem_description: string | null;
  solution_description: string | null;
  mechanic_name: string | null;
}

interface RecurringProblemsTabProps {
  orders: ServiceOrder[];
}

interface ProblemGroup {
  category: string;
  count: number;
  problems: {
    description: string;
    count: number;
    vehicles: string[];
    lastOccurrence: string;
  }[];
}

interface VehicleProblem {
  vehicleCode: string;
  vehicleDescription: string;
  count: number;
  problems: {
    description: string;
    count: number;
    lastOccurrence: string;
  }[];
}

// Extract category from vehicle description
const extractCategory = (description: string | null): string => {
  if (!description) return 'Outros';
  
  const desc = description.toLowerCase();
  
  if (desc.includes('motoniveladora')) return 'Motoniveladora';
  if (desc.includes('escavadeira') || desc.includes('escavadora')) return 'Escavadeira';
  if (desc.includes('retroescavadeira')) return 'Retroescavadeira';
  if (desc.includes('carregadeira') || desc.includes('pá carregadeira')) return 'Carregadeira';
  if (desc.includes('rolo compactador') || desc.includes('rolo')) return 'Rolo Compactador';
  if (desc.includes('trator')) return 'Trator';
  if (desc.includes('caminhão') || desc.includes('caminhao')) return 'Caminhão';
  if (desc.includes('comboio')) return 'Comboio';
  if (desc.includes('pickup') || desc.includes('hilux') || desc.includes('frontier')) return 'Pickup';
  if (desc.includes('ônibus') || desc.includes('onibus')) return 'Ônibus';
  if (desc.includes('van')) return 'Van';
  if (desc.includes('guincho')) return 'Guincho';
  if (desc.includes('gerador')) return 'Gerador';
  if (desc.includes('bomba')) return 'Bomba';
  if (desc.includes('compressor')) return 'Compressor';
  
  return 'Outros';
};

// Normalize problem description for grouping
const normalizeProblem = (problem: string | null): string => {
  if (!problem) return 'Problema não especificado';
  
  const normalized = problem.toLowerCase().trim();
  
  // Group similar problems
  if (normalized.includes('vazamento')) return 'Vazamento';
  if (normalized.includes('freio')) return 'Sistema de Freios';
  if (normalized.includes('motor') && normalized.includes('falha')) return 'Falha no Motor';
  if (normalized.includes('elétric') || normalized.includes('eletric')) return 'Sistema Elétrico';
  if (normalized.includes('hidráulic') || normalized.includes('hidraulic')) return 'Sistema Hidráulico';
  if (normalized.includes('pneu')) return 'Pneus';
  if (normalized.includes('óleo') || normalized.includes('oleo')) return 'Sistema de Lubrificação';
  if (normalized.includes('ar condicionado') || normalized.includes('ar-condicionado')) return 'Ar Condicionado';
  if (normalized.includes('transmissão') || normalized.includes('transmissao') || normalized.includes('câmbio') || normalized.includes('cambio')) return 'Transmissão';
  if (normalized.includes('suspensão') || normalized.includes('suspensao')) return 'Suspensão';
  if (normalized.includes('direção') || normalized.includes('direcao')) return 'Direção';
  if (normalized.includes('preventiva') || normalized.includes('revisão') || normalized.includes('revisao')) return 'Manutenção Preventiva';
  if (normalized.includes('bateria')) return 'Bateria';
  if (normalized.includes('filtro')) return 'Filtros';
  if (normalized.includes('correia')) return 'Correias';
  if (normalized.includes('mangueira')) return 'Mangueiras';
  if (normalized.includes('bomba')) return 'Bombas';
  
  // Return first 50 chars if no match
  return problem.slice(0, 50) + (problem.length > 50 ? '...' : '');
};

export function RecurringProblemsTab({ orders }: RecurringProblemsTabProps) {
  const [viewMode, setViewMode] = useState<'category' | 'vehicle'>('category');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedVehicles, setExpandedVehicles] = useState<Set<string>>(new Set());

  // Analyze problems by category
  const problemsByCategory = useMemo(() => {
    const categoryMap = new Map<string, Map<string, { count: number; vehicles: Set<string>; lastDate: string }>>();
    
    orders.forEach(order => {
      if (!order.problem_description) return;
      
      const category = extractCategory(order.vehicle_description);
      const problem = normalizeProblem(order.problem_description);
      
      if (!categoryMap.has(category)) {
        categoryMap.set(category, new Map());
      }
      
      const problemMap = categoryMap.get(category)!;
      
      if (!problemMap.has(problem)) {
        problemMap.set(problem, { count: 0, vehicles: new Set(), lastDate: order.order_date });
      }
      
      const problemData = problemMap.get(problem)!;
      problemData.count++;
      problemData.vehicles.add(order.vehicle_code);
      if (order.order_date > problemData.lastDate) {
        problemData.lastDate = order.order_date;
      }
    });
    
    const result: ProblemGroup[] = [];
    
    categoryMap.forEach((problemMap, category) => {
      const problems = Array.from(problemMap.entries())
        .map(([description, data]) => ({
          description,
          count: data.count,
          vehicles: Array.from(data.vehicles),
          lastOccurrence: data.lastDate,
        }))
        .sort((a, b) => b.count - a.count);
      
      result.push({
        category,
        count: problems.reduce((sum, p) => sum + p.count, 0),
        problems,
      });
    });
    
    return result.sort((a, b) => b.count - a.count);
  }, [orders]);

  // Analyze problems by vehicle
  const problemsByVehicle = useMemo(() => {
    const vehicleMap = new Map<string, { description: string; problems: Map<string, { count: number; lastDate: string }> }>();
    
    orders.forEach(order => {
      if (!order.problem_description) return;
      
      const problem = normalizeProblem(order.problem_description);
      
      if (!vehicleMap.has(order.vehicle_code)) {
        vehicleMap.set(order.vehicle_code, {
          description: order.vehicle_description || '',
          problems: new Map(),
        });
      }
      
      const vehicleData = vehicleMap.get(order.vehicle_code)!;
      
      if (!vehicleData.problems.has(problem)) {
        vehicleData.problems.set(problem, { count: 0, lastDate: order.order_date });
      }
      
      const problemData = vehicleData.problems.get(problem)!;
      problemData.count++;
      if (order.order_date > problemData.lastDate) {
        problemData.lastDate = order.order_date;
      }
    });
    
    const result: VehicleProblem[] = [];
    
    vehicleMap.forEach((data, vehicleCode) => {
      const problems = Array.from(data.problems.entries())
        .map(([description, pData]) => ({
          description,
          count: pData.count,
          lastOccurrence: pData.lastDate,
        }))
        .sort((a, b) => b.count - a.count);
      
      const totalCount = problems.reduce((sum, p) => sum + p.count, 0);
      
      // Only include vehicles with more than 1 problem
      if (totalCount > 1) {
        result.push({
          vehicleCode,
          vehicleDescription: data.description,
          count: totalCount,
          problems,
        });
      }
    });
    
    return result.sort((a, b) => b.count - a.count);
  }, [orders]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleVehicle = (vehicle: string) => {
    const newExpanded = new Set(expandedVehicles);
    if (newExpanded.has(vehicle)) {
      newExpanded.delete(vehicle);
    } else {
      newExpanded.add(vehicle);
    }
    setExpandedVehicles(newExpanded);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-4 bg-card rounded-lg border border-border p-4">
        <span className="text-sm font-medium text-muted-foreground">Agrupar por:</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('category')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
              viewMode === 'category'
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <BarChart3 className="w-4 h-4" />
            Descrição / Categoria
          </button>
          <button
            onClick={() => setViewMode('vehicle')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
              viewMode === 'vehicle'
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            <Wrench className="w-4 h-4" />
            Veículo
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold text-primary">{orders.length}</p>
          <p className="text-xs text-muted-foreground">Total de O.S.</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{problemsByCategory.length}</p>
          <p className="text-xs text-muted-foreground">Categorias</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{problemsByVehicle.length}</p>
          <p className="text-xs text-muted-foreground">Veículos Afetados</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold text-red-600">
            {problemsByCategory.reduce((sum, c) => sum + c.problems.filter(p => p.count > 2).length, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Problemas Críticos (&gt;2x)</p>
        </div>
      </div>

      {/* Problems List */}
      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">
              {viewMode === 'category' ? 'Problemas por Categoria' : 'Problemas por Veículo'}
            </h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {viewMode === 'category' ? problemsByCategory.length : problemsByVehicle.length} grupos
          </span>
        </div>

        <div className="divide-y divide-border">
          {viewMode === 'category' ? (
            problemsByCategory.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum problema registrado</p>
              </div>
            ) : (
              problemsByCategory.map((group) => (
                <div key={group.category}>
                  <button
                    onClick={() => toggleCategory(group.category)}
                    className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedCategories.has(group.category) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Wrench className="w-5 h-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{group.category}</p>
                        <p className="text-sm text-muted-foreground">
                          {group.problems.length} tipo(s) de problema
                        </p>
                      </div>
                    </div>
                    <Badge 
                      className={cn(
                        "text-lg px-3 py-1",
                        group.count > 10 ? "bg-red-500/20 text-red-600" :
                        group.count > 5 ? "bg-amber-500/20 text-amber-600" :
                        "bg-blue-500/20 text-blue-600"
                      )}
                    >
                      {group.count} ocorrências
                    </Badge>
                  </button>
                  
                  {expandedCategories.has(group.category) && (
                    <div className="bg-muted/30 border-t border-border">
                      {group.problems.map((problem, idx) => (
                        <div 
                          key={idx}
                          className="px-6 py-3 flex items-center justify-between border-b border-border/50 last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              problem.count > 3 ? "bg-red-500" :
                              problem.count > 1 ? "bg-amber-500" : "bg-green-500"
                            )} />
                            <div>
                              <p className="text-sm font-medium">{problem.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {problem.vehicles.length} veículo(s) afetado(s) • Última: {formatDate(problem.lastOccurrence)}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="font-mono">
                            {problem.count}x
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )
          ) : (
            problemsByVehicle.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhum veículo com problemas recorrentes</p>
              </div>
            ) : (
              problemsByVehicle.map((vehicle) => (
                <div key={vehicle.vehicleCode}>
                  <button
                    onClick={() => toggleVehicle(vehicle.vehicleCode)}
                    className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedVehicles.has(vehicle.vehicleCode) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{vehicle.vehicleCode}</p>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px] md:max-w-none">
                          {vehicle.vehicleDescription || 'Sem descrição'}
                        </p>
                      </div>
                    </div>
                    <Badge 
                      className={cn(
                        "text-lg px-3 py-1",
                        vehicle.count > 5 ? "bg-red-500/20 text-red-600" :
                        vehicle.count > 3 ? "bg-amber-500/20 text-amber-600" :
                        "bg-blue-500/20 text-blue-600"
                      )}
                    >
                      {vehicle.count} manutenções
                    </Badge>
                  </button>
                  
                  {expandedVehicles.has(vehicle.vehicleCode) && (
                    <div className="bg-muted/30 border-t border-border">
                      {vehicle.problems.map((problem, idx) => (
                        <div 
                          key={idx}
                          className="px-6 py-3 flex items-center justify-between border-b border-border/50 last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              problem.count > 2 ? "bg-red-500" :
                              problem.count > 1 ? "bg-amber-500" : "bg-green-500"
                            )} />
                            <div>
                              <p className="text-sm font-medium">{problem.description}</p>
                              <p className="text-xs text-muted-foreground">
                                Última ocorrência: {formatDate(problem.lastOccurrence)}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="font-mono">
                            {problem.count}x
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}
