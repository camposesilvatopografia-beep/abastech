import { useState, useMemo } from 'react';
import { Fuel, Calendar, TrendingUp, TrendingDown, Gauge, Truck, X, Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, isValid, isWithinInterval, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useObraSettings } from '@/hooks/useObraSettings';

interface FuelRecord {
  record_date: string;
  fuel_quantity: number;
  horimeter_current: number | null;
  horimeter_previous: number | null;
  km_current: number | null;
  km_previous: number | null;
  location: string | null;
  operator_name: string | null;
  observations?: string | null;
}

// Check if a record is a tank refuel for comboio (shouldn't count for consumption)
const isTankRefuelRecord = (observations?: string | null): boolean => {
  if (!observations) return false;
  return observations.includes('[ABAST. TANQUE COMBOIO]');
};

interface VehicleConsumptionModalProps {
  open: boolean;
  onClose: () => void;
  vehicleCode: string;
  vehicleDescription: string;
  category: string;
  records: FuelRecord[];
}

function parseNumber(value: any): number {
  if (!value) return 0;
  const str = String(value).replace(/\./g, '').replace(',', '.');
  return parseFloat(str) || 0;
}

export function VehicleConsumptionModal({
  open,
  onClose,
  vehicleCode,
  vehicleDescription,
  category,
  records,
}: VehicleConsumptionModalProps) {
  const { settings } = useObraSettings();
  const [startDate, setStartDate] = useState<Date | undefined>(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date | undefined>(new Date());
  
  // Filter to exclude tank refuel records from consumption calculation
  const [excludeTankRefuels, setExcludeTankRefuels] = useState(true);

  // Check if this is a Comboio vehicle (CC prefix)
  const isComboioVehicle = useMemo(() => {
    const codeUpper = vehicleCode?.toUpperCase() || '';
    const descUpper = vehicleDescription?.toUpperCase() || '';
    return codeUpper.startsWith('CC') || 
           codeUpper.includes('COMBOIO') ||
           descUpper.includes('COMBOIO');
  }, [vehicleCode, vehicleDescription]);

  // Count tank refuel records
  const tankRefuelCount = useMemo(() => {
    return records.filter(r => isTankRefuelRecord(r.observations)).length;
  }, [records]);

  // Determine if equipment (L/h) or vehicle (km/L)
  const isEquipment = useMemo(() => {
    const cat = category?.toLowerCase() || '';
    return cat.includes('equipamento') ||
           cat.includes('máquina') ||
           cat.includes('maquina') ||
           cat.includes('trator') ||
           cat.includes('retroescavadeira') ||
           cat.includes('escavadeira') ||
           cat.includes('pá carregadeira') ||
           cat.includes('rolo') ||
           cat.includes('motoniveladora') ||
           cat.includes('compactador') ||
           cat.includes('gerador');
  }, [category]);

  // Filter records by date range
  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      if (!startDate || !endDate) return true;
      const recordDate = new Date(record.record_date);
      if (!isValid(recordDate)) return false;
      return isWithinInterval(recordDate, {
        start: startOfDay(startDate),
        end: endOfDay(endDate),
      });
    }).sort((a, b) => new Date(a.record_date).getTime() - new Date(b.record_date).getTime());
  }, [records, startDate, endDate]);

  // Filter records for consumption calculation (excluding tank refuels if enabled)
  const consumptionRecords = useMemo(() => {
    if (!excludeTankRefuels) return filteredRecords;
    return filteredRecords.filter(r => !isTankRefuelRecord(r.observations));
  }, [filteredRecords, excludeTankRefuels]);

  // Calculate consumption metrics (using consumptionRecords which may exclude tank refuels)
  const metrics = useMemo(() => {
    if (consumptionRecords.length === 0) {
      return {
        totalLiters: 0,
        totalHours: 0,
        totalKm: 0,
        avgConsumption: 0,
        recordCount: 0,
        consumptionUnit: isEquipment ? 'L/h' : 'km/L',
        tankRefuelLiters: 0,
      };
    }

    const totalLiters = consumptionRecords.reduce((sum, r) => sum + (r.fuel_quantity || 0), 0);
    
    // Calculate tank refuel liters separately (for display purposes)
    const tankRefuelLiters = filteredRecords
      .filter(r => isTankRefuelRecord(r.observations))
      .reduce((sum, r) => sum + (r.fuel_quantity || 0), 0);
    
    // Calculate intervals
    let totalHours = 0;
    let totalKm = 0;

    consumptionRecords.forEach(record => {
      if (record.horimeter_current && record.horimeter_previous) {
        totalHours += record.horimeter_current - record.horimeter_previous;
      }
      if (record.km_current && record.km_previous) {
        totalKm += record.km_current - record.km_previous;
      }
    });

    // Calculate average consumption
    let avgConsumption = 0;
    if (isEquipment) {
      // L/h - liters per hour
      avgConsumption = totalHours > 0 ? totalLiters / totalHours : 0;
    } else {
      // km/L - km per liter
      avgConsumption = totalLiters > 0 ? totalKm / totalLiters : 0;
    }

    return {
      totalLiters,
      totalHours,
      totalKm,
      avgConsumption,
      recordCount: consumptionRecords.length,
      consumptionUnit: isEquipment ? 'L/h' : 'km/L',
      tankRefuelLiters,
    };
  }, [consumptionRecords, filteredRecords, isEquipment]);

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header with navy blue
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`HISTÓRICO DE CONSUMO - ${vehicleCode}`, pageWidth / 2, 12, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(vehicleDescription, pageWidth / 2, 19, { align: 'center' });
    
    if (settings?.nome) {
      doc.setFontSize(8);
      doc.text(`${settings.nome}${settings.cidade ? ` - ${settings.cidade}` : ''}`, pageWidth / 2, 25, { align: 'center' });
    }

    // Period and metrics
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    const periodStr = startDate && endDate 
      ? `Período: ${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`
      : 'Período: Todo o histórico';
    doc.text(periodStr, 14, 36);
    doc.text(`Total: ${metrics.totalLiters.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L | Consumo Médio: ${metrics.avgConsumption.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${metrics.consumptionUnit}`, 14, 42);

    // Table
    const tableData = filteredRecords.map(record => {
      const horInterval = record.horimeter_current && record.horimeter_previous 
        ? record.horimeter_current - record.horimeter_previous 
        : 0;
      const kmInterval = record.km_current && record.km_previous 
        ? record.km_current - record.km_previous 
        : 0;
      
      let consumption = 0;
      if (isEquipment && horInterval > 0) {
        consumption = record.fuel_quantity / horInterval;
      } else if (!isEquipment && record.fuel_quantity > 0) {
        consumption = kmInterval / record.fuel_quantity;
      }

      return [
        format(new Date(record.record_date), 'dd/MM/yyyy'),
        record.fuel_quantity.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        record.horimeter_previous?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '-',
        record.horimeter_current?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '-',
        horInterval > 0 ? horInterval.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
        record.km_previous?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '-',
        record.km_current?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '-',
        kmInterval > 0 ? kmInterval.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) : '-',
        consumption > 0 ? consumption.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-',
        record.location || '-',
        record.operator_name || '-',
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['Data', 'Litros', 'Hor. Ant.', 'Hor. Atual', 'Δ Horas', 'Km Ant.', 'Km Atual', 'Δ Km', metrics.consumptionUnit, 'Local', 'Operador']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      styles: {
        fontSize: 7,
        cellPadding: 2,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 22 },
        1: { halign: 'right', cellWidth: 20 },
        2: { halign: 'right', cellWidth: 22 },
        3: { halign: 'right', cellWidth: 22 },
        4: { halign: 'right', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 20 },
        6: { halign: 'right', cellWidth: 20 },
        7: { halign: 'right', cellWidth: 18 },
        8: { halign: 'right', cellWidth: 18 },
        9: { halign: 'left', cellWidth: 'auto' },
        10: { halign: 'left', cellWidth: 'auto' },
      },
    });

    doc.save(`consumo-${vehicleCode}-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Fuel className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="font-bold text-primary">{vehicleCode}</span>
              <span className="mx-2">-</span>
              {vehicleDescription}
            </div>
            <Badge variant="outline" className="ml-2">
              {isEquipment ? 'Equipamento (L/h)' : 'Veículo (km/L)'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 pb-4 border-b">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Período:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="w-4 h-4" />
                  {startDate ? format(startDate, 'dd/MM/yyyy') : 'Início'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="w-4 h-4" />
                  {endDate ? format(endDate, 'dd/MM/yyyy') : 'Fim'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="ml-auto">
            <Button onClick={exportToPDF} variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Exportar PDF
            </Button>
          </div>
        </div>

        {/* Tank Refuel Filter - Only show for Comboio vehicles or when there are tank refuels */}
        {(isComboioVehicle || tankRefuelCount > 0) && (
          <div className="flex flex-wrap items-center gap-4 py-3 px-4 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                Filtro de Consumo
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch 
                id="exclude-tank-refuels" 
                checked={excludeTankRefuels}
                onCheckedChange={setExcludeTankRefuels}
              />
              <Label htmlFor="exclude-tank-refuels" className="text-sm cursor-pointer">
                Excluir abastecimentos do tanque
              </Label>
            </div>

            {tankRefuelCount > 0 && (
              <Badge variant="outline" className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300">
                {tankRefuelCount} registro(s) de tanque
                {excludeTankRefuels && ` excluído(s)`}
              </Badge>
            )}

            {!excludeTankRefuels && metrics.tankRefuelLiters > 0 && (
              <span className="text-xs text-orange-600 dark:text-orange-400">
                ({metrics.tankRefuelLiters.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L de tanque incluídos)
              </span>
            )}
          </div>
        )}

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-4">
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm font-medium">
              <Fuel className="w-4 h-4" />
              Total Diesel
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
              {metrics.totalLiters.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} L
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm font-medium">
              <Gauge className="w-4 h-4" />
              {isEquipment ? 'Horas Trabalhadas' : 'Km Rodados'}
            </div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
              {isEquipment 
                ? `${metrics.totalHours.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} h`
                : `${metrics.totalKm.toLocaleString('pt-BR', { minimumFractionDigits: 0 })} km`
              }
            </div>
          </div>

          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
              <TrendingUp className="w-4 h-4" />
              Consumo Médio
            </div>
            <div className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
              {metrics.avgConsumption.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} {metrics.consumptionUnit}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 text-sm font-medium">
              <Truck className="w-4 h-4" />
              Abastecimentos
            </div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">
              {metrics.recordCount}
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="flex-1 overflow-auto border rounded-lg">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Hor. Ant.</TableHead>
                <TableHead className="text-right">Hor. Atual</TableHead>
                <TableHead className="text-right">Δ Horas</TableHead>
                <TableHead className="text-right">Km Ant.</TableHead>
                <TableHead className="text-right">Km Atual</TableHead>
                <TableHead className="text-right">Δ Km</TableHead>
                <TableHead className="text-right">{metrics.consumptionUnit}</TableHead>
                <TableHead>Local</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado para o período selecionado
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record, idx) => {
                  const horInterval = record.horimeter_current && record.horimeter_previous 
                    ? record.horimeter_current - record.horimeter_previous 
                    : 0;
                  const kmInterval = record.km_current && record.km_previous 
                    ? record.km_current - record.km_previous 
                    : 0;
                  
                  let consumption = 0;
                  if (isEquipment && horInterval > 0) {
                    consumption = record.fuel_quantity / horInterval;
                  } else if (!isEquipment && record.fuel_quantity > 0) {
                    consumption = kmInterval / record.fuel_quantity;
                  }

                  return (
                    <TableRow key={idx}>
                      <TableCell>{format(new Date(record.record_date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-right font-medium">
                        {record.fuel_quantity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {record.horimeter_previous?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.horimeter_current?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '-'}
                      </TableCell>
                      <TableCell className="text-right text-amber-600 font-medium">
                        {horInterval > 0 ? `+${horInterval.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {record.km_previous?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.km_current?.toLocaleString('pt-BR', { minimumFractionDigits: 0 }) || '-'}
                      </TableCell>
                      <TableCell className="text-right text-blue-600 font-medium">
                        {kmInterval > 0 ? `+${kmInterval.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {consumption > 0 ? consumption.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{record.location || '-'}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
