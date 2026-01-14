import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Fuel,
  Droplets,
  Activity,
  Wrench,
  Calendar,
  RefreshCw,
  FileText,
  X,
  Clock,
  Gauge,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Car,
  Download
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface VehicleHistoryModalProps {
  open: boolean;
  onClose: () => void;
  vehicleCode: string;
  vehicleDescription: string;
  vehicleCategory: string;
  vehicleEmpresa: string;
}

interface FuelRecord {
  id: string;
  record_date: string;
  record_time: string;
  fuel_quantity: number;
  arla_quantity: number | null;
  horimeter_current: number | null;
  horimeter_previous: number | null;
  km_current: number | null;
  km_previous: number | null;
  oil_type: string | null;
  oil_quantity: number | null;
  lubricant: string | null;
  filter_blow_quantity: number | null;
  operator_name: string | null;
  location: string | null;
  record_type: string | null;
}

interface HorimeterReading {
  id: string;
  reading_date: string;
  current_value: number;
  previous_value: number | null;
  operator: string | null;
  observations: string | null;
}

interface ServiceOrder {
  id: string;
  order_number: string;
  order_date: string;
  order_type: string;
  status: string;
  priority: string;
  problem_description: string | null;
  solution_description: string | null;
  mechanic_name: string | null;
  entry_date: string | null;
  end_date: string | null;
  horimeter_current: number | null;
  km_current: number | null;
  parts_used: string | null;
}

type PeriodFilter = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom';

