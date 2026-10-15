import { isDateKey, shiftDate } from './dates';
import { getFood } from './foods';
import { validateEstimatedFood } from './meal-items';
import { DEFAULT_GOALS, calculatePlan } from './nutrition';
import type { Goals, LocalState, Meal, MealItem, Profile, WeightEntry } from './types';

export const STORAGE_KEY = 'a7sbha.local.v1';
// Keep serialized UTF-16 storage comfortably below the typical 5 MB quota.
const MAX_STATE_CHARS = 1_500_000;
const MAX_PHOTO_CHARS = 400_000;

export function emptyState(): LocalState {
  return { version: 1, meals: [], goals: { ...DEFAULT_GOALS }, profile: null, targetSource: 'manual',
    weights: [], water: {}, locale: 'en', theme: 'light', demoLoaded: false };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 100, min = 0): string {
  if (typeof value !== 'string' || value.length < min || value.length > max) throw new Error(`${label} is invalid.`);
  return value;
}

function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} is invalid or too large.`);
  return value;
}

function uniqueIds(items: { id: string }[], label: string): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`${label} contains duplicate identifiers.`);
}

function readGoals(value: unknown): Goals {
  const input = record(value, 'Goals');
  return { calories: number(input.calories, 'Calories', 500, 10000),
    protein: number(input.protein, 'Protein', 0, 600),
    carbs: number(input.carbs, 'Carbohydrates', 0, 2000),
    fat: number(input.fat, 'Fat', 0, 1000), waterMl: number(input.waterMl, 'Water', 100, 20000) };
}

function readProfile(value: unknown): Profile | null {
  if (value === null) return null;
  const input = record(value, 'Profile');
  const profile = {
    name: text(input.name, 'Name', 60), goal: input.goal,
    weight: input.weight, targetWeight: input.targetWeight,
    height: input.height, age: input.age, gender: input.gender,
    activity: input.activity, weeklyRate: input.weeklyRate,
  } as Profile;
  // The calculator performs the same numeric and directional validation as
  // the goal form. Validate numeric types before any formula can coerce them.
  for (const key of ['weight', 'targetWeight', 'height', 'age', 'weeklyRate'] as const) {
    if (typeof profile[key] !== 'number') throw new Error(`Profile ${key} must be a number.`);
  }
  calculatePlan(profile, { allowReachedGoal: true });
  return profile;
}

function readMeal(value: unknown): Meal {
  const input = record(value, 'Meal');
  const id = text(input.id, 'Meal identifier', 128, 1);
  const type = input.type as Meal['type'];
  if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(type)) throw new Error('Meal type is invalid.');
  if (!isDateKey(input.date)) throw new Error('Meal date is invalid.');
  const items: MealItem[] = array(input.items, 'Meal items', 50).map((entry) => {
    const item = record(entry, 'Meal item');
    const foodId = text(item.foodId, 'Food identifier', 128, 1);
    if (foodId === 'ai-estimate') {
      return { id: text(item.id, 'Item identifier', 128, 1), foodId,
        grams: number(item.grams, 'Portion in grams', 0.1, 5000), estimatedFood: validateEstimatedFood(item.estimatedFood) };
    }
    if (item.estimatedFood !== undefined) throw new Error('A local food cannot contain an AI estimate.');
    if (!getFood(foodId)) throw new Error('A saved food is not in the local database.');
    return { id: text(item.id, 'Item identifier', 128, 1), foodId,
      grams: number(item.grams, 'Portion in grams', Number.MIN_VALUE, 5000) };
  });
  if (!items.length) throw new Error('A meal must contain at least one food.');
  uniqueIds(items, 'Meal');
  const createdAt = text(input.createdAt, 'Meal creation time', 64, 1);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Meal creation time is invalid.');
  const meal: Meal = { id, type, name: text(input.name, 'Meal name', 100), date: input.date, items, createdAt };
  if (input.photo !== undefined) {
    const photo = text(input.photo, 'Meal photo', MAX_PHOTO_CHARS, 1);
    if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)) throw new Error('Meal photo must be a small JPEG, PNG, or WebP data URL.');
    meal.photo = photo;
  }
  return meal;
}

/** Validate and copy imports. Invalid backups are rejected, never partly applied. */
export function sanitizeState(value: unknown): LocalState {
  const input = record(value, 'Saved data');
  if (input.version !== 1) throw new Error('This backup version is not supported.');
  if (input.locale !== 'ar' && input.locale !== 'en') throw new Error('Saved language is invalid.');
  if (input.theme !== 'light' && input.theme !== 'dark') throw new Error('Saved theme is invalid.');
  if (typeof input.demoLoaded !== 'boolean') throw new Error('Sample data status is invalid.');
  const meals = array(input.meals, 'Meals', 5000).map(readMeal);
  uniqueIds(meals, 'Saved meals');
  const weights: WeightEntry[] = array(input.weights, 'Weight entries', 3000).map((value) => {
    const entry = record(value, 'Weight entry');
    if (!isDateKey(entry.date)) throw new Error('Weight date is invalid.');
    return { id: text(entry.id, 'Weight identifier', 128, 1), date: entry.date, weight: number(entry.weight, 'Weight', 30, 350) };
  });
  uniqueIds(weights, 'Weight entries');
  const inputWater = record(input.water, 'Water entries');
  if (Object.keys(inputWater).length > 3000) throw new Error('Too many water entries.');
  const water: Record<string, number> = {};
  for (const [date, amount] of Object.entries(inputWater)) {
    if (!isDateKey(date)) throw new Error('Water date is invalid.');
    water[date] = number(amount, 'Daily water amount', 0, 20000);
  }
  const profile = readProfile(input.profile);
  // Older version-1 backups predate the explicit source flag. A profile
  // previously implied calculated goals; new manual goals retain the profile.
  const targetSource = input.targetSource === undefined ? (profile ? 'calculated' : 'manual') : input.targetSource;
  if (targetSource !== 'manual' && targetSource !== 'calculated') throw new Error('Saved target source is invalid.');
  const state: LocalState = { version: 1, meals, goals: readGoals(input.goals), profile, targetSource,
    weights, water, locale: input.locale, theme: input.theme, demoLoaded: input.demoLoaded };
  if (JSON.stringify(state).length > MAX_STATE_CHARS) throw new Error('Saved data is too large. Remove some photos and try again.');
  return state;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Browser storage is unavailable.';
}

export function loadState(storage?: Pick<Storage, 'getItem'>): { state: LocalState; error: string | null } {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return { state: emptyState(), error: null };
    const saved = target.getItem(STORAGE_KEY);
    if (saved === null) return { state: emptyState(), error: null };
    if (saved.length > MAX_STATE_CHARS) throw new Error('Saved data is too large to load.');
    return { state: sanitizeState(JSON.parse(saved)), error: null };
  } catch (error) {
    // Do not remove or overwrite the original value: the UI can offer an
    // explicit recovery action, and users can still export/recover that data.
    return { state: emptyState(), error: `Could not load saved data. ${errorMessage(error)}` };
  }
}

export function saveState(state: LocalState, storage?: Pick<Storage, 'setItem'>): { ok: boolean; error: string | null } {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) throw new Error('Browser storage is unavailable.');
    const safeState = sanitizeState(state);
    target.setItem(STORAGE_KEY, JSON.stringify(safeState));
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: `Could not save data. ${errorMessage(error)}` };
  }
}

/** Explicit, opt-in sample data. Never append sample meals to a real day. */
export function createDemoState(base: LocalState, date: string): LocalState {
  if (!isDateKey(date)) throw new Error('Sample date is invalid.');
  const state = sanitizeState(base);
  const occupied = new Set(state.meals.map((meal) => meal.date));
  for (let offset = -6; offset <= 0; offset += 1) {
    const day = shiftDate(date, offset);
    if (occupied.has(day)) continue;
    const portionFactor = 1 + (offset % 3) * 0.08;
    const recipes: { type: Meal['type']; name: string; items: [string, number][] }[] = [
      { type: 'breakfast', name: 'Sample • Oats & yogurt', items: [['oats', 60], ['greek-yogurt', 170], ['banana', 120]] },
      { type: 'lunch', name: 'Sample • Chicken & rice', items: [['chicken-breast', 150], ['white-rice', 220], ['broccoli', 100], ['olive-oil', 10]] },
      { type: 'dinner', name: 'Sample • Salmon & potatoes', items: [['salmon', 130], ['potato', 220], ['tomato', 120], ['olive-oil', 5]] },
      { type: 'snack', name: 'Sample • Fruit & almonds', items: [['apple', 180], ['almonds', 28], ['dates', 24]] },
    ];
    for (const recipe of recipes) {
      const id = `demo-${day}-${recipe.type}`;
      state.meals.push({ id, type: recipe.type, name: recipe.name, date: day,
        createdAt: `${day}T12:00:00.000Z`, items: recipe.items.map(([foodId, grams], index) => ({
          id: `${id}-${index}`, foodId, grams: Math.round(grams * portionFactor),
        })) });
    }
  }
  state.demoLoaded = true;
  return state;
}
