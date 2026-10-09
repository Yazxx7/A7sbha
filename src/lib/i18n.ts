import type { Locale, MealType } from './types';
export const text = (locale: Locale, en: string, ar: string) => locale === 'ar' ? ar : en;
export const mealNames: Record<MealType, { en: string; ar: string; emoji: string; time: string }> = {
  breakfast: { en: 'Breakfast', ar: 'الفطور', emoji: '🍳', time: 'A good start' },
  lunch: { en: 'Lunch', ar: 'الغداء', emoji: '🥗', time: 'Midday fuel' },
  dinner: { en: 'Dinner', ar: 'العشاء', emoji: '🍲', time: 'Evening balance' },
  snack: { en: 'Snacks', ar: 'سناك', emoji: '🍎', time: 'Little pick-me-ups' },
};
export const fmt = (value: number, decimal = 0) => value.toLocaleString('en-US', { maximumFractionDigits: decimal });
