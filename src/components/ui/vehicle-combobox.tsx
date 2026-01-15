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

  const selectedVehicle = React.useMemo(() => {
    if (!value) return null;
    return vehicles.find(v => 
      useIdAsValue ? v.id === value : v.code === value
    );
  }, [vehicles, value, useIdAsValue]);

  const displayText = React.useMemo(() => {
    if (!selectedVehicle) return placeholder;
    const name = selectedVehicle.name || selectedVehicle.description || selectedVehicle.category || '';
    return `${selectedVehicle.code}${name ? ` - ${name}` : ''}`;
  }, [selectedVehicle, placeholder]);

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
            value && 'border-primary/30 bg-primary/5',
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
        <Command className="bg-popover">
          <div className="flex items-center border-b-2 border-border px-3 bg-muted/50">
            <Search className="h-5 w-5 shrink-0 text-primary mr-2" />
            <CommandInput 
              placeholder="Digite para pesquisar..." 
              className="h-12 text-base border-0 focus:ring-0 bg-transparent placeholder:text-muted-foreground"
            />
          </div>
          <CommandList className="max-h-[350px] overflow-auto">
            <CommandEmpty className="py-6 text-center">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Truck className="h-8 w-8 opacity-50" />
                <span className="text-sm">{emptyMessage}</span>
              </div>
            </CommandEmpty>
            <CommandGroup className="p-2">
              {vehicles.map((vehicle) => {
                const itemValue = useIdAsValue ? vehicle.id! : vehicle.code;
                const name = vehicle.name || vehicle.description || '';
                const category = vehicle.category || '';
                const label = `${vehicle.code}${name ? ` - ${name}` : ''}`;
                // Include code, name and category in search value
                const searchValue = `${vehicle.code} ${name} ${category}`.toLowerCase();
                const isSelected = value === itemValue;
                
                return (
                  <CommandItem
                    key={itemValue}
                    value={searchValue}
                    onSelect={() => {
                      onValueChange(itemValue);
                      setOpen(false);
                    }}
                    className={cn(
                      "cursor-pointer py-3 px-3 rounded-lg mb-1 transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-primary/10 border border-primary/30"
                    )}
                  >
                    <Check
                      className={cn(
                        'mr-3 h-5 w-5 text-primary',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className={cn(
                        "font-medium text-base truncate",
                        isSelected && "text-primary"
                      )}>
                        {vehicle.code}
                        {name && <span className="font-normal text-foreground"> - {name}</span>}
                      </span>
                      {category && (
                        <span className={cn(
                          "text-sm truncate mt-0.5",
                          isSelected ? "text-primary/70" : "text-muted-foreground"
                        )}>
                          {category}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
