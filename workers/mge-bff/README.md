# MGEeveryday BFF Worker

Small Cloudflare Worker backend-for-frontend for the static Makeyourcraft Cloudflare Pages app.

Purpose: keep the MGEeveryday API token server-side while the browser calls safe `/api/mge/*` endpoints.

## Endpoints

- `GET /health` — health check.
- `POST /api/mge/preview` — accepts multipart form data with `image` and optional `preferredSize`; creates a DOT preview at MGEeveryday.
- `GET /api/mge/preview/:previewId` — polls/retrieves a preview session.

## Required Cloudflare secret

```bash
npx wrangler secret put MGEVERYDAY_API_TOKEN --config workers/mge-bff/wrangler.toml
```

Use the local token from `~/.hermes/secrets/mgeveryday.env`; do not commit the value.

## Vars

Configured in `wrangler.toml`:

- `MGEVERYDAY_BASE_URL=https://www.mgeveryday.sg`
- `MGEVERYDAY_BRAND_ID=116`

Set `ALLOWED_ORIGIN` before production if the Worker has a public workers.dev URL, for example:

```bash
npx wrangler secret put ALLOWED_ORIGIN --config workers/mge-bff/wrangler.toml
# value: https://hermes-painting-landing.pages.dev
```

## Frontend connection

The static Next.js app uses the Worker only when this public build-time env var is set:

```bash
NEXT_PUBLIC_MGE_BFF_BASE_URL=https://hermes-painting-mge-bff.<your-workers-subdomain>.workers.dev
```

If the env var is missing, the app keeps using the local/mock browser preview.

## Commands

```bash
npm run worker:typecheck
npm run worker:dev
npm run worker:deploy
```
