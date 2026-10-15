import { expect, test, type Page, type Request } from '@playwright/test';
import type { LocalState } from '../src/lib/types';

const storageKey = 'a7sbha.local.v1';
const smallPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGMoWZH4H4QZYAwAVs4J8RVA3GQAAAAASUVORK5CYII=', 'base64');
const estimate = {
  status: 'success',
  foods: [{
    label: 'Grilled fish', labelAr: 'سمك مشوي', estimatedGrams: 150,
    per100g: { calories: 200, protein: 24, carbs: 0, fat: 10 }, confidence: 'medium',
  }],
  message: 'These are estimates. Review the foods, portions, and nutrition before adding them.',
};
const descriptionEstimate = {
  status: 'success',
  foods: [
    { label: 'Cooked rice', labelAr: 'أرز مطبوخ', estimatedGrams: 200, per100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 }, confidence: 'medium' },
    { label: 'Grilled chicken', labelAr: 'دجاج مشوي', estimatedGrams: 150, per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 }, confidence: 'medium' },
    { label: 'Olive oil', labelAr: 'زيت زيتون', estimatedGrams: 14, per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 }, confidence: 'low' },
  ],
  message: 'Estimated nutrition based on the description; portions and cooking methods can change these values.',
};

async function openEditor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Lunch', exact: true }).click();
  return page.getByRole('dialog', { name: 'Add a meal', exact: true });
}

async function storedState(page: Page): Promise<LocalState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), storageKey);
}

async function expectNoSavedMeals(page: Page) {
  const meals = await page.evaluate(key => {
    const saved = localStorage.getItem(key);
    return saved === null ? [] : (JSON.parse(saved) as LocalState).meals;
  }, storageKey);
  expect(meals).toEqual([]);
}

async function expectDailyTotals(page: Page, calories: number, protein: number, carbs: number, fat: number) {
  await expect(page.getByText('Eaten today', { exact: true }).locator('..').locator('strong')).toHaveText(`${Math.round(calories).toLocaleString('en-US')} kcal`);
  for (const [name, value] of [['Protein', protein], ['Carbs', carbs], ['Fats', fat]] as const) {
    await expect.poll(async () => Number(await page.getByRole('progressbar', { name, exact: true }).getAttribute('aria-valuenow'))).toBeCloseTo(value, 4);
  }
}

function multipartParts(request: Request) {
  const contentType = request.headers()['content-type'];
  expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  expect(boundaryMatch).not.toBeNull();
  const boundary = boundaryMatch![1] || boundaryMatch![2];
  const body = request.postDataBuffer();
  expect(body).not.toBeNull();
  const parts = new Map<string, { headers: string; body: Buffer }>();
  for (const segment of body!.toString('latin1').split(`--${boundary}`)) {
    const headerEnd = segment.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;
    const headers = segment.slice(0, headerEnd);
    const name = headers.match(/name="([^"]+)"/)?.[1];
    if (!name) continue;
    parts.set(name, { headers, body: Buffer.from(segment.slice(headerEnd + 4).replace(/\r\n$/, ''), 'latin1') });
  }
  return parts;
}

function assertPhotoRequest(request: Request, description: string, locale: 'en' | 'ar') {
  const parts = multipartParts(request);
  expect([...parts.keys()].sort()).toEqual(['description', 'image', 'locale', 'mode']);
  expect(parts.get('mode')!.body.toString('utf8')).toBe('photo');
  expect(parts.get('description')!.body.toString('utf8')).toBe(description);
  expect(parts.get('locale')!.body.toString('utf8')).toBe(locale);
  const image = parts.get('image')!;
  expect(image.headers).toMatch(/filename="[^"]+"/);
  expect(image.headers).toMatch(/Content-Type: image\/jpeg/i);
  expect(image.body[0]).toBe(0xff);
  expect(image.body[1]).toBe(0xd8);
  expect(request.headers()['authorization']).toBeUndefined();
  expect(request.postData()).not.toMatch(/OPENAI_API_KEY|NUTRITION_AI_KEY|sk-proj-/);
}

