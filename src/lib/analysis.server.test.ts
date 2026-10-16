import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@google/genai';
import { createAnalysisLimits, createFoodAnalysisHandlers, MAX_IMAGE_BYTES, validateAnalyzedFoods } from './analysis.server';

const validFood = { label: 'Rice', labelAr: 'أرز', estimatedGrams: 150, per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, confidence: 'medium' };
const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 0, 255, 217]);
function request(options: { locale?: string; description?: string; image?: File; origin?: string; site?: string; signal?: AbortSignal; url?: string; host?: string; forwardedHost?: string; forwardedProto?: string; mode?: string } = {}) {
  const form = new FormData();
  if (options.mode !== 'description' || options.image) form.set('image', options.image ?? new File([jpeg], 'rice.jpg', { type: 'image/jpeg' }));
  if (options.mode !== undefined) form.set('mode', options.mode);
  form.set('locale', options.locale ?? 'en');
  if (options.description !== undefined) form.set('description', options.description);
  return new Request(options.url ?? 'http://localhost:3000/api/food-analysis', { method: 'POST', body: form, signal: options.signal, headers: {
    ...(options.origin === undefined ? {} : { Origin: options.origin }), ...(options.site === undefined ? {} : { 'Sec-Fetch-Site': options.site }),
    ...(options.host === undefined ? {} : { Host: options.host }),
    ...(options.forwardedHost === undefined ? {} : { 'X-Forwarded-Host': options.forwardedHost }),
    ...(options.forwardedProto === undefined ? {} : { 'X-Forwarded-Proto': options.forwardedProto }),
  } });
}
function provider(foods: unknown = [validFood], clarification: unknown = null) {
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ foods, clarification }) }] } }] });
}
function setup(overrides: Parameters<typeof createFoodAnalysisHandlers>[0] = {}) {
  let calls = 0;
  const handlers = createFoodAnalysisHandlers({ env: () => ({ GEMINI_API_KEY: 'test-only-placeholder' }), limits: createAnalysisLimits(), log: () => {}, sleep: async () => {},
    fetch: async () => { calls++; return provider(); }, ...overrides });
  return { ...handlers, calls: () => calls };
}

test('availability is key presence only, never exposes credentials, and is not cached', async () => {
  const configured = await setup().GET();
  assert.deepEqual(await configured.json(), { available: true, provider: 'gemini' });
  assert.equal(configured.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await (await setup({ env: () => ({ GEMINI_API_KEY: ' ' }) }).GET()).json(), { available: false, provider: 'gemini' });
});

test('missing key returns localized unavailable without a provider request', async () => {
  const handler = setup({ env: () => ({}) });
  const response = await handler.POST(request({ locale: 'ar' }));
  assert.equal(response.status, 503);
  const result = await response.json();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.code, 'not_configured');
  assert.match(result.message, /غير مفعّل/);
  assert.equal(handler.calls(), 0);
});

test('official SDK sends real Gemini image JSON, header authentication, and structured schema', async () => {
  let sent: Record<string, unknown> | undefined;
  const handler = setup({ fetch: async (url, init) => {
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('x-goog-api-key'), 'test-only-placeholder');
    assert.equal(headers.has('authorization'), false);
    sent = JSON.parse(String(init?.body)); return provider();
  } });
  const response = await handler.POST(request({ description: 'Rice with lunch', origin: 'http://localhost:3000' }));
  assert.equal(response.status, 200);
  const result = await response.json(); assert.deepEqual(result.foods, [validFood]); assert.match(result.message, /Review/);
  const body = sent as { contents: { parts: { inlineData?: { mimeType: string; data: string }; text?: string }[] }[];
    generationConfig: { responseMimeType: string; responseJsonSchema: { required: string[] } } };
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema.required, ['foods', 'clarification']);
  assert.equal(body.contents[0].parts[1].inlineData?.mimeType, 'image/jpeg');
  assert.equal(body.contents[0].parts[1].inlineData?.data, Buffer.from(jpeg).toString('base64'));
  assert.match(body.contents[0].parts[0].text ?? '', /Rice with lunch/);
  assert.equal(JSON.stringify(sent).includes('image_url'), false);
});

test('optional configured Gemini model is used on the server', async () => {
  const handler = setup({ env: () => ({ GEMINI_API_KEY: 'test', GEMINI_FOOD_MODEL: 'gemini-2.5-flash' }), fetch: async (url) => {
    assert.match(String(url), /models\/gemini-2\.5-flash:generateContent$/); return provider();
  } });
  assert.equal((await handler.POST(request())).status, 200);
});

