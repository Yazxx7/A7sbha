import type { Locale } from './types';

export function dateKey(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date.');
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function shiftDate(date: string, days: number): string {
  if (!isDateKey(date) || !Number.isInteger(days)) throw new Error('Invalid date or day offset.');
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(year, month - 1, day, 12);
  result.setDate(result.getDate() + days);
  return dateKey(result);
}

export function formatDate(date: string, locale: Locale = 'en'): string {
  if (!isDateKey(date)) throw new Error('Invalid date.');
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-OM' : 'en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(year, month - 1, day, 12));
}
