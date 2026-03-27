# Hiatus Hub

**Hiatus Collection — Marketing Operations Hub**

Premium oxidised 925 sterling silver jewellery brand operations dashboard. Frosted glass UI with dark chiaroscuro aesthetic.

## Architecture

Static HTML dashboard hosted on GitHub Pages, fed by JSON data files updated via Claude Code scheduled tasks.

```
index.html          → Single-page dashboard with sidebar navigation
data/
  overview.json     → Brand snapshot & metrics
  products.json     → Product catalogue & pipeline
  content.json      → Instagram metrics & content pipeline
  orders.json       → Orders & sales tracking
  finance.json      → Costs, revenue, margins
```

## Tabs

| Tab | Data Source | Refresh |
|-----|-----------|---------|
| Overview | Aggregated from all sources | Daily 06:00 |
| Products | ClickUp LUXE tasks | Weekly Monday |
| Instagram / Content | Instagram API + ClickUp | Daily 06:30 |
| Orders / Sales | Store platform API | Every 6hrs (when live) |
| Finance | ClickUp expense tracking | Weekly Monday |

## Setup

1. Enable GitHub Pages on `main` branch (root)
2. Configure Claude Code scheduled tasks per `SCHEDULED-TASKS.md`
3. Dashboard auto-refreshes every 5 minutes

## Brand

- **Domain:** LUXE (internal operations codename)
- **Aesthetic:** Dark, moody, chiaroscuro — Portra 800 pushed one stop
- **Colours:** Black, white, teal/green accents
- **Typography:** Cormorant Garamond (display) + DM Sans (body)

---

*Part of the Rankify operations ecosystem.*