test('unclear or nonfood result stays empty with an honest message', async () => {
  const handler = setup({ fetch: async () => provider([]) });
  const result = await (await handler.POST(request({ locale: 'ar' }))).json();
  assert.equal(result.status, 'success');
  assert.deepEqual(result.foods, []);
  assert.match(result.message, /تعذّر تحديد طعام/);
});

test('cross-origin browser requests are rejected before provider calls', async () => {
  const handler = setup();
  assert.equal((await handler.POST(request({ origin: 'https://other.example' }))).status, 403);
  assert.equal((await handler.POST(request({ site: 'cross-site' }))).status, 403);
  assert.equal((await handler.POST(request({ origin: 'null' }))).status, 403);
  assert.equal(handler.calls(), 0);
});

test('browser Origin matches the external Host when Next listens on 0.0.0.0', async () => {
  const handler = setup({ env: () => ({}) });
  const response = await handler.POST(request({ url: 'http://0.0.0.0:3100/api/food-analysis', host: 'localhost:3100', origin: 'http://localhost:3100', site: 'same-origin' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'not_configured');
  assert.equal((await handler.POST(request({ url: 'http://0.0.0.0:3100/api/food-analysis', host: '127.0.0.1:3100', origin: 'http://127.0.0.1:3100' }))).status, 503);
});

test('trusted proxy authority supports external HTTPS without accepting another Origin', async () => {
  const handler = setup({ env: () => ({}) });
  const options = { url: 'http://0.0.0.0:3100/api/food-analysis', host: 'internal:3100', forwardedHost: 'a7sbha.example', forwardedProto: 'https' };
  assert.equal((await handler.POST(request({ ...options, origin: 'https://a7sbha.example' }))).status, 503);
  assert.equal((await handler.POST(request({ ...options, origin: 'http://a7sbha.example' }))).status, 403);
  assert.equal((await handler.POST(request({ ...options, origin: 'https://other.example' }))).status, 403);
  assert.equal((await handler.POST(request({ ...options, forwardedHost: 'a7sbha.example, internal:3100', forwardedProto: 'https, http', origin: 'https://a7sbha.example' }))).status, 503);
});

test('malformed browser origins and forwarded authorities remain rejected', async () => {
  const handler = setup();
  for (const origin of ['http://localhost:3000/path', 'http://localhost:3000/', 'http://user@localhost:3000', 'null', 'file://localhost:3000', 'http://localhost:3000?query']) {
    assert.equal((await handler.POST(request({ origin }))).status, 403);
  }
  for (const forwardedHost of ['localhost:3000/path', 'user@localhost:3000', 'localhost:bad', 'localhost:3000?query', 'localhost:3000#hash', 'local host:3000', '']) {
    assert.equal((await handler.POST(request({ origin: 'http://localhost:3000', forwardedHost }))).status, 403);
  }
  assert.equal((await handler.POST(request({ origin: 'http://localhost:3000', forwardedProto: 'file' }))).status, 403);
  assert.equal((await handler.POST(request({ origin: 'https://localhost:3000', forwardedHost: 'localhost:3000', forwardedProto: 'https', site: 'cross-site' }))).status, 403);
  assert.equal(handler.calls(), 0);
});

test('invalid fields, oversized descriptions, missing image and mismatched magic never call provider', async () => {
  const handler = setup();
  for (const invalid of [
    request({ description: 'x'.repeat(2001) }), request({ locale: 'fr' }),
    request({ image: new File(['not an image'], 'food.jpg', { type: 'image/jpeg' }) }),
    request({ image: new File([jpeg], 'food.png', { type: 'image/png' }) }),
    request({ image: new File([jpeg], 'food.svg', { type: 'image/svg+xml' }) }),
    new Request('http://localhost:3000/api/food-analysis', { method: 'POST', body: new FormData() }),
    new Request('http://localhost:3000/api/food-analysis', { method: 'POST', body: '{}' }),
    new Request('http://localhost:3000/api/food-analysis', { method: 'POST', body: 'bad multipart', headers: { 'Content-Type': 'multipart/form-data; boundary=absent' } }),
  ]) assert.equal((await handler.POST(invalid)).status, 400);
  const duplicate = new FormData(); duplicate.append('image', new File([jpeg], 'a.jpg', { type: 'image/jpeg' })); duplicate.append('image', new File([jpeg], 'b.jpg', { type: 'image/jpeg' }));
  assert.equal((await handler.POST(new Request('http://localhost:3000/api/food-analysis', { method: 'POST', body: duplicate }))).status, 400);
  assert.equal(handler.calls(), 0);
});

test('JPEG, PNG and WebP signatures are supported', async () => {
  const handler = setup();
  for (const [type, bytes] of [['image/png', Uint8Array.from([137,80,78,71,13,10,26,10])], ['image/webp', new TextEncoder().encode('RIFF0000WEBP')]] as const) {
    assert.equal((await handler.POST(request({ image: new File([bytes], 'meal', { type }) }))).status, 200);
  }
});

test('image limit and actual streamed request limit are enforced without Content-Length', async () => {
  const handler = setup();
  const bytes = new Uint8Array(MAX_IMAGE_BYTES + 1); bytes.set(jpeg);
  assert.equal((await handler.POST(request({ image: new File([bytes], 'big.jpg', { type: 'image/jpeg' }) }))).status, 413);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
  const streamed = new Request('http://localhost:3000/api/food-analysis', { method: 'POST', body: stream, headers: { 'Content-Type': 'multipart/form-data; boundary=food' }, duplex: 'half' } as RequestInit);
  assert.equal(streamed.headers.has('content-length'), false);
  assert.equal((await handler.POST(streamed)).status, 413);
  assert.equal(cancelled, true);
  assert.equal(handler.calls(), 0);
});

test('malformed, refused, incomplete and out-of-bounds AI output is never accepted', async () => {
  const badResponses = [
    () => new Response('not json'),
    () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{}' }] } }] }),
    () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'unrequested' } }] } }] }),
    () => Response.json({ candidates: [] }),
    () => provider([{ ...validFood, estimatedGrams: 0 }]),
    () => provider([{ ...validFood, per100g: { ...validFood.per100g, protein: 101 } }]),
    () => provider(new Array(21).fill(validFood)),
    () => provider([{ ...validFood, label: 'x'.repeat(101) }]),
  ];
  for (const response of badResponses) {
    const result = await setup({ fetch: async () => response() }).POST(request());
    assert.equal(result.status, 502);
    assert.equal((await result.json()).code, 'invalid_response');
  }
  assert.equal(validateAnalyzedFoods({ foods: [{ ...validFood, estimatedGrams: Infinity }] }), null);
  assert.equal(validateAnalyzedFoods({ foods: [{ ...validFood, confidence: {} }] }), null);
});

