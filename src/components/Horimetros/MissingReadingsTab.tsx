import React, { useState, useMemo, useCallback } from 'react';
import { format, subDays, startOfDay, addDays, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Check, Calendar, ChevronDown, ChevronRight, ChevronLeft, RefreshCw, Eye, MessageCircle, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Vehicle, HorimeterWithVehicle } from '@/hooks/useHorimeters';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DatabaseHorimeterModal } from '@/components/Horimetros/DatabaseHorimeterModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatPtBRNumber } from '@/lib/ptBRNumber';
import { getSheetData } from '@/lib/googleSheets';

interface MissingReadingsTabProps {
  vehicles: Vehicle[];
  readings: HorimeterWithVehicle[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function MissingReadingsTab({ vehicles, readings, loading, refetch }: MissingReadingsTabProps) {
  const [daysBack, setDaysBack] = useState(14);
  const [dateOffset, setDateOffset] = useState(0);
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [viewMode, setViewMode] = useState<'pendentes' | 'todos' | 'em_dia'>('pendentes');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalVehicleId, setModalVehicleId] = useState<string | undefined>(undefined);
  const [modalDate, setModalDate] = useState<string | undefined>(undefined);
  const [repeating, setRepeating] = useState(false);

  // Date range with offset navigation
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    const end = addDays(today, dateOffset);
    const start = subDays(end, daysBack - 1);
    return eachDayOfInterval({ start, end }).sort((a, b) => a.getTime() - b.getTime());
  }, [daysBack, dateOffset]);

  const goToToday = () => setDateOffset(0);
  const goBack = () => setDateOffset(prev => prev - 7);
  const goForward = () => setDateOffset(prev => Math.min(prev + 7, 0));

  // Companies from vehicles
  const companies = useMemo(() => {
    const set = new Set<string>();
    vehicles.forEach(v => v.company && set.add(v.company));
    return Array.from(set).sort();
  }, [vehicles]);

  // Filtered vehicles (exclude "Outros")
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      if (v.category?.toLowerCase() === 'outros') return false;
      if (v.status?.toLowerCase() === 'desmobilizado' || v.status?.toLowerCase() === 'inativo') return false;
      if (companyFilter !== 'all' && v.company?.toLowerCase() !== companyFilter.toLowerCase()) return false;
      if (searchFilter) {
        const s = searchFilter.toLowerCase();
        if (!v.code.toLowerCase().includes(s) && !v.name.toLowerCase().includes(s)) return false;
      }
      return true;
    }).sort((a, b) => a.code.localeCompare(b.code, 'pt-BR'));
  }, [vehicles, companyFilter, searchFilter]);

  // Readings lookup
  const readingsMap = useMemo(() => {
    const map = new Map<string, HorimeterWithVehicle>();
    readings.forEach(r => {
      const key = `${r.vehicle_id}|${r.reading_date}`;
      const existing = map.get(key);
      if (!existing || r.created_at > existing.created_at) map.set(key, r);
    });
    return map;
  }, [readings]);

  // Vehicle stats
  const vehicleStats = useMemo(() => {
    const stats = new Map<string, { filled: number; missing: number }>();
    filteredVehicles.forEach(v => {
      let filled = 0, missing = 0;
      dateRange.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        if (readingsMap.has(`${v.id}|${dateStr}`)) filled++; else missing++;
      });
      stats.set(v.id, { filled, missing });
    });
    return stats;
  }, [filteredVehicles, dateRange, readingsMap]);

  // Display vehicles based on view mode
  const displayVehicles = useMemo(() => {
    if (viewMode === 'todos') return filteredVehicles;
    if (viewMode === 'em_dia') return filteredVehicles.filter(v => vehicleStats.get(v.id)?.missing === 0);
    return filteredVehicles.filter(v => (vehicleStats.get(v.id)?.missing || 0) > 0);
  }, [filteredVehicles, viewMode, vehicleStats]);

  // Group by company
  const groupedVehicles = useMemo(() => {
    const groups = new Map<string, Vehicle[]>();
    displayVehicles.forEach(v => {
      const company = v.company || 'Sem Empresa';
      if (!groups.has(company)) groups.set(company, []);
      groups.get(company)!.push(v);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [displayVehicles]);

  const toggleGroup = useCallback((g: string) => {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }, []);
  const expandAll = () => setCollapsedGroups(new Set());
  const collapseAll = () => setCollapsedGroups(new Set(groupedVehicles.map(([g]) => g)));

  // Global stats
  const totalFleet = filteredVehicles.length;
  const vehiclesWithPending = filteredVehicles.filter(v => (vehicleStats.get(v.id)?.missing || 0) > 0).length;
  const totalMissing = useMemo(() => {
    let c = 0;
    vehicleStats.forEach(s => c += s.missing);
    return c;
  }, [vehicleStats]);

  // Click on a pending cell → open form directly
  const handleCellClick = (vehicleId: string, dateStr: string) => {
    const key = `${vehicleId}|${dateStr}`;
    if (readingsMap.has(key)) return;
    setModalVehicleId(vehicleId);
    setModalDate(dateStr);
    setModalOpen(true);
  };

  const handleModalSuccess = async () => {
    setModalOpen(false);
    setModalVehicleId(undefined);
    setModalDate(undefined);
    await refetch();
  };

  // WhatsApp export
  const exportWhatsApp = useCallback(() => {
    const today = format(new Date(), 'dd/MM/yyyy');
    let msg = `📋 *Monitoramento de Preenchimento*\n📅 ${today}\n\n`;
    msg += `🚜 Frota: *${totalFleet}* | ⚠️ Com pendência: *${vehiclesWithPending}* | 📝 Dias sem preenchimento: *${totalMissing}*\n\n`;

    groupedVehicles.forEach(([company, vehs]) => {
      const companyMissing = vehs.reduce((acc, v) => acc + (vehicleStats.get(v.id)?.missing || 0), 0);
      if (companyMissing === 0) return;
      msg += `▸ *${company}* (${vehs.length} veículos - ${companyMissing} pendentes)\n`;
      vehs.forEach(v => {
        const stats = vehicleStats.get(v.id);
        if (!stats || stats.missing === 0) return;
        msg += `  ✗ ${v.code} — ${stats.missing} dias pendente(s)\n`;
      });
      msg += '\n';
    });

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }, [groupedVehicles, vehicleStats, totalFleet, vehiclesWithPending, totalMissing]);

  const isToday = (dateStr: string) => dateStr === format(new Date(), 'yyyy-MM-dd');
  const isFuture = (dateStr: string) => dateStr > format(new Date(), 'yyyy-MM-dd');
  const isSunday = (date: Date) => date.getDay() === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Monitoramento de Preenchimento
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Frota: <strong>{totalFleet}</strong> &nbsp;⚠️ <strong className="text-destructive">{vehiclesWithPending}</strong> com pendência &nbsp;📝 <strong className="text-amber-600">{totalMissing}</strong> dias sem preenchimento
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportWhatsApp}>
            <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* View mode tabs */}
        <div className="flex gap-0.5 rounded-lg border p-0.5">
          <Button variant={viewMode === 'pendentes' ? 'default' : 'ghost'} size="sm" className="h-8 text-xs gap-1"
            onClick={() => setViewMode('pendentes')}>
            <span className="font-bold">Pendentes ({vehiclesWithPending})</span>
          </Button>
          <Button variant={viewMode === 'todos' ? 'default' : 'ghost'} size="sm" className="h-8 text-xs"
            onClick={() => setViewMode('todos')}>Todos</Button>
          <Button variant={viewMode === 'em_dia' ? 'default' : 'ghost'} size="sm" className="h-8 text-xs"
            onClick={() => setViewMode('em_dia')}>Em dia</Button>
        </div>

        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Todas empresas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas empresas</SelectItem>
            {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input placeholder="Buscar veículo..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
          className="h-8 w-[160px] text-xs" />

        {/* Days selector */}
        <Select value={String(daysBack)} onValueChange={v => { setDaysBack(Number(v)); setDateOffset(0); }}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[7, 14, 21, 30].map(d => <SelectItem key={d} value={String(d)}>{d} dias</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Date navigation */}
        <div className="flex items-center gap-0.5">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goBack}><ChevronLeft className="w-4 h-4" /></Button>
          <Button variant={dateOffset === 0 ? 'default' : 'outline'} size="sm" className="h-8 text-xs px-3" onClick={goToToday}>Hoje</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={goForward} disabled={dateOffset >= 0}><ChevronRight className="w-4 h-4" /></Button>
        </div>

        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>Expandir</Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>Recolher</Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-800 border border-emerald-400" /> Preenchido
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-200 dark:bg-red-800 border border-red-400" /> Pendente
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-muted border" /> Hoje/Futuro
        </div>
      </div>

      {/* Matrix */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <ScrollArea className="w-full">
          <div className="min-w-[700px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/95 backdrop-blur-sm border-b sticky top-0 z-30">
                  <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur-sm px-3 py-2.5 text-left font-semibold border-r min-w-[180px]">
                    Veículo
                  </th>
                  <th className="px-2 py-2.5 text-left font-semibold border-r min-w-[90px]">Tipo</th>
                  {dateRange.map(date => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const dayName = format(date, 'EEEEEE', { locale: ptBR }).toUpperCase();
                    const isSun = isSunday(date);
                    const isTod = isToday(dateStr);
                    return (
                      <th key={dateStr} className={cn(
                        "px-0.5 py-2.5 text-center font-medium border-r min-w-[52px]",
                        isSun && "font-bold text-destructive",
                        isTod && "bg-primary/10"
                      )}>
                        <div className="text-[9px] text-muted-foreground uppercase">{dayName}</div>
                        <div className="font-semibold text-[11px]">{format(date, 'dd/MM')}</div>
                      </th>
                    );
                  })}
                  <th className="px-2 py-2.5 text-center font-semibold border-l min-w-[50px]">Pend.</th>
                </tr>
              </thead>
              <tbody>
                {displayVehicles.length === 0 ? (
                  <tr>
                    <td colSpan={dateRange.length + 3} className="text-center py-16 text-muted-foreground">
                      {viewMode === 'pendentes' ? '🎉 Todos os equipamentos estão em dia!' : 'Nenhum equipamento encontrado.'}
                    </td>
                  </tr>
                ) : groupedVehicles.map(([company, vehs]) => {
                  const isCollapsed = collapsedGroups.has(company);
                  const companyMissing = vehs.reduce((acc, v) => acc + (vehicleStats.get(v.id)?.missing || 0), 0);
                  return (
                    <React.Fragment key={company}>
                      {/* Company header row */}
                      <tr className="border-t-2 border-border cursor-pointer hover:bg-muted/60 transition-colors"
                        onClick={() => toggleGroup(company)}>
                        <td colSpan={2} className="sticky left-0 z-10 bg-muted/90 backdrop-blur-sm px-3 py-2 border-r">
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-bold text-sm text-foreground">{company}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5">{vehs.length} veículos</Badge>
                          </div>
                        </td>
                        {dateRange.map(date => <td key={format(date, 'yyyy-MM-dd')} className="border-r" />)}
                        <td className="px-2 py-2 text-center border-l">
                          {companyMissing > 0 ? (
                            <Badge variant="destructive" className="text-[10px] px-2">{companyMissing} dias pendentes</Badge>
                          ) : (
                            <span className="text-emerald-500 font-medium">✓</span>
                          )}
                        </td>
                      </tr>
                      {/* Vehicle rows */}
                      {!isCollapsed && vehs.map(vehicle => {
                        const vStats = vehicleStats.get(vehicle.id);
                        const vMissing = vStats?.missing || 0;
                        return (
                          <tr key={vehicle.id} className="border-t hover:bg-muted/20 transition-colors">
                            <td className="sticky left-0 z-10 bg-card px-3 py-1.5 border-r">
                              <div className="font-semibold text-foreground text-[11px]">{vehicle.code}</div>
                              <div className="text-[9px] text-muted-foreground truncate max-w-[160px]">{vehicle.name}</div>
                            </td>
                            <td className="px-2 py-1.5 border-r text-[10px] text-muted-foreground">
                              {vehicle.category || '—'}
                            </td>
                            {dateRange.map(date => {
                              const dateStr = format(date, 'yyyy-MM-dd');
                              const key = `${vehicle.id}|${dateStr}`;
                              const reading = readingsMap.get(key);
                              const isTod = isToday(dateStr);
                              const isFut = isFuture(dateStr);
                              const isSun = isSunday(date);

                              if (isFut) {
                                return (
                                  <td key={dateStr} className={cn("px-0.5 py-1.5 text-center border-r bg-muted/30", isTod && "bg-muted/50")}>
                                    <span className="text-muted-foreground/40">—</span>
                                  </td>
                                );
                              }

                              if (reading) {
                                return (
                                  <td key={dateStr} className={cn(
                                    "px-0.5 py-1.5 text-center border-r",
                                    "bg-emerald-100/60 dark:bg-emerald-950/30",
                                    isSun && "bg-emerald-100/40 dark:bg-emerald-950/20"
                                  )}>
                                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mx-auto" />
                                  </td>
                                );
                              }

                              // Pending cell — click directly opens form
                              return (
                                <td key={dateStr} className={cn(
                                  "px-0.5 py-1.5 text-center border-r cursor-pointer transition-colors",
                                  "bg-red-100/60 dark:bg-red-950/30 hover:bg-red-200/80 dark:hover:bg-red-900/50",
                                  isSun && "bg-red-100/40 dark:bg-red-950/20"
                                )}
                                  onClick={() => handleCellClick(vehicle.id, dateStr)}
                                  title={`Lançar ${vehicle.code} em ${format(date, 'dd/MM/yyyy')}`}
                                >
                                  <span className="text-destructive font-bold text-sm">✗</span>
                                </td>
                              );
                            })}
                            <td className="px-2 py-1.5 text-center border-l">
                              {vMissing > 0 ? (
                                <Badge variant="destructive" className="text-[10px] px-2 py-0.5 font-bold">{vMissing}</Badge>
                              ) : (
                                <span className="text-emerald-500 text-sm">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Modal */}
      <DatabaseHorimeterModal
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) { setModalOpen(false); setModalVehicleId(undefined); setModalDate(undefined); }
        }}
        onSuccess={handleModalSuccess}
        initialVehicleId={modalVehicleId}
        initialDate={modalDate}
        externalReadings={readings}
      />
    </div>
  );
}