function assertDescriptionRequest(request: Request, description: string, locale: 'en' | 'ar') {
  const parts = multipartParts(request);
  expect([...parts.keys()].sort()).toEqual(['description', 'locale', 'mode']);
  expect(parts.get('mode')!.body.toString('utf8')).toBe('description');
  expect(parts.get('description')!.body.toString('utf8')).toBe(description);
  expect(parts.get('locale')!.body.toString('utf8')).toBe(locale);
  expect(request.headers()['authorization']).toBeUndefined();
  expect(request.postData()).not.toMatch(/OPENAI_API_KEY|NUTRITION_AI_KEY|sk-proj-|filename=|data:image|profile|targetWeight/);
}

test('real production API accepts the browser host and keeps missing-key analysis honest', async ({ request, baseURL }) => {
  const availability = await request.get('/api/food-analysis');
  expect(availability.status()).toBe(200);
  const configuration = await availability.json();
  expect(configuration.provider).toBe('openai');
  test.skip(configuration.available, 'Never send a live provider request from the test suite.');
  const response = await request.post('/api/food-analysis', {
    headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin' },
    multipart: { mode: 'photo', image: { name: 'food.png', mimeType: 'image/png', buffer: smallPng }, locale: 'ar' },
  });
  expect(response.status()).toBe(503);
  const result = await response.json();
  expect(result.status).toBe('unavailable');
  expect(result.code).toBe('not_configured');
  expect(result.message).toContain('غير مفعّل');
  const descriptionResponse = await request.post('/api/food-analysis', {
    headers: { Origin: baseURL!, 'Sec-Fetch-Site': 'same-origin' },
    multipart: { mode: 'description', description: '200 grams of cooked rice', locale: 'en' },
  });
  expect(descriptionResponse.status()).toBe(503);
  expect(await descriptionResponse.json()).toMatchObject({ status: 'unavailable', code: 'not_configured' });
  const rejected = await request.post('/api/food-analysis', {
    headers: { Origin: 'https://other.example', 'Sec-Fetch-Site': 'cross-site' },
    multipart: { image: { name: 'food.png', mimeType: 'image/png', buffer: smallPng } },
  });
  expect(rejected.status()).toBe(403);
});

