/**
 * Parse numbers that may come in pt-BR or en-US formatting.
 *
 * Supported examples:
 * - "6,56" -> 6.56
 * - "6.566,90" -> 6566.9
 * - "180.072" -> 180072 (pt-BR thousand separator)
 * - "1,234.56" -> 1234.56 (en-US thousand separator)
 * - 1234.56 -> 1234.56 (number passthrough)
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
      // pt-BR: 1.234,56
      str = str.replace(/\./g, "").replace(",", ".");
    } else {
      // en-US: 1,234.56
      str = str.replace(/,/g, "");
    }
  } else if (commaCount > 0 && dotCount === 0) {
    // Only comma: assume decimal (pt-BR)
    // "1234,56" -> "1234.56"; "1,234" (ambiguous) will become 1.234
    // This is acceptable here because our domain data uses comma as decimal.
    str = str.replace(/,/g, ".");
  } else if (dotCount > 0 && commaCount === 0) {
    // Only dot(s): decide between thousand separator (pt-BR) or decimal (en-US)
    // Heuristics:
    // - multiple dots => thousand separators
    // - single dot with exactly 3 digits after => thousand separator
    // - otherwise keep as decimal
    if (dotCount > 1) {
      str = str.replace(/\./g, "");
    } else {
      const afterDot = str.substring(lastDot + 1);
      if (afterDot.length === 3 && /^\d{3}$/.test(afterDot)) {
        str = str.replace(".", "");
      }
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
