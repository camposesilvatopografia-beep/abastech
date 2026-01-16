import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: 'vehicle' | 'order' | 'record' | 'page' | 'action';
  path?: string;
  data?: any;
}

// Static pages/actions that can be searched
const STATIC_ITEMS: SearchResult[] = [
  { id: 'page-dashboard', title: 'Dashboard', subtitle: 'Visão geral do sistema', category: 'page', path: '/' },
  { id: 'page-abastecimento', title: 'Abastecimento', subtitle: 'Gestão de combustível', category: 'page', path: '/abastecimento' },
  { id: 'page-horimetros', title: 'Horímetros', subtitle: 'Controle de horas', category: 'page', path: '/horimetros' },
  { id: 'page-manutencao', title: 'Manutenção', subtitle: 'Ordens de serviço', category: 'page', path: '/manutencao' },
  { id: 'page-frota', title: 'Frota', subtitle: 'Veículos e equipamentos', category: 'page', path: '/frota' },
  { id: 'page-estoques', title: 'Estoques', subtitle: 'Controle de estoque', category: 'page', path: '/estoques' },
  { id: 'page-alertas', title: 'Alertas', subtitle: 'Notificações do sistema', category: 'page', path: '/alertas' },
  { id: 'page-cadastros', title: 'Cadastros', subtitle: 'Gestão de dados', category: 'page', path: '/cadastros' },
  { id: 'page-usuarios', title: 'Usuários do Sistema', subtitle: 'Gerenciar usuários', category: 'page', path: '/usuarios-sistema' },
  { id: 'page-field-users', title: 'Usuários de Campo', subtitle: 'Operadores', category: 'page', path: '/usuarios-campo' },
  { id: 'page-suppliers', title: 'Fornecedores', subtitle: 'Cadastro de fornecedores', category: 'page', path: '/fornecedores' },
  { id: 'page-mechanics', title: 'Mecânicos', subtitle: 'Cadastro de mecânicos', category: 'page', path: '/mecanicos' },
  { id: 'page-lubricants', title: 'Lubrificantes', subtitle: 'Tipos de lubrificantes', category: 'page', path: '/lubrificantes' },
  { id: 'page-oil-types', title: 'Tipos de Óleo', subtitle: 'Cadastro de óleos', category: 'page', path: '/tipos-oleo' },
  { id: 'page-obra', title: 'Dados da Obra', subtitle: 'Configurações do projeto', category: 'page', path: '/obra' },
  { id: 'action-ai', title: 'Assistente IA', subtitle: 'Pergunte ao sistema', category: 'action' },
];

export function useGlobalSearch() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const searchInItems = useCallback((
    query: string,
    vehicles: any[] = [],
    orders: any[] = [],
    fuelRecords: any[] = []
  ): SearchResult[] => {
    if (!query || query.length < 2) return [];
    
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];
    const maxResults = 20;

    // Search static items (pages/actions)
    STATIC_ITEMS.forEach(item => {
      if (
        item.title.toLowerCase().includes(queryLower) ||
        item.subtitle?.toLowerCase().includes(queryLower)
      ) {
        results.push(item);
      }
    });

    // Search vehicles
    vehicles.forEach(vehicle => {
      if (results.length >= maxResults) return;
      const code = String(vehicle.code || vehicle.Codigo || '').toLowerCase();
      const name = String(vehicle.name || vehicle.Nome || vehicle.description || vehicle.Descricao || '').toLowerCase();
      const company = String(vehicle.company || vehicle.Empresa || '').toLowerCase();
      
      if (code.includes(queryLower) || name.includes(queryLower) || company.includes(queryLower)) {
        results.push({
          id: `vehicle-${vehicle.id || vehicle.code}`,
          title: vehicle.code || vehicle.Codigo,
          subtitle: `${vehicle.name || vehicle.Nome || vehicle.description || ''} • ${vehicle.company || vehicle.Empresa || 'N/I'}`,
          category: 'vehicle',
          path: '/frota',
          data: vehicle,
        });
      }
    });

    // Search orders
    orders.forEach(order => {
      if (results.length >= maxResults) return;
      const orderNum = String(order.order_number || '').toLowerCase();
      const vehicleCode = String(order.vehicle_code || '').toLowerCase();
      const problem = String(order.problem_description || '').toLowerCase();
      
      if (orderNum.includes(queryLower) || vehicleCode.includes(queryLower) || problem.includes(queryLower)) {
        results.push({
          id: `order-${order.id}`,
          title: order.order_number,
          subtitle: `${order.vehicle_code} • ${order.status}`,
          category: 'order',
          path: '/manutencao',
          data: order,
        });
      }
    });

    // Search fuel records
    fuelRecords.forEach(record => {
      if (results.length >= maxResults) return;
      const vehicleCode = String(record.vehicle_code || '').toLowerCase();
      const location = String(record.location || '').toLowerCase();
      const operator = String(record.operator_name || '').toLowerCase();
      
      if (vehicleCode.includes(queryLower) || location.includes(queryLower) || operator.includes(queryLower)) {
        results.push({
          id: `record-${record.id}`,
          title: `${record.vehicle_code} - ${record.fuel_quantity}L`,
          subtitle: `${record.record_date} • ${record.location || 'N/I'}`,
          category: 'record',
          path: '/abastecimento',
          data: record,
        });
      }
    });

    return results.slice(0, maxResults);
  }, []);

  const navigateToResult = useCallback((result: SearchResult) => {
    if (result.path) {
      navigate(result.path);
    }
    setSearch('');
  }, [navigate]);

  return {
    search,
    setSearch,
    searchInItems,
    navigateToResult,
  };
}
