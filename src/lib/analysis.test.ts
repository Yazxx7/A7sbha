import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFoodAnalyzer, apiPhotoAnalyzer, getPhotoAnalysisAvailability, localPhotoAnalyzer, parseAnalyzedFoods, photoDataUrlToFile } from './analysis';

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

test('legacy photo client sends its explicit photo mode and meal content only to our server', async context => {
  const file = new File(['photo'], 'meal.jpg', { type: 'image/jpeg' });
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/food-analysis');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers, undefined);
    const form = init.body as FormData;
    assert.deepEqual([...form.keys()], ['mode', 'locale', 'description', 'image']);
    assert.equal(form.get('mode'), 'photo');
    assert.equal((form.get('image') as File).name, file.name);
    assert.equal(form.get('description'), 'Fish with lemon');
    assert.equal(form.get('locale'), 'ar');
    return Response.json({ status: 'success', foods: [estimate], message: 'Review these estimates.' });
  });
  const result = await apiPhotoAnalyzer.analyze({ file, description: ' Fish with lemon ', locale: 'ar' });
  assert.equal(result.status, 'success');
  if (result.status === 'success') assert.deepEqual(result.foods, [estimate]);
});

test('description analysis submits Arabic or English text without an image or credential', async context => {
  const descriptions = ['200 grams of cooked rice and 150 grams of chicken', '٢٠٠ غرام أرز مطبوخ و١٥٠ غرام دجاج'];
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, '/api/food-analysis');
    assert.equal(init.method, 'POST');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers, undefined);
    const form = init.body as FormData;
    assert.deepEqual([...form.keys()], ['mode', 'locale', 'description']);
    assert.equal(form.has('image'), false);
    assert.equal(form.get('mode'), 'description');
    assert.equal(form.get('locale'), calls === 0 ? 'en' : 'ar');
    assert.equal(form.get('description'), descriptions[calls++]);
    return Response.json({ status: 'success', foods: [estimate], message: 'Estimates only; review before saving.' });
  });
  for (const [index, description] of descriptions.entries()) {
    const result = await apiFoodAnalyzer.analyze({ mode: 'description', description: ` ${description} `, locale: index === 0 ? 'en' : 'ar' });
    assert.equal(result.status, 'success');
  }
  assert.equal(calls, 2);
});

test('clarification remains a question without invented nutrition or extra server fields', async context => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    status: 'clarification', message: 'كم غرامًا من الأرز أكلت؟', foods: [estimate], ignored: 'not copied',
  }));
  assert.deepEqual(await apiFoodAnalyzer.analyze({ mode: 'description', description: 'أرز', locale: 'ar' }), {
    status: 'clarification', message: 'كم غرامًا من الأرز أكلت؟',
  });
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

test('client rejects malformed API claims and never trusts success on a failed HTTP response', async context => {
  const file = new File(['photo'], 'meal.jpg');
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({ status: 'success', foods: [{ ...estimate, estimatedGrams: -20 }], message: 'Bad' }));
  assert.deepEqual(await apiPhotoAnalyzer.analyze({ file }), { status: 'error', code: 'request_failed', message: 'Could not analyze the photo. Try again or add foods manually.' });
  fetchMock.mock.mockImplementation(async () => Response.json({ status: 'success', foods: [estimate], message: 'Unexpected success' }, { status: 503 }));
  const falseSuccess = await apiPhotoAnalyzer.analyze({ file });
  assert.equal(falseSuccess.status, 'error');
  assert.equal('foods' in falseSuccess, false);
  fetchMock.mock.mockImplementation(async () => Response.json({ status: 'clarification', message: 'How much?' }, { status: 500 }));
  assert.equal((await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice' })).status, 'error');
});

test('valid quota, authentication, and rate-limit errors preserve safe metadata without browser retries', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({}));
  for (const details of [
    { code: 'insufficient_quota', message: 'The API account needs billing or quota.', retryable: false, status: 429 },
    { code: 'authentication_error', message: 'تحقّق من مفتاح API في الخادم.', retryable: false, status: 401 },
    { code: 'rate_limited', message: 'Please try again in 90 seconds.', retryable: true, status: 429 },
  ]) {
    const expected = { status: 'error', code: details.code, message: details.message, retryable: details.retryable,
      retryAfterSeconds: 90, requestId: 'de08329a-546a-4fac-a7cd-9a4d2d58e25f' };
    fetchMock.mock.mockImplementation(async () => Response.json({ ...expected, ignored: 'not copied' }, { status: details.status }));
    const before = fetchMock.mock.callCount();
    assert.deepEqual(await apiFoodAnalyzer.analyze({ mode: 'description', description: '200g rice' }), expected);
    assert.equal(fetchMock.mock.callCount() - before, 1);
  }
});

