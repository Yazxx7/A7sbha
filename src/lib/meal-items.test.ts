import test from 'node:test';
import assert from 'node:assert/strict';
import { getFood } from './foods';
import { getMealItemFood, validateEstimatedFood } from './meal-items';
import { dailyNutrients, itemNutrients, mealNutrients } from './nutrition';
import { emptyState, loadState, sanitizeState, saveState, STORAGE_KEY } from './storage';
import type { EstimatedFood, LocalState, Meal, MealItem } from './types';

const estimate: EstimatedFood = { source: 'gemini', name: 'Grilled chicken with sauce', nameAr: 'دجاج مشوي مع صلصة',
  per100g: { calories: 180.5, protein: 25.1, carbs: 5.3, fat: 6.2 } };
const aiItem: MealItem = { id: 'ai-item', foodId: 'ai-estimate', grams: 125, estimatedFood: estimate };
const mixedMeal: Meal = { id: 'mixed-meal', type: 'lunch', name: 'Reviewed lunch', date: '2026-10-15',
  createdAt: '2026-10-15T12:00:00.000Z', items: [aiItem, { id: 'rice', foodId: 'white-rice', grams: 150 }] };
const stateWith = (item: unknown) => ({ ...emptyState(), meals: [{ ...mixedMeal, items: [item] }] });

test('AI estimates resolve bilingual labels and nutrients while local foods retain their reference data', () => {
  assert.deepEqual(getMealItemFood(aiItem), { name: estimate.name, nameAr: estimate.nameAr, per100g: estimate.per100g, emoji: '✨' });
  assert.deepEqual(getMealItemFood({ id: 'egg', foodId: 'egg', grams: 100 }), getFood('egg'));
  assert.equal(getMealItemFood({ ...aiItem, foodId: 'egg' }), undefined);
  assert.equal(getMealItemFood({ ...aiItem, estimatedFood: undefined }), undefined);
  assert.equal(getMealItemFood({ id: 'unknown', foodId: 'unknown', grams: 100 }), undefined);
});

test('reviewed AI portions scale precisely and combine with local foods in meal and daily totals', () => {
  assert.deepEqual(itemNutrients(aiItem), { calories: 225.625, protein: 31.375, carbs: 6.625, fat: 7.75 });
  const totals = mealNutrients(mixedMeal);
  assert.deepEqual(totals, { calories: 420.625, protein: 35.425, carbs: 48.925, fat: 8.2 });
  assert.deepEqual(dailyNutrients([mixedMeal, { ...mixedMeal, id: 'yesterday', date: '2026-10-14' }], mixedMeal.date), totals);
  assert.equal(itemNutrients({ ...aiItem, grams: 50 }).calories, 90.25);
  assert.equal(itemNutrients({ ...aiItem, grams: 0.1 }).calories, 0.1805);
  assert.equal(itemNutrients({ ...aiItem, grams: 5000 }).calories, 9025);
  for (const grams of [0, -1, 0.099, 5000.1, NaN, Infinity]) {
    assert.throws(() => itemNutrients({ ...aiItem, grams }), /Portion/);
    assert.throws(() => sanitizeState(stateWith({ ...aiItem, grams })), /Portion/);
  }
  assert.throws(() => itemNutrients({ ...aiItem, foodId: 'egg' }), /invalid/);
});

test('edited AI labels, portions, provenance and per-100g values survive save, reload, and backup import', () => {
  const edited: MealItem = { ...aiItem, grams: 165.5, estimatedFood: { ...estimate,
    name: 'My corrected dish', nameAr: 'وجبتي المعدلة', per100g: { calories: 192.5, protein: 24, carbs: 6, fat: 8 } } };
  const state: LocalState = { ...emptyState(), meals: [{ ...mixedMeal, items: [edited, mixedMeal.items[1]] }] };
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
  assert.deepEqual(saveState(state, storage), { ok: true, error: null });
  assert.deepEqual(loadState(storage), { state, error: null });
  const imported = sanitizeState(JSON.parse(entries.get(STORAGE_KEY)!));
  assert.deepEqual(imported, state);
  assert.deepEqual(itemNutrients(imported.meals[0].items[0]), itemNutrients(edited));
  assert.notEqual(imported.meals[0].items[0].estimatedFood?.per100g, edited.estimatedFood?.per100g);
});