test('provider errors return safe messages and status without raw error data', async () => {
  for (const [status, expectedStatus, code] of [[401,401,'authentication_error'], [403,403,'permission_denied'], [400,400,'provider_request_error'], [404,503,'model_unavailable'], [429,429,'rate_limited'], [500,502,'provider_unavailable']] as const) {
    const response = await setup({ fetch: async () => new Response('private upstream content secret-key', { status }) }).POST(request());
    assert.equal(response.status, expectedStatus);
    const body = await response.text();
    assert.equal(JSON.parse(body).code, code);
    assert.equal(body.includes('secret-key'), false);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '1');
  }
  const response = await setup({ fetch: async () => { throw new Error('private network details'); } }).POST(request());
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('private network'), false);
});

test('provider response stream is bounded', async () => {
  const response = await setup({ fetch: async () => new Response('x'.repeat(256 * 1024 + 1)) }).POST(request());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'invalid_response');
});

test('provider timeout is bounded, localized, and aborts the outgoing request', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0;
  let fetchStarted!: () => void;
  const started = new Promise<void>(resolve => { fetchStarted = resolve; });
  let signal: AbortSignal | undefined;
  const handler = setup({ timeoutMs: 50, now: () => time, fetch: async (_, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise<Response>((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      fetchStarted();
    });
  } });
  const pending = handler.POST(request({ locale: 'ar' }));
  await started;
  assert.equal(signal?.aborted, false);
  time = 50;
  context.mock.timers.tick(50);
  const response = await pending;
  assert.equal(response.status, 504);
  const body = await response.json();
  assert.equal(body.code, 'timeout');
  assert.match(body.message, /وقتًا طويلًا/);
  assert.equal(signal?.aborted, true);
});

test('provider response body remains inside the timeout after headers arrive', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0;
  let bodyOpened!: () => void;
  const opened = new Promise<void>(resolve => { bodyOpened = resolve; });
  let signal: AbortSignal | undefined;
  let closed = false;
  const handler = setup({ timeoutMs: 50, now: () => time, fetch: async (_, init) => {
    signal = init?.signal as AbortSignal;
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener('abort', () => { closed = true; controller.error(new DOMException('aborted', 'AbortError')); });
      },
      // Zero buffering means this hook runs only once the handler reads the body.
      pull() { bodyOpened(); },
    }, { highWaterMark: 0 }));
  } });
  const pending = handler.POST(request());
  await opened;
  assert.equal(closed, false);
  assert.equal(signal?.aborted, false);
  time = 50;
  context.mock.timers.tick(50);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal(closed, true);
  assert.equal(signal?.aborted, true);
});

