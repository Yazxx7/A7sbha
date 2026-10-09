# A7sbha — local nutrition journal

A working Next.js App Router application built with TypeScript and Tailwind CSS. It tracks calories, protein, carbohydrates, fats, meals, water, and weight entirely through a local food catalog and browser storage. **No API keys, accounts, environment variables, remote food services, or database server are needed.**

## Download and start on a MacBook

Install Node.js 24 LTS (recommended; Node.js 20.9+ is supported) from [nodejs.org](https://nodejs.org/) if it is not installed. Node.js includes npm. Open Terminal and run:

```sh
git clone https://github.com/Yazxx7/A7sbha.git
cd A7sbha
npm ci
npm run dev
```

The development server runs on port **3000**. Open `http://localhost:3000` in your browser. Stop the server with **Control+C**.

You can also select **Code → Download ZIP** on GitHub, extract the archive, open Terminal in that extracted folder, and run `npm ci` followed by `npm run dev`. No `.env` file or API key is needed.

For production:

```sh
npm run build
npm start
```

Production also uses port 3000. Choose another port with `npm run dev -- --port 3002` or `npm start -- --port 3002`. Hosting and a public domain are not configured.

For this cloud workspace, use `/workspace/A7sbha` as the working directory and `npm ci --cache /workspace/.npm-cache` when reinstalling dependencies.

## Use the application

1. The dashboard starts with an empty journal and clearly described example targets. **Set my targets** lets you enter your own daily goals or calculate an adult plan from body details and activity.
2. Press **Add meal** or a meal category’s plus button. Choose breakfast, lunch, dinner, or snacks, search in **Arabic or English**, add foods, and adjust their weight in grams. Nutrition updates immediately from the selected portions. Save, edit, or delete meals as needed.
3. Use the date control to view a different day. Daily totals, remaining calories, and weekly charts reflect that day’s entries. Chart buttons switch between calories and macros; selecting a chart day opens that date.
4. **Try sample data** adds a clearly marked seven-day sample journal without replacing any day that already contains meals. It never changes your personal profile or targets.
5. Use the moon/sun button for light or dark mode and the globe button for Arabic/English. Both preferences persist. Arabic uses a full RTL layout.
6. Optionally attach a real photo in the meal editor. It previews and is resized/compressed before saving locally. **Photos are visual notes, not analysis.** You must select foods and portions; a photo alone cannot generate nutrition. The future analysis button is explicitly disabled.
7. In **My progress**, log weight to draw your real trend. Calculated targets update with weight; manually entered nutrition targets stay fixed. Reached calculated weight goals switch to maintenance estimates.
8. **My settings** offers JSON export, validated backup import, and confirmed clearing of local data. Export a backup before switching devices or clearing browser data.

## Persistence and estimates

Data is stored under `a7sbha.local.v1` in this browser’s `localStorage`, scoped to the site origin. It survives page reloads but does not synchronize across devices. Clearing browser storage removes it; browser privacy restrictions or full storage can prevent saving. The UI reports these errors, and preserves malformed original data until you explicitly recover, import, or reset it. New meals stay in the editor if saving fails. Keep using the same port/origin to see the same journal.

The database has 59 representative sample foods with bilingual names, aliases, per-100-g nutrients, and typical servings. Values are estimates, especially prepared dishes, and differ with brands, recipes, and cooking methods. Portions are scaled before totals are rounded for display. Default targets are examples, not personal advice. The optional adult calculator uses Mifflin–St Jeor and gradual weight-change estimates; it is not a medical plan.

Uploaded JPEG/PNG/WebP files are capped at 5 MB and compressed to small JPEG attachments (less than 400,000 data-URL characters). Stored state has a conservative size cap to report quota problems before silently losing data. Multiple tabs receive browser storage updates.

## Architecture

- `src/app`: Next.js layout, metadata, route, local fonts, Tailwind theme variables.
- `src/components`: responsive dashboard, meal editor, goal calculator, charts.
- `src/lib/foods.ts`: local bilingual reference database and normalized search.
- `src/lib/nutrition.ts`: pure portion arithmetic, daily sums, and optional planning.
- `src/lib/storage.ts`: versioned state, validation, safe storage, backup import, sample seeding.
- `src/lib/analysis.ts`: `FoodPhotoAnalyzer` interface and an honest unavailable local adapter. A later server-backed implementation can provide estimates for user confirmation. No provider code, credentials, or network calls are present today.
- `src/lib/*.test.ts` and `tests/app.spec.ts`: domain and real browser tests.

## Tests

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The browser suite starts the built production server on port **3100**, uses fresh isolated browser contexts, and verifies meal arithmetic, bilingual searches, edit/delete/reload persistence, honest photos, charts, goals, local-data recovery, backups, mobile layout, and saved themes. Build before running it. Configuration uses `/usr/bin/chromium` when available, accepts `CHROMIUM_PATH` for another executable, or falls back to Playwright’s managed Chromium. On a machine without either:

```sh
npx playwright install chromium
```

No API credentials are needed for any install, runtime, or test command.
