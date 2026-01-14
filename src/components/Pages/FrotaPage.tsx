import { useState, useMemo } from 'react';
import { 
  Truck,
  RefreshCw,
  FileText,
  Search,
  Building2,
  Settings,
  ChevronDown,
  ChevronRight,
  Calendar,
  X,
  FileSpreadsheet,
  Cog,
  Car,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSheetData } from '@/hooks/useGoogleSheets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import * as XLSX from 'xlsx';

const SHEET_NAME = 'Veiculo';

interface VehicleGroup {
  name: string;
  empresas: number;
  veiculos: number;
  items: Array<{
    codigo: string;
    descricao: string;
    empresa: string;
    categoria: string;
  }>;
}

function getRowValue(row: Record<string, any>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]);
  }
  return '';
}

export function FrotaPage() {
  const { data, loading, refetch } = useSheetData(SHEET_NAME);
  const [search, setSearch] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('all');
  const [descricaoFilter, setDescricaoFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [groupBy, setGroupBy] = useState<'categoria' | 'empresa' | 'descricao'>('categoria');
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const empresas = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']).trim();
      if (empresa) unique.add(empresa);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const descricoes = useMemo(() => {
    const unique = new Set<string>();
    data.rows.forEach(row => {
      const desc = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']).trim();
      if (desc) unique.add(desc);
    });
    return Array.from(unique).sort();
  }, [data.rows]);

  const filteredRows = useMemo(() => {
    return data.rows.filter(row => {
      const matchesSearch = !search || 
        Object.values(row).some(v => 
          String(v).toLowerCase().includes(search.toLowerCase())
        );

      const empresaValue = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']);
      const descricaoValue = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']);

      const matchesEmpresa = empresaFilter === 'all' || empresaValue === empresaFilter;
      const matchesDescricao = descricaoFilter === 'all' || descricaoValue === descricaoFilter;

      return matchesSearch && matchesEmpresa && matchesDescricao;
    });
  }, [data.rows, search, empresaFilter, descricaoFilter]);

  const metrics = useMemo(() => {
    const empresasSet = new Set<string>();
    const categorias = new Set<string>();
    let equipamentos = 0;
    let veiculos = 0;
    
    filteredRows.forEach(row => {
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']).trim();
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']).trim().toLowerCase();
      if (empresa) empresasSet.add(empresa);
      if (categoria) categorias.add(categoria);
      
      if (categoria.includes('equipamento') || categoria.includes('máquina') || categoria.includes('maquina')) {
        equipamentos++;
      } else {
        veiculos++;
      }
    });

    return {
      totalAtivos: filteredRows.length,
      equipamentos,
      veiculos,
      empresas: empresasSet.size,
      categorias: categorias.size
    };
  }, [filteredRows]);

  const groupedVehicles = useMemo(() => {
    const groups: Record<string, VehicleGroup> = {};
    
    filteredRows.forEach(row => {
      const categoria = getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']) || 'Outros';
      const empresa = getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']) || 'Não informada';
      const codigo = getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']);
      const descricao = getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']) || 'Sem descrição';

      let groupKey: string;
      switch (groupBy) {
        case 'empresa':
          groupKey = empresa;
          break;
        case 'descricao':
          groupKey = descricao;
          break;
        case 'categoria':
        default:
          groupKey = categoria;
          break;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { name: groupKey, empresas: 0, veiculos: 0, items: [] };
      }

      groups[groupKey].veiculos++;
      groups[groupKey].items.push({ codigo, descricao, empresa, categoria });
    });

    Object.values(groups).forEach(group => {
      const uniqueEmpresas = new Set(group.items.map(i => i.empresa));
      group.empresas = uniqueEmpresas.size;
    });

    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows, groupBy]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => 
      prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
    );
  };

  // PDF Report - Landscape with Red Theme
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header with red theme
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE FROTA - EQUIPAMENTOS ATIVOS', 14, 16);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Report info
    doc.text(`Data de Referência: ${format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}`, 14, 35);
    if (empresaFilter !== 'all') {
      doc.text(`Empresa: ${empresaFilter}`, 14, 41);
    }
    if (descricaoFilter !== 'all') {
      doc.text(`Descrição: ${descricaoFilter}`, 14, empresaFilter !== 'all' ? 47 : 41);
    }
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, pageWidth - 70, 35);
    
    // Summary
    const summaryY = empresaFilter !== 'all' || descricaoFilter !== 'all' ? 55 : 47;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO:', 14, summaryY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Total de Ativos: ${metrics.totalAtivos}`, 14, summaryY + 6);
    doc.text(`Equipamentos: ${metrics.equipamentos}`, 80, summaryY + 6);
    doc.text(`Veículos: ${metrics.veiculos}`, 140, summaryY + 6);
    doc.text(`Empresas: ${metrics.empresas}`, 200, summaryY + 6);

    // Group by category/empresa
    let startY = summaryY + 16;
    
    groupedVehicles.forEach((group, groupIndex) => {
      // Check if need new page
      if (startY > 180) {
        doc.addPage();
        startY = 20;
      }

      // Group header with red background
      doc.setFillColor(220, 38, 38);
      doc.rect(14, startY - 5, pageWidth - 28, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(`${group.name.toUpperCase()} (${group.veiculos} unidades)`, 16, startY);
      doc.setTextColor(0, 0, 0);
      
      startY += 5;

      const tableData = group.items.map(item => [
        item.codigo,
        item.descricao,
        item.categoria,
        item.empresa
      ]);

      autoTable(doc, {
        head: [['Código', 'Descrição', 'Categoria', 'Empresa']],
        body: tableData,
        startY: startY,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [75, 85, 99], textColor: 255 },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: 14, right: 14 }
      });

      startY = (doc as any).lastAutoTable.finalY + 10;
    });

    // Footer with totals
    if (startY > 180) {
      doc.addPage();
      startY = 20;
    }
    
    doc.setFillColor(220, 38, 38);
    doc.rect(14, startY, pageWidth - 28, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL GERAL: ${metrics.totalAtivos} ativos`, 16, startY + 7);

    doc.save(`frota_${format(selectedDate, 'yyyy-MM-dd')}.pdf`);
  };

  const exportToExcel = () => {
    const excelData = filteredRows.map(row => ({
      'Código': getRowValue(row as any, ['CODIGO', 'Codigo', 'codigo', 'VEICULO', 'Veiculo', 'veiculo']),
      'Descrição': getRowValue(row as any, ['DESCRICAO', 'DESCRIÇÃO', 'Descricao', 'descrição', 'descricao']),
      'Categoria': getRowValue(row as any, ['CATEGORIA', 'Categoria', 'categoria', 'TIPO', 'Tipo', 'tipo']),
      'Empresa': getRowValue(row as any, ['EMPRESA', 'Empresa', 'empresa']),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 25 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Frota');
    XLSX.writeFile(workbook, `frota_${format(selectedDate, 'yyyy-MM-dd')}.xlsx`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 overflow-auto">
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg">
              <Truck className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Gestão de Frota</h1>
              <p className="text-sm text-muted-foreground">Equipamentos e veículos ativos</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 sm:mr-2", loading && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={exportToPDF}
              className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
            >
              <FileText className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">PDF</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportToExcel}>
              <FileSpreadsheet className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Excel</span>
            </Button>
          </div>
        </div>

        {/* KPI Cards - Improved Visual */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Total Ativos - Blue */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-100 uppercase tracking-wide">TOTAL ATIVOS</p>
                <p className="text-3xl font-bold mt-1">{metrics.totalAtivos}</p>
                <p className="text-xs text-blue-200 mt-1">Em operação</p>
              </div>
              <Activity className="w-10 h-10 text-blue-200" />
            </div>
          </div>

          {/* Equipamentos - Amber */}
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-100 uppercase tracking-wide">EQUIPAMENTOS</p>
                <p className="text-3xl font-bold mt-1">{metrics.equipamentos}</p>
                <p className="text-xs text-amber-200 mt-1">Máquinas</p>
              </div>
              <Cog className="w-10 h-10 text-amber-200" />
            </div>
          </div>

          {/* Veículos - Green */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-100 uppercase tracking-wide">VEÍCULOS</p>
                <p className="text-3xl font-bold mt-1">{metrics.veiculos}</p>
                <p className="text-xs text-emerald-200 mt-1">Carros/Caminhões</p>
              </div>
              <Car className="w-10 h-10 text-emerald-200" />
            </div>
          </div>

          {/* Empresas - Purple */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-purple-100 uppercase tracking-wide">EMPRESAS</p>
                <p className="text-3xl font-bold mt-1">{metrics.empresas}</p>
                <p className="text-xs text-purple-200 mt-1">Proprietárias</p>
              </div>
              <Building2 className="w-10 h-10 text-purple-200" />
            </div>
          </div>
        </div>

        {/* Filters - Simplified */}
        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center flex-wrap">
            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Data:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {format(selectedDate, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant={format(selectedDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDate(new Date())}
              >
                Hoje
              </Button>
            </div>

            {/* Empresa Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Empresa:</span>
              <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas Empresas" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Todas Empresas</SelectItem>
                  {empresas.map(empresa => (
                    <SelectItem key={empresa} value={empresa}>{empresa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Descrição Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Descrição:</span>
              <Select value={descricaoFilter} onValueChange={setDescricaoFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas Descrições" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">Todas Descrições</SelectItem>
                  {descricoes.map(desc => (
                    <SelectItem key={desc} value={desc}>{desc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(empresaFilter !== 'all' || descricaoFilter !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setEmpresaFilter('all');
                  setDescricaoFilter('all');
                }}
              >
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar código ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Group By and Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Agrupar por:</span>
              <div className="flex gap-1">
                <Button 
                  variant={groupBy === 'categoria' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setGroupBy('categoria')}
                >
                  Categoria
                </Button>
                <Button 
                  variant={groupBy === 'empresa' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setGroupBy('empresa')}
                >
                  Empresa
                </Button>
                <Button 
                  variant={groupBy === 'descricao' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => setGroupBy('descricao')}
                >
                  Descrição
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setExpandedGroups(groupedVehicles.map(g => g.name))}>
                Expandir
              </Button>
              <Button variant="outline" size="sm" onClick={() => setExpandedGroups([])}>
                Recolher
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Exibindo <span className="font-semibold text-foreground">{filteredRows.length}</span> de {data.rows.length} ativos
          </p>
        </div>

        {/* Content - Grouped View */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {groupedVehicles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum equipamento encontrado com os filtros aplicados
              </div>
            ) : (
              groupedVehicles.map(group => (
                <div key={group.name} className="bg-card rounded-lg border border-border overflow-hidden shadow-sm">
                  <button
                    onClick={() => toggleGroup(group.name)}
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {expandedGroups.includes(group.name) ? (
                        <ChevronDown className="w-5 h-5 text-primary" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                      <div className="text-left">
                        <span className="font-semibold text-lg">{group.name}</span>
                        <span className="text-sm text-muted-foreground ml-3">
                          {group.empresas} empresa{group.empresas !== 1 ? 's' : ''} • {group.veiculos} unidade{group.veiculos !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                        {group.veiculos}
                      </span>
                    </div>
                  </button>
                  
                  {expandedGroups.includes(group.name) && (
                    <div className="border-t border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Código</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Empresa</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{item.codigo}</TableCell>
                              <TableCell>{item.descricao}</TableCell>
                              <TableCell>{item.categoria}</TableCell>
                              <TableCell>{item.empresa}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
