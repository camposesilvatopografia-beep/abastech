import { format } from 'date-fns';

/**
 * Formats a Date to dd/MM/yyyy with zero-padded day and month.
 * Always produces "19/02/2026" (never "19/2/2026").
 * Use this instead of toLocaleDateString('pt-BR') for consistency.
 */
export function formatDateBR(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}