test('sends only on explicit analysis, reviews estimates, and persists mixed local and AI foods', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    requests.push(route.request());
    await route.fulfill({ json: estimate });
  });
  const editor = await openEditor(page);
  await editor.getByLabel('Meal name (optional)', { exact: true }).fill('Reviewed fish and banana');
  await editor.getByLabel('Search foods in Arabic or English', { exact: true }).fill('banana');
  await editor.getByRole('button', { name: 'Add Banana', exact: true }).click();
  await editor.getByLabel('Banana portion in grams', { exact: true }).fill('100');
  await editor.getByRole('tab', { name: 'Food photo', exact: true }).click();
  await editor.getByLabel('Upload a food photo', { exact: true }).setInputFiles({ name: 'lunch.png', mimeType: 'image/png', buffer: smallPng });
  await expect(editor.getByRole('img', { name: 'Your uploaded meal photo', exact: true })).toBeVisible();
  await editor.getByLabel('Meal description (optional)', { exact: true }).fill('Grilled fish, no sauce');
  await expect(editor.getByRole('button', { name: 'Analyze photo', exact: true })).toBeEnabled();
  expect(requests).toHaveLength(0);
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true })).toHaveCount(0);
  await editor.getByRole('button', { name: 'Analyze photo', exact: true }).click();
  const review = editor.getByRole('region', { name: 'Review food estimates', exact: true });
  await expect(review).toBeVisible();
  expect(requests).toHaveLength(1);
  assertPhotoRequest(requests[0], 'Grilled fish, no sauce', 'en');
  const fish = review.getByRole('article', { name: 'Estimated food 1', exact: true });
  await expect(fish.getByLabel('Portion (g)', { exact: true })).toHaveValue('150');
  await expect(editor.getByLabel('Grilled fish portion in grams', { exact: true })).toHaveCount(0);
  await expectDailyTotals(page, 0, 0, 0, 0);
  await fish.getByLabel('Food name (English)', { exact: true }).fill('Reviewed grilled fish');
  await fish.getByLabel('Food name (Arabic)', { exact: true }).fill('سمك مشوي بعد المراجعة');
  await fish.getByLabel('Portion (g)', { exact: true }).fill('0');
  await expect(review.getByRole('button', { name: 'Add reviewed foods', exact: true })).toBeDisabled();
  await fish.getByLabel('Portion (g)', { exact: true }).fill('200');
  await fish.getByLabel('Calories per 100 g', { exact: true }).fill('180');
  await fish.getByLabel('Protein per 100 g', { exact: true }).fill('22');
  await fish.getByLabel('Carbs per 100 g', { exact: true }).fill('3');
  await fish.getByLabel('Fat per 100 g', { exact: true }).fill('8');
  await review.getByRole('button', { name: 'Add reviewed foods', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Foods added to your plate', exact: true })).toBeDisabled();
  await expect(editor.getByLabel('Reviewed grilled fish portion in grams', { exact: true })).toHaveValue('200');
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByText('AI estimate', { exact: true })).toBeVisible();
  await expectDailyTotals(page, 449, 45.1, 28.8, 16.3);
  const saved = await storedState(page);
  expect(saved.meals).toHaveLength(1);
  expect(saved.meals[0].items).toHaveLength(2);
  expect(saved.meals[0].items[1]).toMatchObject({
    foodId: 'ai-estimate', grams: 200,
    estimatedFood: { source: 'openai', name: 'Reviewed grilled fish', nameAr: 'سمك مشوي بعد المراجعة', per100g: { calories: 180, protein: 22, carbs: 3, fat: 8 } },
  });
  await page.reload();
  await expectDailyTotals(page, 449, 45.1, 28.8, 16.3);
  await page.getByRole('button', { name: 'Edit meal: Reviewed fish and banana', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit your meal', exact: true });
  await expect(edit.getByLabel('Reviewed grilled fish portion in grams', { exact: true })).toHaveValue('200');
  await edit.getByLabel('Reviewed grilled fish portion in grams', { exact: true }).fill('100');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expectDailyTotals(page, 269, 23.1, 25.8, 8.3);
  expect((await storedState(page)).meals[0].items).toHaveLength(2);
  expect(requests).toHaveLength(1);
});

test('an analysis failure keeps the photo and can be retried without adding duplicate foods', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 429, json: { status: 'error', code: 'rate_limited', message: 'Photo analysis is temporarily busy. Please try again.', retryable: true, requestId: 'test-photo-retry' } });
    await route.fulfill({ json: estimate });
  });
  const editor = await openEditor(page);
  await editor.getByLabel('Meal name (optional)', { exact: true }).fill('Retried fish');
  await editor.getByRole('tab', { name: 'Food photo', exact: true }).click();
  await editor.getByLabel('Upload a food photo', { exact: true }).setInputFiles({ name: 'fish.png', mimeType: 'image/png', buffer: smallPng });
  await editor.getByRole('button', { name: 'Analyze photo', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Photo analysis is temporarily busy. Please try again.');
  await expect(editor.getByRole('img', { name: 'Your uploaded meal photo', exact: true })).toBeVisible();
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true })).toHaveCount(0);
  await expect(editor.getByText('Your plate is empty. Find a food above to get started.', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Analyze photo', exact: true }).click();
  const review = editor.getByRole('region', { name: 'Review food estimates', exact: true });
  await expect(review.getByRole('article')).toHaveCount(1);
  await review.getByRole('button', { name: 'Add reviewed foods', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Foods added to your plate', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expectDailyTotals(page, 300, 36, 0, 15);
  expect(attempts).toBe(2);
  expect((await storedState(page)).meals[0].items).toHaveLength(1);
});

test('replacing a photo cancels stale suggestions even when the image content is identical', async ({ page }) => {
  let requests = 0;
  let settled = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    requests++;
    if (requests === 1) await pending;
    try { await route.fulfill({ json: estimate }); } catch { /* The superseded browser request was aborted. */ }
    finally { settled++; }
  });
  const editor = await openEditor(page);
  await editor.getByRole('tab', { name: 'Food photo', exact: true }).click();
  const input = editor.getByLabel('Upload a food photo', { exact: true });
  await input.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: smallPng });
  await editor.getByRole('button', { name: 'Analyze photo', exact: true }).click();
  await expect.poll(() => requests).toBe(1);
  await input.setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: smallPng });
  await expect(editor.getByRole('button', { name: 'Analyze photo', exact: true })).toBeEnabled();
  release();
  await expect.poll(() => settled).toBe(1);
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true })).toHaveCount(0);
  await expect(editor.getByText('Your plate is empty. Find a food above to get started.', { exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Analyze photo', exact: true }).click();
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('an image with no identified foods never creates nutrition and manual search remains usable', async ({ page }) => {
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    await route.fulfill({ json: { status: 'success', foods: [], message: 'No food was found in the image.' } });
  });
  const editor = await openEditor(page);
  await editor.getByRole('tab', { name: 'Food photo', exact: true }).click();
  await editor.getByLabel('Upload a food photo', { exact: true }).setInputFiles({ name: 'empty-plate.png', mimeType: 'image/png', buffer: smallPng });
  await editor.getByRole('button', { name: 'Analyze photo', exact: true }).click();
  await expect(editor.getByText('No food could be identified in this photo. Try another photo or add foods manually.', { exact: true })).toBeVisible();
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true })).toHaveCount(0);
  await expectDailyTotals(page, 0, 0, 0, 0);
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(editor.getByRole('alert')).toContainText('Add at least one food to calculate and save your meal.');
  await editor.getByLabel('Search foods in Arabic or English', { exact: true }).fill('banana');
  await editor.getByRole('button', { name: 'Add Banana', exact: true }).click();
  await editor.getByLabel('Banana portion in grams', { exact: true }).fill('100');
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expectDailyTotals(page, 89, 1.1, 22.8, 0.3);
  expect((await storedState(page)).meals[0].items[0].estimatedFood).toBeUndefined();
});

