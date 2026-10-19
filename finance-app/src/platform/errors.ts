import { ValidationError } from '../data/context';

/**
 * Error text that is safe to log: no query parameters (Drizzle appends them
 * to failed-query messages) and no numbers, which could be amounts or dates.
 * Financial data must never reach logs (briefing §12).
 */
export function sanitizeErrorForLog(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : '';
  const safe = message
    .split(/\bparams:/i)[0]
    .replace(/'[^']*'|"[^"]*"/g, '…')
    .replace(/\d[\d.,:-]*/g, '#')
    .slice(0, 160);
  return safe ? `${name}: ${safe}` : name;
}

/** Logs an unexpected error without its data. */
export function logError(context: string, err: unknown): void {
  console.warn(`[${context}] ${sanitizeErrorForLog(err)}`);
}

/** Message to show the user: our own validation messages as they are, anything else generic. */
export function userFacingError(err: unknown, fallback: string): string {
  return err instanceof ValidationError ? err.message : fallback;
}
