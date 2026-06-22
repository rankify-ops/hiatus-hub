# Hiatus Hub — Vercel Migration Notes

## What's now live (Phase 1)

| Route | Data source | Notes |
|---|---|---|
| `/api/overview` | Shopify GraphQL + static `data/overview.json` | Revenue, orders, products count from Shopify. Status/alerts/collections/costs merged from static JSON. |
| `/api/stock` | Shopify GraphQL + static `data/stock.json` | Inventory quantities live from Shopify. `supplier_sku`, `supplier`, `components`, `is_component`, `component_of`, `notes`, `material_type` merged from static stock.json keyed on product name. |
| `/api/orders` | Shopify GraphQL | All order data live — counts, revenue rollups, monthly breakdown, recent orders, top products. `shopify_url` now included. |
| `/api/catalogue` | Shopify GraphQL | Product catalogue (title, type, price, image, stock, variants) live from Shopify. Material guessed from title if no metafield. |

## What's still static (read from `/data/*.json`)

- `content.json` — Instagram / content pipeline
- `finance.json` — Subscriptions, cost breakdown
- `markets.json` — Market stall schedule
- `market_sales.json` — In-person market sales
- `stock_changelog.json` — Stock change history
- `products.json` — Pipeline summary + collections (catalogue portion replaced by live `/api/catalogue`)

## Environment variable to set in Vercel

```
SHOPIFY_ADMIN_TOKEN = shpat_xxxxxxxxxxxxxxxxxxxxx
```

Set this in the Vercel dashboard under **Settings → Environment Variables**. It is never exposed to the browser.

### Required Shopify scopes

The Admin API token needs these scopes:
- `read_products`
- `read_orders`
- `read_inventory`

## Deploy steps

### Option A: GitHub import (recommended)

1. Push this repo to GitHub (`rankify-ops/hiatus-hub`)
2. Go to [vercel.com/new](https://vercel.com/new) → Import Git Repository
3. Select `rankify-ops/hiatus-hub`
4. Add environment variable `SHOPIFY_ADMIN_TOKEN`
5. Deploy — Vercel auto-detects the config

### Option B: Vercel CLI

```bash
npm i -g vercel
cd hiatus-hub
vercel              # follow prompts to link project
vercel env add SHOPIFY_ADMIN_TOKEN   # paste your token
vercel --prod       # deploy to production
```

## Phase 2 stubs (not yet implemented)

- `POST /api/market-sale` — Log a market sale, decrement Shopify inventory via Inventory API, append to changelog. Will need Supabase for persistence.
- The `renderMarkets()` and market sales tab will eventually read from a live source instead of `market_sales.json`.

## API route protection note

The API routes currently have no authentication — anyone who knows the URL can hit them. The Shopify token is safe (server-side only), but the data itself (orders, revenue, stock levels) is accessible. If you want to restrict access, consider adding a simple bearer token check or Vercel's built-in authentication.
