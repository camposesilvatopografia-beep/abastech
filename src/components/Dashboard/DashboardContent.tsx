import { useMemo } from 'react';
import { Droplet, TrendingDown, TrendingUp, Package, Truck, ArrowDownCircle, ArrowUpCircle, Clock, Fuel, Calendar } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { MetricCard } from './MetricCard';
import { StockSummary } from './StockSummary';
import { ConsumptionChart } from './ConsumptionChart';
import { useSheetData } from '@/hooks/useGoogleSheets';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const GERAL_SHEET = 'GERAL';
const ABASTECIMENTO_SHEET = 'AbastecimentoCanteiro01';

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

export function DashboardContent() {
  const { data: geralData, loading } = useSheetData(GERAL_SHEET);
  const { data: abastecimentoData } = useSheetData(ABASTECIMENTO_SHEET);

  // Extract stock values from GERAL sheet - get LAST row (most recent)
  const stockData = useMemo(() => {
    if (!geralData.rows.length) {
      return {
        estoqueAnterior: 0,
        entrada: 0,
        saidaComboios: 0,
        saidaEquipamentos: 0,
        estoqueAtual: 0,
        estoqueArla: 0
      };
    }

    // Get the last row (most recent data)
    const lastRow = geralData.rows[geralData.rows.length - 1];
    
    const estoqueAnterior = parseNumber(lastRow?.['EstoqueAnterior']);
    const entrada = parseNumber(lastRow?.['Entrada']);
    const saidaComboios = parseNumber(lastRow?.['Saidas_Para_Comboios']);
    const saidaEquipamentos = parseNumber(lastRow?.['Saida']);
    const estoqueAtual = parseNumber(lastRow?.['EstoqueAtual']);
    const estoqueArla = parseNumber(lastRow?.['EstoqueArla'] || lastRow?.['Arla'] || 0);

    return {
      estoqueAnterior,
      entrada,
      saidaComboios,
      saidaEquipamentos,
      estoqueAtual,
      estoqueArla
    };
  }, [geralData.rows]);

  // Get recent activities from abastecimento data
  const recentActivities = useMemo(() => {
    if (!abastecimentoData.rows.length) return [];

    // Get last 10 records
    return abastecimentoData.rows
      .slice(-10)
      .reverse()
      .map((row, index) => ({
        id: index,
        data: String(row['DATA'] || ''),
        hora: String(row['HORA'] || ''),
        veiculo: String(row['VEICULO'] || row['Veiculo'] || 'N/A'),
        motorista: String(row['MOTORISTA'] || row['Motorista'] || 'N/A'),
        quantidade: parseNumber(row['QUANTIDADE'] || row['Quantidade']),
        combustivel: String(row['TIPO DE COMBUSTIVEL'] || row['Combustivel'] || 'Diesel'),
        local: String(row['LOCAL'] || row['Local'] || 'N/A')
      }));
  }, [abastecimentoData.rows]);

  const summaryRows = [
    { label: 'Estoque Anterior', value: stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) },
    { label: '+ Entradas', value: stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isPositive: true },
    { label: '- Saídas Total', value: (stockData.saidaComboios + stockData.saidaEquipamentos).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isNegative: true },
    { label: 'Para Comboios', value: stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isSubItem: true },
    { label: 'Para Equipamentos', value: stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isSubItem: true },
    { label: 'Estoque Atual', value: stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), isTotal: true },
  ];

  const totalRecords = abastecimentoData.rows.length;

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Filter Bar */}
        <FilterBar totalRecords={totalRecords} />

        {/* Primary Stock KPIs - Different colors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="ESTOQUE ANTERIOR"
            value={`${stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Diesel - Início do período"
            variant="primary"
            icon={Package}
            className="border-l-4 border-l-slate-500"
          />
          <MetricCard
            title="ENTRADAS"
            value={`${stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Recebimentos no período"
            variant="primary"
            icon={ArrowDownCircle}
            className="border-l-4 border-l-emerald-500"
          />
          <MetricCard
            title="ESTOQUE ATUAL"
            value={`${stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Diesel disponível"
            variant="primary"
            icon={Droplet}
            className="border-l-4 border-l-blue-500"
          />
        </div>

        {/* Secondary KPIs - Exits and ARLA */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="SAÍDA P/ COMBOIOS"
            value={`${stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Abastecimento em campo"
            icon={Truck}
            className="border-l-4 border-l-amber-500"
          />
          <MetricCard
            title="SAÍDA P/ EQUIPAMENTOS"
            value={`${stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Abastecimento direto"
            icon={ArrowUpCircle}
            className="border-l-4 border-l-orange-500"
          />
          <MetricCard
            title="SAÍDAS TOTAL"
            value={`${(stockData.saidaComboios + stockData.saidaEquipamentos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L`}
            subtitle="Consumo no período"
            icon={TrendingDown}
            className="border-l-4 border-l-red-500"
          />
          <MetricCard
            title="ESTOQUE ARLA"
            value={`${stockData.estoqueArla.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Arla disponível"
            icon={Droplet}
            className="border-l-4 border-l-cyan-500"
          />
        </div>

        {/* Charts and Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <ConsumptionChart
              title="Consumo por Período"
              subtitle="Diesel e Arla (Litros)"
            />
          </div>
          <div className="lg:col-span-2">
            <StockSummary
              title="Resumo de Estoque"
              subtitle="Diesel - Último registro"
              rows={summaryRows}
            />
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-card rounded-lg border border-border">
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Atividades Recentes</h3>
                <p className="text-sm text-muted-foreground">Últimos abastecimentos registrados</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-border">
            {recentActivities.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Nenhuma atividade recente encontrada
              </div>
            ) : (
              recentActivities.map((activity) => (
                <div key={activity.id} className="p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Fuel className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{activity.veiculo}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                            {activity.combustivel}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {activity.motorista} • {activity.local}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-primary">
                        {activity.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3" />
                        {activity.data} {activity.hora}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
