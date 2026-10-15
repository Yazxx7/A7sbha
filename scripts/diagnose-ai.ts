import nextEnv from '@next/env';
import { createFoodAnalysisHandlers } from '../src/lib/analysis.server';

// Load Next's server environment without printing filenames or environment values.
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production', { info() {}, error() {} });

async function main() {
  const handlers = createFoodAnalysisHandlers();
  const availability = await (await handlers.GET()).json();
  if (!availability.available) {
    console.log('AI diagnosis: OPENAI_API_KEY is not configured in this server environment.');
    process.exitCode = 1;
    return;
  }

  console.log('Checking the configured OpenAI account with one fixed sample meal. API usage may be billed.');
  const form = new FormData();
  form.set('mode', 'description');
  form.set('description', '100 grams of cooked white rice.');
  form.set('locale', 'en');
  const response = await handlers.POST(new Request('http://localhost/api/food-analysis', { method: 'POST', body: form }));
  const result = await response.json();
  // Print only our own sanitized classification, never the provider body or input.
  console.log(JSON.stringify({
    httpStatus: response.status,
    status: result.status,
    code: result.code,
    retryable: result.retryable,
    retryAfterSeconds: result.retryAfterSeconds,
    requestId: result.requestId,
    ...(result.status === 'success' ? { foodCount: result.foods.length } : {}),
  }, null, 2));
  if (result.status !== 'success') process.exitCode = 1;
}

main().catch(() => {
  console.error('AI diagnosis could not complete. Check the sanitized server diagnostics.');
  process.exitCode = 1;
});
