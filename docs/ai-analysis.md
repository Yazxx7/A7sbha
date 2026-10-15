# AI analysis: errors, retries, and account diagnosis

The live feature always calls `https://api.openai.com/v1/responses` from the Next.js server with its existing `OPENAI_API_KEY`. It never substitutes sample food results when OpenAI fails. Manual catalog lookup remains independent.

## Why the original Arabic error was misleading

The original server translated both its process-wide limit (10 requests per minute, 2 concurrent analyses) and **all** OpenAI HTTP 429 responses to `تحليل الصور مشغول. انتظر دقيقة ثم حاول مجددًا.` It cancelled the provider response without reading its structured error code. This concealed the difference between transient rate limiting and `insufficient_quota`, which requires an API account/billing change. It also grouped rejected credentials and inaccessible models into one configuration error, and had no safe request diagnostics.

The original message cannot establish the underlying account condition after the fact. No existing request logs or server key are available in this cloud checkout, so the user's live balance and original provider response have not been inspected. The application defects are reproduced in automated provider-response tests and corrected; account-level diagnosis requires running the updated integration where the real key is configured.

## Messages and next steps

| API error code | Meaning | Action | Automatic retries |
| --- | --- | --- | --- |
| `not_configured` | The server has no key | Set the existing `OPENAI_API_KEY` in the server environment and restart | None |
| `local_rate_limited` | This app's shared process limit or concurrency guard was reached | Wait for the returned delay | None; no provider call is made |
| `rate_limited` | OpenAI temporarily throttled requests | Respect the displayed delay and reduce request rate | Bounded retries within the request deadline |
| `insufficient_quota` | OpenAI reported exhausted quota or unavailable billing balance | Check API billing, credit balance, and project/organization limits | **Never** |
| `authentication_error` | OpenAI rejected the key | Check or replace the key in server settings | **Never** |
| `permission_denied` | The account lacks permission | Check API project permissions and model access | **Never** |
| `model_not_supported` | The configured model is incompatible with this mode or the provider rejected that model capability | Select a supported image/structured-output model | None |
| `model_unavailable` | The configured model is inaccessible or does not exist | Check the model name and project access | None |
| `provider_request_error` | OpenAI rejected a request for another nonretryable reason | Check the server integration/configuration using sanitized diagnostics | None |
| `network_error` | The server could not reach OpenAI | Check DNS, outbound HTTPS, and hosting networking | Bounded retries |
| `timeout` | The provider attempt or overall deadline expired | Try later, optionally with a simpler image/description | Bounded retries if time remains |
| `provider_unavailable` | OpenAI returned an upstream service failure | Try again later | Only selected temporary 5xx responses |
| `invalid_response` | Output was refused, incomplete, malformed, or outside validated nutrition limits | Try clearer input; review recurring integration errors | None; no success or nutrition is fabricated |
| `request_aborted` | The browser cancelled the analysis | Submit again only when ready | None |

Messages are localized in Arabic and English. Quota and credential errors explain that the server owner must fix account settings. A ChatGPT subscription does not supply API credit. Account balances and limits cannot be repaired by a code update or by repeatedly pressing Analyze.

## Retry policy

- At most **3 provider attempts** for one analysis, including the initial attempt.
- Retry only transient OpenAI rate limits, HTTP 408/selected 5xx responses, network failures, and attempt timeouts. Quota/authentication failures stop immediately, including when reported in an HTTP 429 error body.
- Exponential waits start at **500 ms**, then **1,000 ms**. A valid `Retry-After` delta or HTTP date takes precedence when it requires a longer wait.
- A **35-second overall deadline** covers processing and retry waits. Each provider attempt is capped at **15 seconds** and by the remaining deadline, including response-body reading. A wait that cannot fit returns the error and retry delay instead of retrying early.
- Every outbound attempt consumes the app's shared 10-attempt/minute allowance. The analysis retains one of the two concurrency slots while waiting. Cancellation stops retries.
- The browser does not automatically retry. It displays a countdown when the server supplies a retry delay; another request requires an explicit click.

Process limits are not distributed across servers and reset on process restart. Public deployments need authenticated access and shared quotas to control API spending. A retry is another provider request and may consume API usage.

## Model compatibility

The default remains `gpt-4.1-mini`, which accepts images and structured output. The server conservatively supports GPT-4.1, GPT-4.1 mini/nano and their `2025-04-14` snapshots; GPT-4o and its `2024-08-06`/`2024-11-20` snapshots; and GPT-4o mini with its `2024-07-18` snapshot. Description mode also accepts the text-only `o3-mini` and `o3-mini-2025-01-31`. Photo mode rejects text-only and unknown models **before** sending an image. New model families require an explicit compatibility review. Supported format does not guarantee that a particular account has access.

References: [GPT-4.1 mini model card](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), and [OpenAI's API schema](https://github.com/openai/openai-openapi).

## Safe diagnosis on the configured server

Run from the project folder:

```sh
npm run diagnose:ai
```

This opt-in command loads Next.js environment files and sends a fixed `100 grams of cooked white rice` description through the real integration. It can incur normal API usage, including bounded retries. With no key it exits without making a provider request. It reports only HTTP status, application error code, retry metadata, and a diagnostic request ID. This is an account/request check, not a guarantee of the accuracy of food estimates.

Server logs contain only a generated request ID, analysis mode, a recognized model identifier, attempt number, status, allowlisted classification, elapsed time, retry delay, and a sanitized provider request ID when available. Raw OpenAI messages and error bodies are discarded. Keys, authorization headers, uploaded bytes, meal descriptions, food results, profiles, IP addresses, and other personal information are not logged.

## Photo and description requests

Both modes use multipart `POST /api/food-analysis` with `locale=en` or `locale=ar`:

- `mode=photo`: requires one JPEG/PNG/WebP `image` up to 5 MiB; `description` is optional, up to 2,000 characters.
- `mode=description`: requires a nonempty `description` up to 2,000 characters; image fields are rejected. An existing meal attachment stays local.
- An omitted mode defaults to photo for existing clients.

The strict provider schema contains validated foods and a nullable bilingual clarification question. When essential portion quantities are missing, the prompt requires a clarification with no foods. A clarification response is shown for the user to revise; it never updates the plate or diary. Successful estimates include English/Arabic names, estimated grams, confidence, and nutrients per 100 g. The interface calculates portion totals, lets users edit them, and requires **Add reviewed foods → Save meal** before daily totals change. All values remain estimates, including when quantities are specified.