export function VehicleHistoryModal({
  open,
  onClose,
  vehicleCode,
  vehicleDescription,
  vehicleCategory,
  vehicleEmpresa
}: VehicleHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [horimeterReadings, setHorimeterReadings] = useState<HorimeterReading[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [activeTab, setActiveTab] = useState('resumo');
  
  // Period filter
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30days');
  const [customDateStart, setCustomDateStart] = useState<Date | undefined>();
  const [customDateEnd, setCustomDateEnd] = useState<Date | undefined>();

  const dateRange = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (periodFilter) {
      case 'today':
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        return { start: todayStart, end: today };
      case 'yesterday':
        const yesterdayStart = subDays(today, 1);
        yesterdayStart.setHours(0, 0, 0, 0);
        const yesterdayEnd = subDays(today, 1);
        yesterdayEnd.setHours(23, 59, 59, 999);
        return { start: yesterdayStart, end: yesterdayEnd };
      case '7days':
        return { start: subDays(today, 7), end: today };
      case '30days':
        return { start: subDays(today, 30), end: today };
      case 'month':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'custom':
        return {
          start: customDateStart || subDays(today, 30),
          end: customDateEnd || today
        };
      default:
        return { start: subDays(today, 30), end: today };
    }
  }, [periodFilter, customDateStart, customDateEnd]);

  const fetchAllData = async () => {
    if (!vehicleCode) return;
    
    setLoading(true);
    try {
      const startDate = format(dateRange.start, 'yyyy-MM-dd');
      const endDate = format(dateRange.end, 'yyyy-MM-dd');

      // Fetch fuel records
      const { data: fuelData } = await supabase
        .from('field_fuel_records')
        .select('*')
        .eq('vehicle_code', vehicleCode)
        .gte('record_date', startDate)
        .lte('record_date', endDate)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false });

      // Fetch horimeter readings - need to find vehicle_id first
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('id')
        .eq('code', vehicleCode)
        .maybeSingle();

      let horimeterData: HorimeterReading[] = [];
      if (vehicleData?.id) {
        const { data } = await supabase
          .from('horimeter_readings')
          .select('*')
          .eq('vehicle_id', vehicleData.id)
          .gte('reading_date', startDate)
          .lte('reading_date', endDate)
          .order('reading_date', { ascending: false });
        horimeterData = data || [];
      }

      // Fetch service orders
      const { data: serviceData } = await supabase
        .from('service_orders')
        .select('*')
        .eq('vehicle_code', vehicleCode)
        .gte('order_date', startDate)
        .lte('order_date', endDate)
        .order('order_date', { ascending: false });

      setFuelRecords(fuelData || []);
      setHorimeterReadings(horimeterData);
      setServiceOrders(serviceData || []);
    } catch (error) {
      console.error('Error fetching vehicle history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && vehicleCode) {
      fetchAllData();
    }
  }, [open, vehicleCode, dateRange]);

  // Calculate summaries
  const summary = useMemo(() => {
    const totalDiesel = fuelRecords
      .filter(r => r.record_type === 'saida')
      .reduce((sum, r) => sum + (r.fuel_quantity || 0), 0);
    
    const totalArla = fuelRecords
      .filter(r => r.record_type === 'saida')
      .reduce((sum, r) => sum + (r.arla_quantity || 0), 0);
    
    const totalOil = fuelRecords
      .filter(r => r.record_type === 'saida')
      .reduce((sum, r) => sum + (r.oil_quantity || 0), 0);
    
    const lubricantRecords = fuelRecords.filter(r => r.lubricant && r.record_type === 'saida');
    const filterBlowRecords = fuelRecords.filter(r => r.filter_blow_quantity && r.filter_blow_quantity > 0);
    
    const latestHorimeter = horimeterReadings[0]?.current_value || 
      fuelRecords.find(r => r.horimeter_current)?.horimeter_current || 0;
    
    const oldestHorimeter = horimeterReadings[horimeterReadings.length - 1]?.current_value ||
      fuelRecords.filter(r => r.horimeter_current).pop()?.horimeter_current || 0;
    
    const horimeterInterval = latestHorimeter - oldestHorimeter;

    const osCount = serviceOrders.length;
    const osCompleted = serviceOrders.filter(o => o.status === 'Finalizada').length;
    const osInProgress = serviceOrders.filter(o => ['Aberta', 'Em Andamento', 'Aguardando Peças'].includes(o.status)).length;

    // Calculate consumption (L/h or km/L)
    let consumption = 0;
    if (horimeterInterval > 0 && totalDiesel > 0) {
      consumption = totalDiesel / horimeterInterval;
    }

    return {
      totalDiesel,
      totalArla,
      totalOil,
      lubricantCount: lubricantRecords.length,
      filterBlowCount: filterBlowRecords.length,
      latestHorimeter,
      horimeterInterval,
      consumption,
      osCount,
      osCompleted,
      osInProgress,
      fuelRecordCount: fuelRecords.filter(r => r.record_type === 'saida').length,
      horimeterReadingCount: horimeterReadings.length
    };
  }, [fuelRecords, horimeterReadings, serviceOrders]);

  const exportToPDF = () => {
    const doc = new jsPDF('portrait');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, pageWidth, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTÓRICO COMPLETO DO EQUIPAMENTO', 14, 12);
    doc.setFontSize(12);
    doc.text(`${vehicleCode} - ${vehicleDescription}`, 14, 22);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    
    // Period info
    doc.text(`Período: ${format(dateRange.start, 'dd/MM/yyyy')} a ${format(dateRange.end, 'dd/MM/yyyy')}`, 14, 40);
    doc.text(`Empresa: ${vehicleEmpresa}`, 14, 46);
    doc.text(`Categoria: ${vehicleCategory}`, 14, 52);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth - 60, 40);

    // Summary section
    let yPos = 62;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('RESUMO DO PERÍODO', 14, yPos);
    
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    const summaryData = [
      ['Total Diesel', `${summary.totalDiesel.toFixed(1)} L`],
      ['Total ARLA', `${summary.totalArla.toFixed(1)} L`],
      ['Total Óleo', `${summary.totalOil.toFixed(1)} L`],
      ['Horímetro Atual', `${summary.latestHorimeter.toFixed(1)} h`],
      ['Intervalo Horímetro', `${summary.horimeterInterval.toFixed(1)} h`],
      ['Consumo Médio', `${summary.consumption.toFixed(2)} L/h`],
      ['Abastecimentos', `${summary.fuelRecordCount}`],
      ['Leituras Horímetro', `${summary.horimeterReadingCount}`],
      ['Ordens de Serviço', `${summary.osCount}`],
    ];

    autoTable(doc, {
      body: summaryData,
      startY: yPos,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 }, 1: { cellWidth: 50 } },
      margin: { left: 14, right: pageWidth - 130 }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Fuel records table
    if (fuelRecords.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('ABASTECIMENTOS', 14, yPos);
      
      const fuelTableData = fuelRecords.slice(0, 15).map(r => [
        format(new Date(r.record_date), 'dd/MM/yyyy'),
        r.record_time?.substring(0, 5) || '',
        r.record_type === 'saida' ? 'Saída' : 'Entrada',
        `${r.fuel_quantity?.toFixed(1) || 0} L`,
        `${r.arla_quantity?.toFixed(1) || 0} L`,
        `${r.horimeter_current?.toFixed(0) || '-'}`,
        r.operator_name?.substring(0, 15) || '-'
      ]);

      autoTable(doc, {
        head: [['Data', 'Hora', 'Tipo', 'Diesel', 'ARLA', 'Hor.', 'Operador']],
        body: fuelTableData,
        startY: yPos + 5,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [75, 85, 99] },
        margin: { left: 14, right: 14 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Service orders table
    if (serviceOrders.length > 0 && yPos < 250) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('ORDENS DE SERVIÇO', 14, yPos);
      
      const osTableData = serviceOrders.slice(0, 10).map(o => [
        o.order_number,
        format(new Date(o.order_date), 'dd/MM/yyyy'),
        o.order_type,
        o.status,
        o.problem_description?.substring(0, 30) || '-'
      ]);

      autoTable(doc, {
        head: [['OS', 'Data', 'Tipo', 'Status', 'Problema']],
        body: osTableData,
        startY: yPos + 5,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [75, 85, 99] },
        margin: { left: 14, right: 14 }
      });
    }

    doc.save(`historico_${vehicleCode}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { color: string; icon: React.ReactNode }> = {
      'Aberta': { color: 'bg-blue-100 text-blue-700', icon: <Clock className="w-3 h-3" /> },
      'Em Andamento': { color: 'bg-amber-100 text-amber-700', icon: <RefreshCw className="w-3 h-3" /> },
      'Aguardando Peças': { color: 'bg-yellow-100 text-yellow-700', icon: <AlertTriangle className="w-3 h-3" /> },
      'Finalizada': { color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    };
    const info = statusMap[status] || statusMap['Aberta'];
    return (
      <Badge variant="secondary" className={cn("gap-1", info.color)}>
        {info.icon}
        {status}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">
                  {vehicleCode} - {vehicleDescription}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {vehicleCategory} • {vehicleEmpresa}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={exportToPDF} className="gap-2">
              <Download className="w-4 h-4" />
              PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Period Filter */}
        <div className="flex flex-wrap items-center gap-3 py-3 border-b shrink-0">
          <span className="text-sm font-medium text-muted-foreground">Período:</span>
          <Select value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="yesterday">Ontem</SelectItem>
              <SelectItem value="7days">Últimos 7 dias</SelectItem>
              <SelectItem value="30days">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Mês atual</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {periodFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {customDateStart ? format(customDateStart, 'dd/MM/yyyy') : 'Início'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={customDateStart}
                    onSelect={setCustomDateStart}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="w-4 h-4" />
                    {customDateEnd ? format(customDateEnd, 'dd/MM/yyyy') : 'Fim'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-background" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={customDateEnd}
                    onSelect={setCustomDateEnd}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Button variant="ghost" size="sm" onClick={fetchAllData} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          </Button>
        </div>

        {/* Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="shrink-0 grid w-full grid-cols-4">
            <TabsTrigger value="resumo" className="gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Resumo</span>
            </TabsTrigger>
            <TabsTrigger value="abastecimento" className="gap-2">
              <Fuel className="w-4 h-4" />
              <span className="hidden sm:inline">Abastecimentos</span>
            </TabsTrigger>
            <TabsTrigger value="horimetro" className="gap-2">
              <Gauge className="w-4 h-4" />
              <span className="hidden sm:inline">Horímetros</span>
            </TabsTrigger>
            <TabsTrigger value="manutencao" className="gap-2">
              <Wrench className="w-4 h-4" />
              <span className="hidden sm:inline">Manutenção</span>
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Resumo Tab */}
                <TabsContent value="resumo" className="m-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* Diesel */}
                    <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-red-100 text-xs font-medium uppercase">
                        <Fuel className="w-4 h-4" />
                        Total Diesel
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.totalDiesel.toFixed(1)} L</p>
                      <p className="text-xs text-red-200 mt-1">{summary.fuelRecordCount} abastecimentos</p>
                    </div>

                    {/* ARLA */}
                    <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-yellow-100 text-xs font-medium uppercase">
                        <Droplets className="w-4 h-4" />
                        Total ARLA
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.totalArla.toFixed(1)} L</p>
                    </div>

                    {/* Óleo */}
                    <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-amber-100 text-xs font-medium uppercase">
                        <Droplets className="w-4 h-4" />
                        Total Óleo
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.totalOil.toFixed(1)} L</p>
                      <p className="text-xs text-amber-200 mt-1">+ {summary.lubricantCount} lubrificações</p>
                    </div>

                    {/* Horímetro */}
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-blue-100 text-xs font-medium uppercase">
                        <Gauge className="w-4 h-4" />
                        Horímetro Atual
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.latestHorimeter.toFixed(0)} h</p>
                      <p className="text-xs text-blue-200 mt-1">+{summary.horimeterInterval.toFixed(0)} h no período</p>
                    </div>

                    {/* Consumo */}
                    <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-emerald-100 text-xs font-medium uppercase">
                        <Activity className="w-4 h-4" />
                        Consumo Médio
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.consumption.toFixed(2)} L/h</p>
                    </div>

                    {/* OS Total */}
                    <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-purple-100 text-xs font-medium uppercase">
                        <Wrench className="w-4 h-4" />
                        Ordens Serviço
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.osCount}</p>
                      <p className="text-xs text-purple-200 mt-1">{summary.osCompleted} finalizadas</p>
                    </div>

                    {/* Sopra Filtro */}
                    <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-gray-100 text-xs font-medium uppercase">
                        <Activity className="w-4 h-4" />
                        Sopra Filtro
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.filterBlowCount}</p>
                      <p className="text-xs text-gray-200 mt-1">intervenções</p>
                    </div>

                    {/* Leituras */}
                    <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl p-4 text-white">
                      <div className="flex items-center gap-2 text-teal-100 text-xs font-medium uppercase">
                        <Clock className="w-4 h-4" />
                        Leituras Hor.
                      </div>
                      <p className="text-2xl font-bold mt-2">{summary.horimeterReadingCount}</p>
                      <p className="text-xs text-teal-200 mt-1">registros</p>
                    </div>
                  </div>
                </TabsContent>

                {/* Abastecimento Tab */}
                <TabsContent value="abastecimento" className="m-0">
                  {fuelRecords.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhum registro de abastecimento no período
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Data</TableHead>
                            <TableHead>Hora</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Diesel (L)</TableHead>
                            <TableHead className="text-right">ARLA (L)</TableHead>
                            <TableHead className="text-right">Óleo (L)</TableHead>
                            <TableHead className="text-right">Horímetro</TableHead>
                            <TableHead>Operador</TableHead>
                            <TableHead>Local</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fuelRecords.map((record) => (
                            <TableRow key={record.id}>
                              <TableCell>{format(new Date(record.record_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell>{record.record_time?.substring(0, 5)}</TableCell>
                              <TableCell>
                                <Badge variant={record.record_type === 'saida' ? 'destructive' : 'default'}>
                                  {record.record_type === 'saida' ? 'Saída' : 'Entrada'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {record.fuel_quantity?.toFixed(1) || '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {record.arla_quantity?.toFixed(1) || '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {record.oil_quantity?.toFixed(1) || '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                {record.horimeter_current?.toFixed(0) || record.km_current?.toFixed(0) || '-'}
                              </TableCell>
                              <TableCell className="max-w-[100px] truncate">
                                {record.operator_name || '-'}
                              </TableCell>
                              <TableCell className="max-w-[100px] truncate">
                                {record.location || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Horímetro Tab */}
                <TabsContent value="horimetro" className="m-0">
                  {horimeterReadings.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhuma leitura de horímetro no período
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Data</TableHead>
                            <TableHead className="text-right">Anterior</TableHead>
                            <TableHead className="text-right">Atual</TableHead>
                            <TableHead className="text-right">Intervalo</TableHead>
                            <TableHead>Operador</TableHead>
                            <TableHead>Observações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {horimeterReadings.map((reading) => (
                            <TableRow key={reading.id}>
                              <TableCell>{format(new Date(reading.reading_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell className="text-right">
                                {reading.previous_value?.toFixed(0) || '-'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {reading.current_value?.toFixed(0)}
                              </TableCell>
                              <TableCell className="text-right text-emerald-600 font-medium">
                                +{((reading.current_value || 0) - (reading.previous_value || 0)).toFixed(0)}
                              </TableCell>
                              <TableCell>{reading.operator || '-'}</TableCell>
                              <TableCell className="max-w-[150px] truncate">
                                {reading.observations || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                {/* Manutenção Tab */}
                <TabsContent value="manutencao" className="m-0">
                  {serviceOrders.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      Nenhuma ordem de serviço no período
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>OS</TableHead>
                            <TableHead>Data</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Problema</TableHead>
                            <TableHead>Mecânico</TableHead>
                            <TableHead className="text-right">Hor./KM</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {serviceOrders.map((order) => (
                            <TableRow key={order.id}>
                              <TableCell className="font-medium">{order.order_number}</TableCell>
                              <TableCell>{format(new Date(order.order_date), 'dd/MM/yyyy')}</TableCell>
                              <TableCell>{order.order_type}</TableCell>
                              <TableCell>{getStatusBadge(order.status)}</TableCell>
                              <TableCell className="max-w-[200px] truncate">
                                {order.problem_description || '-'}
                              </TableCell>
                              <TableCell>{order.mechanic_name || '-'}</TableCell>
                              <TableCell className="text-right">
                                {order.horimeter_current?.toFixed(0) || order.km_current?.toFixed(0) || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </>
            )}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
