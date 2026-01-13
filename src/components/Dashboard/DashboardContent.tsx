import { Droplet, TrendingDown, Copy } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { MetricCard } from './MetricCard';
import { StockSummary } from './StockSummary';
import { ConsumptionChart } from './ConsumptionChart';

export function DashboardContent() {
  const summaryRows = [
    { label: 'Estoque Anterior', value: '24.115,2' },
    { label: '+ Entradas', value: '0', isPositive: true },
    { label: '- Saídas Total', value: '3.448', isNegative: true },
    { label: 'Para Comboios', value: '0', isSubItem: true },
    { label: 'Para Equipamentos', value: '3.448', isSubItem: true },
    { label: 'Estoque Atual', value: '20.667,2', isTotal: true },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Filter Bar */}
        <FilterBar totalRecords={500} />

        {/* Primary Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            title="ESTOQUE DIESEL"
            value="20.667,2 L"
            variant="primary"
            icon={Droplet}
          />
          <MetricCard
            title="ESTOQUE ARLA"
            value="1.643 L"
            variant="primary"
            icon={Droplet}
          />
        </div>

        {/* Secondary Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="SAÍDAS GERAL"
            value="3.448 L"
            icon={TrendingDown}
          />
          <MetricCard
            title="SAÍDA PARA EQUIPAMENTOS"
            value="3.448 L"
            icon={Copy}
          />
          <MetricCard
            title="SAÍDA PARA COMBOIOS"
            value="0 L"
            icon={Copy}
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
              subtitle="Diesel - Hoje"
              rows={summaryRows}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
