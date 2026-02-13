import * as React from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null;
  onChange: (value: number | null) => void;
  decimals?: number;
  allowNegative?: boolean;
  minValue?: number;
  maxValue?: number;
  suffix?: string;
  prefix?: string;
}

/**
 * Currency-style input that automatically formats numbers in pt-BR format.
 * User types only digits, system handles formatting automatically.
 * 
 * Behavior (similar to ATM/banking inputs):
 * - Typing "8900" shows "89,00"
 * - Typing "10290" shows "102,90"
 * - Typing "2930000" shows "29.300,00"
 * 
 * Always uses:
 * - Comma (,) as decimal separator
 * - Dot (.) as thousand separator
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ 
    className, 
    value, 
    onChange, 
    decimals = 2,
    allowNegative = false,
    minValue,
    maxValue,
    suffix = "",
    prefix = "",
    ...props 
  }, ref) => {
    
    // Format number to pt-BR display string
    const formatDisplay = React.useCallback((num: number | null): string => {
      if (num === null || num === undefined || isNaN(num)) return "";
      
      // Round to the specified decimals to avoid floating point artifacts (e.g. 89540.200 -> 89540.20)
      const factor = Math.pow(10, decimals);
      const rounded = Math.round(num * factor) / factor;
      
      const formatted = rounded.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      
      return `${prefix}${formatted}${suffix}`;
    }, [decimals, prefix, suffix]);

    // Convert raw integer to actual number value
    const rawToValue = React.useCallback((raw: number): number => {
      return raw / Math.pow(10, decimals);
    }, [decimals]);

    // Convert value to raw integer
    const valueToRaw = React.useCallback((val: number | null): number => {
      if (val === null || val === undefined || isNaN(val)) return 0;
      return Math.round(val * Math.pow(10, decimals));
    }, [decimals]);

    const [displayValue, setDisplayValue] = React.useState(() => formatDisplay(value));
    const [isFocused, setIsFocused] = React.useState(false);

    // Sync external value changes
    React.useEffect(() => {
      if (!isFocused) {
        setDisplayValue(formatDisplay(value));
      }
    }, [value, isFocused, formatDisplay]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow navigation keys
      const allowedKeys = [
        "Backspace", "Delete", "ArrowLeft", "ArrowRight", 
        "Tab", "Enter", "Home", "End"
      ];
      
      if (allowedKeys.includes(e.key)) {
        if (e.key === "Backspace") {
          e.preventDefault();
          const currentRaw = valueToRaw(value);
          const newRaw = Math.floor(currentRaw / 10);
          const newValue = rawToValue(newRaw);
          onChange(newValue === 0 ? null : newValue);
          setDisplayValue(formatDisplay(newValue === 0 ? null : newValue));
        }
        return;
      }

      // Allow minus sign if negative values are allowed
      if (e.key === "-" && allowNegative) {
        e.preventDefault();
        if (value !== null) {
          const newValue = -value;
          onChange(newValue);
          setDisplayValue(formatDisplay(newValue));
        }
        return;
      }

      // Only allow digits
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
        return;
      }

      e.preventDefault();
      
      // Add new digit
      const digit = parseInt(e.key, 10);
      const currentRaw = Math.abs(valueToRaw(value));
      const isNegative = value !== null && value < 0;
      
      // Limit to reasonable size (prevent overflow)
      if (currentRaw > 99999999999) return;
      
      let newRaw = currentRaw * 10 + digit;
      if (isNegative) newRaw = -newRaw;
      
      let newValue = rawToValue(newRaw);
      
      // Apply min/max constraints
      if (maxValue !== undefined && newValue > maxValue) return;
      if (minValue !== undefined && newValue < minValue) return;
      
      onChange(newValue);
      setDisplayValue(formatDisplay(newValue));
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Select all on focus for easy replacement
      setTimeout(() => e.target.select(), 0);
    };

    const handleBlur = () => {
      setIsFocused(false);
      setDisplayValue(formatDisplay(value));
    };

    // Handle paste - extract numbers only
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedText = e.clipboardData.getData("text");
      
      // Extract all digits from pasted text
      const digits = pastedText.replace(/[^\d]/g, "");
      if (!digits) return;
      
      const raw = parseInt(digits, 10);
      if (isNaN(raw)) return;
      
      let newValue = rawToValue(raw);
      
      // Apply constraints
      if (maxValue !== undefined && newValue > maxValue) newValue = maxValue;
      if (minValue !== undefined && newValue < minValue) newValue = minValue;
      
      onChange(newValue);
      setDisplayValue(formatDisplay(newValue));
    };

    return (
      <input
        type="text"
        inputMode="numeric"
        ref={ref}
        value={displayValue}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        onChange={() => {}} // Controlled by keyDown
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-right font-mono",
          className
        )}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };

/**
 * Hook to manage currency input state
 * Returns [value, setValue, getNumericValue, setFromNumber]
 */
export function useCurrencyInput(initialValue: number | null = null) {
  const [value, setValue] = React.useState<number | null>(initialValue);
  
  const getNumericValue = React.useCallback((): number => {
    return value ?? 0;
  }, [value]);
  
  const setFromNumber = React.useCallback((num: number | null | undefined) => {
    if (num === null || num === undefined || isNaN(num)) {
      setValue(null);
    } else {
      setValue(num);
    }
  }, []);
  
  return [value, setValue, getNumericValue, setFromNumber] as const;
}
