/**
 * Parse numbers that may come in pt-BR or en-US formatting.
 *
 * Supported examples:
 * - "6,56" -> 6.56
 * - "6.566,90" -> 6566.9
 * - "5.127,80" -> 5127.8 (pt-BR: dot=thousand, comma=decimal)
 * - "5.127" -> 5127 (pt-BR thousand separator, common in horimeters)
 * - "180.072" -> 180072 (pt-BR thousand separator)
 * - "1,234.56" -> 1234.56 (en-US thousand separator)
 * - 1234.56 -> 1234.56 (number passthrough)
 * 
 * IMPORTANT: In our domain (fuel/horimeter management), values are typically
 * integers or have 1-2 decimal places. Values like "5.127" are almost always
 * meant as 5127 (pt-BR thousand separator), not 5.127 (decimal).
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
    // - multiple dots => always thousand separators (e.g., "1.234.567" -> 1234567)
    // - single dot followed by exactly 2 digits at end (e.g., "89.00") => decimal
    // - single dot followed by exactly 3 digits at end (e.g., "5.127") => thousand separator (5127)
    // - single dot in the middle of a larger number (e.g., "5.127") => thousand separator
    // - values less than 10 with dot (e.g., "5.5") => decimal
    
    if (dotCount > 1) {
      // Multiple dots = thousand separators
      str = str.replace(/\./g, "");
    } else {
      // Single dot - analyze context
      const afterDot = str.substring(lastDot + 1);
      const beforeDot = str.substring(0, lastDot);
      const beforeDotNum = parseInt(beforeDot, 10);
      
      // If exactly 3 digits after dot AND there's at least 1 digit before
      // => treat as thousand separator (pt-BR style)
      // Examples: "5.127" => 5127, "12.345" => 12345
      if (afterDot.length === 3 && /^\d{3}$/.test(afterDot) && beforeDot.length >= 1) {
        str = str.replace(".", "");
      }
      // If exactly 2 digits after dot at the end (e.g., "89.00", "123.45")
      // AND the whole number would be reasonable as a decimal (< 1000)
      // => treat as decimal
      // BUT if beforeDot is a typical thousand separator pattern, keep as thousand sep
      else if (afterDot.length === 2 && /^\d{2}$/.test(afterDot)) {
        // If beforeDot is 1-3 digits, likely a decimal (e.g., "89.00" = 89.00)
        // If beforeDot is > 3 digits, ambiguous but likely decimal too
        // We keep it as decimal (standard behavior)
        // No change needed - dot stays as decimal
      }
      // Default: if number before dot is very small (< 10) and after dot is 1-2 digits
      // keep as decimal. Otherwise treat single dot with 3+ digits after as thousand sep.
      else if (afterDot.length >= 3 && /^\d+$/.test(afterDot)) {
        // 3+ digits after dot = thousand separator
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
