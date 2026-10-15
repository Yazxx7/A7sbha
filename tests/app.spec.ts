import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { LocalState } from '../src/lib/types';

const storageKey = 'a7sbha.local.v1';
const smallPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGMoWZH4H4QZYAwAVs4J8RVA3GQAAAAASUVORK5CYII=', 'base64');

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Switch to Arabic', exact: true })).toBeVisible();
}

async function navigate(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name, exact: true }).click();
}

async function storedState(page: Page): Promise<LocalState> {
  const saved = await page.evaluate((key) => localStorage.getItem(key), storageKey);
  expect(saved).not.toBeNull();
  return JSON.parse(saved!) as LocalState;
}

async function addMeal(page: Page, type: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks', name: string, food: string, query: string, grams: number) {
  await page.getByRole('button', { name: `Add ${type}`, exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add a meal', exact: true });
  await expect(editor.getByRole('combobox', { name: 'Meal type', exact: true })).toHaveValue(type === 'Snacks' ? 'snack' : type.toLowerCase());
  await editor.getByLabel('Meal name (optional)', { exact: true }).fill(name);
  await editor.getByLabel('Search foods in Arabic or English', { exact: true }).fill(query);
  await editor.getByRole('button', { name: `Add ${food}`, exact: true }).click();
  await editor.getByLabel(`${food} portion in grams`).fill(String(grams));
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function expectDailyTotals(page: Page, calories: number, protein: number, carbs: number, fat: number) {
  await expect(page.getByText('Eaten today', { exact: true }).locator('..').locator('strong')).toHaveText(`${Math.round(calories).toLocaleString('en-US')} kcal`);
  for (const [name, value] of [['Protein', protein], ['Carbs', carbs], ['Fats', fat]] as const) {
    await expect.poll(async () => Number(await page.getByRole('progressbar', { name, exact: true }).getAttribute('aria-valuenow'))).toBeCloseTo(value, 4);
  }
}

async function applyCalculatedGoal(page: Page) {
  await page.getByRole('button', { name: 'Edit daily targets', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make your goals your own', exact: true });
  await dialog.getByRole('button', { name: 'Calculate my plan', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Your name (optional)', exact: true }).fill('Journey');
  await dialog.getByRole('radio', { name: 'Lose weight', exact: true }).check();
  await dialog.getByRole('spinbutton', { name: 'Current weight (kg)', exact: true }).fill('75');
  await dialog.getByRole('spinbutton', { name: 'Target weight (kg)', exact: true }).fill('70');
  await dialog.getByRole('spinbutton', { name: 'Height (cm)', exact: true }).fill('175');
  await dialog.getByRole('spinbutton', { name: 'Age (years)', exact: true }).fill('28');
  await dialog.getByRole('combobox', { name: 'Sex used for this calculation', exact: true }).selectOption('male');
  await dialog.getByRole('combobox', { name: 'Activity level', exact: true }).selectOption('moderate');
  await dialog.getByRole('spinbutton', { name: 'Target change each week (kg)', exact: true }).fill('0.4');
  await expect(dialog.getByText('2,209 kcal', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Apply calculated plan', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function logCurrentWeight(page: Page, weight: number) {
  await navigate(page, 'My progress');
  await page.getByRole('button', { name: 'Log weight', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'A new check-in', exact: true });
  await dialog.getByRole('spinbutton', { name: 'Weight (kg)', exact: true }).fill(String(weight));
  await dialog.getByRole('button', { name: 'Save measurement', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('starts empty without keys, remote food services, or fabricated nutrition', async ({ page }) => {
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:3100/')) remoteRequests.push(request.url());
  });
  await openApp(page);
  await expectDailyTotals(page, 0, 0, 0, 0);
  await expect(page.getByText('Your progress starts with your first meal. Days without entries show 0 logged.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample • Oats & yogurt', exact: true })).toHaveCount(0);
  await navigate(page, 'My settings');
  await expect(page.getByText('Your journal stays in this browser. Only photos you choose to analyze and their descriptions are sent to OpenAI.', { exact: true })).toBeVisible();
  await expect(page.getByText(/NUTRITION_AI_KEY/)).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(remoteRequests).toEqual([]);
});

test('saves all four meal types, scales portions, and persists editing and deletion', async ({ page }) => {
  await openApp(page);
  await addMeal(page, 'Breakfast', 'My banana breakfast', 'Banana', 'موز', 200);
  await addMeal(page, 'Lunch', 'My rice lunch', 'White rice, cooked', 'white rice', 250);
  await addMeal(page, 'Dinner', 'My chicken dinner', 'Chicken breast, cooked', 'صدر دجاج', 150);
  await addMeal(page, 'Snacks', 'My almond snack', 'Almonds', 'almonds', 20);
  await expectDailyTotals(page, 866.3, 59.69, 120.42, 16.73);
  const saved = await storedState(page);
  expect(saved.meals.map((meal) => meal.type)).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  expect(saved.meals.map((meal) => meal.items[0].grams)).toEqual([200, 250, 150, 20]);

  await page.getByRole('button', { name: 'Edit meal: My banana breakfast', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit your meal', exact: true });
  const portion = editor.getByLabel('Banana portion in grams');
  await portion.fill('0');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveText('Enter a portion between 0.1 and 5,000 grams for every food.');
  await portion.fill('100');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expectDailyTotals(page, 777.3, 58.59, 97.62, 16.43);
  await page.getByRole('button', { name: 'Delete meal: My rice lunch', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Remove this meal?', exact: true });
  await confirmation.getByRole('button', { name: 'Remove meal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My rice lunch', exact: true })).toHaveCount(0);
  await expectDailyTotals(page, 452.3, 51.84, 27.12, 15.68);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My banana breakfast', exact: true })).toBeVisible();
  await expectDailyTotals(page, 452.3, 51.84, 27.12, 15.68);
  expect((await storedState(page)).meals).toHaveLength(3);
});

test('food library searches Arabic, English, normalized Arabic and categories', async ({ page }) => {
  await openApp(page);
  await navigate(page, 'Food library');
  const search = page.getByRole('searchbox', { name: 'Search food library', exact: true });
  await search.fill('chicken breast');
  await expect(page.getByRole('heading', { name: 'Chicken breast, cooked', exact: true })).toBeVisible();
  await search.fill('دَجَاج');
  await expect(page.getByRole('heading', { name: 'Chicken breast, cooked', exact: true })).toBeVisible();
  await search.fill('أرز');
  await expect(page.getByRole('heading', { name: 'White rice, cooked', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Brown rice, cooked', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fruit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching foods', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Banana', exact: true })).toBeVisible();
  await search.fill('unfindablefood123');
  await expect(page.getByRole('heading', { name: 'No matching foods', exact: true })).toBeVisible();
});

test('mobile supports Arabic food entry, RTL, dark mode and persisted preferences without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'إضافة الفطور', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'أضف وجبة', exact: true });
  await editor.getByLabel('اسم الوجبة (اختياري)', { exact: true }).fill('فطوري المحلي');
  await editor.getByLabel('ابحث عن طعام بالعربية أو الإنجليزية', { exact: true }).fill('banana');
  await editor.getByRole('button', { name: 'إضافة موز', exact: true }).click();
  await editor.getByLabel('كمية موز بالغرام').fill('100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await editor.getByRole('button', { name: 'حفظ الوجبة', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'فطوري المحلي', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveClass(/dark/);
  expect((await storedState(page)).locale).toBe('ar');
  expect((await storedState(page)).theme).toBe('dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'تفعيل الوضع الفاتح', exact: true }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('button', { name: 'Foods', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search food library', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sample week is explicit, marked, charted and selectable', async ({ page }) => {
  await openApp(page);
  const originalDate = await page.getByLabel('Journal date', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Try sample data', exact: true }).click();
  await expect(page.getByText('This journal includes clearly marked sample meals. You can edit or remove them.', { exact: true })).toBeVisible();
  await expect(page.getByText('SAMPLE', { exact: true })).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Sample • Oats & yogurt', exact: true })).toBeVisible();
  const state = await storedState(page);
  expect(state.demoLoaded).toBe(true);
  expect(state.meals).toHaveLength(28);
  expect(new Set(state.meals.map((meal) => meal.date)).size).toBe(7);
  const chart = page.getByRole('region', { name: 'Weekly nutrition progress', exact: true });
  await expect(chart.getByText('7 of 7 days logged. Select a day to view its meals.', { exact: true })).toBeVisible();
  await chart.getByRole('button', { name: 'Protein', exact: true }).click();
  await expect(chart.getByText('Daily goal: 150 g', { exact: true })).toBeVisible();
  const days = chart.getByRole('button').filter({ has: page.locator('span.flex.h-44') });
  await expect(days).toHaveCount(7);
  await days.first().click();
  await expect(page.getByLabel('Journal date', { exact: true })).not.toHaveValue(originalDate);
  await expect(page.getByText('SAMPLE', { exact: true })).toHaveCount(4);
});

test('photo attachments remain local and manual food tracking works without an AI key', async ({ page }) => {
  const apiRequests: string[] = [];
  await page.route('**/api/food-analysis', route => route.fulfill({ json: { available: false, provider: 'openai' } }));
  page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  await openApp(page);
  await page.getByRole('button', { name: 'Add Breakfast', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add a meal', exact: true });
  await editor.getByLabel('Meal name (optional)', { exact: true }).fill('Photo and manual banana');
  await editor.getByRole('tab', { name: 'Food photo', exact: true }).click();
  await expect(editor.getByText('Photo analysis is not configured on the server. You can still add foods manually.', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Analyze photo', exact: true })).toBeDisabled();
  await editor.getByLabel('Upload a food photo', { exact: true }).setInputFiles({ name: 'real-small-image.png', mimeType: 'image/png', buffer: smallPng });
  await expect(editor.getByRole('img', { name: 'Your uploaded meal photo', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Analyze photo', exact: true })).toBeDisabled();
  await expect(editor.getByText('Your plate is empty. Find a food above to get started.', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveText('Add at least one food to calculate and save your meal.');
  await editor.getByLabel('Search foods in Arabic or English', { exact: true }).fill('banana');
  await editor.getByRole('button', { name: 'Add Banana', exact: true }).click();
  await editor.getByLabel('Banana portion in grams').fill('100');
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expectDailyTotals(page, 89, 1.1, 22.8, 0.3);
  await expect(page.getByRole('img', { name: 'Attached meal photo', exact: true })).toBeVisible();
  const state = await storedState(page);
  expect(state.meals[0].items).toHaveLength(1);
  expect(state.meals[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  expect(apiRequests).toEqual([]);
  await page.reload();
  await expect(page.getByRole('img', { name: 'Attached meal photo', exact: true })).toBeVisible();
  await expectDailyTotals(page, 89, 1.1, 22.8, 0.3);
});

test('malformed saved data is preserved through edits until an explicit confirmed reset', async ({ page }) => {
  const original = '{"version":1,"meals":"broken original journal"';
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('corruption-fixture')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('corruption-fixture', 'set');
    }
  }, { key: storageKey, value: original });
  await openApp(page);
  const storageAlert = page.getByRole('alert').filter({ hasText: 'Browser storage needs attention.' });
  await expect(storageAlert).toContainText('Your existing stored data has been kept.');
  await addMeal(page, 'Breakfast', 'In-memory breakfast', 'Banana', 'banana', 100);
  await expectDailyTotals(page, 89, 1.1, 22.8, 0.3);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(original);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'In-memory breakfast', exact: true })).toHaveCount(0);
  await expect(storageAlert).toBeVisible();
  await page.getByRole('button', { name: 'Reset local storage', exact: true }).click();
  const reset = page.getByRole('dialog', { name: 'Clear your local journal?', exact: true });
  await reset.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(original);
  await page.getByRole('button', { name: 'Reset local storage', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear your local journal?', exact: true }).getByRole('button', { name: 'Clear journal', exact: true }).click();
  await expect(storageAlert).toHaveCount(0);
  expect((await storedState(page)).meals).toEqual([]);
});

test('exports the saved journal and imports it only after confirmation', async ({ page }) => {
  await openApp(page);
  await addMeal(page, 'Breakfast', 'Portable breakfast', 'Banana', 'banana', 100);
  const original = await storedState(page);
  await navigate(page, 'My settings');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export journal', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^a7sbha-journal-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = await readFile((await download.path())!, 'utf8');
  expect(JSON.parse(backup)).toEqual(original);
  await page.getByRole('button', { name: 'Clear all local data', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear your local journal?', exact: true }).getByRole('button', { name: 'Clear journal', exact: true }).click();
  expect((await storedState(page)).meals).toHaveLength(0);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  const confirmation = page.getByRole('dialog', { name: 'Replace your current journal?', exact: true });
  await expect(confirmation).toBeVisible();
  expect((await storedState(page)).meals).toHaveLength(0);
  await confirmation.getByRole('button', { name: 'Import and replace', exact: true }).click();
  expect(await storedState(page)).toEqual(original);
  await navigate(page, 'Overview');
  await expect(page.getByRole('heading', { name: 'Portable breakfast', exact: true })).toBeVisible();
  await expectDailyTotals(page, 89, 1.1, 22.8, 0.3);
  await navigate(page, 'My settings');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await expect(page.getByText('This file is not a valid A7sbha journal. Your data is unchanged.', { exact: true })).toBeVisible();
  expect(await storedState(page)).toEqual(original);
});

test('weight measurements produce an actual date-spaced trend and survive reload', async ({ page }) => {
  await openApp(page);
  const today = await page.getByLabel('Journal date', { exact: true }).inputValue();
  const dateBefore = (days: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  await navigate(page, 'My progress');
  await expect(page.getByText('Log your weight on two different days to see your real trend.', { exact: true })).toBeVisible();
  for (const [weight, date] of [[70, today], [69.5, dateBefore(1)], [71, dateBefore(7)]] as const) {
    await page.getByRole('button', { name: 'Log weight', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'A new check-in', exact: true });
    await dialog.getByLabel('Weight (kg)', { exact: true }).fill(String(weight));
    await dialog.getByLabel('Measurement date', { exact: true }).fill(date);
    await dialog.getByRole('button', { name: 'Save measurement', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  const chart = page.getByRole('region', { name: 'Weight progress', exact: true });
  const svg = chart.getByRole('img', { name: 'Recorded weight over time' });
  await expect(svg).toBeVisible();
  await expect(svg.locator('circle')).toHaveCount(3);
  const positions = await svg.locator('circle').evaluateAll((circles) => circles.map((circle) => Number(circle.getAttribute('cx'))));
  expect((positions[1] - positions[0]) / (positions[2] - positions[0])).toBeCloseTo(6 / 7, 4);
  await expect(chart.getByText('-1 kg since first entry', { exact: true })).toBeVisible();
  expect((await storedState(page)).weights).toHaveLength(3);
  await page.reload();
  await navigate(page, 'My progress');
  await expect(page.getByRole('region', { name: 'Weight progress', exact: true }).getByRole('img', { name: 'Recorded weight over time' }).locator('circle')).toHaveCount(3);
});

test('a calculated weight-loss plan reaches its target and switches to maintenance without losing the profile', async ({ page }) => {
  await openApp(page);
  await applyCalculatedGoal(page);
  const initial = await storedState(page);
  expect(initial.targetSource).toBe('calculated');
  expect(initial.goals).toEqual({ calories: 2209, protein: 150, carbs: 264.1, fat: 61.4, waterMl: 2500 });
  expect(initial.profile).toMatchObject({ name: 'Journey', goal: 'cut', weight: 75, targetWeight: 70 });
  await logCurrentWeight(page, 70);
  const reached = await storedState(page);
  expect(reached.targetSource).toBe('calculated');
  expect(reached.profile).toEqual({ ...initial.profile, weight: 70 });
  expect(reached.profile?.targetWeight).toBe(70);
  expect(reached.goals).toEqual({ calories: 2571, protein: 126, carbs: 356.1, fat: 71.4, waterMl: 2500 });
  expect(reached.weights.find((entry) => entry.date === initial.weights[0].date)?.weight).toBe(70);
  await navigate(page, 'Overview');
  await expect(page.getByText('Goal reached · targets now maintain your weight', { exact: true })).toBeVisible();
  await expect(page.getByText('Daily target', { exact: true }).locator('..').locator('strong')).toHaveText('2,571 kcal');
  await page.reload();
  await expect(page.getByText('Goal reached · targets now maintain your weight', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Browser storage needs attention.' })).toHaveCount(0);
  expect(await storedState(page)).toEqual(reached);
});

test('manual targets preserve an existing profile and remain fixed when its weight changes', async ({ page }) => {
  await openApp(page);
  await applyCalculatedGoal(page);
  const calculated = await storedState(page);
  await page.getByRole('button', { name: 'Edit daily targets', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Make your goals your own', exact: true });
  await expect(dialog.getByRole('button', { name: 'Daily targets', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('spinbutton', { name: 'Calories (kcal)', exact: true }).fill('2100');
  await dialog.getByRole('spinbutton', { name: 'Protein (g)', exact: true }).fill('120');
  await dialog.getByRole('spinbutton', { name: 'Carbohydrates (g)', exact: true }).fill('240');
  await dialog.getByRole('spinbutton', { name: 'Fat (g)', exact: true }).fill('70');
  await dialog.getByRole('spinbutton', { name: 'Water (ml)', exact: true }).fill('3000');
  await dialog.getByRole('button', { name: 'Save daily targets', exact: true }).click();
  await expect(dialog).toBeHidden();
  const manual = await storedState(page);
  const targets = { calories: 2100, protein: 120, carbs: 240, fat: 70, waterMl: 3000 };
  expect(manual.targetSource).toBe('manual');
  expect(manual.goals).toEqual(targets);
  expect(manual.profile).toEqual(calculated.profile);
  expect(manual.weights).toEqual(calculated.weights);
  await logCurrentWeight(page, 73);
  const updated = await storedState(page);
  expect(updated.targetSource).toBe('manual');
  expect(updated.profile).toEqual({ ...calculated.profile, weight: 73 });
  expect(updated.goals).toEqual(targets);
  await navigate(page, 'Overview');
  await expect(page.getByText('Daily target', { exact: true }).locator('..').locator('strong')).toHaveText('2,100 kcal');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hey Journey 👋', exact: true })).toBeVisible();
  expect(await storedState(page)).toEqual(updated);
});
