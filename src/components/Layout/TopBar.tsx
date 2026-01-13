import { Search, Bell, User } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function TopBar() {
  return (
    <header className="h-14 bg-card border-b border-border px-6 flex items-center justify-between">
      {/* Search */}
      <div className="relative w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar veículos, ordens..."
          className="pl-10 h-9 bg-muted/50 border-0"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        <button className="relative p-2 hover:bg-muted rounded-lg transition-colors">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">Jean Campos</p>
            <p className="text-xs text-muted-foreground">Sistema</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
            JC
          </div>
        </div>
      </div>
    </header>
  );
}
