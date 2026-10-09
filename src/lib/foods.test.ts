import test from 'node:test';
import assert from 'node:assert/strict';
import { foods, getFood, searchFoods } from './foods';

test('sample catalog has unique identifiers and valid per-100g nutrition', () => {
  assert.ok(foods.length >= 50);
  assert.equal(new Set(foods.map((food) => food.id)).size, foods.length);
  for (const food of foods) {
    assert.ok(food.name && food.nameAr && food.servingGrams > 0);
    assert.ok(Object.values(food.per100g).every((value) => Number.isFinite(value) && value >= 0));
  }
});

test('search supports English case, multiple words, and empty catalog browsing', () => {
  assert.equal(searchFoods('CHICKEN BREAST')[0]?.id, 'chicken-breast');
  assert.equal(searchFoods('cooked rice').length, 2);
  assert.equal(searchFoods('')[0]?.id, foods[0].id);
  assert.equal(searchFoods('a food that does not exist').length, 0);
});

test('Arabic search ignores diacritics and alef forms and supports familiar aliases', () => {
  assert.ok(searchFoods('أَرُز أَبْيَض').some((food) => food.id === 'white-rice'));
  assert.ok(searchFoods('رز').some((food) => food.id === 'white-rice'));
  assert.ok(searchFoods('فراوله').some((food) => food.id === 'strawberry'));
  assert.ok(searchFoods('صدر دجاج').some((food) => food.id === 'chicken-breast'));
  assert.ok(searchFoods('مجبوس').some((food) => food.id === 'chicken-kabsa'));
});

test('category filters and mixed Arabic/English tokens narrow results', () => {
  const filtered = searchFoods('', 'fruit');
  assert.ok(filtered.length > 0 && filtered.every((food) => food.category === 'fruit'));
  assert.equal(searchFoods('chicken دجاج', 'protein')[0]?.id, 'chicken-breast');
  assert.equal(searchFoods('chicken', 'fruit').length, 0);
  assert.equal(getFood('does-not-exist'), undefined);
});
