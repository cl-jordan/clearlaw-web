# clearlaw-web

Static marketing site for clearlaw.ai — Clearlaw studio home, LitigationOS platform page, and the Discovery Loop product page. Plain HTML with embedded CSS, no build step.

## Structure

```
index.html                  clearlaw.ai            — Clearlaw studio home
litigationos/index.html     clearlaw.ai/litigationos    — LitigationOS platform page
discovery-loop/index.html   clearlaw.ai/discovery-loop  — Discovery Loop product page
assets/
  clearlaw-mark.svg         favicon (home)
  litos-mark.svg            favicon (product pages) — >_ prompt mark, D-056
  apple-touch-*.png         iOS home-screen / share icons
  og/*.png                  1200×630 Open Graph link-preview cards
  og-src/                   HTML sources for the OG cards + local fonts
```

## Deploying (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Framework preset: **None**. Build command: (empty). Output directory: `/`.
4. Add custom domain `clearlaw.ai` (and `www.clearlaw.ai`; redirect www → apex in Cloudflare rules). This requires moving the domain's DNS off Wix to Cloudflare first.
5. Every push to `main` auto-deploys.

Canonical URLs and `og:url`/`og:image` tags assume the apex domain `https://clearlaw.ai`. If www becomes canonical instead, update the meta tags in all three pages.

## Regenerating OG cards

Card sources live in `assets/og-src/*.html` (fonts are vendored locally so rendering needs no network). Re-render with headless Chrome/Brave:

```sh
cd assets/og-src
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
"$BRAVE" --headless=new --disable-gpu --hide-scrollbars \
  --user-data-dir=/tmp/brave-og --window-size=1200,630 \
  --screenshot=../og/discovery-loop.png "file://$PWD/discovery-loop.html"
```

## Lead capture

Forms on all three pages POST JSON to the `clearlaw-leads` Cloudflare Worker
(`leads-worker/`), which stores every lead in a D1 database and emails a
notification to hello@clearlaw.ai — same pattern as edgar-ready-website.
Until the worker is deployed, `LEADS_ENDPOINT` in each page's inline script is
empty and the form falls back to a prefilled mailto.

Deploy (from `leads-worker/`, on the Cloudflare account that runs edgarready.ai):

```sh
npx wrangler login
npx wrangler d1 create clearlaw-leads     # put the returned id in wrangler.jsonc
npx wrangler d1 execute clearlaw-leads --remote --file=schema.sql
npx wrangler deploy                        # note the workers.dev URL
```

Then: verify hello@clearlaw.ai as a destination address in Cloudflare Email
Routing (dashboard → Email Routing → Destination addresses), and set
`LEADS_ENDPOINT` in all three `index.html` files to
`https://clearlaw-leads.<account>.workers.dev/api/lead`.

Query leads: `npx wrangler d1 execute clearlaw-leads --remote --command "SELECT * FROM leads ORDER BY id DESC LIMIT 20"`

Internal checklists and pending decisions live outside this repo.
