import { useState, useEffect } from 'react';
import { Edit2, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BrazilianNumberInput } from '@/components/ui/brazilian-number-input';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FullRecordData {
  id: string;
  vehicle_code: string;
  vehicle_description: string | null;
  fuel_quantity: number;
  record_date: string;
  record_time: string;
  location: string | null;
  operator_name: string | null;
  horimeter_current: number | null;
  horimeter_previous: number | null;
  km_current: number | null;
  km_previous: number | null;
  arla_quantity: number | null;
  observations: string | null;
  fuel_type: string | null;
  oil_type: string | null;
  oil_quantity: number | null;
  lubricant: string | null;
  filter_blow: boolean | null;
  filter_blow_quantity: number | null;
  category: string | null;
  company: string | null;
  work_site: string | null;
  supplier: string | null;
  invoice_number: string | null;
  entry_location: string | null;
  unit_price: number | null;
  record_type: string | null;
  synced_to_sheet: boolean | null;
}

interface EditRequestModalProps {
  record: { id: string; vehicle_code: string; fuel_quantity: number; record_date: string; record_time: string; location: string; operator_name?: string; horimeter_current?: number; km_current?: number; arla_quantity?: number; observations?: string } | null;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRequestModal({ record, userId, onClose, onSuccess }: EditRequestModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fullRecord, setFullRecord] = useState<FullRecordData | null>(null);

  // Editable field states
  const [fuelQuantityStr, setFuelQuantityStr] = useState('');
  const [horimeterCurrentStr, setHorimeterCurrentStr] = useState('');
  const [horimeterPreviousStr, setHorimeterPreviousStr] = useState('');
  const [kmCurrentStr, setKmCurrentStr] = useState('');
  const [kmPreviousStr, setKmPreviousStr] = useState('');
  const [arlaQuantityStr, setArlaQuantityStr] = useState('');
  const [oilQuantityStr, setOilQuantityStr] = useState('');
  const [unitPriceStr, setUnitPriceStr] = useState('');
  const [filterBlowQtyStr, setFilterBlowQtyStr] = useState('');
  const [observationsStr, setObservationsStr] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [oilType, setOilType] = useState('');
  const [lubricant, setLubricant] = useState('');
  const [filterBlow, setFilterBlow] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [recordDate, setRecordDate] = useState('');
  const [recordTime, setRecordTime] = useState('');
  const [workSite, setWorkSite] = useState('');

  // Fetch the full record from DB when modal opens
  useEffect(() => {
    if (!record) {
      setFullRecord(null);
      return;
    }
    
    const fetchFullRecord = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('field_fuel_records')
          .select('*')
          .eq('id', record.id)
          .single();
        
        if (error) throw error;
        
        const r = data as FullRecordData;
        setFullRecord(r);
        
        // Populate all fields
        setFuelQuantityStr(r.fuel_quantity ? formatPtBRNumber(r.fuel_quantity) : '');
        setHorimeterCurrentStr(r.horimeter_current ? formatPtBRNumber(r.horimeter_current) : '');
        setHorimeterPreviousStr(r.horimeter_previous ? formatPtBRNumber(r.horimeter_previous) : '');
        setKmCurrentStr(r.km_current ? formatPtBRNumber(r.km_current) : '');
        setKmPreviousStr(r.km_previous ? formatPtBRNumber(r.km_previous) : '');
        setArlaQuantityStr(r.arla_quantity ? formatPtBRNumber(r.arla_quantity) : '');
        setOilQuantityStr(r.oil_quantity ? formatPtBRNumber(r.oil_quantity) : '');
        setUnitPriceStr(r.unit_price ? formatPtBRNumber(r.unit_price) : '');
        setFilterBlowQtyStr(r.filter_blow_quantity ? formatPtBRNumber(r.filter_blow_quantity, { decimals: 0 }) : '');
        setObservationsStr(r.observations || '');
        setOperatorName(r.operator_name || '');
        setFuelType(r.fuel_type || 'Diesel');
        setOilType(r.oil_type || '');
        setLubricant(r.lubricant || '');
        setFilterBlow(r.filter_blow || false);
        setSupplier(r.supplier || '');
        setInvoiceNumber(r.invoice_number || '');
        setRecordDate(r.record_date);
        setRecordTime(r.record_time?.substring(0, 5) || '');
        setWorkSite(r.work_site || '');
      } catch (err) {
        console.error('Error fetching full record:', err);
        toast.error('Erro ao carregar registro');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchFullRecord();
  }, [record]);

