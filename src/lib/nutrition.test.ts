import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlan, dailyNutrients, foodNutrients, mealNutrients, sumNutrients } from './nutrition';
import type { Meal, Profile } from './types';

const profile: Profile = { name: 'Test', goal: 'cut', weight: 80, targetWeight: 75,
  height: 180, age: 30, gender: 'male', activity: 'moderate', weeklyRate: 0.5 };
const meal: Meal = { id: 'meal-1', type: 'lunch', name: 'Lunch', date: '2026-10-09', createdAt: '2026-10-09T12:00:00.000Z',
  items: [{ id: 'item-1', foodId: 'chicken-breast', grams: 150 }, { id: 'item-2', foodId: 'white-rice', grams: 200 }] };

test('portion multiplication preserves calories and macros without premature rounding', () => {
  const nutrients = foodNutrients('chicken-breast', 150);
  assert.equal(nutrients.calories, 247.5);
  assert.equal(nutrients.protein, 46.5);
  assert.equal(nutrients.carbs, 0);
  assert.ok(Math.abs(nutrients.fat - 5.4) < 1e-10);
  assert.ok(Math.abs(foodNutrients('egg', 50).calories - 77.5) < 1e-10);
});

test('meal and day totals sum actual portions and exclude other dates', () => {
  const result = mealNutrients(meal);
  assert.equal(result.calories, 507.5);
  assert.equal(result.protein, 51.9);
  assert.deepEqual(dailyNutrients([meal, { ...meal, id: 'other', date: '2026-10-08' }], '2026-10-09'), result);
  assert.deepEqual(sumNutrients([]), { calories: 0, protein: 0, carbs: 0, fat: 0 });
});

test('unknown foods and unsafe portion numbers are rejected', () => {
  assert.throws(() => foodNutrients('invented', 100), /database/);
  for (const grams of [0, -1, Infinity, NaN, 5001]) assert.throws(() => foodNutrients('egg', grams), /Portion/);
});

test('Mifflin calculation produces a deficit and coherent macro energy', () => {
  const result = calculatePlan(profile);
  assert.equal(result.bmr, 1780);
  assert.equal(result.tdee, 2759);
  assert.equal(result.calories, 2209);
  assert.equal(result.weeklyRate, 0.5);
  assert.equal(result.weeksToGoal, 10);
  assert.ok(Math.abs(result.protein * 4 + result.carbs * 4 + result.fat * 9 - result.calories) < 1);
});

test('maintain has no timeline and bulk uses a gradual surplus', () => {
  const maintain = calculatePlan({ ...profile, goal: 'maintain', weeklyRate: 0 });
  assert.equal(maintain.calories, maintain.tdee);
  assert.equal(maintain.weeklyRate, 0);
  assert.equal(maintain.weeksToGoal, null);
  const bulk = calculatePlan({ ...profile, goal: 'bulk', targetWeight: 85, weeklyRate: 1 });
  assert.equal(bulk.weeklyRate, 0.4);
  assert.ok(bulk.calories > bulk.tdee);
  assert.ok(bulk.notes.some((note) => note.includes('limited')));
});

test('adult profile and directional targets must be valid', () => {
  assert.throws(() => calculatePlan({ ...profile, age: 17 }), /Adult age/);
  assert.throws(() => calculatePlan({ ...profile, weight: NaN }), /Weight/);
  assert.throws(() => calculatePlan({ ...profile, targetWeight: 85 }), /below/);
  assert.throws(() => calculatePlan({ ...profile, goal: 'bulk', targetWeight: 75 }), /above/);
  assert.throws(() => calculatePlan({ ...profile, height: 0 }), /Height/);
  assert.throws(() => calculatePlan({ ...profile, activity: 'toString' } as unknown as Profile), /activity/);
});

test('calorie floor adjusts the timeline and warns about target BMI', () => {
  const result = calculatePlan({ ...profile, gender: 'female', height: 160, weight: 50, targetWeight: 40, activity: 'sedentary' });
  assert.equal(result.calories, 1200);
  assert.ok(result.notes.some((note) => note.includes('minimum')));
  assert.ok(result.notes.some((note) => note.includes('BMI')));
  assert.ok((result.weeksToGoal ?? 0) > 20);
});

test('reaching or crossing an existing target changes to maintenance without blocking progress', () => {
  for (const progress of [
    { ...profile, weight: 75 },
    { ...profile, weight: 74 },
    { ...profile, goal: 'bulk' as const, targetWeight: 85, weight: 85 },
    { ...profile, goal: 'bulk' as const, targetWeight: 85, weight: 86 },
  ]) {
    assert.throws(() => calculatePlan(progress), /target/);
    const result = calculatePlan(progress, { allowReachedGoal: true });
    assert.equal(result.completed, true);
    assert.equal(result.weeklyRate, 0);
    assert.equal(result.weeksToGoal, 0);
    assert.equal(result.calories, result.tdee);
    assert.ok(result.notes.some((note) => note.includes('target has been reached')));
    assert.ok(!result.notes.some((note) => note.includes('timeline cannot')));
  }
  const ongoing = calculatePlan(profile, { allowReachedGoal: true });
  assert.equal(ongoing.completed, false);
  assert.equal(ongoing.weeklyRate, 0.5);
  assert.equal(ongoing.weeksToGoal, 10);
});
