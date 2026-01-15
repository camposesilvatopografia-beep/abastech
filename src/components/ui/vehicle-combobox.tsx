import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
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
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[--radix-popover-trigger-width] p-0 bg-background border shadow-lg z-50" 
        align="start"
        sideOffset={4}
      >
        <Command className="bg-background">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
            <CommandInput 
              placeholder="Pesquisar veículo..." 
              className="h-10 border-0 focus:ring-0"
            />
          </div>
          <CommandList className="max-h-[250px]">
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {vehicles.map((vehicle) => {
                const itemValue = useIdAsValue ? vehicle.id! : vehicle.code;
                const name = vehicle.name || vehicle.description || '';
                const category = vehicle.category || '';
                const label = `${vehicle.code}${name ? ` - ${name}` : ''}`;
                // Include code, name and category in search value
                const searchValue = `${vehicle.code} ${name} ${category}`.toLowerCase();
                
                return (
                  <CommandItem
                    key={itemValue}
                    value={searchValue}
                    onSelect={() => {
                      onValueChange(itemValue);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === itemValue ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="truncate">{label}</span>
                      {category && (
                        <span className="text-xs text-muted-foreground truncate">{category}</span>
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