test('incoming cancellation aborts the provider and releases the concurrency permit', async () => {
  const incoming = new AbortController();
  const limits = createAnalysisLimits();
  let providerSignal: AbortSignal | undefined;
  const handler = setup({ limits, fetch: async (_, init) => {
    providerSignal = init?.signal as AbortSignal;
    return new Promise<Response>((_, reject) => providerSignal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  } });
  const pending = handler.POST(request({ signal: incoming.signal }));
  while (!providerSignal) await new Promise(resolve => setTimeout(resolve, 1));
  incoming.abort();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.equal((await response.json()).code, 'request_aborted');
  assert.equal(providerSignal.aborted, true);
  assert.equal(limits.active, 0);
});

test('10 per minute cap is shared between handlers using the same process state', async () => {
  const limits = createAnalysisLimits();
  let time = 1000;
  let calls = 0;
  const options = { limits, now: () => time, fetch: async () => { calls++; return provider(); } };
  const first = setup(options); const second = setup(options);
  for (let index = 0; index < 10; index++) assert.equal((await (index % 2 ? first : second).POST(request())).status, 200);
  assert.equal((await second.POST(request())).status, 429);
  assert.equal(calls, 10);
  time += 60_001;
  assert.equal((await first.POST(request())).status, 200);
  assert.equal(calls, 11);
});

test('only two provider requests can be active and permits are released', async () => {
  const limits = createAnalysisLimits();
  const release: (() => void)[] = [];
  const handler = setup({ limits, fetch: () => new Promise<Response>(resolve => release.push(() => resolve(provider()))) });
  const first = handler.POST(request()); const second = handler.POST(request());
  while (release.length < 2) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await handler.POST(request())).status, 429);
  release.forEach(resolve => resolve());
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  assert.equal(limits.active, 0);
});

function upstreamError(status: number, reason?: string, rpcStatus?: string, headers?: HeadersInit) {
  return Response.json({ error: { code: status, status: rpcStatus, message: 'PRIVATE upstream message must never escape',
    details: reason ? [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason }] : [] } }, { status, headers });
}

test('description mode sends only text with explicit no-invented-portions instructions', async () => {
  let payload: Record<string, unknown> | undefined;
  const handler = setup({ fetch: async (_, init) => { payload = JSON.parse(String(init?.body)); return provider(); } });
  const response = await handler.POST(request({ mode: 'description', description: '150 g cooked rice' })); assert.equal(response.status, 200);
  const sent = payload as { contents: { parts: { text: string }[] }[]; systemInstruction: { parts: { text: string }[] }; generationConfig: { responseJsonSchema: { required: string[] } } };
  assert.equal(sent.contents[0].parts.length, 1); assert.match(sent.contents[0].parts[0].text, /150 g cooked rice/);
  assert.equal(JSON.stringify(sent).includes('inlineData'), false);
  assert.match(sent.systemInstruction.parts[0].text, /Do not invent serving sizes/);
  assert.match(sent.systemInstruction.parts[0].text, /Do not produce nutrition estimates until quantities are specified/);
  assert.deepEqual(sent.generationConfig.responseJsonSchema.required, ['foods', 'clarification']);
});

test('text mode requires a description and rejects image uploads or duplicate mode fields', async () => {
  const handler = setup();
  for (const invalid of [request({ mode: 'description' }), request({ mode: 'description', description: '   ' }),
    request({ mode: 'description', description: 'rice', image: new File([jpeg], 'food.jpg', { type: 'image/jpeg' }) }),
    request({ mode: 'unknown' })]) assert.equal((await handler.POST(invalid)).status, 400);
  const duplicate = new FormData(); duplicate.append('mode', 'description'); duplicate.append('mode', 'photo'); duplicate.append('description', 'rice');
  assert.equal((await handler.POST(new Request('http://localhost:3000/api/food-analysis', { method: 'POST', body: duplicate }))).status, 400);
  assert.equal(handler.calls(), 0);
});

