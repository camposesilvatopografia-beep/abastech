/**
 * Generates a unique ID for Google Sheets rows.
 * Format: HOR-{timestamp_base36}-{random_chars}
 * Example: HOR-m5k2x1a-7f3
 * 
 * This ensures uniqueness across all entries and is short enough for column A.
 */
export function generateHorimeterId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 5);
  return `HOR-${timestamp}-${random}`;
}
