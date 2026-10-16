import { getFood } from './foods';
import type { EstimatedFood, Food, MealItem, Nutrients } from './types';

/** Validate imported estimates as well as reviewed AI results before saving. */
export function validateEstimatedFood(value: unknown): EstimatedFood {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Estimated food is invalid.');
  const input = value as Record<string, unknown>;
  if (input.source !== 'gemini' && input.source !== 'openai') throw new Error('Estimated food source is invalid.');
  for (const field of ['name', 'nameAr'] as const) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 100) {
      throw new Error('Estimated food names must contain 1–100 characters.');
    }
  }
  if (!input.per100g || typeof input.per100g !== 'object' || Array.isArray(input.per100g)) {
    throw new Error('Estimated food nutrients are invalid.');
  }
  const values = input.per100g as Record<string, unknown>;
  const per100g = {} as Nutrients;
  for (const field of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const amount = values[field];
    const maximum = field === 'calories' ? 1000 : 100;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > maximum) {
      throw new Error(`Estimated food ${field} must be between 0 and ${maximum} per 100 g.`);
    }
    per100g[field] = amount;
  }
  return { source: input.source, name: input.name as string, nameAr: input.nameAr as string, per100g };
}

/** Resolve stored items without allowing estimates to replace local reference foods. */
export function getMealItemFood(item: MealItem): Pick<Food, 'name' | 'nameAr' | 'per100g' | 'emoji'> | undefined {
  if (item.foodId !== 'ai-estimate') {
    return item.estimatedFood === undefined ? getFood(item.foodId) : undefined;
  }
  try {
    const estimatedFood = validateEstimatedFood(item.estimatedFood);
    return { name: estimatedFood.name, nameAr: estimatedFood.nameAr, per100g: estimatedFood.per100g, emoji: '✨' };
  } catch {
    return undefined;
  }
}
