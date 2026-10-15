import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisLimits, createFoodAnalysisHandlers, MAX_IMAGE_BYTES, validateAnalyzedFoods } from './analysis.server';

const validFood = { label: 'Rice', labelAr: 'أرز', estimatedGrams: 150, per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }, confidence: 'medium' };
const jpeg = Uint8Array.from([255, 216, 255, 224, 0, 0, 255, 217]);
function request(options: { locale?: string; description?: string; image?: File; origin?: string; site?: string; signal?: AbortSignal; url?: string; host?: string; forwardedHost?: string; forwardedProto?: string } = {}) {
  const form = new FormData();
  form.set('image', options.image ?? new File([jpeg], 'rice.jpg', { type: 'image/jpeg' }));
  form.set('locale', options.locale ?? 'en');
  if (options.description !== undefined) form.set('description', options.description);
  return new Request(options.url ?? 'http://localhost:3000/api/food-analysis', { method: 'POST', body: form, signal: options.signal, headers: {
    ...(options.origin === undefined ? {} : { Origin: options.origin }), ...(options.site === undefined ? {} : { 'Sec-Fetch-Site': options.site }),
    ...(options.host === undefined ? {} : { Host: options.host }),
    ...(options.forwardedHost === undefined ? {} : { 'X-Forwarded-Host': options.forwardedHost }),
    ...(options.forwardedProto === undefined ? {} : { 'X-Forwarded-Proto': options.forwardedProto }),
  } });
}
function provider(foods: unknown = [validFood]) {
  return Response.json({ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify({ foods }) }] }] });
}
function setup(overrides: Parameters<typeof createFoodAnalysisHandlers>[0] = {}) {
  let calls = 0;
  const handlers = createFoodAnalysisHandlers({ env: () => ({ OPENAI_API_KEY: 'test-only-placeholder' }), limits: createAnalysisLimits(),
    fetch: async () => { calls++; return provider(); }, ...overrides });
  return { ...handlers, calls: () => calls };
}

test('availability is key presence only, never exposes credentials, and is not cached', async () => {
  const configured = await setup().GET();
  assert.deepEqual(await configured.json(), { available: true, provider: 'openai' });
  assert.equal(configured.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await (await setup({ env: () => ({ OPENAI_API_KEY: ' ' }) }).GET()).json(), { available: false, provider: 'openai' });
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

test('valid image sends Responses structured schema, no persistence, and returns reviewed estimates', async () => {
  let sent: Record<string, unknown> | undefined;
  const handler = setup({ fetch: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-only-placeholder');
    sent = JSON.parse(String(init?.body));
    return provider();
  } });
  const response = await handler.POST(request({ description: 'Rice with lunch', origin: 'http://localhost:3000' }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.foods, [validFood]);
  assert.match(result.message, /Review/);
  assert.equal(sent?.model, 'gpt-4.1-mini');
  assert.equal(sent?.store, false);
  const body = sent as { input: { content: { type: string; image_url?: string; detail?: string; text?: string }[] }[]; text: { format: { type: string; strict: boolean; schema: unknown } } };
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.match(body.input[0].content[1].image_url ?? '', /^data:image\/jpeg;base64,/);
  assert.equal(body.input[0].content[1].detail, 'high');
  assert.match(body.input[0].content[0].text ?? '', /Rice with lunch/);
});

test('optional configured model is used on the server', async () => {
  const handler = setup({ env: () => ({ OPENAI_API_KEY: 'test', OPENAI_FOOD_MODEL: 'gpt-4.1' }), fetch: async (_, init) => {
    assert.equal(JSON.parse(String(init?.body)).model, 'gpt-4.1'); return provider();
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
    () => Response.json({ status: 'incomplete', output: [] }),
    () => Response.json({ status: 'completed', output: [{ type: 'message', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] }),
    () => Response.json({ status: 'completed', output: [] }),
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
  for (const [status, expectedStatus, code] of [[401,503,'provider_configuration'], [403,503,'provider_configuration'], [400,503,'provider_configuration'], [404,503,'provider_configuration'], [429,429,'rate_limited'], [500,502,'provider_unavailable']] as const) {
    const response = await setup({ fetch: async () => new Response('private upstream content secret-key', { status }) }).POST(request());
    assert.equal(response.status, expectedStatus);
    const body = await response.text();
    assert.equal(JSON.parse(body).code, code);
    assert.equal(body.includes('secret-key'), false);
    if (status === 429) assert.equal(response.headers.get('retry-after'), '60');
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

test('provider timeout is bounded, localized, and aborts the outgoing request', async () => {
  let signal: AbortSignal | undefined;
  const handler = setup({ timeoutMs: 5, fetch: async (_, init) => {
    signal = init?.signal as AbortSignal;
    return new Promise<Response>((_, reject) => signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  } });
  const response = await handler.POST(request({ locale: 'ar' }));
  assert.equal(response.status, 504);
  const body = await response.json();
  assert.equal(body.code, 'timeout');
  assert.match(body.message, /وقتًا طويلًا/);
  assert.equal(signal?.aborted, true);
});

test('provider response body remains inside the timeout after headers arrive', async () => {
  let signal: AbortSignal | undefined;
  let closed = false;
  const handler = setup({ timeoutMs: 5, fetch: async (_, init) => {
    signal = init?.signal as AbortSignal;
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      signal?.addEventListener('abort', () => { closed = true; controller.error(new DOMException('aborted', 'AbortError')); });
    } }));
  } });
  const response = await handler.POST(request());
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
