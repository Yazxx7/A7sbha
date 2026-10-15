import test from 'node:test';
import assert from 'node:assert/strict';
import { apiPhotoAnalyzer, getPhotoAnalysisAvailability, localPhotoAnalyzer, parseAnalyzedFoods, photoDataUrlToFile } from './analysis';

test('local photo adapter honestly reports unavailable and creates no nutrition claims', async () => {
  const result = await localPhotoAnalyzer.analyze({ file: new File(['image placeholder'], 'food.jpg', { type: 'image/jpeg' }) });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.message.includes('not enabled'));
  assert.equal('foods' in result, false);
  const arabic = await localPhotoAnalyzer.analyze({ file: new File([], 'food.jpg'), locale: 'ar' });
  assert.ok(arabic.message.includes('غير مفعّل'));
});

const estimate = { label: 'Grilled fish', labelAr: 'سمك مشوي', estimatedGrams: 150,
  per100g: { calories: 200, protein: 24, carbs: 0, fat: 10 }, confidence: 'medium' as const };

test('analysis boundary accepts empty food results but rejects unsafe estimates', () => {
  assert.deepEqual(parseAnalyzedFoods([]), []);
  assert.deepEqual(parseAnalyzedFoods([{ ...estimate, ignored: 'extra' }]), [estimate]);
  for (const value of [null, {}, Array(21).fill(estimate), [{ ...estimate, label: ' ' }],
    [{ ...estimate, labelAr: 'x'.repeat(101) }], [{ ...estimate, confidence: 0.9 }],
    [{ ...estimate, estimatedGrams: '150' }], [{ ...estimate, estimatedGrams: 0 }],
    [{ ...estimate, per100g: { ...estimate.per100g, calories: Infinity } }],
    [{ ...estimate, per100g: { ...estimate.per100g, protein: 101 } }]]) {
    assert.throws(() => parseAnalyzedFoods(value));
  }
});

test('prepared local photo becomes a file without network access', async () => {
  const file = photoDataUrlToFile('data:image/jpeg;base64,/9j/');
  assert.equal(file.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [255, 216, 255]);
  assert.throws(() => photoDataUrlToFile('https://example.com/food.jpg'));
  assert.throws(() => photoDataUrlToFile('data:image/svg+xml;base64,PHN2Zz4='));
});

test('API client sends only explicit image, description and locale to our server', async context => {
  const file = new File(['photo'], 'meal.jpg', { type: 'image/jpeg' });
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/food-analysis');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers, undefined);
    const form = init.body as FormData;
    assert.deepEqual([...form.keys()], ['image', 'description', 'locale']);
    assert.equal((form.get('image') as File).name, file.name);
    assert.equal(form.get('description'), 'Fish with lemon');
    assert.equal(form.get('locale'), 'ar');
    return Response.json({ status: 'success', foods: [estimate], message: 'Review these estimates.' });
  });
  const result = await apiPhotoAnalyzer.analyze({ file, description: ' Fish with lemon ', locale: 'ar' });
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.foods, [estimate]);
});

test('API availability reveals no secret and unavailable analysis remains explicit', async context => {
  context.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => init.method === 'POST'
    ? Response.json({ status: 'unavailable', code: 'not_configured', message: 'Analysis is not configured.' }, { status: 503 })
    : Response.json({ available: false, provider: 'openai', ignored: 'not copied' }));
  assert.deepEqual(await getPhotoAnalysisAvailability(), { available: false, provider: 'openai' });
  const result = await apiPhotoAnalyzer.analyze({ file: new File(['photo'], 'food.jpg') });
  assert.equal(result.status, 'unavailable');
  assert.equal('foods' in result, false);
});

test('client rejects malformed API claims and handles retryable errors', async context => {
  const file = new File(['photo'], 'meal.jpg');
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'success', foods: [{ ...estimate, estimatedGrams: -20 }], message: 'Bad' }));
  assert.deepEqual(await apiPhotoAnalyzer.analyze({ file }), { status: 'error', code: 'request_failed', message: 'Could not analyze the photo. Try again or add foods manually.' });
  fetchMock.mock.mockImplementation(async () => Response.json({ status: 'error', code: 'rate_limited', message: 'Please try again shortly.' }, { status: 429 }));
  const limited = await apiPhotoAnalyzer.analyze({ file });
  assert.equal(limited.status, 'error');
  assert.equal(limited.message, 'Please try again shortly.');
  fetchMock.mock.mockImplementation(async () => { throw new TypeError('Network failed'); });
  const network = await apiPhotoAnalyzer.analyze({ file, locale: 'ar' });
  assert.equal(network.status, 'error');
  assert.ok(network.message.includes('تعذر'));
});

test('caller cancellation propagates instead of presenting a stale analysis error', async context => {
  const controller = new AbortController();
  context.mock.method(globalThis, 'fetch', async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(apiPhotoAnalyzer.analyze({ file: new File([], 'food.jpg'), signal: controller.signal }), { name: 'AbortError' });
});
