# A7sbha — nutrition journal with photo and description analysis

A working Next.js App Router application built with TypeScript and Tailwind CSS. Track calories, protein, carbohydrates, fats, meals, water, and weight using a local food catalog and browser storage. **Manual tracking needs no API keys, accounts, environment variables, or database server.** Optional Google Gemini analysis accepts food photos or Arabic/English meal descriptions, with estimates you review before adding them.

## Download and start on a MacBook

Install Node.js 24 LTS (recommended; Node.js 20.9+ is supported) from [nodejs.org](https://nodejs.org/) if it is not installed. Node.js includes npm. Open Terminal and run:

```sh
git clone https://github.com/Yazxx7/A7sbha.git
cd A7sbha
npm ci
npm run dev
```

The development server runs on port **3000**. Open `http://localhost:3000` in your browser. Stop the server with **Control+C**.

You can also select **Code → Download ZIP** on GitHub, extract the archive, open Terminal in that extracted folder, and run `npm ci` followed by `npm run dev`. No `.env` file or API key is needed for manual tracking.

For production:

```sh
npm run build
npm start
```

Production also uses port 3000. Choose another port with `npm run dev -- --port 3002` or `npm start -- --port 3002`. Hosting and a public domain are not configured.

For this cloud workspace, use `/workspace/A7sbha` as the working directory and `npm ci --cache /workspace/.npm-cache` when reinstalling dependencies.

## Enable Google Gemini food analysis

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Use a model enabled for your project's free tier; Google sets eligibility, available models, and rate/daily quotas. A free-tier key is not unlimited, and the app does not enable billing or switch to a paid provider.
2. Copy `.env.example` to `.env.local` in the project root if it does not already exist. Set `GEMINI_API_KEY` there. Never prefix it with `NEXT_PUBLIC_`, put it in browser code, or commit it to GitHub. Existing OpenAI environment variables are no longer used.
3. The default `GEMINI_FOOD_MODEL=gemini-flash-latest` is the current Flash alias recommended in the [official SDK examples](https://github.com/googleapis/js-genai/blob/main/README.md), with image and text support. You can set a supported explicit Flash model such as `gemini-2.5-flash` if it is available to your Google project. The server rejects incompatible configuration and reports provider model-access errors without silently selecting another model.
4. Run `npm ci` after pulling this update to install the official `@google/genai` SDK. Restart with `npm run dev`, or use `npm run build` and `npm start` for production.
5. For photos: **Add meal → Food photo → Analyze photo**. Upload a JPEG, PNG, or WebP, optionally describe the ingredients/preparation, and explicitly request analysis.
6. For text only: **Add meal → Meal description → Analyze description**. Enter Arabic or English, for example: `200 grams of cooked rice, 150 grams of grilled chicken, and one tablespoon of olive oil.` No photo is needed or sent, even if the meal has a local photo attachment.
7. Review/edit the detected foods, grams, calories, protein, carbs, and fat. Press **Add reviewed foods**, then **Save meal**. Missing quantities can produce a clarification question instead of nutrition; add the amounts and explicitly analyze again.

Photos and descriptions are never sent automatically. Photo mode resizes/re-encodes the image as JPEG before sending it with optional text. Description mode sends only text and language. Neither mode sends your profile or journal. The key and SDK stay on the Next.js server. The server sends inline images directly to Google's Gemini Developer API; Google's data-use terms apply. No OpenAI API request or sample-result fallback remains.

Food recognition, portion weights, and nutrient values are estimates. Cooking methods, hidden oils, and brands change the result. The interface labels AI estimates and requires review; nothing changes your diary totals until you add and save the foods. Old OpenAI-generated meals remain readable with their original provenance; new AI meals record Gemini as the source.

The server accepts photos up to 5 MiB, validates signatures and bounded multipart requests, checks browser origins, and retains a process-local guard of 10 provider attempts/minute and 2 simultaneous analyses. Retries count toward this limit; replicas do not share it. Public deployments need authentication and shared quotas to control usage. A reverse proxy must overwrite `X-Forwarded-Host` and `X-Forwarded-Proto` with trusted public values so origin checks work behind Next's internal listener.

## Diagnose API failures

The API gives separate Arabic/English messages for missing configuration, invalid/restricted keys, unavailable models, transient rate limits, exhausted/zero quota, service errors, network failures, timeouts, and invalid/blocked model output. See the [Gemini troubleshooting and retry guide](docs/ai-analysis.md).

On the machine where the key is configured, run:

```sh
npm run diagnose:ai
```

This opt-in command sends a **small real Gemini request using a fixed sample description**. It consumes quota and may be billed on a paid Google project. It prints only sanitized status, an error classification, and a request ID. With no key it reports missing configuration and makes no API call. A successful local test does not establish your remaining Google account quota.

## Use the application

1. The dashboard starts with an empty journal and clearly described example targets. **Set my targets** lets you enter your own daily goals or calculate an adult plan from body details and activity.
2. Press **Add meal** or a meal category’s plus button. Choose breakfast, lunch, dinner, or snacks, search in **Arabic or English**, add foods, and adjust their weight in grams. Nutrition updates immediately from the selected portions. Save, edit, or delete meals as needed.
3. Use the date control to view a different day. Daily totals, remaining calories, and weekly charts reflect that day’s entries. Chart buttons switch between calories and macros; selecting a chart day opens that date.
4. **Try sample data** adds a clearly marked seven-day sample journal without replacing any day that already contains meals. It never changes your personal profile or targets.
5. Use the moon/sun button for light or dark mode and the globe button for Arabic/English. Both preferences persist. Arabic uses a full RTL layout.
6. Optionally attach a real photo in the meal editor. It previews and is resized/compressed before saving locally. If Gemini is configured, use **Food photo → Analyze photo** or **Meal description → Analyze description**, review/edit the estimates, add them to your plate, then save the meal. Otherwise use food search as usual; merely attaching a photo or typing a description does not generate nutrition.
7. In **My progress**, log weight to draw your real trend. Calculated targets update with weight; manually entered nutrition targets stay fixed. Reached calculated weight goals switch to maintenance estimates.
8. **My settings** offers JSON export, validated backup import, and confirmed clearing of local data. Export a backup before switching devices or clearing browser data.

## Persistence and estimates

Data is stored under `a7sbha.local.v1` in this browser’s `localStorage`, scoped to the site origin. It survives page reloads but does not synchronize across devices. Clearing browser storage removes it; browser privacy restrictions or full storage can prevent saving. The UI reports these errors, and preserves malformed original data until you explicitly recover, import, or reset it. New meals stay in the editor if saving fails. Keep using the same port/origin to see the same journal.

The database has 59 representative sample foods with bilingual names, aliases, per-100-g nutrients, and typical servings. Values are estimates, especially prepared dishes, and differ with brands, recipes, and cooking methods. Portions are scaled before totals are rounded for display. Default targets are examples, not personal advice. The optional adult calculator uses Mifflin–St Jeor and gradual weight-change estimates; it is not a medical plan.

Uploaded JPEG/PNG/WebP files are capped at 5 MiB and compressed to small JPEG attachments (less than 400,000 data-URL characters). Reviewed AI foods store bilingual names, provider provenance, and a per-100-g nutrient snapshot so edits, charts, reloads, and exported backups retain the same calculations. Existing version-one backups remain compatible. Stored state has a conservative size cap to report quota problems before silently losing data. Multiple tabs receive browser storage updates.

## Architecture

- `src/app`: Next.js layout, metadata, route, local fonts, Tailwind theme variables.
- `src/components`: responsive dashboard, meal editor, goal calculator, charts.
- `src/lib/foods.ts`: local bilingual reference database and normalized search.
- `src/lib/nutrition.ts`: pure portion arithmetic, daily sums, and optional planning.
- `src/lib/storage.ts`: versioned state, validation, safe storage, backup import, sample seeding.
- `src/lib/analysis.ts`: shared analysis types, result validation, same-origin browser API adapter, and a local unavailable adapter.
- `src/lib/analysis.server.ts` and `src/app/api/food-analysis/route.ts`: server-only official Google GenAI SDK integration, validation, classified errors, bounded retries, safe diagnostics, and usage limits. `GET /api/food-analysis` reports key availability without a provider request; it does not test project quota or model access. `POST` accepts multipart `mode` (`photo` or `description`), `locale` (`en` or `ar`), and `description`. Photo mode requires `image`; description mode requires nonempty text and rejects images. Legacy requests without `mode` default to photo.
- `src/components/photo-analysis-panel.tsx`: shared photo/text request interface, bilingual clarification and editable review, countdown, and explicit confirmation.
- `scripts/diagnose-ai.ts`: opt-in real account check with a fixed sample and sanitized output.
- `src/lib/meal-items.ts`: validated local-food and AI-estimate resolution for consistent nutrition and storage.
- `src/lib/*.test.ts` and `tests/app.spec.ts`: domain and real browser tests.

## Tests

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The browser suite starts the built production server on port **3100**, uses fresh isolated browser contexts, and verifies meal arithmetic, bilingual searches, edit/delete/reload persistence, manual photos, reviewed AI photo/text estimates, clarification, errors/countdowns, charts, goals, local-data recovery, backups, mobile layout, and saved themes. Provider responses are injected in server tests and app API responses are intercepted in browser tests; automated tests never call Google or consume API quota. Real production route checks cover validation and missing configuration without a billable request. Production analysis always calls the real Gemini API through `@google/genai`. Build before running browser tests. Configuration uses `/usr/bin/chromium` when available, accepts `CHROMIUM_PATH` for another executable, or falls back to Playwright's managed Chromium. On a machine without either:

```sh
npx playwright install chromium
```

No API credentials are needed to install, build, test, or run manual tracking. Real AI analysis requires a server-side `GEMINI_API_KEY`. No Gemini key is configured in this workspace, so live analysis and project-specific model access/free-tier quota could not be verified here.
