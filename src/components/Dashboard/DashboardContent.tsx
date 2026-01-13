import { useMemo } from 'react';
import { Droplet, TrendingDown, TrendingUp, Package, Truck, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { FilterBar } from './FilterBar';
import { MetricCard } from './MetricCard';
import { StockSummary } from './StockSummary';
import { ConsumptionChart } from './ConsumptionChart';
import { useSheetData } from '@/hooks/useGoogleSheets';

const GERAL_SHEET = 'GERAL';

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

export function DashboardContent() {
  const { data: geralData, loading } = useSheetData(GERAL_SHEET);

  // Extract stock values from GERAL sheet
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

    const firstRow = geralData.rows[0];
    
    // Try different possible column names
    const estoqueAnterior = parseNumber(
      firstRow?.['EstoqueAnterior'] || firstRow?.['ESTOQUEANTERIOR'] || 
      firstRow?.['Estoque Anterior'] || firstRow?.['C'] || 0
    );
    const entrada = parseNumber(
      firstRow?.['Entrada'] || firstRow?.['ENTRADA'] || firstRow?.['D'] || 0
    );
    const saidaComboios = parseNumber(
      firstRow?.['SaidaComboios'] || firstRow?.['SAIDACOMBOIOS'] || 
      firstRow?.['Saida para Comboios'] || firstRow?.['SaidaparaComboios'] || firstRow?.['E'] || 0
    );
    const saidaEquipamentos = parseNumber(
      firstRow?.['SaidaEquipamentos'] || firstRow?.['SAIDAEQUIPAMENTOS'] || 
      firstRow?.['Saidas para equipamentos'] || firstRow?.['SaidasparaEquipamentos'] || firstRow?.['F'] || 0
    );
    const estoqueAtual = parseNumber(
      firstRow?.['EstoqueAtual'] || firstRow?.['ESTOQUEATO'] || 
      firstRow?.['Estoque Atual'] || firstRow?.['G'] || 0
    );
    const estoqueArla = parseNumber(
      firstRow?.['EstoqueArla'] || firstRow?.['ESTOQUEARLA'] || 
      firstRow?.['Estoque Arla'] || firstRow?.['H'] || 0
    );

    return {
      estoqueAnterior,
      entrada,
      saidaComboios,
      saidaEquipamentos,
      estoqueAtual,
      estoqueArla
    };
  }, [geralData.rows]);

  const summaryRows = [
    { label: 'Estoque Anterior', value: stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) },
    { label: '+ Entradas', value: stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 0 }), isPositive: true },
    { label: '- Saídas Total', value: (stockData.saidaComboios + stockData.saidaEquipamentos).toLocaleString('pt-BR', { minimumFractionDigits: 0 }), isNegative: true },
    { label: 'Para Comboios', value: stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 0 }), isSubItem: true },
    { label: 'Para Equipamentos', value: stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 0 }), isSubItem: true },
    { label: 'Estoque Atual', value: stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 1 }), isTotal: true },
  ];

  const totalRecords = geralData.rows.length;

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="space-y-6">
        {/* Filter Bar */}
        <FilterBar totalRecords={totalRecords} />

        {/* Primary Stock KPIs - Different colors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="ESTOQUE ANTERIOR"
            value={`${stockData.estoqueAnterior.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L`}
            subtitle="Diesel - Início do período"
            variant="primary"
            icon={Package}
            className="border-l-4 border-l-slate-500"
          />
          <MetricCard
            title="ENTRADAS"
            value={`${stockData.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Recebimentos no período"
            variant="primary"
            icon={ArrowDownCircle}
            className="border-l-4 border-l-emerald-500"
          />
          <MetricCard
            title="ESTOQUE ATUAL"
            value={`${stockData.estoqueAtual.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} L`}
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
            value={`${stockData.saidaComboios.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Abastecimento em campo"
            icon={Truck}
            className="border-l-4 border-l-amber-500"
          />
          <MetricCard
            title="SAÍDA P/ EQUIPAMENTOS"
            value={`${stockData.saidaEquipamentos.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
            subtitle="Abastecimento direto"
            icon={ArrowUpCircle}
            className="border-l-4 border-l-orange-500"
          />
          <MetricCard
            title="SAÍDAS TOTAL"
            value={`${(stockData.saidaComboios + stockData.saidaEquipamentos).toLocaleString('pt-BR', { minimumFractionDigits: 0 })} L`}
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
              subtitle="Diesel - Hoje"
              rows={summaryRows}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
