# Hiatus Hub — Operations Dashboard

Live operations dashboard for **Hiatus Collection**, a premium oxidised 925 sterling silver jewellery brand.

## Architecture

```
Browser (index.html)
  ├── /api/overview    → Vercel serverless → Shopify Admin GraphQL API
  ├── /api/stock       → Vercel serverless → Shopify Admin GraphQL API + static supplier data
  ├── /api/orders      → Vercel serverless → Shopify Admin GraphQL API
  ├── /api/catalogue   → Vercel serverless → Shopify Admin GraphQL API
  └── /data/*.json     → Static files (content, finance, markets, pipeline)
```

- **Frontend**: Single-page HTML/CSS/JS dashboard with PIN gate (soft access control)
- **Backend**: Vercel serverless functions (Node.js) that query Shopify's Admin GraphQL API
- **Auth**: Shopify Admin token stored as a Vercel environment variable, never exposed to browser
- **Refresh**: Auto-refreshes every 5 minutes via `setInterval`

## Tabs

| Tab | Data source |
|---|---|
| Overview | Live (Shopify) + static (status/alerts) |
| Products | Static (pipeline/collections) + Live (catalogue) |
| Content | Static |
| Orders / Sales | Live (Shopify) + static (market sales) |
| Stock Levels | Live (Shopify) + static (supplier metadata) |
| Market Stalls | Static |
| Finance | Static |

## Setup

1. Clone the repo
2. Set `SHOPIFY_ADMIN_TOKEN` in Vercel environment variables
3. Deploy via `vercel --prod` or GitHub import

See [MIGRATION-NOTES.md](MIGRATION-NOTES.md) for full details.

## Brand

- **Domain:** LUXE (internal operations codename)
- **Aesthetic:** Dark, moody, chiaroscuro — Portra 800 pushed one stop
- **Colours:** Black, white, teal/green accents

---

*Part of the Rankify operations ecosystem.*
