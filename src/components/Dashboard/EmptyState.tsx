import { Table2 } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Table2 className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">
          Selecione uma planilha
        </h2>
        <p className="text-muted-foreground">
          Escolha uma planilha no menu lateral para visualizar e gerenciar seus dados.
        </p>
      </div>
    </div>
  );
}
