/**
 * Parse numbers that may come in pt-BR or en-US formatting.
 *
 * Supported examples:
 * - "6,56" -> 6.56
 * - "6.566,90" -> 6566.9
 * - "5.127,80" -> 5127.8 (pt-BR: dot=thousand, comma=decimal)
 * - "5.127" -> 5127 (pt-BR thousand separator, common in horimeters)
 * - "5.086.70" -> 5086.70 (multiple dots where last is decimal - 2 digits after)
 * - "76.749.90" -> 76749.90 (KM with thousand separator and decimal)
 * - "180.072" -> 180072 (pt-BR thousand separator)
 * - "1,234.56" -> 1234.56 (en-US thousand separator)
 * - 1234.56 -> 1234.56 (number passthrough)
 * 
 * IMPORTANT: In our domain (fuel/horimeter management), values are typically
 * have 1-2 decimal places. The spreadsheet often uses dots for both thousand
 * separators AND decimals (e.g., "5.086.70" means 5086.70).
 */
export function parsePtBRNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;

  let str = String(val).trim();
  if (!str) return 0;

  // Remove spaces (including non-breaking)
  str = str.replace(/\s|\u00A0/g, "");

  const dotCount = (str.match(/\./g) || []).length;
  const commaCount = (str.match(/,/g) || []).length;
  const lastDot = str.lastIndexOf(".");
  const lastComma = str.lastIndexOf(",");

  if (dotCount > 0 && commaCount > 0) {
    // Both present: last separator is decimal
    if (lastComma > lastDot) {
      // pt-BR: 1.234,56 -> 1234.56
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // en-US: 1,234.56 -> 1234.56
      str = str.replace(/,/g, "");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    // Only comma: assume decimal (pt-BR)
    // "1234,56" -> "1234.56"; "1,234" (ambiguous) will become 1.234
    // This is acceptable here because our domain data uses comma as decimal.
    str = str.replace(/,/g, ".");
  } else if (dotCount > 0 && commaCount === 0) {
    // Only dot(s): decide between thousand separator (pt-BR) or decimal (en-US)
    // 
    // DOMAIN-SPECIFIC HEURISTICS for horimeter/fuel values:
    // The spreadsheet often uses "5.086.70" format where:
    // - dots are thousand separators EXCEPT the last one if followed by 2 digits
    // - "5.086.70" => 5086.70 (last .70 is decimal)
    // - "5.127" => 5127 (single dot with 3 digits = thousand separator)
    // - "89.00" => 89.00 (single dot with 2 digits = decimal)
    
    if (dotCount > 1) {
      // Multiple dots - check if last group has 2 digits (decimal)
      const afterLastDot = str.substring(lastDot + 1);
      
      if (afterLastDot.length === 2 && /^\d{2}$/.test(afterLastDot)) {
        // Last dot is decimal (e.g., "5.086.70" or "76.749.90")
        // Remove all dots except the last one
        const parts = str.split('.');
        const decimalPart = parts.pop(); // ".70" or ".90"
        const integerPart = parts.join(''); // "5086" or "76749"
        str = integerPart + '.' + decimalPart;
      } else if (afterLastDot.length === 3 && /^\d{3}$/.test(afterLastDot)) {
        // All dots are thousand separators (e.g., "1.234.567")
        str = str.replace(/\./g, "");
      } else {
        // Ambiguous - remove all dots (treat as thousand separators)
        str = str.replace(/\./g, "");
      }
    } else {
      // Single dot - analyze context
      const afterDot = str.substring(lastDot + 1);
      const beforeDot = str.substring(0, lastDot);
      
      // If exactly 3 digits after dot AND there's at least 1 digit before
      // => treat as thousand separator (pt-BR style)
      // Examples: "5.127" => 5127, "12.345" => 12345
      if (afterDot.length === 3 && /^\d{3}$/.test(afterDot) && beforeDot.length >= 1) {
        str = str.replace(".", "");
      }
      // If exactly 2 digits after dot (e.g., "89.00", "123.45")
      // => treat as decimal
      else if (afterDot.length === 2 && /^\d{2}$/.test(afterDot)) {
        // Keep as decimal - no change needed
      }
      // If 1 digit after dot (e.g., "5.5") => decimal
      else if (afterDot.length === 1 && /^\d$/.test(afterDot)) {
        // Keep as decimal - no change needed
      }
      // Default: if 3+ digits after dot = thousand separator
      else if (afterDot.length >= 3 && /^\d+$/.test(afterDot)) {
        str = str.replace(".", "");
      }
      // Otherwise keep as decimal
    }
  }

  // Keep only digits, dot and minus
  str = str.replace(/[^0-9.\-]/g, "");

  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

export function formatPtBRNumber(val: number | null | undefined, opts?: { decimals?: 0 | 1 | 2 }): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return "-";
  const decimals = opts?.decimals;
  const hasDecimals = decimals !== undefined ? decimals > 0 : val % 1 !== 0;
  const min = decimals ?? (hasDecimals ? 2 : 0);
  const max = decimals ?? (hasDecimals ? 2 : 0);
  return val.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
}
