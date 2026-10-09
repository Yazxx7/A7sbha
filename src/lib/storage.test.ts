import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState, emptyState, loadState, sanitizeState, saveState, STORAGE_KEY } from './storage';
import type { LocalState, Meal, Profile } from './types';

function memoryStorage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); } };
}
const realMeal: Meal = { id: 'real-1', type: 'lunch', name: 'My lunch', date: '2026-10-09', createdAt: '2026-10-09T12:00:00.000Z',
  items: [{ id: 'real-item', foodId: 'egg', grams: 100 }] };

test('empty state is a fresh light-mode English state with independent defaults', () => {
  const a = emptyState();
  const b = emptyState();
  a.goals.calories = 2400;
  assert.equal(b.goals.calories, 2200);
  assert.equal(b.theme, 'light');
  assert.equal(b.locale, 'en');
  assert.equal(b.targetSource, 'manual');
  assert.deepEqual(loadState(memoryStorage()), { state: b, error: null });
});

test('meals, settings, water, and weights survive a storage round trip', () => {
  const storage = memoryStorage();
  const state: LocalState = { ...emptyState(), meals: [realMeal], locale: 'ar', theme: 'dark',
    weights: [{ id: 'weight-1', date: '2026-10-09', weight: 80 }], water: { '2026-10-09': 1500 } };
  assert.deepEqual(saveState(state, storage), { ok: true, error: null });
  assert.deepEqual(loadState(storage), { state, error: null });
  assert.ok(storage.values.has(STORAGE_KEY));
});

test('malformed saved data is preserved and load returns a recovery error', () => {
  const storage = memoryStorage();
  const malformed = '{this is not JSON';
  storage.setItem(STORAGE_KEY, malformed);
  const loaded = loadState(storage);
  assert.ok(loaded.error?.includes('Could not load'));
  assert.deepEqual(loaded.state, emptyState());
  assert.equal(storage.getItem(STORAGE_KEY), malformed);
});

test('imports reject unknown foods, invalid dates, unsafe amounts, and duplicate IDs', () => {
  const state = { ...emptyState(), meals: [realMeal] };
  assert.throws(() => sanitizeState({ ...state, version: 99 }), /version/);
  assert.throws(() => sanitizeState({ ...state, meals: [{ ...realMeal, date: '2026-02-31' }] }), /date/);
  assert.throws(() => sanitizeState({ ...state, meals: [{ ...realMeal, items: [{ id: 'bad', foodId: 'unknown', grams: 100 }] }] }), /database/);
  assert.throws(() => sanitizeState({ ...state, meals: [{ ...realMeal, items: [{ id: 'bad', foodId: 'egg', grams: '100' }] }] }), /Portion/);
  assert.throws(() => sanitizeState({ ...state, water: { '__proto__bad': 500 } }), /date/);
  assert.throws(() => sanitizeState({ ...state, meals: [realMeal, realMeal] }), /duplicate/);
  assert.throws(() => sanitizeState({ ...state, goals: { ...state.goals, protein: Infinity } }), /Protein/);
});

test('quota and denied storage errors are reported without mutating caller data', () => {
  const state = emptyState();
  const result = saveState(state, { setItem: () => { throw new Error('QuotaExceededError'); } });
  assert.equal(result.ok, false);
  assert.ok(result.error?.includes('QuotaExceededError'));
  assert.ok(!result.error?.includes('available in this tab'));
  assert.deepEqual(state, emptyState());
  const loaded = loadState({ getItem: () => { throw new Error('Storage denied'); } });
  assert.ok(loaded.error?.includes('Storage denied'));
});

test('existing profiles at or beyond their target survive a storage round trip', () => {
  const profile: Profile = { name: 'Progress', goal: 'cut', weight: 75, targetWeight: 75,
    height: 180, age: 30, gender: 'male', activity: 'moderate', weeklyRate: 0.5 };
  const storage = memoryStorage();
  for (const progress of [profile, { ...profile, weight: 74 },
    { ...profile, goal: 'bulk' as const, targetWeight: 85, weight: 86 }]) {
    const state = { ...emptyState(), profile: progress,
      weights: [{ id: 'progress-weight', date: '2026-10-09', weight: progress.weight }] };
    assert.deepEqual(saveState(state, storage), { ok: true, error: null });
    assert.deepEqual(loadState(storage), { state, error: null });
  }
});

test('manual targets retain their source and profile through storage and imports', () => {
  const profile: Profile = { name: 'Manual plan', goal: 'cut', weight: 80, targetWeight: 75,
    height: 180, age: 30, gender: 'male', activity: 'moderate', weeklyRate: 0.5 };
  const state: LocalState = { ...emptyState(), profile, targetSource: 'manual',
    goals: { calories: 2000, protein: 130, carbs: 230, fat: 62, waterMl: 2500 } };
  const storage = memoryStorage();
  assert.deepEqual(saveState(state, storage), { ok: true, error: null });
  assert.deepEqual(loadState(storage), { state, error: null });
  assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(state))), state);
  assert.throws(() => sanitizeState({ ...state, targetSource: 'unsupported' }), /target source/);
});

test('older backups infer calculated targets from a profile and manual targets without one', () => {
  const profile: Profile = { name: 'Legacy', goal: 'cut', weight: 80, targetWeight: 75,
    height: 180, age: 30, gender: 'male', activity: 'moderate', weeklyRate: 0.5 };
  const withProfile: Record<string, unknown> = { ...emptyState(), profile };
  delete withProfile.targetSource;
  assert.equal(sanitizeState(withProfile).targetSource, 'calculated');
  const withoutProfile: Record<string, unknown> = { ...emptyState() };
  delete withoutProfile.targetSource;
  assert.equal(sanitizeState(withoutProfile).targetSource, 'manual');
});

test('oversized and unsupported photos cannot silently consume storage quota', () => {
  assert.throws(() => sanitizeState({ ...emptyState(), meals: [{ ...realMeal, photo: `data:image/jpeg;base64,${'A'.repeat(400_001)}` }] }), /photo/);
  assert.throws(() => sanitizeState({ ...emptyState(), meals: [{ ...realMeal, photo: 'https://external.example/photo.jpg' }] }), /photo/);
});

test('opt-in samples populate seven days, repeat safely, and preserve genuine meals and goals', () => {
  const initial = emptyState();
  const first = createDemoState(initial, '2026-10-09');
  assert.equal(first.meals.length, 28);
  assert.ok(first.meals.every((meal) => meal.id.startsWith('demo-') && meal.name.startsWith('Sample')));
  assert.deepEqual(createDemoState(first, '2026-10-09'), first);
  assert.equal(initial.meals.length, 0);
  const real: LocalState = { ...emptyState(), meals: [realMeal], goals: { ...emptyState().goals, calories: 1800 } };
  const mixed = createDemoState(real, '2026-10-09');
  assert.deepEqual(mixed.meals.filter((meal) => meal.date === realMeal.date), [realMeal]);
  assert.equal(mixed.meals.length, 25);
  assert.deepEqual(mixed.goals, real.goals);
  assert.equal(mixed.profile, real.profile);
});