test('missing portions produce localized clarification without fabricated foods', async () => {
  const question = { question: 'How many grams of rice did you eat?', questionAr: 'كم غرامًا من الأرز أكلت؟' };
  const handler = setup({ fetch: async () => provider([], question) });
  for (const locale of ['ar', 'en']) {
    const response = await handler.POST(request({ mode: 'description', description: 'rice', locale }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'clarification', message: locale === 'ar' ? question.questionAr : question.question });
  }
  const conflicting = setup({ fetch: async () => provider([validFood], question) });
  assert.equal((await conflicting.POST(request({ mode: 'description', description: 'rice' }))).status, 502);
});

test('unknown and nonvision Gemini models cannot receive images', async () => {
  for (const model of ['text-embedding-004', 'arbitrary-private-value', 'gemini-unreviewed-preview']) {
    const handler = setup({ env: () => ({ GEMINI_API_KEY: 'test', GEMINI_FOOD_MODEL: model }) });
    const response = await handler.POST(request()); assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'model_not_supported'); assert.equal(handler.calls(), 0);
  }
  for (const model of ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-2.5-flash-lite']) {
    assert.equal((await setup({ env: () => ({ GEMINI_API_KEY: 'test', GEMINI_FOOD_MODEL: model }) }).POST(request())).status, 200);
  }
});

test('zero and exhausted daily Gemini quotas are never retried', async () => {
  for (const violation of [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel', quotaValue: '0' },
    { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }]) {
    let calls = 0; const sleeps: number[] = [];
    const handler = setup({ fetch: async () => { calls++; return Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'PRIVATE quota details',
      details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [violation] },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '5s' }] } }, { status: 429, headers: { 'Retry-After': '5' } }); },
      sleep: async delay => { sleeps.push(delay); } });
    const response = await handler.POST(request({ locale: 'ar' })); const result = await response.json();
    assert.equal(response.status, 429); assert.equal(result.code, 'insufficient_quota'); assert.equal(result.retryable, false);
    assert.equal(response.headers.has('retry-after'), false); assert.equal('retryAfterSeconds' in result, false);
    assert.equal(calls, 1); assert.deepEqual(sleeps, []); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.match(result.requestId, /^[a-f0-9-]{36}$/);
  }
});

test('Gemini invalid API keys including HTTP400 are not retried', async () => {
  for (const status of [400, 401, 429]) {
    let calls = 0; const sleeps: number[] = [];
    const handler = setup({ fetch: async () => { calls++; return upstreamError(status, 'API_KEY_INVALID', undefined, { 'Retry-After': '5' }); }, sleep: async delay => { sleeps.push(delay); } });
    const response = await handler.POST(request()); const result = await response.json();
    assert.equal(response.status, 401); assert.equal(result.code, 'authentication_error'); assert.equal(result.retryable, false);
    assert.equal(response.headers.has('retry-after'), false); assert.equal(calls, 1); assert.deepEqual(sleeps, []);
  }
});

test('transient rate limits retry at most twice with exponential backoff and exact attempt counts', async () => {
  let time = 1000; let calls = 0; const sleeps: number[] = []; const starts: number[] = [];
  const limits = createAnalysisLimits();
  const handler = setup({ limits, now: () => time, sleep: async delay => { sleeps.push(delay); time += delay; }, fetch: async () => {
    calls++; starts.push(time); return upstreamError(429, 'RATE_LIMIT_EXCEEDED');
  } });
  const response = await handler.POST(request()); const result = await response.json();
  assert.equal(calls, 3); assert.deepEqual(sleeps, [500, 1000]); assert.deepEqual(starts, [1000, 1500, 2500]);
  assert.deepEqual(limits.starts, starts); assert.equal(limits.active, 0);
  assert.equal(response.status, 429); assert.equal(result.code, 'rate_limited'); assert.equal(result.retryable, true);
});

test('Retry-After seconds and HTTP-date are respected without retrying early', async () => {
  for (const retryAfter of ['2', new Date(4000).toUTCString()]) {
    let time = 1000; let calls = 0; const sleeps: number[] = []; const attempts: number[] = [];
    const handler = setup({ now: () => time, sleep: async delay => { sleeps.push(delay); time += delay; }, fetch: async () => {
      attempts.push(time); calls++; return calls === 1 ? upstreamError(429, 'RATE_LIMIT_EXCEEDED', undefined, { 'Retry-After': retryAfter }) : provider();
    } });
    assert.equal((await handler.POST(request())).status, 200);
    const expected = retryAfter === '2' ? 2000 : 3000;
    assert.deepEqual(sleeps, [expected]); assert.deepEqual(attempts, [1000, 1000 + expected]);
  }
});