  const handleSubmit = async () => {
    if (!record || !fullRecord) return;

    const updatedData: Record<string, any> = {
      fuel_quantity: parsePtBRNumber(fuelQuantityStr) || fullRecord.fuel_quantity,
      horimeter_current: parsePtBRNumber(horimeterCurrentStr) || null,
      horimeter_previous: parsePtBRNumber(horimeterPreviousStr) || null,
      km_current: parsePtBRNumber(kmCurrentStr) || null,
      km_previous: parsePtBRNumber(kmPreviousStr) || null,
      arla_quantity: parsePtBRNumber(arlaQuantityStr) || null,
      oil_quantity: parsePtBRNumber(oilQuantityStr) || null,
      unit_price: parsePtBRNumber(unitPriceStr) || null,
      filter_blow: filterBlow,
      filter_blow_quantity: parsePtBRNumber(filterBlowQtyStr) || 0,
      observations: observationsStr || null,
      operator_name: operatorName || null,
      fuel_type: fuelType || null,
      oil_type: oilType || null,
      lubricant: lubricant || null,
      supplier: supplier || null,
      invoice_number: invoiceNumber || null,
      record_date: recordDate,
      record_time: recordTime ? `${recordTime}:00` : fullRecord.record_time,
      work_site: workSite || null,
      updated_at: new Date().toISOString(),
    };

    setIsSubmitting(true);
    try {
      // 1. Update in Supabase
      const { error } = await supabase
        .from('field_fuel_records')
        .update(updatedData)
        .eq('id', record.id);

      if (error) throw error;

      // 2. Sync to Google Sheets - find and update the row
      try {
        await syncEditToSheet(fullRecord, updatedData);
      } catch (syncErr) {
        console.warn('Sheet sync failed (DB updated successfully):', syncErr);
      }

      toast.success('Registro atualizado com sucesso');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Error updating record:', err);
      toast.error('Erro ao atualizar registro');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find the corresponding row in the sheet and update it
  const syncEditToSheet = async (original: FullRecordData, updated: Record<string, any>) => {
    const sheetsToSearch = ['AbastecimentoCanteiro01'];
    const recordDateObj = new Date(`${original.record_date}T00:00:00`);
    const dateBR = recordDateObj.toLocaleDateString('pt-BR');
    const originalVehicle = original.vehicle_code.toUpperCase().replace(/\s/g, '');
    const originalQty = original.fuel_quantity;

    for (const sheetName of sheetsToSearch) {
      try {
        const { data: sheetData } = await supabase.functions.invoke('google-sheets', {
          body: { action: 'getData', sheetName, noCache: true },
        });

        if (!sheetData?.rows) continue;

        const matchIdx = sheetData.rows.findIndex((row: any) => {
          const rowDate = String(row['DATA'] || row['Data'] || '').trim();
          const rowVehicle = String(row['CODIGO'] || row['Codigo'] || row['Código'] || row['VEICULO'] || row['Veiculo'] || row['Veículo'] || '').toUpperCase().replace(/\s/g, '');
          const rowQty = parseFloat(String(row['QUANTIDADE'] || row['Quantidade'] || '0').replace(/\./g, '').replace(',', '.'));
          const rowTime = String(row['HORA'] || row['Hora'] || '').trim();
          const originalTime = original.record_time?.substring(0, 5) || '';

          const dateMatch = rowDate === dateBR;
          const vehicleMatch = rowVehicle === originalVehicle || rowVehicle.includes(originalVehicle) || originalVehicle.includes(rowVehicle);
          const qtyMatch = Math.abs(rowQty - originalQty) < 0.5;
          const timeMatch = rowTime === originalTime || !originalTime;

          return dateMatch && vehicleMatch && (timeMatch || qtyMatch);
        });

        if (matchIdx >= 0) {
          const rowIndex = (sheetData.rows[matchIdx] as any)._rowIndex ?? matchIdx + 2;
          const headers = sheetData.headers || [];

          // Build update payload mapping updated values to sheet headers
          const normalizeH = (h: string) => h.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/[\s_.]/g, '');

          const fmtNum = (v: number | null) => {
            if (!v && v !== 0) return '';
            return formatPtBRNumber(v);
          };

          const newDateObj = new Date(`${updated.record_date}T00:00:00`);
          const newDateBR = newDateObj.toLocaleDateString('pt-BR');

          const semanticMap: Record<string, string> = {
            'DATA': newDateBR,
            'HORA': updated.record_time?.substring(0, 5) || '',
            'QUANTIDADE': fmtNum(updated.fuel_quantity),
            'HORIMETROANTERIOR': fmtNum(updated.horimeter_previous),
            'HORIMETROATUAL': fmtNum(updated.horimeter_current),
            'KMANTERIOR': fmtNum(updated.km_previous),
            'KMATUAL': fmtNum(updated.km_current),
            'ARLA': fmtNum(updated.arla_quantity),
            'OLEO': fmtNum(updated.oil_quantity),
            'PRECOLITRO': fmtNum(updated.unit_price),
            'OPERADOR': updated.operator_name || '',
            'OBSERVACOES': updated.observations || '',
            'OBSERVACAO': updated.observations || '',
            'TIPOCOMBUSTIVEL': updated.fuel_type || '',
            'COMBUSTIVEL': updated.fuel_type || '',
            'FORNECEDOR': updated.supplier || '',
            'NOTAFISCAL': updated.invoice_number || '',
            'OBRA': updated.work_site || '',
            'SOPRODOSFILTROS': updated.filter_blow ? 'Sim' : '',
            'QTDSOPRO': updated.filter_blow_quantity ? String(updated.filter_blow_quantity) : '',
            'LUBRIFICANTE': updated.lubricant || '',
            'TIPOOLEO': updated.oil_type || '',
          };

          const updatePayload: Record<string, string> = {};
          for (const header of headers) {
            const norm = normalizeH(header);
            if (semanticMap[norm] !== undefined) {
              updatePayload[header] = semanticMap[norm];
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            await supabase.functions.invoke('google-sheets', {
              body: { action: 'update', sheetName, rowIndex, data: updatePayload },
            });
            console.log(`Updated row ${rowIndex} in sheet ${sheetName}`);
          }
          return; // Found and updated
        }
      } catch (err) {
        console.error(`Error syncing to sheet ${sheetName}:`, err);
      }
    }
    console.warn('Record not found in any sheet for update');
  };

  if (!record) return null;

  const isEntrada = fullRecord?.record_type === 'entrada';

  return (
    <Dialog open={!!record} onOpenChange={() => onClose()}>
      <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Edit2 className="w-5 h-5 text-blue-500" />
            Editar Registro
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            <strong className="text-foreground">{record.vehicle_code}</strong> — {record.record_date}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Carregando registro...</span>
          </div>
        ) : fullRecord ? (
          <div className="space-y-3 py-2">
            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Data</Label>
                <Input
                  type="date"
                  value={recordDate}
                  onChange={(e) => setRecordDate(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Hora</Label>
                <Input
                  type="time"
                  value={recordTime}
                  onChange={(e) => setRecordTime(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
            </div>

            {/* Operator */}
            <div className="space-y-1">
              <Label className="text-xs text-foreground">Operador</Label>
              <Input
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="h-9 bg-background border-border text-foreground text-sm"
              />
            </div>

            {/* Fuel Quantity & Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Qtd Combustível (L)</Label>
                <BrazilianNumberInput
                  value={fuelQuantityStr}
                  onChange={setFuelQuantityStr}
                  decimals={2}
                  placeholder="0,00"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Tipo Combustível</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger className="h-9 bg-background border-border text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Diesel">Diesel</SelectItem>
                    <SelectItem value="Diesel S10">Diesel S10</SelectItem>
                    <SelectItem value="Gasolina">Gasolina</SelectItem>
                    <SelectItem value="Etanol">Etanol</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Horimeter */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Hor. Anterior</Label>
                <BrazilianNumberInput
                  value={horimeterPreviousStr}
                  onChange={setHorimeterPreviousStr}
                  decimals={2}
                  placeholder="0,00"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Hor. Atual</Label>
                <BrazilianNumberInput
                  value={horimeterCurrentStr}
                  onChange={setHorimeterCurrentStr}
                  decimals={2}
                  placeholder="0,00"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
            </div>

            {/* KM */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">KM Anterior</Label>
                <BrazilianNumberInput
                  value={kmPreviousStr}
                  onChange={setKmPreviousStr}
                  decimals={2}
                  placeholder="0,0"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">KM Atual</Label>
                <BrazilianNumberInput
                  value={kmCurrentStr}
                  onChange={setKmCurrentStr}
                  decimals={2}
                  placeholder="0,0"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
            </div>

            {/* ARLA & Oil */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">ARLA (L)</Label>
                <BrazilianNumberInput
                  value={arlaQuantityStr}
                  onChange={setArlaQuantityStr}
                  decimals={1}
                  placeholder="0,0"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Óleo (L)</Label>
                <BrazilianNumberInput
                  value={oilQuantityStr}
                  onChange={setOilQuantityStr}
                  decimals={2}
                  placeholder="0,00"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
            </div>

            {/* Oil Type & Lubricant */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Tipo Óleo</Label>
                <Input
                  value={oilType}
                  onChange={(e) => setOilType(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                  placeholder="—"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Lubrificante</Label>
                <Input
                  value={lubricant}
                  onChange={(e) => setLubricant(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                  placeholder="—"
                />
              </div>
            </div>

            {/* Unit Price & Supplier (for entrada) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Preço/L (R$)</Label>
                <BrazilianNumberInput
                  value={unitPriceStr}
                  onChange={setUnitPriceStr}
                  decimals={2}
                  placeholder="0,00"
                  className="h-9 bg-background border-border text-foreground text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Fornecedor</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                  placeholder="—"
                />
              </div>
            </div>

            {/* Invoice & Work Site */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Nota Fiscal</Label>
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                  placeholder="—"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Obra</Label>
                <Input
                  value={workSite}
                  onChange={(e) => setWorkSite(e.target.value)}
                  className="h-9 bg-background border-border text-foreground text-sm"
                  placeholder="—"
                />
              </div>
            </div>

            {/* Filter Blow */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-foreground">Sopro dos Filtros</Label>
                <Select value={filterBlow ? 'sim' : 'nao'} onValueChange={(v) => setFilterBlow(v === 'sim')}>
                  <SelectTrigger className="h-9 bg-background border-border text-foreground text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {filterBlow && (
                <div className="space-y-1">
                  <Label className="text-xs text-foreground">Qtd Sopro</Label>
                  <BrazilianNumberInput
                    value={filterBlowQtyStr}
                    onChange={setFilterBlowQtyStr}
                    decimals={0}
                    placeholder="0"
                    className="h-9 bg-background border-border text-foreground text-sm"
                  />
                </div>
              )}
            </div>

            {/* Observations */}
            <div className="space-y-1">
              <Label className="text-xs text-foreground">Observações</Label>
              <Textarea
                value={observationsStr}
                onChange={(e) => setObservationsStr(e.target.value)}
                className="bg-background border-border text-foreground min-h-[60px] text-sm"
                placeholder="Observações..."
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border-0"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Alterações
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
