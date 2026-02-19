import { 
  Truck, 
  Activity, 
  X, 
  Cog, 
  Wrench,
  Calendar,
  AlertTriangle,
  User,
  Building2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type KpiType = 'total' | 'ativos' | 'inativos' | 'manutencao' | 'mobilizados' | 'desmobilizados' | 'obra_saneamento';

interface VehicleItem {
  codigo: string;
  descricao: string;
  empresa: string;
  categoria: string;
  status: string;
}

interface MaintenanceOrder {
  vehicle_code: string;
  vehicle_description: string | null;
  problem_description: string | null;
  status: string;
  entry_date: string | null;
  mechanic_name: string | null;
}

interface FrotaKpiDetailModalProps {
  open: boolean;
  onClose: () => void;
  kpiType: KpiType;
  vehicles: VehicleItem[];
  maintenanceOrders: MaintenanceOrder[];
  onVehicleClick?: (vehicle: VehicleItem) => void;
}

const KPI_CONFIG: Record<KpiType, { 
  title: string; 
  icon: React.ElementType; 
  color: string;
  headerBg: string;
  statusFilter?: string;
}> = {
  total: { 
    title: 'Todos os Veículos/Equipamentos', 
    icon: Truck, 
    color: 'text-blue-600',
    headerBg: 'bg-gradient-to-r from-blue-500 to-blue-600',
  },
  ativos: { 
    title: 'Veículos Ativos', 
    icon: Activity, 
    color: 'text-emerald-600',
    headerBg: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    statusFilter: 'ativo',
  },
  inativos: { 
    title: 'Veículos Inativos', 
    icon: X, 
    color: 'text-gray-600',
    headerBg: 'bg-gradient-to-r from-gray-400 to-gray-500',
    statusFilter: 'inativo',
  },
  manutencao: { 
    title: 'Em Manutenção — Ordens de Serviço Ativas', 
    icon: Cog, 
    color: 'text-amber-600',
    headerBg: 'bg-gradient-to-r from-amber-500 to-amber-600',
    statusFilter: 'manutencao',
  },
  mobilizados: { 
    title: 'Veículos Mobilizados', 
    icon: Truck, 
    color: 'text-blue-500',
    headerBg: 'bg-gradient-to-r from-blue-400 to-blue-500',
    statusFilter: 'mobilizado',
  },
  desmobilizados: { 
    title: 'Veículos Desmobilizados', 
    icon: X, 
    color: 'text-red-500',
    headerBg: 'bg-gradient-to-r from-red-400 to-red-500',
    statusFilter: 'desmobilizado',
  },
  obra_saneamento: { 
    title: 'Obra Saneamento', 
    icon: Building2, 
    color: 'text-purple-600',
    headerBg: 'bg-gradient-to-r from-purple-500 to-purple-600',
    statusFilter: 'obra_saneamento',
  },
};

export function FrotaKpiDetailModal({
  open,
  onClose,
  kpiType,
  vehicles,
  maintenanceOrders,
  onVehicleClick,
}: FrotaKpiDetailModalProps) {
  const config = KPI_CONFIG[kpiType];
  const Icon = config.icon;

  // Filter vehicles by status
  const filteredVehicles = config.statusFilter
    ? vehicles.filter(v => {
        const s = v.status.toLowerCase();
        const empresa = (v.empresa || '').toLowerCase();
        const descricao = (v.descricao || '').toLowerCase();
        if (config.statusFilter === 'obra_saneamento') {
          return empresa.includes('obra saneamento') || descricao.includes('aferição comboio') || descricao.includes('afericao comboio') || descricao === 'ajuste';
        }
        if (config.statusFilter === 'manutencao') {
          return s === 'manutencao' || s === 'manutenção';
        }
        return s === config.statusFilter;
      })
    : vehicles;

  // For maintenance KPI, show service orders
  const isMaintenanceKpi = kpiType === 'manutencao';

  // Group vehicles by empresa for the vehicle tables
  const groupedByEmpresa = filteredVehicles.reduce((acc, v) => {
    const emp = v.empresa || 'Não informada';
    if (!acc[emp]) acc[emp] = [];
    acc[emp].push(v);
    return acc;
  }, {} as Record<string, VehicleItem[]>);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Colored header */}
        <div className={cn('px-6 py-4 text-white rounded-t-lg', config.headerBg)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white text-lg">
              <Icon className="w-6 h-6" />
              {config.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-4 mt-2 text-sm opacity-90">
            {isMaintenanceKpi ? (
              <>
                <span>{maintenanceOrders.length} ordens de serviço ativas</span>
                {filteredVehicles.length > 0 && (
                  <span>+ {filteredVehicles.length} com status manutenção</span>
                )}
              </>
            ) : (
              <span>{filteredVehicles.length} veículos</span>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Maintenance Orders Table */}
          {isMaintenanceKpi && maintenanceOrders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                Ordens de Serviço Ativas ({maintenanceOrders.length})
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="py-2 px-3">Veículo</TableHead>
                      <TableHead className="py-2 px-3">Descrição</TableHead>
                      <TableHead className="py-2 px-3 hidden sm:table-cell">Problema</TableHead>
                      <TableHead className="py-2 px-3 hidden md:table-cell">Mecânico</TableHead>
                      <TableHead className="py-2 px-3">Entrada</TableHead>
                      <TableHead className="py-2 px-3">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {maintenanceOrders.map((order, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/30">
                        <TableCell className="py-2 px-3 font-mono font-medium">
                          {order.vehicle_code}
                        </TableCell>
                        <TableCell className="py-2 px-3 max-w-[120px] truncate">
                          {order.vehicle_description || '-'}
                        </TableCell>
                        <TableCell className="py-2 px-3 hidden sm:table-cell max-w-[180px] truncate text-muted-foreground">
                          {order.problem_description || '-'}
                        </TableCell>
                        <TableCell className="py-2 px-3 hidden md:table-cell">
                          {order.mechanic_name ? (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {order.mechanic_name}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          {order.entry_date ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(order.entry_date), 'dd/MM/yy')}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="py-2 px-3">
                          <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]">
                            {order.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Vehicles with maintenance status from sheet */}
          {isMaintenanceKpi && filteredVehicles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Status Manutenção na Planilha ({filteredVehicles.length})
              </h3>
              <VehicleTable vehicles={filteredVehicles} onVehicleClick={onVehicleClick} />
            </div>
          )}

          {/* Regular vehicle list for non-maintenance KPIs */}
          {!isMaintenanceKpi && (
            Object.keys(groupedByEmpresa).length > 0 ? (
              Object.entries(groupedByEmpresa)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([empresa, vecs]) => (
                  <div key={empresa} className="space-y-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary" />
                      {empresa}
                      <Badge variant="secondary" className="text-[10px]">{vecs.length}</Badge>
                    </h3>
                    <VehicleTable vehicles={vecs} onVehicleClick={onVehicleClick} />
                  </div>
                ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum veículo encontrado nesta categoria
              </div>
            )
          )}

          {isMaintenanceKpi && maintenanceOrders.length === 0 && filteredVehicles.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum veículo em manutenção no momento
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VehicleTable({ 
  vehicles, 
  onVehicleClick 
}: { 
  vehicles: VehicleItem[]; 
  onVehicleClick?: (v: VehicleItem) => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="py-2 px-3">Código</TableHead>
            <TableHead className="py-2 px-3">Descrição</TableHead>
            <TableHead className="py-2 px-3 hidden sm:table-cell">Categoria</TableHead>
            <TableHead className="py-2 px-3 hidden md:table-cell">Empresa</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vehicles
            .sort((a, b) => a.codigo.localeCompare(b.codigo))
            .map((v, idx) => (
              <TableRow 
                key={`${v.codigo}-${idx}`} 
                className={cn("hover:bg-muted/30", onVehicleClick && "cursor-pointer")}
                onClick={() => onVehicleClick?.(v)}
              >
                <TableCell className="py-2 px-3 font-mono font-medium">{v.codigo}</TableCell>
                <TableCell className="py-2 px-3">{v.descricao || '-'}</TableCell>
                <TableCell className="py-2 px-3 hidden sm:table-cell text-muted-foreground">{v.categoria || '-'}</TableCell>
                <TableCell className="py-2 px-3 hidden md:table-cell text-muted-foreground">{v.empresa || '-'}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