test('long Retry-After returns its real delay rather than retrying beyond the overall budget', async () => {
  let calls = 0; const sleeps: number[] = [];
  const handler = setup({ now: () => 1000, fetch: async () => { calls++; return upstreamError(429, 'RATE_LIMIT_EXCEEDED', undefined, { 'Retry-After': '60' }); }, sleep: async delay => { sleeps.push(delay); } });
  const response = await handler.POST(request()); const result = await response.json();
  assert.equal(calls, 1); assert.deepEqual(sleeps, []); assert.equal(response.status, 429);
  assert.equal(result.retryAfterSeconds, 60); assert.equal(response.headers.get('retry-after'), '60');
});

test('transport failures and selected 5xx can recover, while non-transient provider errors do not retry', async () => {
  for (const initial of ['network', 500, 502, 503, 504] as const) {
    let calls = 0; const sleeps: number[] = [];
    const handler = setup({ fetch: async () => { calls++; if (calls === 1) { if (initial === 'network') throw new TypeError('PRIVATE connection details'); return upstreamError(initial); } return provider(); },
      sleep: async delay => { sleeps.push(delay); } });
    assert.equal((await handler.POST(request())).status, 200); assert.equal(calls, 2); assert.deepEqual(sleeps, [500]);
  }
  for (const status of [400, 401, 403, 404, 501]) {
    let calls = 0;
    const response = await setup({ fetch: async () => { calls++; return upstreamError(status); } }).POST(request());
    assert.equal(calls, 1); assert.equal((await response.json()).retryable, false);
  }
});

test('per-attempt timeouts may retry within the single overall deadline', async () => {
  let calls = 0;
  const handler = setup({ timeoutMs: 5000, attemptTimeoutMs: 5, fetch: async (_, init) => {
    calls++; if (calls > 1) return provider();
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  } });
  assert.equal((await handler.POST(request())).status, 200); assert.equal(calls, 2);
});

test('local quota counts every retry and reports the precise remaining window', async () => {
  let time = 1000; let calls = 0; const limits = createAnalysisLimits(); limits.starts = new Array(9).fill(0);
  const handler = setup({ limits, now: () => time, fetch: async () => { calls++; return upstreamError(429, 'RATE_LIMIT_EXCEEDED'); }, sleep: async delay => { time += delay; } });
  const response = await handler.POST(request()); const result = await response.json();
  assert.equal(calls, 1); assert.equal(result.code, 'local_rate_limited'); assert.equal(result.retryAfterSeconds, 59);
  assert.equal(response.headers.get('retry-after'), '59'); assert.equal(limits.starts.length, 10); assert.equal(limits.active, 0);
});

test('active concurrency slot remains held throughout backoff', async () => {
  const limits = createAnalysisLimits(); let calls = 0; const sleepers: (() => void)[] = [];
  const handler = setup({ limits, fetch: async () => { calls++; return calls <= 2 ? upstreamError(429, 'RATE_LIMIT_EXCEEDED') : provider(); },
    sleep: () => new Promise<void>(resolve => sleepers.push(resolve)) });
  const first = handler.POST(request()); const second = handler.POST(request());
  while (sleepers.length < 2) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(limits.active, 2);
  const blocked = await handler.POST(request()); assert.equal((await blocked.json()).code, 'local_rate_limited'); assert.equal(calls, 2);
  sleepers.forEach(resolve => resolve()); assert.equal((await first).status, 200); assert.equal((await second).status, 200); assert.equal(limits.active, 0);
});

test('safe diagnostics correlate requests without logging user data, keys or provider messages/codes', async () => {
  const entries: unknown[] = []; let calls = 0;
  const handler = setup({ env: () => ({ GEMINI_API_KEY: 'PRIVATE_SERVER_KEY' }), log: entry => { entries.push(entry); }, fetch: async () => {
    calls++; return calls === 1 ? upstreamError(429, 'PRIVATE_UNKNOWN_CODE', undefined, { 'X-Request-Id': 'req_safe123' }) : provider();
  } });
  await handler.POST(request({ mode: 'description', description: 'PRIVATE_USER_DESCRIPTION 150g rice' }));
  const encoded = JSON.stringify(entries);
  for (const forbidden of ['PRIVATE_SERVER_KEY', 'PRIVATE_USER_DESCRIPTION', 'PRIVATE_UNKNOWN_CODE', 'PRIVATE upstream', 'base64', 'per100g']) assert.equal(encoded.includes(forbidden), false);
  assert.equal(entries.length, 2);
  const logs = entries as { requestId: string; mode: string; model: string; code: string; attempt: number; retryDelayMs?: number; providerRequestId?: string }[];
  assert.equal(logs[0].requestId, logs[1].requestId); assert.equal(logs[0].mode, 'description'); assert.equal(logs[0].model, 'gemini-flash-latest');
  assert.equal(logs[0].code, 'rate_limited'); assert.equal(logs[0].attempt, 1); assert.equal(logs[0].retryDelayMs, 500); assert.equal(logs[0].providerRequestId, 'req_safe123');
  assert.equal(logs[1].code, 'success'); assert.equal(logs[1].attempt, 2);
  const unsafe: unknown[] = [];
  await setup({ log: entry => unsafe.push(entry), fetch: async () => upstreamError(401, 'API_KEY_INVALID', undefined, { 'X-Request-Id': 'contains spaces private' }) }).POST(request());
  assert.equal(JSON.stringify(unsafe).includes('contains spaces private'), false);
});