test('Gemini and legacy OpenAI estimates preserve their own source in mixed local meals and exported backups', context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new Error('A saved meal must not call an AI provider.'); });
  const legacyFood: EstimatedFood = { ...estimate, source: 'openai', name: 'Previously reviewed chicken', nameAr: 'دجاج مراجع سابقاً' };
  const legacyItem: MealItem = { ...aiItem, id: 'legacy-item', estimatedFood: legacyFood };
  const legacyBackup: LocalState = { ...emptyState(), meals: [{ ...mixedMeal, items: [legacyItem, mixedMeal.items[1]] }] };
  const imported = sanitizeState(JSON.parse(JSON.stringify(legacyBackup)));
  assert.equal(imported.version, 1);
  assert.equal(imported.meals[0].items[0].estimatedFood?.source, 'openai');
  assert.equal(getMealItemFood(imported.meals[0].items[0])?.name, legacyFood.name);

  // Editing a legacy estimate must retain its original source. New results use Gemini.
  const editedLegacy: MealItem = { ...imported.meals[0].items[0], grams: 90,
    estimatedFood: { ...legacyFood, per100g: { ...legacyFood.per100g, calories: 190 } } };
  const mixedState: LocalState = { ...imported, meals: [{ ...mixedMeal, items: [editedLegacy, aiItem, mixedMeal.items[1]] }] };
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
  assert.deepEqual(saveState(mixedState, storage), { ok: true, error: null });
  const reloaded = loadState(storage);
  assert.equal(reloaded.error, null);
  assert.deepEqual(reloaded.state, mixedState);
  const exported = JSON.stringify(reloaded.state, null, 2);
  const restored = sanitizeState(JSON.parse(exported));
  assert.deepEqual(restored, mixedState);
  assert.deepEqual(restored.meals[0].items.map(item => item.estimatedFood?.source), ['openai', 'gemini', undefined]);
  assert.deepEqual(mealNutrients(restored.meals[0]), mealNutrients(mixedState.meals[0]));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('old version-one local-only meals still load without adding estimate metadata', () => {
  const oldState = { ...emptyState(), meals: [{ ...mixedMeal, items: [{ id: 'old-egg', foodId: 'egg', grams: 50 }] }] };
  const imported = sanitizeState(JSON.parse(JSON.stringify(oldState)));
  assert.deepEqual(imported, oldState);
  assert.equal(Object.hasOwn(imported.meals[0].items[0], 'estimatedFood'), false);
  assert.deepEqual(mealNutrients(imported.meals[0]), itemNutrients(imported.meals[0].items[0]));
});

test('estimate import rejects missing provenance, malformed names, non-finite and out-of-range nutrients', () => {
  const malformed: unknown[] = [undefined, null, [], {}, ...['local', 'google', 'GEMINI', null, undefined, 1, {}].map(source => ({ ...estimate, source })),
    { ...estimate, name: '' }, { ...estimate, nameAr: '  ' }, { ...estimate, name: 'x'.repeat(101) },
    { ...estimate, nameAr: 123 }, { ...estimate, per100g: [] }, { ...estimate, per100g: null }];
  for (const field of ['calories', 'protein', 'carbs', 'fat'] as const) {
    for (const value of [-1, Infinity, NaN, '1', field === 'calories' ? 1000.1 : 100.1]) {
      malformed.push({ ...estimate, per100g: { ...estimate.per100g, [field]: value } });
    }
    const missing: Record<string, unknown> = { ...estimate.per100g };
    delete missing[field];
    malformed.push({ ...estimate, per100g: missing });
  }
  for (const estimatedFood of malformed) {
    assert.throws(() => validateEstimatedFood(estimatedFood), /Estimated food/);
    assert.throws(() => sanitizeState(stateWith({ ...aiItem, estimatedFood })), /Estimated food/);
    assert.equal(getMealItemFood({ ...aiItem, estimatedFood } as MealItem), undefined);
  }
  assert.throws(() => sanitizeState(stateWith({ ...aiItem, foodId: 'egg' })), /local food/);
  assert.throws(() => sanitizeState(stateWith({ ...aiItem, foodId: 'unknown' })), /local food/);
  assert.deepEqual(validateEstimatedFood({ ...estimate, per100g: { calories: 1000, protein: 100, carbs: 0, fat: 0 } }).per100g,
    { calories: 1000, protein: 100, carbs: 0, fat: 0 });
  for (const source of ['gemini', 'openai'] as const) {
    assert.deepEqual(validateEstimatedFood({ ...estimate, source }), { ...estimate, source });
  }
});