test('Arabic photo review works on mobile with the locale and description sent only on consent', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    requests.push(route.request());
    await route.fulfill({ json: estimate });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await page.getByRole('button', { name: 'إضافة الغداء', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'أضف وجبة', exact: true });
  await editor.getByLabel('اسم الوجبة (اختياري)', { exact: true }).fill('غداء بعد المراجعة');
  await editor.getByRole('tab', { name: 'صورة الطعام', exact: true }).click();
  await editor.getByLabel('تحميل صورة الطعام', { exact: true }).setInputFiles({ name: 'fish.png', mimeType: 'image/png', buffer: smallPng });
  await editor.getByLabel('وصف الوجبة (اختياري)', { exact: true }).fill('سمك مشوي بدون صلصة');
  await expect(editor.getByRole('button', { name: 'تحليل الصورة', exact: true })).toBeEnabled();
  expect(requests).toHaveLength(0);
  await editor.getByRole('button', { name: 'تحليل الصورة', exact: true }).click();
  const review = editor.getByRole('region', { name: 'مراجعة تقديرات الطعام', exact: true });
  await expect(review).toBeVisible();
  assertPhotoRequest(requests[0], 'سمك مشوي بدون صلصة', 'ar');
  const fish = review.getByRole('article', { name: 'الطعام المقدّر 1', exact: true });
  await expect(fish.getByLabel('اسم الطعام بالعربية', { exact: true })).toHaveValue('سمك مشوي');
  await fish.getByLabel('الكمية (غ)', { exact: true }).fill('100');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await review.getByRole('button', { name: 'إضافة الأطعمة بعد المراجعة', exact: true }).click();
  await editor.getByRole('button', { name: 'حفظ الوجبة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'غداء بعد المراجعة', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'غداء بعد المراجعة', exact: true })).toBeVisible();
  expect((await storedState(page)).meals[0].items).toHaveLength(1);
  expect((await storedState(page)).meals[0].items[0].grams).toBe(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('description analysis needs no photo, reviews editable nutrition totals, and saves real diary items', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    requests.push(route.request());
    await route.fulfill({ json: descriptionEstimate });
  });
  const editor = await openEditor(page);
  await editor.getByLabel('Meal name (optional)', { exact: true }).fill('Description rice and chicken');
  await editor.getByRole('tab', { name: 'Meal description', exact: true }).click();
  const description = editor.getByRole('textbox', { name: 'Meal description', exact: true });
  const analyze = editor.getByRole('button', { name: 'Analyze description', exact: true });
  await expect(analyze).toBeDisabled();
  const text = '200 grams of cooked rice, 150 grams of grilled chicken, and one tablespoon of olive oil.';
  await description.fill(text);
  await expect(analyze).toBeEnabled();
  await expect(editor.getByRole('img', { name: 'Your uploaded meal photo', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await analyze.click();
  const review = editor.getByRole('region', { name: 'Review food estimates', exact: true });
  await expect(review.getByRole('article')).toHaveCount(3);
  assertDescriptionRequest(requests[0], text, 'en');
  await expect(review).toContainText('AI estimates can be inaccurate');
  await expectDailyTotals(page, 0, 0, 0, 0);
  const rice = review.getByRole('article', { name: 'Estimated food 1', exact: true });
  await expect(rice.getByLabel('Portion (g)', { exact: true })).toHaveValue('200');
  await rice.getByLabel('Portion (g)', { exact: true }).fill('180');
  await rice.getByLabel('Calories per 100 g', { exact: true }).fill('120');
  await rice.getByLabel('Protein per 100 g', { exact: true }).fill('3');
  await rice.getByLabel('Carbs per 100 g', { exact: true }).fill('25');
  await rice.getByLabel('Fat per 100 g', { exact: true }).fill('1');
  await review.getByRole('article', { name: 'Estimated food 3', exact: true }).getByLabel('Portion (g)', { exact: true }).fill('10');
  const totals = review.getByRole('region', { name: 'Estimated nutrition totals', exact: true });
  for (const [label, value, unit] of [['Calories', 552, 'kcal'], ['Protein', 52, 'g'], ['Carbs', 45, 'g'], ['Fat', 17, 'g']] as const) {
    await expect(totals.getByText(label, { exact: true }).locator('..').locator('p').first()).toHaveText(new RegExp(`^${value}\\s*${unit}$`));
  }
  await review.getByRole('button', { name: 'Add reviewed foods', exact: true }).click();
  await expect(editor.getByLabel('Cooked rice portion in grams', { exact: true })).toHaveValue('180');
  await editor.getByRole('button', { name: 'Save meal', exact: true }).click();
  await expect(editor).toBeHidden();
  await expectDailyTotals(page, 551.9, 51.9, 45, 17.2);
  const saved = await storedState(page);
  expect(saved.meals).toHaveLength(1);
  expect(saved.meals[0].photo).toBeUndefined();
  expect(saved.meals[0].items).toHaveLength(3);
  expect(saved.meals[0].items[0]).toMatchObject({ foodId: 'ai-estimate', grams: 180, estimatedFood: { source: 'openai', per100g: { calories: 120, protein: 3, carbs: 25, fat: 1 } } });
  await page.reload();
  await expectDailyTotals(page, 551.9, 51.9, 45, 17.2);
  await page.getByRole('button', { name: 'Edit meal: Description rice and chicken', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit your meal', exact: true });
  await edit.getByLabel('Grilled chicken portion in grams', { exact: true }).fill('100');
  await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expectDailyTotals(page, 469.4, 36.4, 45, 15.4);
  expect((await storedState(page)).meals[0].items).toHaveLength(3);
  expect(requests).toHaveLength(1);
});

test('Arabic meal description works on mobile and excludes an attached photo from the consented request', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    requests.push(route.request());
    await route.fulfill({ json: estimate });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
  await page.getByRole('button', { name: 'إضافة الغداء', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'أضف وجبة', exact: true });
  await editor.getByLabel('اسم الوجبة (اختياري)', { exact: true }).fill('وجبة من الوصف');
  await editor.getByRole('tab', { name: 'صورة الطعام', exact: true }).click();
  await editor.getByLabel('تحميل صورة الطعام', { exact: true }).setInputFiles({ name: 'local-only-fish.png', mimeType: 'image/png', buffer: smallPng });
  await expect(editor.getByRole('img', { name: 'صورة وجبتك المرفوعة', exact: true })).toBeVisible();
  await editor.getByRole('tab', { name: 'وصف الوجبة', exact: true }).click();
  const description = '١٥٠ غرام سمك مشوي بدون صلصة';
  await editor.getByRole('textbox', { name: 'وصف الوجبة', exact: true }).fill(description);
  await expect(editor.getByRole('button', { name: 'تحليل الوصف', exact: true })).toBeEnabled();
  expect(requests).toHaveLength(0);
  await editor.getByRole('button', { name: 'تحليل الوصف', exact: true }).click();
  const review = editor.getByRole('region', { name: 'مراجعة تقديرات الطعام', exact: true });
  await expect(review).toBeVisible();
  assertDescriptionRequest(requests[0], description, 'ar');
  await expect(review.getByRole('article', { name: 'الطعام المقدّر 1', exact: true }).getByLabel('اسم الطعام بالعربية', { exact: true })).toHaveValue('سمك مشوي');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await review.getByRole('button', { name: 'إضافة الأطعمة بعد المراجعة', exact: true }).click();
  await editor.getByRole('button', { name: 'حفظ الوجبة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'وجبة من الوصف', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'وجبة من الوصف', exact: true })).toBeVisible();
  expect((await storedState(page)).meals[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  expect((await storedState(page)).meals[0].items[0].grams).toBe(150);
});

test('missing quantities request clarification without inventing foods and only resend after the user adds detail', async ({ page }) => {
  const requests: Request[] = [];
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    requests.push(route.request());
    if (requests.length === 1) return route.fulfill({ json: { status: 'clarification', message: 'How many grams of cooked rice and grilled chicken did you eat?' } });
    await route.fulfill({ json: descriptionEstimate });
  });
  const editor = await openEditor(page);
  await editor.getByRole('tab', { name: 'Meal description', exact: true }).click();
  const description = editor.getByRole('textbox', { name: 'Meal description', exact: true });
  await description.fill('Rice and grilled chicken with olive oil');
  await editor.getByRole('button', { name: 'Analyze description', exact: true }).click();
  const clarification = editor.getByRole('status').filter({ hasText: 'Add portion details' });
  await expect(clarification).toContainText('How many grams of cooked rice and grilled chicken did you eat?');
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true })).toHaveCount(0);
  await expect(editor.getByRole('button', { name: 'Add reviewed foods', exact: true })).toHaveCount(0);
  await expect(editor.getByText('Your plate is empty. Find a food above to get started.', { exact: true })).toBeVisible();
  await expectDailyTotals(page, 0, 0, 0, 0);
  await expectNoSavedMeals(page);
  const detailed = '200 grams cooked rice, 150 grams grilled chicken, 1 tablespoon olive oil';
  await description.fill(detailed);
  await expect(clarification).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await editor.getByRole('button', { name: 'Analyze description', exact: true }).click();
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true }).getByRole('article')).toHaveCount(3);
  assertDescriptionRequest(requests[0], 'Rice and grilled chicken with olive oil', 'en');
  assertDescriptionRequest(requests[1], detailed, 'en');
  await expectNoSavedMeals(page);
});

for (const scenario of [
  { name: 'insufficient quota', locale: 'en', status: 429, code: 'insufficient_quota', message: 'OpenAI API quota is exhausted. Check billing and project limits.', retryable: false },
  { name: 'an invalid API key in Arabic', locale: 'ar', status: 401, code: 'authentication_error', message: 'مفتاح OpenAI على الخادم غير صالح. اطلب من مسؤول الموقع تحديثه.', retryable: false },
  { name: 'an upstream timeout', locale: 'en', status: 504, code: 'timeout', message: 'Food analysis took too long. Please try again.', retryable: true },
  { name: 'an upstream network failure', locale: 'en', status: 502, code: 'network_error', message: 'Could not reach OpenAI. Please try again later.', retryable: true },
] as const) {
  test(`description analysis clearly shows ${scenario.name} without fake food or automatic browser retries`, async ({ page }) => {
    let attempts = 0;
    await page.clock.install();
    await page.route('**/api/food-analysis', async route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
      attempts++;
      await route.fulfill({ status: scenario.status, json: { status: 'error', code: scenario.code, message: scenario.message, retryable: scenario.retryable, requestId: 'test-safe-diagnostic-id' } });
    });
    await page.goto('/');
    const ar = scenario.locale === 'ar';
    if (ar) await page.getByRole('button', { name: 'Switch to Arabic', exact: true }).click();
    await page.getByRole('button', { name: ar ? 'إضافة الغداء' : 'Add Lunch', exact: true }).click();
    const editor = page.getByRole('dialog', { name: ar ? 'أضف وجبة' : 'Add a meal', exact: true });
    await editor.getByRole('tab', { name: ar ? 'وصف الوجبة' : 'Meal description', exact: true }).click();
    const description = editor.getByRole('textbox', { name: ar ? 'وصف الوجبة' : 'Meal description', exact: true });
    await description.fill(ar ? '١٥٠ غرام سمك مشوي' : '150 grams of grilled fish');
    await editor.getByRole('button', { name: ar ? 'تحليل الوصف' : 'Analyze description', exact: true }).click();
    await expect(editor.getByRole('alert')).toContainText(scenario.message);
    await expect(description).toHaveValue(ar ? '١٥٠ غرام سمك مشوي' : '150 grams of grilled fish');
    await expect(editor.getByRole('region', { name: ar ? 'مراجعة تقديرات الطعام' : 'Review food estimates', exact: true })).toHaveCount(0);
    await expectNoSavedMeals(page);
    await page.clock.fastForward(60_000);
    expect(attempts).toBe(1);
  });
}

