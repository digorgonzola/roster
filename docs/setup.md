# Setup: sign-in and households

Cloudflare Access puts a Google login in front of the whole roster. The Worker
checks the Access token on each API request, finds the person's household in
D1, and serves that household's roster: the RosterRoom Durable Object named by
the household id.

## Households

- Each person is in exactly one household. A household with one member is not
  shared.
- At first sign-in, a person in `HOUSEHOLD_EMAILS` joins the default household
  (the roster from before households, id `10fef99a-…` in
  `migrations/0001_households.sql`). Anyone else gets a new household of one,
  with the example roster.
- A member invites someone by email in Settings. The invited person sees a
  "Join" banner after sign-in. Joining moves them, and their old household
  keeps its roster. When nobody is left in it, nobody can see it again.
- A member who leaves gets a new, empty household. The roster stays with the
  others.
- The owner of the Cloudflare account can read every household's roster. Tell
  people before they join.

## 1. Access applications

1. Zero Trust → Settings → Authentication: make sure Google is a login method.
   The bills app uses the same team (`crunchyapple.cloudflareaccess.com`).
2. Zero Trust → Access → Applications: the `roster` application has Worker
   destinations for both `roster` and `roster-preview`. That covers the custom
   domain, the workers.dev URLs and the preview Worker with one AUD tag.
3. Its **Allow** policy is the only list of who can sign in. Add each person's
   Google address one by one. Never use "any Google account" or a whole email
   domain.
4. The `Roster calendar feed (public)` application has one **Bypass** policy
   that includes **Everyone**, for the path
   `roster.crunchyapple.xyz/api/calendar.ics`. Calendar apps cannot sign in.
   The feed token in the URL protects this path, and it gives read-only access.
5. The AUD tag of the `roster` application (not the bypass one) is
   `vars.ACCESS_AUD` in `wrangler.jsonc`, for both environments.

## 2. D1 and secrets

The databases `roster` and `roster-preview` exist, and `wrangler.jsonc` names
them. Migrations in `migrations/` run before each deploy (step 3).

Set the people who join the default household at first sign-in
(comma-separated). It is optional for the preview Worker.

```bash
pnpm exec wrangler secret put HOUSEHOLD_EMAILS --env=""
pnpm exec wrangler secret put HOUSEHOLD_EMAILS --env preview
```

`--env=""` targets the top-level (production) Worker; without it, wrangler
warns because the config also defines `env.preview`.

## 3. Deploys

- **Production:** `.github/workflows/deploy.yml` runs on each push to `main`.
  It tests, builds, applies D1 migrations, then deploys. Migrations must stay
  additive, because the old Worker serves until the deploy finishes.
- **Preview:** `.github/workflows/deploy-preview.yml` applies the preview
  migrations, then deploys `roster-preview`, for each ready PR.
- Both use the repository secret `CLOUDFLARE_API_TOKEN`. It needs Workers
  Scripts:Edit and D1:Edit.
- **Workers Builds must stay disconnected** from the `roster` Worker
  (Workers → roster → Settings → Build). It cannot run migrations first, and
  with it connected, both would deploy.

## 4. Local development

```bash
cp .dev.vars.example .dev.vars
pnpm exec wrangler d1 migrations apply roster --local
pnpm dev:worker   # API on :8787
pnpm dev          # app on :5173
```

`DEV_IDENTITY_EMAIL` skips Access and signs you in as that person. The Worker
accepts it only when `ENVIRONMENT=development`. To try invites between two
people, change it and restart `pnpm dev:worker`.

## Add someone

1. Add their Google address to the Allow policy of the `roster` Access
   application.
2. To share your household, invite them in Settings → Household. Without an
   invite they get their own household.

## Check after the first deploy

- Signed out, `https://roster.crunchyapple.xyz` shows the Access login page.
- A Google account that is not in the Allow policy is refused.
- `curl -H 'Cf-Access-Jwt-Assertion: x' https://roster.crunchyapple.xyz/api/me`
  returns 401.
- `https://roster.dry-mouse-09f0.workers.dev` does not serve the app.
- Each person in `HOUSEHOLD_EMAILS` sees the existing roster after sign-in.
- Settings → Calendar & tasks → Enable live feed gives a URL that a calendar
  app can subscribe to without signing in.

## Lost access

Sign in again with your Google account. The roster lives in the Durable
Object, and D1 records which household you are in. Settings → Export JSON
gives an extra backup.
