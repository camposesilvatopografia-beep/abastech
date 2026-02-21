import * as React from 'react';
import { Check, ChevronsUpDown, Search, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface VehicleOption {
  id?: string;
  code: string;
  name?: string;
  description?: string;
  category?: string;
}

interface VehicleComboboxProps {
  vehicles: VehicleOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** If true, uses 'id' as the value; otherwise uses 'code' */
  useIdAsValue?: boolean;
}

/** Remove accents and normalize for search */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function VehicleCombobox({
  vehicles,
  value,
  onValueChange,
  placeholder = 'Selecione o veículo...',
  emptyMessage = 'Nenhum veículo encontrado.',
  disabled = false,
  className,
  useIdAsValue = false,
}: VehicleComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  // Reset search when popover opens
  React.useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const selectedVehicle = React.useMemo(() => {
    if (!value) return null;
    return vehicles.find(v => 
      useIdAsValue ? v.id === value : v.code === value
    );
  }, [vehicles, value, useIdAsValue]);

  const displayText = React.useMemo(() => {
    if (!selectedVehicle) return placeholder;
    const desc = selectedVehicle.name || selectedVehicle.description || '';
    return desc ? `${selectedVehicle.code} - ${desc}` : selectedVehicle.code;
  }, [selectedVehicle, placeholder]);

  // Custom filtering: normalize search terms, split into words, all must match
  const filteredGrouped = React.useMemo(() => {
    const normalizedSearch = normalize(search);
    const searchTerms = normalizedSearch.split(/\s+/).filter(Boolean);

    const filtered = vehicles.filter(vehicle => {
      if (searchTerms.length === 0) return true;
      const name = vehicle.name || vehicle.description || '';
      const category = vehicle.category || '';
      const haystack = normalize(`${vehicle.code} ${name} ${category}`);
      // Also try matching code without separators (e.g. "mn20" matches "MN-20")
      const haystackCompact = haystack.replace(/[-\s]/g, '');
      return searchTerms.every(term => {
        const termCompact = term.replace(/[-\s]/g, '');
        return haystack.includes(term) || haystackCompact.includes(termCompact);
      });
    });

    // Group by category
    const groups: Record<string, VehicleOption[]> = {};
    filtered.forEach(vehicle => {
      const cat = vehicle.category?.trim() || 'Outros';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(vehicle);
    });

    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === 'Outros') return 1;
      if (b === 'Outros') return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    return sortedCategories.map(category => ({
      category,
      vehicles: groups[category].sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [vehicles, search]);

  const totalFiltered = filteredGrouped.reduce((sum, g) => sum + g.vehicles.length, 0);

  // Custom filter that always returns 1 (we handle filtering ourselves)
  const commandFilter = React.useCallback(() => 1, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-medium h-12 text-base',
            'bg-background border-2 border-input hover:border-primary/50',
            'transition-all duration-200',
            !value && 'text-muted-foreground',
            value && 'border-muted-foreground/30 bg-muted/50',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Truck className={cn(
              "h-5 w-5 shrink-0",
              value ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="truncate">{displayText}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] min-w-[320px] p-0 bg-popover border-2 border-border shadow-xl z-[100]" 
        align="start"
        sideOffset={4}
      >
        <Command className="bg-popover" filter={commandFilter} shouldFilter={false}>
          <div className="flex items-center border-b-2 border-border px-3 bg-muted/50">
            <Search className="h-5 w-5 shrink-0 text-primary mr-2" />
            <CommandInput 
              placeholder="Digite código ou descrição..." 
              className="h-12 text-base border-0 focus:ring-0 bg-transparent placeholder:text-muted-foreground"
              value={search}
              onValueChange={setSearch}
            />
          </div>
          <CommandList className="max-h-[400px] overflow-auto">
            {totalFiltered === 0 && (
              <CommandEmpty className="py-6 text-center">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Truck className="h-8 w-8 opacity-50" />
                  <span className="text-sm">{emptyMessage}</span>
                  {search && (
                    <span className="text-xs">Busca: "{search}"</span>
                  )}
                </div>
              </CommandEmpty>
            )}
            
            {filteredGrouped.map(({ category, vehicles: categoryVehicles }) => (
              <CommandGroup 
                key={category} 
                heading={
                  <div className="flex items-center gap-2 px-2 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b border-border">
                    <span className="w-2 h-2 rounded-full bg-primary/50" />
                    {category} ({categoryVehicles.length})
                  </div>
                }
                className="p-0"
              >
                <div className="p-1">
                  {categoryVehicles.map((vehicle) => {
                    const itemValue = useIdAsValue ? vehicle.id! : vehicle.code;
                    const desc = vehicle.name || vehicle.description || '';
                    const isSelected = value === itemValue;
                    
                    return (
                      <CommandItem
                        key={itemValue}
                        value={itemValue}
                        onSelect={() => {
                          onValueChange(itemValue);
                          setOpen(false);
                        }}
                        className={cn(
                          "cursor-pointer py-2.5 px-3 rounded-lg mb-0.5 transition-colors",
                          "hover:bg-accent hover:text-accent-foreground",
                          isSelected && "bg-primary/10 border border-primary/30"
                        )}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 text-primary shrink-0',
                            isSelected ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className={cn(
                            "font-bold text-sm truncate",
                            isSelected && "text-primary"
                          )}>
                            {vehicle.code}
                          </span>
                          {desc && (
                            <span className="text-xs text-muted-foreground truncate">
                              {desc}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </div>
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