test('invalid error metadata is omitted without masking the actual API error', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({}));
  for (const delay of [-1, '60', null, Number.MAX_SAFE_INTEGER + 1]) {
    fetchMock.mock.mockImplementation(async () => Response.json({ status: 'error', code: 'insufficient_quota',
      message: 'Quota exhausted.', retryable: 'yes', retryAfterSeconds: delay, requestId: 'unsafe request id\nheader' }, { status: 429 }));
    assert.deepEqual(await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice' }), {
      status: 'error', code: 'insufficient_quota', message: 'Quota exhausted.',
    });
  }
  fetchMock.mock.mockImplementation(async () => Response.json({ status: 'error', code: 'rate_limited',
    message: 'Wait before trying again.', retryAfterSeconds: 700_000 }, { status: 429 }));
  const longDelay = await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice' });
  assert.equal(longDelay.status === 'error' && longDelay.retryAfterSeconds, 700_000);
});

test('malformed JSON and unsafe error claims use localized fallback messages rather than raw response data', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({}));
  for (const malformed of [null, [], { status: 'error', code: 'unsafe code', message: 'raw server error' },
    { status: 'error', code: 'request_failed', message: '' }, { status: 'error', code: 'request_failed', message: 'x'.repeat(1001) }]) {
    fetchMock.mock.mockImplementation(async () => Response.json(malformed));
    const result = await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice', locale: 'ar' });
    assert.equal(result.status, 'error');
    assert.ok(result.message.includes('تعذر تحليل الوصف'));
    assert.equal(result.message.includes('raw server error'), false);
  }
  for (const [status, code] of [[401, 'authentication_error'], [403, 'authentication_error'], [429, 'rate_limited'],
    [504, 'timeout'], [503, 'provider_unavailable']] as const) {
    fetchMock.mock.mockImplementation(async () => new Response('private server error', { status }));
    const result = await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice' });
    assert.equal(result.status === 'error' && result.code, code);
    assert.equal(result.message.includes('private server error'), false);
  }
});

test('network errors have clear Arabic and English messages and no automatic retries', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Sensitive underlying network detail'); });
  for (const locale of ['ar', 'en'] as const) {
    const before = fetchMock.mock.callCount();
    const result = await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice', locale });
    assert.equal(result.status === 'error' && result.code, 'network_error');
    assert.ok(result.message.includes(locale === 'ar' ? 'اتصالك بالإنترنت' : 'internet connection'));
    assert.equal(result.message.includes('Sensitive'), false);
    assert.equal(fetchMock.mock.callCount() - before, 1);
  }
});

test('45-second client timeout is distinct from network errors', async context => {
  context.mock.method(AbortSignal, 'timeout', (delay: number) => {
    assert.equal(delay, 45_000);
    return AbortSignal.abort(new DOMException('Timed out', 'TimeoutError'));
  });
  context.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    init.signal?.throwIfAborted();
    throw new Error('Expected an aborted signal');
  });
  const result = await apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice', locale: 'ar' });
  assert.equal(result.status === 'error' && result.code, 'timeout');
  assert.ok(result.message.includes('وقتًا طويلًا'));
});

test('caller cancellation propagates instead of presenting a stale analysis error', async context => {
  const controller = new AbortController();
  context.mock.method(globalThis, 'fetch', async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(apiPhotoAnalyzer.analyze({ file: new File([], 'food.jpg'), signal: controller.signal }), { name: 'AbortError' });
});

test('already cancelled description analysis never sends a request', async context => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => Response.json({}));
  await assert.rejects(apiFoodAnalyzer.analyze({ mode: 'description', description: 'rice', signal: AbortSignal.abort() }), { name: 'AbortError' });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('availability checks have a bounded timeout and preserve cancellation', async context => {
  context.mock.method(AbortSignal, 'timeout', (delay: number) => {
    assert.equal(delay, 10_000);
    return new AbortController().signal;
  });
  const controller = new AbortController();
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => {
    controller.abort();
    throw new DOMException('Aborted', 'AbortError');
  });
  await assert.rejects(getPhotoAnalysisAvailability(controller.signal), { name: 'AbortError' });
  assert.equal(fetchMock.mock.callCount(), 1);
  await assert.rejects(getPhotoAnalysisAvailability(AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(fetchMock.mock.callCount(), 1);
});
