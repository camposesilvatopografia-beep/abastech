import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { parsePtBRNumber, formatPtBRNumber } from '@/lib/ptBRNumber';

interface BrazilianNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  decimals?: 0 | 1 | 2;
  allowEmpty?: boolean;
}

/**
 * Input component that enforces Brazilian number formatting (comma as decimal separator).
 * - Displays: 4321,30
 * - Stores internally: "4321,30" as string
 * - Use parsePtBRNumber() to get the numeric value when saving
 */
export function BrazilianNumberInput({
  value,
  onChange,
  decimals = 2,
  allowEmpty = true,
  className,
  placeholder,
  ...props
}: BrazilianNumberInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Format the display value with Brazilian formatting
  const formatDisplayValue = (val: string): string => {
    if (!val || val.trim() === '') return '';
    
    // If the value already has a comma, keep it as-is for editing
    if (val.includes(',')) {
      // Clean but preserve the comma format
      return val.replace(/[^\d,\-]/g, '');
    }
    
    // If it has a dot (from paste or programmatic), convert to comma
    if (val.includes('.')) {
      const cleaned = val.replace(/[^\d.\-]/g, '');
      return cleaned.replace('.', ',');
    }
    
    // Pure digits - just return them
    return val.replace(/[^\d\-]/g, '');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    // Allow empty
    if (inputValue === '' || inputValue === '-') {
      onChange(inputValue);
      return;
    }
    
    // Replace dots with commas (force Brazilian format)
    inputValue = inputValue.replace(/\./g, ',');
    
    // Only allow digits, one comma, and minus at the start
    let cleaned = '';
    let hasComma = false;
    let hasDigitBeforeComma = false;
    
    for (let i = 0; i < inputValue.length; i++) {
      const char = inputValue[i];
      
      if (char === '-' && i === 0) {
        cleaned += char;
      } else if (char >= '0' && char <= '9') {
        cleaned += char;
        if (!hasComma) hasDigitBeforeComma = true;
      } else if (char === ',' && !hasComma) {
        // Only add comma if we have at least one digit before it
        if (hasDigitBeforeComma || cleaned === '' || cleaned === '-') {
          hasComma = true;
          cleaned += char;
        }
      }
    }
    
    // Limit decimal places
    if (hasComma) {
      const parts = cleaned.split(',');
      if (parts[1] && parts[1].length > decimals) {
        parts[1] = parts[1].substring(0, decimals);
        cleaned = parts.join(',');
      }
    }
    
    onChange(cleaned);
  };

  // Handle blur to format the number properly
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!value || value.trim() === '' || value === '-') {
      if (!allowEmpty) {
        onChange('0');
      }
      return;
    }
    
    // Parse and reformat for consistency
    const numValue = parsePtBRNumber(value);
    if (numValue === 0 && !allowEmpty) {
      onChange('0');
    } else if (numValue !== 0) {
      // Reformat with proper decimal places
      const formatted = formatPtBRNumber(numValue, { decimals });
      onChange(formatted);
    }
    
    props.onBlur?.(e);
  };

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={formatDisplayValue(value)}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder || `Ex: 4321${decimals > 0 ? ',30' : ''}`}
      className={cn(className)}
      {...props}
    />
  );
}

/**
 * Hook to manage Brazilian number input state
 * Returns [displayValue, setDisplayValue, getNumericValue]
 */
export function useBrazilianNumber(initialValue: number | string = '') {
  const [value, setValue] = React.useState<string>(() => {
    if (typeof initialValue === 'number') {
      return initialValue > 0 ? formatPtBRNumber(initialValue) : '';
    }
    return initialValue;
  });

  const getNumericValue = React.useCallback((): number => {
    return parsePtBRNumber(value);
  }, [value]);

  const setFromNumber = React.useCallback((num: number | null | undefined) => {
    if (num === null || num === undefined || num === 0) {
      setValue('');
    } else {
      setValue(formatPtBRNumber(num));
    }
  }, []);

  return [value, setValue, getNumericValue, setFromNumber] as const;
}
