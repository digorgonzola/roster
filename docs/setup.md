# Setup: Google sign-in with Cloudflare Access

Cloudflare Access puts a Google login in front of the whole roster. The Worker
checks the Access token on each API request and serves one household roster,
the RosterRoom Durable Object that `HOUSEHOLD_ROOM_ID` names.

Do these steps in order. Do step 1 and step 2 before the first deploy with the
`routes` entry in `wrangler.jsonc`, so the hostname is never open without Access.

## 1. Access application (production)

1. Zero Trust → Settings → Authentication: make sure Google is a login method.
   The bills app uses the same team (`crunchyapple.cloudflareaccess.com`), so
   this is already done.
2. Zero Trust → Access → Applications: add a self-hosted application for
   `roster.crunchyapple.xyz`. Protect the whole hostname.
3. Add an **Allow** policy that includes the household Google addresses one by
   one. Never use "any Google account" or a whole email domain.
4. Add a second self-hosted application for the path
   `roster.crunchyapple.xyz/api/calendar.ics` with one **Bypass** policy that
   includes **Everyone**. Calendar apps cannot sign in. The feed token in the
   URL protects this path, and it gives read-only access.
5. Copy the AUD tag of the hostname application (not the bypass one) into
   `vars.ACCESS_AUD` in `wrangler.jsonc`.

## 2. Worker configuration (production)

1. Put the room id in `vars.HOUSEHOLD_ROOM_ID`. For an existing roster, this is
   the UUID in the old share link: `https://…/#/r/<room id>/<key>`. The key is
   not needed any more.
2. Set the household list as a secret (comma-separated):

   ```bash
   pnpm exec wrangler secret put HOUSEHOLD_EMAILS
   ```

Until `ACCESS_AUD`, `HOUSEHOLD_ROOM_ID` and `HOUSEHOLD_EMAILS` are valid, every
API request gets a 500 response. The Worker fails closed.

## 3. Preview Worker

1. After the first preview deploy, turn on Cloudflare Access for the
   `roster-preview` workers.dev URL (Workers → roster-preview → Settings →
   Domains & Routes).
2. Put that application's AUD tag into `env.preview.vars.ACCESS_AUD`, and set
   the secret:

   ```bash
   pnpm exec wrangler secret put HOUSEHOLD_EMAILS --env preview
   ```

The preview room starts with the example roster. It never shares data with
production.

## 4. Local development

```bash
cp .dev.vars.example .dev.vars
pnpm dev:worker   # API on :8787
pnpm dev          # app on :5173
```

`DEV_IDENTITY_EMAIL` skips Access and signs you in as that household member.
The Worker accepts it only when `ENVIRONMENT=development`.

## Add or remove a household member

1. Edit the Allow policy of the Access application.
2. Update the `HOUSEHOLD_EMAILS` secret to the same list.

## Check after the first deploy

- Signed out, `https://roster.crunchyapple.xyz` shows the Access login page.
- A Google account that is not in the Allow policy is refused.
- `curl -H 'Cf-Access-Jwt-Assertion: x' https://roster.crunchyapple.xyz/api/me`
  returns 401.
- `https://roster.dry-mouse-09f0.workers.dev` does not serve the app.
- Settings → Calendar & tasks → Enable live feed gives a URL that a calendar
  app can subscribe to without signing in.

## Lost access

Sign in again with a household Google account. The roster lives in the
Durable Object, not in the browser, and `HOUSEHOLD_ROOM_ID` in
`wrangler.jsonc` records which object it is. Settings → Export JSON gives an
extra backup.
