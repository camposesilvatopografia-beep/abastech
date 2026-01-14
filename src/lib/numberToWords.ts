// Converts a number to Brazilian Portuguese words
const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function convertHundreds(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const u = n % 10;
  
  let result = '';
  
  if (h > 0) {
    result += hundreds[h];
  }
  
  if (n % 100 >= 10 && n % 100 <= 19) {
    if (result) result += ' e ';
    result += teens[n % 100 - 10];
  } else {
    if (t > 0) {
      if (result) result += ' e ';
      result += tens[t];
    }
    if (u > 0) {
      if (result) result += ' e ';
      result += units[u];
    }
  }
  
  return result;
}

export function numberToWords(value: number): string {
  if (value === 0) return 'zero';
  if (value < 0) return 'menos ' + numberToWords(Math.abs(value));
  
  // Handle decimals
  const intPart = Math.floor(value);
  const decPart = Math.round((value - intPart) * 100);
  
  let result = '';
  
  // Thousands
  if (intPart >= 1000000) {
    const millions = Math.floor(intPart / 1000000);
    if (millions === 1) {
      result += 'um milhão';
    } else {
      result += convertHundreds(millions) + ' milhões';
    }
    const remainder = intPart % 1000000;
    if (remainder > 0) {
      if (remainder < 100 || (remainder % 1000 === 0 && remainder < 1000)) {
        result += ' e ';
      } else {
        result += ' ';
      }
    }
  }
  
  const thousands = Math.floor((intPart % 1000000) / 1000);
  if (thousands > 0) {
    if (thousands === 1) {
      result += 'mil';
    } else {
      result += convertHundreds(thousands) + ' mil';
    }
    const remainder = intPart % 1000;
    if (remainder > 0) {
      if (remainder < 100) {
        result += ' e ';
      } else {
        result += ' ';
      }
    }
  }
  
  const lastHundreds = intPart % 1000;
  if (lastHundreds > 0) {
    result += convertHundreds(lastHundreds);
  }
  
  // Add decimal part
  if (decPart > 0) {
    result += ' vírgula ' + convertHundreds(decPart);
  }
  
  return result.trim();
}

// Format currency input (remove dots/commas and format as money)
export function formatCurrencyInput(value: string): string {
  // Remove all non-numeric characters
  const numericOnly = value.replace(/\D/g, '');
  
  if (!numericOnly) return '';
  
  // Convert to number (cents)
  const cents = parseInt(numericOnly, 10);
  
  // Format as currency
  const reais = cents / 100;
  
  return reais.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Parse formatted currency to number
export function parseCurrencyInput(value: string): number {
  if (!value) return 0;
  // Remove thousand separators and replace decimal separator
  const normalized = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(normalized) || 0;
}

// Format quantity input and return number in words
export function formatQuantityInput(value: string): { formatted: string; inWords: string; raw: number } {
  // Remove all non-numeric characters
  const numericOnly = value.replace(/\D/g, '');
  
  if (!numericOnly) return { formatted: '', inWords: '', raw: 0 };
  
  const num = parseInt(numericOnly, 10);
  
  // Format with thousand separators
  const formatted = num.toLocaleString('pt-BR');
  
  // Convert to words
  const inWords = numberToWords(num) + ' litros';
  
  return { formatted, inWords, raw: num };
}