test('authentication and permission statuses never retry broken, hanging, or oversized response bodies', async () => {
  for (const status of [401, 403]) {
    for (const kind of ['broken', 'hanging', 'oversized']) {
      let calls = 0; let cancelled = false; const sleeps: number[] = [];
      const handler = setup({ attemptTimeoutMs: 5, fetch: async () => {
        calls++;
        const body = kind === 'oversized' ? new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(300 * 1024)); }, cancel() { cancelled = true; } })
          : new ReadableStream<Uint8Array>({ start(controller) { if (kind === 'broken') controller.error(new Error('PRIVATE error')); }, cancel() { cancelled = true; } });
        return new Response(body, { status });
      }, sleep: async delay => { sleeps.push(delay); } });
      const response = await handler.POST(request()); const result = await response.json();
      assert.equal(response.status, status); assert.equal(result.code, status === 401 ? 'authentication_error' : 'permission_denied');
      assert.equal(result.retryable, false); assert.equal(calls, 1); assert.deepEqual(sleeps, []);
      if (kind !== 'broken') assert.equal(cancelled, true);
    }
  }
});

test('generic HTTP400 schema/input failures are distinct from known unsupported models and images', async () => {
  for (const [code, expected] of [['INVALID_JSON_SCHEMA', 'provider_request_error'], ['MODEL_NOT_SUPPORTED', 'model_not_supported']]) {
    let calls = 0;
    const handler = setup({ fetch: async () => { calls++; return upstreamError(400, code); } });
    const response = await handler.POST(request()); assert.equal(response.status, 400);
    assert.equal((await response.json()).code, expected); assert.equal(calls, 1);
  }
  for (const hanging of [false, true]) {
    let calls = 0;
    const handler = setup({ attemptTimeoutMs: 5, fetch: async (_, init) => {
      calls++;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        if (hanging) init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
        else controller.error(new Error('broken error body'));
      } }), { status: 400 });
    } });
    const response = await handler.POST(request()); assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'provider_request_error'); assert.equal(calls, 1);
  }
});

test('safe diagnostics preserve numeric upstream status for translated failures', async () => {
  const entries: { upstreamStatus?: number; status: number }[] = [];
  await setup({ fetch: async () => upstreamError(500), log: entry => entries.push(entry) }).POST(request());
  assert.equal(entries.length, 3);
  assert.equal(entries[0].status, 502); assert.equal(entries[0].upstreamStatus, 500);
});

test('other terminal upstream statuses remain nonretryable when their bodies fail or hang', async () => {
  for (const status of [422, 501]) {
    for (const hanging of [false, true]) {
      let calls = 0;
      const handler = setup({ attemptTimeoutMs: 5, fetch: async (_, init) => {
        calls++;
        return new Response(new ReadableStream<Uint8Array>({ start(controller) {
          if (hanging) init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
          else controller.error(new Error('private broken body'));
        } }), { status });
      } });
      const response = await handler.POST(request()); const result = await response.json();
      assert.equal(result.retryable, false); assert.equal(calls, 1);
    }
  }
});

test('only GEMINI_API_KEY enables analysis; unrelated or legacy credentials never do', async () => {
  for (const otherEnvironment of [{ OPENAI_API_KEY: 'legacy-test-placeholder' }, { GOOGLE_API_KEY: 'ambient-test-placeholder' }]) {
    const handler = setup({ env: () => ({ ...otherEnvironment, GEMINI_API_KEY: undefined }) });
    assert.deepEqual(await (await handler.GET()).json(), { available: false, provider: 'gemini' });
    assert.equal((await handler.POST(request())).status, 503);
    assert.equal(handler.calls(), 0);
  }
});

