# 🧹 Household Chore Roster

[![CI](https://github.com/digorgonzola/roster/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/digorgonzola/roster/actions/workflows/ci.yml)
[![Workflow Security](https://github.com/digorgonzola/roster/actions/workflows/zizmor.yml/badge.svg?branch=main)](https://github.com/digorgonzola/roster/actions/workflows/zizmor.yml)
[![Deployment](https://img.shields.io/badge/deploy-Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)](https://github.com/digorgonzola/roster/deployments)

A small, no-backend web app to run a family chore roster: add people and chores,
schedule them **weekly** or as **one-off** irregular tasks, assign them **manually**
or **auto-rotate** them across people each week, and print a **grayscale-safe A4**
roster for the fridge.

## Run it

```bash
pnpm install
pnpm dev
```

Open the printed local URL (usually http://localhost:5173).

Build a static copy:

```bash
pnpm build      # outputs to dist/
pnpm preview    # serve the built copy
```

This repo uses **pnpm** (pinned via the `packageManager` field; `corepack enable`
gets you the right version). Supply-chain hardening lives in
[pnpm-workspace.yaml](pnpm-workspace.yaml): dependency lifecycle scripts are
blocked, new releases must be at least 7 days old before they install, versions
are pinned exactly, and `node_modules` is verified against the lockfile before
every run. In CI, install with `pnpm install --frozen-lockfile`.

## Using it

- **People** — add household members; each gets a colour (also shown as an
  initials + fill-pattern swatch so it survives grayscale printing).
- **Chores** — name it, set effort, set a **time of day** (Morning / Afternoon /
  Evening / Anytime) so the day reads in order — morning "before school" tasks
  first — then choose a schedule:
  - **Weekly** — tick the weekdays it recurs on, and how often it **repeats**
    (weekly, fortnightly, every 3 or 4 weeks) with a *this week / next week* start.
  - **Monthly** — a calendar rule like the **First Saturday** of each month
    (First/Second/Third/Fourth/Last × weekday).
  - **One-off** — pick a single date for irregular tasks.
  - Assign to **one person**, or **rotate** across several — advancing **every
    day** or **every week**, deterministically.
- **This week** — grid of who does what, with week navigation (‹ / This week / ›).
- **Print roster** — choose **Weekly grid** or **Per-person cards**, then
  *Print / Save PDF*. Layout is A4 with tick boxes and a person key.
- **Settings** — pick the week start day, rename the time-of-day row headings,
  share the roster between devices, and export / import / reset the data.

## Data & backup

Everything is stored in your browser's `localStorage`. Use **Export JSON** (on
the Settings page) to back up or move the roster to another device, and
**Import JSON** to restore it.

## Sharing

**Share roster** (on the Settings page) creates a private link that keeps the
roster in sync between devices. The link holds a random secret, and anyone
with the link can view and edit that one roster. Shared rosters live in a
Cloudflare Durable Object. **Stop syncing** disconnects the device and keeps
its local copy. Without a share, the app never talks to a server.

## Tech

Vite + React + TypeScript, plain CSS. No accounts, no tracking. A small
Cloudflare Worker stores shared rosters, only for people who opt in to
sharing. For local development run `pnpm dev` (app) and `pnpm dev:worker`
(API) side by side.
