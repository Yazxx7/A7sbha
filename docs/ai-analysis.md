# Gemini food analysis: configuration, quotas, and diagnostics

The live feature uses the official `@google/genai` SDK on the Next.js server. `GoogleGenAI.models.generateContent` sends requests to the Gemini Developer API using only the server's `GEMINI_API_KEY`. There are no OpenAI API requests, provider fallback, or fabricated sample results. The local food catalog remains independent of AI.

## Configuration and free-tier access

Create a key in [Google AI Studio](https://aistudio.google.com/apikey), then configure `.env.local` in the project root:

```env
GEMINI_API_KEY=your_private_key_here
GEMINI_FOOD_MODEL=gemini-flash-latest
```

Do not commit `.env.local`, send the key through the interface, or prefix it with `NEXT_PUBLIC_`. Restart Next.js after changing environment variables. After pulling this update, run `npm ci` to install the official SDK.

`gemini-flash-latest` is the current Flash alias used by [Google's official JavaScript SDK examples](https://github.com/googleapis/js-genai/blob/main/README.md). Google's [current Generate Content cookbook](https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_Generate_Content.ipynb) demonstrates Flash image input and structured JSON. A fixed model such as `gemini-2.5-flash` can be selected through `GEMINI_FOOD_MODEL` when enabled for your project. A model name being recognized by this app does not guarantee that Google currently enables it for your account.

Google documents a [Gemini API-key free tier for Flash](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/quota-and-pricing.md), but limits vary by model, project, region, and account tier. The CLI's numerical quotas do not describe this application's API quota. Check [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) and [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) for your project. Free access is limited, not unlimited. The app does not enable billing or silently move requests to a paid provider/model.

The SDK is pinned to major version 2 to retain the application's Node.js 20.9+ compatibility. SDK-internal retries and automatic continuation/function calling are explicitly disabled; the server owns the bounded retry policy. The SDK is not imported by any browser component. Existing OpenAI key/model variables are ignored.

## Photo and description requests

Both modes use multipart `POST /api/food-analysis` with `locale=en` or `locale=ar`:

- `mode=photo`: requires one JPEG/PNG/WebP `image` up to 5 MiB; `description` is optional, up to 2,000 characters. The browser re-encodes a smaller JPEG; the server sends it to Gemini as inline image data.
- `mode=description`: requires a nonempty `description` up to 2,000 characters. Image fields are rejected, and a meal's local photo attachment stays on this device.
- An omitted mode defaults to photo for compatibility with existing clients.

Gemini is instructed to produce JSON matching the supplied response schema. The server independently validates every English/Arabic food name, gram estimate, confidence, and per-100-g calorie/protein/carbohydrate/fat value before responding. Negative, non-finite, unreasonable, empty, blocked, truncated, or malformed output cannot become a successful estimate. A non-food image can return an honest empty food list.

The schema includes a nullable bilingual clarification question. Description analysis asks for missing quantities instead of inventing a serving. A clarification response contains no foods and does not change nutrition totals. All successful values remain estimates; photos cannot measure exact weights or hidden ingredients. Review/edit the quantities and nutrients, then choose **Add reviewed foods → Save meal**. Nothing is automatically added or saved.

New AI foods record `source: 'gemini'`. Existing version-one backups with `source: 'openai'` remain readable/editable and keep their original provenance; no legacy service is called. Mixed local/Gemini/legacy meals retain the same portion calculations through reload, edit, import, and export.

Photos/descriptions are sent only after an explicit Analyze action. The API never sends the profile or full journal. No uploaded content or credentials are written to application logs. Google's data-use terms apply to data sent to its API; the app does not claim provider-side zero retention.

## Useful errors

| Error code | Meaning and action |
| --- | --- |
| `not_configured` | Set `GEMINI_API_KEY` on the server and restart. Availability checks report key presence only, not account access or remaining quota. |
| `authentication_error` | Google rejected the key. Check its validity and API restrictions in AI Studio/Google Cloud. |
| `permission_denied` | Check Gemini Developer API access, project permissions, and regional/account eligibility. |
| `model_not_supported` | Choose a model supported for image input and structured JSON. No incompatible image request is sent. |
| `model_unavailable` | Google reports that the configured model is not found or enabled for this project/API version. Check the model setting. |
| `local_rate_limited` | The app's shared process limit was reached. Wait for the returned delay. |
| `rate_limited` | Google temporarily throttled requests. Respect the displayed retry delay and reduce request frequency. |
| `insufficient_quota` | The project has exhausted or zero eligible quota. Check AI Studio quota/model eligibility and daily limits. Repeated clicks cannot restore quota. |
| `provider_request_error` | Google rejected a request for another nonretryable input/configuration reason. Use the sanitized diagnostics to investigate. |
| `network_error` / `timeout` | Check server outbound connectivity or retry later. Cancellation stops further client work/retries. |
| `provider_unavailable` | A temporary upstream service failure occurred; try later. |
| `content_blocked` | Gemini declined to process the content. Try another food photo or description; no estimates are added. |
| `invalid_response` | The result was blocked, incomplete, malformed, or invalid. No fallback nutrition is created. |
| `request_aborted` | The user cancelled or changed the input. No result is added. |

Errors are localized in Arabic and English. Keys, full SDK errors, request URLs containing credentials, and provider error messages are never returned to the browser or logged. SDK error bodies are examined only for recognized status/reason/quota information and then discarded.

## Retry and usage policy

At most **3 provider attempts** are allowed per analysis. Retryable rate/service/transport failures use exponential waits of **500 ms**, then **1,000 ms**, respecting a longer Google `Retry-After` header or structured retry delay. Known authentication, permission, permanent/exhausted-quota, model, and input errors are not automatically retried. A delay that cannot fit within the request budget is returned to the user instead of retrying early.

Each attempt has a **15-second** limit and shares a **35-second overall deadline**, including response processing and waits. Cancelling the browser request aborts the SDK request and future retries, but does not guarantee that Google cancels processing or refunds usage already incurred. The browser never automatically resubmits; it displays a countdown and requires an explicit click.

The process-local guard allows 10 outbound attempts/minute and 2 concurrent analyses; automatic retries also consume attempts, and the concurrency slot is retained during backoff. Limits reset on restart and do not synchronize across replicas. Public deployments should use authenticated access and shared quotas to control API use. A reverse proxy must overwrite trusted `X-Forwarded-Host` and `X-Forwarded-Proto` values so same-origin checks work behind Next's internal listener.

## Safe diagnosis

Run on the machine configured with your Gemini key:

```sh
npm run diagnose:ai
```

The command loads Next.js environment files and sends one fixed sample description through the real SDK integration, including bounded retries when applicable. It consumes quota and may be billed on a paid project. Without a key, it exits without a provider request. It reports only HTTP status, application classification, retry information, a generated diagnostic ID, and a food count on success. It never prints the key, provider error body, or food contents.

Server diagnostics contain only safe request/attempt IDs, a recognized model, mode, numeric statuses, allowlisted classifications, and timings/retry delays. Images, descriptions, nutrition results, profiles, IP addresses, SDK messages/stacks, and credentials are excluded. No Gemini key is configured in this cloud workspace, so live project-specific availability and free quota cannot be confirmed here. Automated tests inject SDK/HTTP boundary responses; production always uses the real Gemini API.