test('Retry-After locks the analysis button briefly, then allows a manual retry without sending automatically', async ({ page }) => {
  let attempts = 0;
  await page.clock.install();
  await page.route('**/api/food-analysis', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, provider: 'openai' } });
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 429, headers: { 'Retry-After': '2' }, json: { status: 'error', code: 'rate_limited', message: 'OpenAI is receiving too many requests. Try again shortly.', retryable: true, retryAfterSeconds: 2, requestId: 'test-rate-limit' } });
    await route.fulfill({ json: estimate });
  });
  const editor = await openEditor(page);
  await editor.getByRole('tab', { name: 'Meal description', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Meal description', exact: true }).fill('150 grams of grilled fish');
  const analyze = editor.getByRole('button', { name: 'Analyze description', exact: true });
  await analyze.click();
  await expect(editor.getByRole('alert')).toContainText('OpenAI is receiving too many requests. Try again shortly.');
  await expect(analyze).toBeDisabled();
  await expect(editor.getByRole('status').filter({ hasText: /You can try again in \d+ seconds\./ })).toBeVisible();
  expect(attempts).toBe(1);
  await page.clock.fastForward(3_000);
  await expect(analyze).toBeEnabled();
  expect(attempts).toBe(1);
  await analyze.click();
  await expect(editor.getByRole('region', { name: 'Review food estimates', exact: true }).getByRole('article')).toHaveCount(1);
  expect(attempts).toBe(2);
});
