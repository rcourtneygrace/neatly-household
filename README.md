# Neatly Household

A calm, iPhone-first home-management app, built as an installable web app (PWA).

- **Functional spec:** claude.ai artifact "Neatly Household: Functional Spec for Claude Code"
- **Design:** Figma file "Neatly Household", page **Design** (tokens: collection *Neatly Colors*, mode *New palette*)

## Run it

```sh
npm install
npm run dev      # local dev server (also reachable from your phone on the same Wi-Fi)
npm test         # unit tests
npm run build    # production build into dist/
```

Pushing to `main` on GitHub builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`).
In the repo: Settings → Pages → Source: **GitHub Actions**.

## Layout

```
src/ui/          shared components (NavBar, PageHeader, SectionHeader, PrimaryButton, record rows, sheets)
src/features/    one folder per tab: today, plan, records, analysis, settings
src/data/        Dexie (IndexedDB) schema, data access, photos, backup. No React screens here.
src/domain/      pure logic, unit-tested: records, task schedules and seasons, the scheduling engine (schedule.ts)
src/styles/      design tokens from Figma + base styles
```

All data stays on the phone (IndexedDB). Every row has `id/createdAt/updatedAt/deletedAt` so sync can be added later.

## Build phases

1. App shell ✅
2. Records ✅
3. Plan ✅: tasks, Opening/Closing, Plan Settings, Seasons, "Suggested tasks"
4. Today ✅ (review with owner): Opening/Closing, Daily, In Progress, Coming Soon, tags, check-off, Defer, Build Your Day, after hours
5. Analysis: all five Figma screens
6. Setup flow, vacation mode: **waiting on product spec v1**

## Decisions and open items

- The $4.99 unlock and 25-task limit are **not** built until a public release (`household.unlocked` is kept in the schema).
- A home-screen widget is not possible for a PWA on iOS; it waits for a native wrapper.
- Hosting: GitHub Pages. Hash routing (`#/records`) so deep links work without server rewrites.
- Backup: Settings → Save a backup / Restore (local JSON file, photos included).
- Text sizes: Figma's Micro/11 and Kicker/10 render at 12px to meet the spec's 12px minimum.
- Plan: a weekly task with a specific day picks one day (as in Figma). Plan Settings and Seasons open from Settings.
- Plan header keeps the NEATLY. HOUSEHOLD wordmark like Records (the Figma Plan frame has none).
- Today rules (domain/schedule.ts): a task with a set day shows 4 days before it, Heads up 2 days before, Today on the day,
  Priority once the day has passed. "Every week/month/…" tasks show all period, untagged. Anything left undone is carried
  over as Priority. Deferred tasks are set aside with a reason and not carried over. Daily tasks roll over as Priority
  only after a day the household was opened. Closing appears 60 minutes before the close time.
- Tap a task's name on Today for: Do it today, Defer, Edit task.
- App icon is a placeholder (`public/icon-*.png`) until a real one exists.
