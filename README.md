# A7sbha — nutrition journal with optional AI photo analysis

A working Next.js App Router application built with TypeScript and Tailwind CSS. Track calories, protein, carbohydrates, fats, meals, water, and weight using a local food catalog and browser storage. **Manual tracking needs no API keys, accounts, environment variables, or database server.** Optional OpenAI photo analysis estimates foods and portions for you to review before adding them.

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

## Enable OpenAI food photo analysis

1. Create an API key in your [OpenAI project](https://platform.openai.com/api-keys) with API billing available. API usage is billed separately from a ChatGPT subscription.
2. In the project root, run `cp .env.example .env.local`. Open `.env.local` in your editor and fill in `OPENAI_API_KEY`. Keep the key on your machine or in your hosting provider's server environment settings. Do not paste it into chat, commit it to GitHub, or prefix it with `NEXT_PUBLIC_`.
3. The default `OPENAI_FOOD_MODEL=gpt-4.1-mini` supports image input and structured responses. You can select another compatible model available to your OpenAI project.
4. Restart the Next.js server (`npm run dev`, or `npm run build` and `npm start` for production).
5. Open **Add meal → Food photo**, upload a JPEG, PNG, or WebP, and optionally describe the ingredients, cooking method, or known portion size. Press **Analyze photo** to send that photo and description to OpenAI.
6. Review the detected foods, estimated grams, confidence, and calories/protein/carbs/fat. Edit or remove suggestions, then press **Add reviewed foods**. The normal **Save meal** button saves your confirmed meal to this browser.

The Arabic interface supports the same flow. Photos are never sent automatically when selected or saved. The browser resizes the photo and re-encodes it as JPEG before sending; the request contains the photo, optional description, and language, not your profile or journal. The API key remains on the server. API requests use `store: false`; OpenAI's own data retention policies still apply.

Food recognition and portion weights are estimates: a photo cannot establish exact weight, hidden oils, ingredients, or nutrition. Suggestions are labeled **AI estimate** and never alter daily totals until you add and save them. A non-food or unclear image can return no foods. Missing keys, provider errors, or timeouts show an explicit message and leave manual tracking available. No fake analysis is used.

The endpoint has a 5 MiB image limit, validates image signatures and bounded multipart bodies, checks browser origins, and limits each running server process to 10 analyses per minute with at most 2 in flight. These limits reset when a process restarts and are not shared between instances. This app has no user authentication; for public hosting with AI enabled, add authenticated access and a shared quota at your hosting layer to control API spending. Development on your own MacBook needs no extra service.

Behind a reverse proxy, configure it to overwrite `X-Forwarded-Host` and `X-Forwarded-Proto` with the trusted public host and protocol. The API uses those headers, or the request `Host`, to check browser origins while Next.js may listen internally on `0.0.0.0`.

## Use the application

1. The dashboard starts with an empty journal and clearly described example targets. **Set my targets** lets you enter your own daily goals or calculate an adult plan from body details and activity.
2. Press **Add meal** or a meal category’s plus button. Choose breakfast, lunch, dinner, or snacks, search in **Arabic or English**, add foods, and adjust their weight in grams. Nutrition updates immediately from the selected portions. Save, edit, or delete meals as needed.
3. Use the date control to view a different day. Daily totals, remaining calories, and weekly charts reflect that day’s entries. Chart buttons switch between calories and macros; selecting a chart day opens that date.
4. **Try sample data** adds a clearly marked seven-day sample journal without replacing any day that already contains meals. It never changes your personal profile or targets.
5. Use the moon/sun button for light or dark mode and the globe button for Arabic/English. Both preferences persist. Arabic uses a full RTL layout.
6. Optionally attach a real photo in the meal editor. It previews and is resized/compressed before saving locally. If OpenAI is configured, explicitly request analysis and review the suggested foods before adding them. Otherwise use food search as usual; merely attaching a photo does not generate nutrition.
7. In **My progress**, log weight to draw your real trend. Calculated targets update with weight; manually entered nutrition targets stay fixed. Reached calculated weight goals switch to maintenance estimates.
8. **My settings** offers JSON export, validated backup import, and confirmed clearing of local data. Export a backup before switching devices or clearing browser data.

## Persistence and estimates

Data is stored under `a7sbha.local.v1` in this browser’s `localStorage`, scoped to the site origin. It survives page reloads but does not synchronize across devices. Clearing browser storage removes it; browser privacy restrictions or full storage can prevent saving. The UI reports these errors, and preserves malformed original data until you explicitly recover, import, or reset it. New meals stay in the editor if saving fails. Keep using the same port/origin to see the same journal.

The database has 59 representative sample foods with bilingual names, aliases, per-100-g nutrients, and typical servings. Values are estimates, especially prepared dishes, and differ with brands, recipes, and cooking methods. Portions are scaled before totals are rounded for display. Default targets are examples, not personal advice. The optional adult calculator uses Mifflin–St Jeor and gradual weight-change estimates; it is not a medical plan.

Uploaded JPEG/PNG/WebP files are capped at 5 MiB and compressed to small JPEG attachments (less than 400,000 data-URL characters). Reviewed AI foods store bilingual names, OpenAI provenance, and a per-100-g nutrient snapshot so edits, charts, reloads, and exported backups retain the same calculations. Existing version-one backups remain compatible. Stored state has a conservative size cap to report quota problems before silently losing data. Multiple tabs receive browser storage updates.

## Architecture

- `src/app`: Next.js layout, metadata, route, local fonts, Tailwind theme variables.
- `src/components`: responsive dashboard, meal editor, goal calculator, charts.
- `src/lib/foods.ts`: local bilingual reference database and normalized search.
- `src/lib/nutrition.ts`: pure portion arithmetic, daily sums, and optional planning.
- `src/lib/storage.ts`: versioned state, validation, safe storage, backup import, sample seeding.
- `src/lib/analysis.ts`: shared analysis types, result validation, same-origin browser API adapter, and a local unavailable adapter.
- `src/lib/analysis.server.ts` and `src/app/api/food-analysis/route.ts`: server-only OpenAI Responses API integration, input validation, bounded requests, timeouts, and process-local usage limits. `GET /api/food-analysis` reports availability without exposing credentials; `POST` accepts multipart `image`, optional `description`, and `locale` (`en` or `ar`).
- `src/components/photo-analysis-panel.tsx`: explicit analysis request, bilingual editable result review, and confirmation.
- `src/lib/meal-items.ts`: validated local-food and AI-estimate resolution for consistent nutrition and storage.
- `src/lib/*.test.ts` and `tests/app.spec.ts`: domain and real browser tests.

## Tests

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The browser suite starts the built production server on port **3100**, uses fresh isolated browser contexts, and verifies meal arithmetic, bilingual searches, edit/delete/reload persistence, manual photos, reviewed AI estimates, charts, goals, local-data recovery, backups, mobile layout, and saved themes. OpenAI responses are mocked in server tests and browser tests; no images are sent to OpenAI or credits consumed. Build before running it. Configuration uses `/usr/bin/chromium` when available, accepts `CHROMIUM_PATH` for another executable, or falls back to Playwright’s managed Chromium. On a machine without either:

```sh
npx playwright install chromium
```

No API credentials are needed to install, build, test, or run manual tracking. Real photo analysis requires a server-side `OPENAI_API_KEY`; it has not been verified against a live paid OpenAI request in this workspace.
