import { useState, useEffect, useRef } from 'react';
import { Search, Bell, Menu, Sun, Moon, Truck, ClipboardList, Fuel, FileText, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/useTheme';
import { useGlobalSearch, SearchResult } from '@/hooks/useGlobalSearch';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface TopBarProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
  userName?: string;
  userRole?: string;
}

const categoryIcons: Record<string, any> = {
  vehicle: Truck,
  order: ClipboardList,
  record: Fuel,
  page: FileText,
};

const categoryLabels: Record<string, string> = {
  vehicle: 'Veículos',
  order: 'Ordens de Serviço',
  record: 'Abastecimentos',
  page: 'Páginas',
};

export function TopBar({ onMenuClick, showMenuButton, userName = 'Jean Campos', userRole = 'Sistema' }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { search, setSearch, searchInItems, navigateToResult } = useGlobalSearch();
  const [showCommandDialog, setShowCommandDialog] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [fuelRecords, setFuelRecords] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Fetch data for search
  useEffect(() => {
    const fetchData = async () => {
      const [vehiclesRes, ordersRes, recordsRes] = await Promise.all([
        supabase.from('vehicles').select('*').limit(500),
        supabase.from('service_orders').select('*').limit(500),
        supabase.from('field_fuel_records').select('*').limit(500),
      ]);
      
      setVehicles(vehiclesRes.data || []);
      setOrders(ordersRes.data || []);
      setFuelRecords(recordsRes.data || []);
    };
    fetchData();
  }, []);

  // Update search results
  useEffect(() => {
    const newResults = searchInItems(search, vehicles, orders, fuelRecords);
    setResults(newResults);
  }, [search, vehicles, orders, fuelRecords, searchInItems]);

  // Handle keyboard shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowCommandDialog(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const handleResultClick = (result: SearchResult) => {
    navigateToResult(result);
    setShowCommandDialog(false);
    setSearch('');
  };

  const initials = userName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Group results by category
  const groupedResults = results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = [];
    }
    acc[result.category].push(result);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <>
      <header className="h-14 bg-card border-b border-border px-3 md:px-6 flex items-center justify-between gap-2">
        {/* Mobile menu button */}
        {showMenuButton && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onMenuClick}
            className="md:hidden shrink-0"
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}

        {/* Search */}
        <div className="relative flex-1 max-w-xs md:max-w-sm lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Buscar... (Ctrl+K)"
            className="pl-10 h-9 bg-muted/50 border-0 w-full cursor-pointer"
            onClick={() => setShowCommandDialog(true)}
            readOnly
          />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          {/* Theme Toggle */}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleTheme}
            className="hover:bg-muted"
            title={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
          >
            {theme === 'light' ? (
              <Moon className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Sun className="w-5 h-5 text-amber-400" />
            )}
          </Button>

          <button className="relative p-2 hover:bg-muted rounded-lg transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
          </button>
          
          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 hover:bg-muted rounded-lg p-1 transition-colors">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{userRole}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {initials}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                {theme === 'light' ? (
                  <>
                    <Moon className="w-4 h-4 mr-2" />
                    Modo Escuro
                  </>
                ) : (
                  <>
                    <Sun className="w-4 h-4 mr-2" />
                    Modo Claro
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Command Dialog for Global Search */}
      <CommandDialog open={showCommandDialog} onOpenChange={setShowCommandDialog}>
        <CommandInput 
          placeholder="Buscar veículos, ordens, páginas..." 
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          
          {Object.entries(groupedResults).map(([category, items]) => {
            const Icon = categoryIcons[category] || FileText;
            return (
              <CommandGroup key={category} heading={categoryLabels[category] || category}>
                {items.map((result) => (
                  <CommandItem
                    key={result.id}
                    onSelect={() => handleResultClick(result)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{result.title}</div>
                      {result.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