test('native SDK uses the explicit Developer API key and endpoint despite ambient Google settings', async () => {
  const names = ['GOOGLE_API_KEY', 'GOOGLE_GENAI_USE_ENTERPRISE', 'GOOGLE_GENAI_USE_VERTEXAI', 'GOOGLE_GEMINI_BASE_URL'];
  const previous = new Map(names.map(name => [name, process.env[name]]));
  try {
    process.env.GOOGLE_API_KEY = 'ambient-test-placeholder'; process.env.GOOGLE_GENAI_USE_ENTERPRISE = 'true'; process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
    process.env.GOOGLE_GEMINI_BASE_URL = 'https://untrusted.invalid';
    let calls = 0;
    const handler = setup({ fetch: async (url, init) => {
      calls++; assert.equal(new URL(String(url)).origin, 'https://generativelanguage.googleapis.com');
      assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'test-only-placeholder');
      assert.equal(new Headers(init?.headers).has('authorization'), false); return provider();
    } });
    assert.equal((await handler.POST(request())).status, 200); assert.equal(calls, 1);
  } finally {
    for (const [name, value] of previous) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});

test('SDK boundary disables retries, automatic continuation, function calls and non-Developer API credentials', async () => {
  let calls = 0;
  const handler = setup({ generate: async (parameters, options) => {
    calls++; assert.equal(options.apiKey, 'test-only-placeholder'); assert.equal(options.vertexai, false); assert.equal(options.enterprise, false);
    assert.equal(options.httpOptions?.retryOptions?.attempts, 1); assert.equal(parameters.config?.httpOptions?.retryOptions?.attempts, 1);
    assert.equal(parameters.config?.automaticContinuation, false); assert.equal(parameters.config?.automaticFunctionCalling?.disable, true);
    assert.equal(parameters.config?.responseMimeType, 'application/json'); assert.ok(parameters.config?.responseJsonSchema);
    assert.ok(parameters.config?.abortSignal instanceof AbortSignal); assert.ok((parameters.config?.httpOptions?.timeout ?? 0) <= 15_000);
    assert.equal(options.googleAuthOptions, undefined); assert.equal(options.project, undefined); assert.equal(options.location, undefined);
    return provider().json();
  } });
  assert.equal((await handler.POST(request())).status, 200); assert.equal(calls, 1);
});

test('native SDK does not perform an automatic continuation request', async () => {
  let calls = 0;
  const handler = setup({ fetch: async () => { calls++; return Response.json({ candidates: [{ finishReason: 'CONTINUATION', content: { role: 'model', parts: [{ text: '{}' }] } }] }); } });
  const response = await handler.POST(request()); assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'invalid_response'); assert.equal(calls, 1);
});

test('Gemini prompt blocks and safety refusals never become invented nutrition estimates', async () => {
  for (const payload of [{ promptFeedback: { blockReason: 'SAFETY' } }, { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] }]) {
    let calls = 0;
    const response = await setup({ fetch: async () => { calls++; return Response.json(payload); } }).POST(request({ locale: 'ar' }));
    const result = await response.json(); assert.equal(result.code, 'content_blocked'); assert.equal(result.retryable, false);
    assert.equal('foods' in result, false); assert.equal(calls, 1); assert.equal(JSON.stringify(result).includes('SAFETY'), false);
  }
});

test('Gemini RetryInfo and positive per-minute QuotaFailure are transient and respect retry delay', async () => {
  let time = 1000; let calls = 0; const sleeps: number[] = []; const attempts: number[] = [];
  const handler = setup({ now: () => time, sleep: async delay => { sleeps.push(delay); time += delay; }, fetch: async () => {
    attempts.push(time); calls++;
    return calls === 1 ? Response.json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [
      { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaValue: '15' }] },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '2.5s' },
    ] } }, { status: 429, headers: { 'Retry-After': '2' } }) : provider();
  } });
  assert.equal((await handler.POST(request())).status, 200); assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2500]); assert.deepEqual(attempts, [1000, 3500]);
});

test('typed SDK ApiError JSON is inspected safely without needing a raw fetch Response', async () => {
  let calls = 0; const logs: unknown[] = [];
  const handler = setup({ generate: async () => {
    calls++; throw new ApiError({ status: 400, message: JSON.stringify({ error: { code: 400, message: 'PRIVATE raw Gemini error with URL and key',
      details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }) });
  }, log: entry => logs.push(entry) });
  const response = await handler.POST(request()); const result = await response.json();
  assert.equal(response.status, 401); assert.equal(result.code, 'authentication_error'); assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false); assert.equal(JSON.stringify(logs).includes('PRIVATE'), false);
});
