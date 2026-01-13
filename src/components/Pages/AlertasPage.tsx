import { useState, useMemo } from 'react';
import { 
  Bell,
  ChevronRight,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSheetData } from '@/hooks/useGoogleSheets';

const SHEET_NAME = 'Horimetros';

interface Alert {
  id: string;
  title: string;
  description: string;
  type: string;
  count: number;
}

export function AlertasPage() {
  const { data, loading } = useSheetData(SHEET_NAME);

  const alerts = useMemo(() => {
    // Generate alerts based on data
    const alertList: Alert[] = [];
    
    // Check for low utilization
    const lowUtilization = data.rows.filter(row => {
      const horas = parseFloat(String(row['HORAS'] || '0').replace(',', '.')) || 0;
      return horas < 2;
    });

    if (lowUtilization.length > 0) {
      // Group by vehicle
      const vehicleAlerts = new Map<string, number>();
      lowUtilization.forEach(row => {
        const veiculo = String(row['VEICULO'] || row['CODIGO'] || 'Desconhecido');
        vehicleAlerts.set(veiculo, (vehicleAlerts.get(veiculo) || 0) + 1);
      });

      vehicleAlerts.forEach((count, veiculo) => {
        alertList.push({
          id: veiculo,
          title: `Horímetro com alerta: ${veiculo}`,
          description: `${count} registro(s) com baixa utilização`,
          type: 'Horímetro',
          count
        });
      });
    }

    return alertList;
  }, [data.rows]);

  const totalAlerts = alerts.length;

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* No recent activity */}
        <div className="text-center py-8 text-muted-foreground">
          Nenhuma atividade recente
        </div>

        {/* Automatic Alerts */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <h2 className="font-semibold">Alertas Automáticos</h2>
            </div>
            <span className="text-sm text-warning font-medium">{totalAlerts} atenção</span>
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">
                Carregando alertas...
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                Nenhum alerta encontrado
              </div>
            ) : (
              alerts.slice(0, 10).map((alert) => (
                <button
                  key={alert.id}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-warning" />
                    </div>
                    <div>
                      <p className="font-medium">{alert.title}</p>
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      <Clock className="w-3 h-3 mr-1" />
                      {alert.type}
                    </Badge>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <span>{totalAlerts} alertas ativos</span>
          <span className="w-2 h-2 rounded-full bg-success" />
          <span>{totalAlerts} atenção</span>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-8">
          Desenvolvido por <span className="font-medium">Jean Campos</span> • Abastech © 2026
        </div>
      </div>
    </div>
  );
}
