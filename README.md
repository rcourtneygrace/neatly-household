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
4. Today ✅: Opening/Closing, Daily, In Progress, Coming Soon, tags, check-off, Defer, Build Your Day, after hours
5. Analysis ✅: home health, department detail, adjust monthly tasks, give it a day, change how often
6. Build Your Day + Vacation mode + task actions ✅ (review with owner), from the doc "Neatly Household: Build Your Day and Vacation Mode"
7. Setup flow: **waiting on product spec v1**

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
- Today shows only today's list: tasks fixed for today (a set day that is today, or pushed there), Build Your Day
  picks (unfinished picks carry over as "Carried over") and daily tasks. Everything else is offered in Build Your Day:
  weekly set days up to 2 days ahead, monthly up to 4, plus "every …" tasks and Priority (missed) ones, max 5 rows a step.
- Daily tasks have only their check: no actions sheet.
- Tap an In Progress task row (not its circle) for: Push to a later date, Skip this <cycle> (with an optional reason), Edit task.
  Skips are stored as Occurrence.status "deferred"; only "Not needed this time", "No time" and "Other" can lead to a
  "change how often" suggestion.
- Vacation mode (Settings, first card): Today shows "Out of office"; anything whose window ends during the trip is
  not carried over and is left out of Analysis. "Welcome back" shows once after.
- Analysis (domain/analysis.ts): ring score = share of the chosen Month/Season/Year's finished windows that found their
  time (on time 1, late ½, missed 0; set-aside left out; daily tasks only on opened days). 85+ Flowing, 65–84 Steady,
  under 65 Ready for a reset. Suggestions need a clear pattern: 3 set-asides in a row, or late/missed 3 of the last 4.
  "Keep it …" hides a suggestion on this phone; "Not now" until the app is reopened. Monthly balance suggests moving up
  to 2 tasks when one week has 3+ more than the lightest.
- App icon is a placeholder (`public/icon-*.png`) until a real one exists.

## Open notes (owner will decide while testing)

- Build Your Day doc mentions an "overload check … as already specified": not built, nothing specified yet.
- "Opening and Closing consistency card" and a separate Opening/Closing deferral: not built, noted only.

## Household sharing (sync)

- Server: `sync-server/` (Cloudflare Worker + D1 `neatly-household-sync`), live at
  https://neatly-household-sync.neatly-household.workers.dev. Deploy with `cd sync-server && npx wrangler@4 deploy`.
- An invite key `<householdId>.<secret>` is the only credential; the invite link is `#/join/<key>`.
- Every write to a synced table is noted in `syncOutbox` by a Dexie middleware (`src/data/outbox.ts`).
  `src/data/sync.ts` sends the outbox and fetches newer rows; the newest change to a row wins.
- Occurrences and day logs use the same id on every phone (`occurrenceId`, `dayLogId`) so they merge.
- On iPhone, Safari and the Home Screen app keep separate data, so the join page explains pasting the invite in Settings.
- Not synced: whole-table clears (backup restore only sends the restored rows), and localStorage preferences.

## The household day

A day runs from its opening time to the next opening time (`src/domain/hours.ts`), not midnight to midnight.
Before the open time it is still the evening before: its Closing stays up, and check-offs count for it
(`Occurrence.completedOn`). "Open early" (`DayLog.startedEarly`) starts the new day before its open time.
