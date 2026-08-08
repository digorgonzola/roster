# 🧹 Household Chore Roster

A small, no-backend web app to run a family chore roster: add people and chores,
schedule them **weekly** or as **one-off** irregular tasks, assign them **manually**
or **auto-rotate** them across people each week, and print a **grayscale-safe A4**
roster for the fridge.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

Build a static copy:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the built copy
```

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

## Data & backup

Everything is stored in your browser's `localStorage`. Use **Export JSON** to back
up or move the roster to another device, and **Import JSON** to restore it.

## Tech

Vite + React + TypeScript, plain CSS. No server, no accounts, no tracking.
