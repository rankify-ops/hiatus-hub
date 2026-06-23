async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key]),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV not configured');
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value]),
  });
}

const CATALOG_VERSION = 2;
const SEED_CATALOG = {
  version: CATALOG_VERSION,
  supplier: 'Guangzhou Yihong Jewelry Co., Ltd',
  silver_price_usd_oz: 70.24,
  last_invoice: '2026-06-15',
  products: [
    // ── SILVER ──
    { supplier_sku: 'SR10242B', name: 'Creators Ring', type: 'Ring', material: '925 Silver', plating: 'Oxidation', weight_g: 8.1, cost_usd: 37.63, stone: null, is_gold: false, silver_sku: null, shopify_name: 'CREATORS RING (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/12_635b1c9b-b2bc-4f83-8d7f-aee9fe904e5b.webp?v=1751674402' },
    { supplier_sku: 'BR02221B', name: 'Unearth Cuff', type: 'Bracelet', material: '925 Silver', plating: 'Oxidation', weight_g: 29.63, cost_usd: 121.89, stone: null, is_gold: false, silver_sku: null, shopify_name: 'UNEARTH CUFF (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/13.webp?v=1751674389' },
    { supplier_sku: 'SR10397B', name: 'Unearth Stacker Ring Set', type: 'Ring', material: '925 Silver', plating: 'Oxidation', weight_g: 6.4, cost_usd: 28.13, stone: null, is_gold: false, silver_sku: null, shopify_name: 'UNEARTH STACKER RING SET (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/10_a964cc27-1769-40ad-ba61-fe3bec9e7868.webp?v=1751674409' },
    { supplier_sku: 'SR10243B', name: 'Unearth Ring', type: 'Ring', material: '925 Silver', plating: 'Oxidation', weight_g: 8.1, cost_usd: 37.63, stone: null, is_gold: false, silver_sku: null, shopify_name: 'UNEARTH RING (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/11_680d9bae-4556-4c04-828a-00bbd1899724.webp?v=1751674374' },
    { supplier_sku: 'SR10453B', name: 'Unearth Signet Ring', type: 'Ring', material: '925 Silver', plating: 'Rhodium', weight_g: 9.1, cost_usd: null, stone: null, is_gold: false, silver_sku: null, shopify_name: 'UNEARTH SIGNET RING (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/9_012c12af-b7a4-47f3-8d70-dc6b1e340d4e.webp?v=1751674419' },
    { supplier_sku: 'BR02628A', name: 'Cuban Link Bracelet (Medium)', type: 'Bracelet', material: '925 Silver', plating: 'Rhodium', weight_g: 22.89, cost_usd: 90.82, stone: null, is_gold: false, silver_sku: null, shopify_name: 'CUBAN LINK BRACELET (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/UNEARTHED_7.png?v=1751674498', variant_label: '7.5 Inches' },
    { supplier_sku: 'BR02628B', name: 'Cuban Link Bracelet (Large)', type: 'Bracelet', material: '925 Silver', plating: 'Rhodium', weight_g: 24.48, cost_usd: 97.25, stone: null, is_gold: false, silver_sku: null, shopify_name: 'CUBAN LINK BRACELET (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/UNEARTHED_7.png?v=1751674498', variant_label: '8 Inches' },
    { supplier_sku: 'SP13540A', name: 'Sun Worshipper Pendant', type: 'Pendant', material: '925 Silver', plating: 'Rhodium', weight_g: 2.55, cost_usd: 13.83, stone: null, is_gold: false, silver_sku: null, shopify_name: 'SUN WORSHIPPER PENDANT (SILVER)', image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/UNEARTHED_9.png?v=1767592068', is_component: true },
    { supplier_sku: 'SP18158A', name: 'Compass Pendant', type: 'Pendant', material: '925 Silver', plating: 'Rhodium', weight_g: 5.24, cost_usd: 29.04, stone: 'Zircon', is_gold: false, silver_sku: null, shopify_name: 'COMPASS PENDANT (SILVER)', image: null },
    { supplier_sku: 'NC03702C', name: '3 Hoop Cuban Chain 61cm', type: 'Chain', material: '925 Silver', plating: 'Rhodium', weight_g: 6.43, cost_usd: 31.84, stone: null, is_gold: false, silver_sku: null, shopify_name: '3 HOOP CHAIN (STERLING SILVER)', image: null, is_component: true },
    { supplier_sku: 'NC02636G', name: '3mm Rope Chain 50cm', type: 'Chain', material: '925 Silver', plating: 'Rhodium', weight_g: 12.2, cost_usd: 54.94, stone: null, is_gold: false, silver_sku: null, shopify_name: 'ROPE CHAIN (STERLING SILVER)', image: null, variant_label: '50cm' },
    { supplier_sku: 'NC02636H', name: '3mm Rope Chain 55cm', type: 'Chain', material: '925 Silver', plating: 'Rhodium', weight_g: 13.5, cost_usd: 60.58, stone: null, is_gold: false, silver_sku: null, shopify_name: 'ROPE CHAIN (STERLING SILVER)', image: null, variant_label: '55cm' },
    { supplier_sku: 'NC02636I', name: '3mm Rope Chain 61cm', type: 'Chain', material: '925 Silver', plating: 'Rhodium', weight_g: 14.9, cost_usd: 66.46, stone: null, is_gold: false, silver_sku: null, shopify_name: 'ROPE CHAIN (STERLING SILVER)', image: null, variant_label: '61cm' },
    { supplier_sku: 'CUSTOM-PEN', name: 'Custom Pendant (New Mould)', type: 'Pendant', material: '925 Silver', plating: 'Rhodium', weight_g: 4, cost_usd: 23.21, stone: null, is_gold: false, silver_sku: null, shopify_name: null, image: null, notes: 'Mould cost $60 USD' },

    // ── BRASS GOLD ──
    { supplier_sku: 'SR10242B-BG', name: 'Creators Ring (Gold)', type: 'Ring', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 8.1, cost_usd: 21.74, stone: null, is_gold: true, silver_sku: 'SR10242B', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/12_635b1c9b-b2bc-4f83-8d7f-aee9fe904e5b.webp?v=1751674402' },
    { supplier_sku: 'BR02221B-BG', name: 'Unearth Cuff (Gold)', type: 'Bracelet', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 29.63, cost_usd: 50.02, stone: null, is_gold: true, silver_sku: 'BR02221B', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/13.webp?v=1751674389' },
    { supplier_sku: 'SR10397B-BG', name: 'Unearth Stacker Ring (Gold)', type: 'Ring', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 6.4, cost_usd: 14.95, stone: null, is_gold: true, silver_sku: 'SR10397B', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/10_a964cc27-1769-40ad-ba61-fe3bec9e7868.webp?v=1751674409' },
    { supplier_sku: 'SR10243B-BG', name: 'Unearth Ring (Gold)', type: 'Ring', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 8.1, cost_usd: 21.74, stone: null, is_gold: true, silver_sku: 'SR10243B', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/11_680d9bae-4556-4c04-828a-00bbd1899724.webp?v=1751674374' },
    { supplier_sku: 'SR10453B-BG', name: 'Unearth Signet Ring (Gold)', type: 'Ring', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 9.1, cost_usd: 23.68, stone: null, is_gold: true, silver_sku: 'SR10453B', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/9_012c12af-b7a4-47f3-8d70-dc6b1e340d4e.webp?v=1751674419' },
    { supplier_sku: 'BR02628A-BG', name: 'Cuban Link Bracelet Medium (Gold)', type: 'Bracelet', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 22.89, cost_usd: 52.64, stone: null, is_gold: true, silver_sku: 'BR02628A', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/UNEARTHED_7.png?v=1751674498', variant_label: '7.5 Inches' },
    { supplier_sku: 'BR02628B-BG', name: 'Cuban Link Bracelet Large (Gold)', type: 'Bracelet', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 24.48, cost_usd: 53.84, stone: null, is_gold: true, silver_sku: 'BR02628B', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/UNEARTHED_7.png?v=1751674498', variant_label: '8 Inches' },
    { supplier_sku: 'SP13540C-BG', name: 'Sun Worshipper Pendant (Gold)', type: 'Pendant', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 2.77, cost_usd: 11.93, stone: null, is_gold: true, silver_sku: 'SP13540A', shopify_name: null, image: 'https://cdn.shopify.com/s/files/1/0584/3366/7115/files/UNEARTHED_9.png?v=1767592068', is_component: true },
    { supplier_sku: 'SP18158A-BG', name: 'Compass Pendant (Gold)', type: 'Pendant', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 5.24, cost_usd: 16.73, stone: 'Zircon', is_gold: true, silver_sku: 'SP18158A', shopify_name: null, image: null },
    { supplier_sku: 'NC03702-BG', name: '3 Hoop Cuban Chain 61cm (Gold)', type: 'Chain', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 6.9, cost_usd: 41.55, stone: null, is_gold: true, silver_sku: 'NC03702C', shopify_name: null, image: null, is_component: true },
    { supplier_sku: 'NC02636-BG-50', name: '3mm Rope Chain 50cm (Gold)', type: 'Chain', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 12.2, cost_usd: 43.96, stone: null, is_gold: true, silver_sku: 'NC02636G', shopify_name: null, image: null, variant_label: '50cm' },
    { supplier_sku: 'NC02636-BG-55', name: '3mm Rope Chain 55cm (Gold)', type: 'Chain', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 13.5, cost_usd: 44.46, stone: null, is_gold: true, silver_sku: 'NC02636H', shopify_name: null, image: null, variant_label: '55cm' },
    { supplier_sku: 'NC02636-BG-61', name: '3mm Rope Chain 61cm (Gold)', type: 'Chain', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 14.9, cost_usd: 44.85, stone: null, is_gold: true, silver_sku: 'NC02636I', shopify_name: null, image: null, variant_label: '61cm' },
    { supplier_sku: 'CUSTOM-PEN-BG', name: 'Custom Pendant (Gold)', type: 'Pendant', material: 'Brass', plating: '2.5 Micron K Gold', weight_g: 4, cost_usd: 18.65, stone: null, is_gold: true, silver_sku: 'CUSTOM-PEN', shopify_name: null, image: null },
  ],
};

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let catalog = await kvGet('supplier_catalog');
      if (!catalog || catalog.version !== CATALOG_VERSION) {
        catalog = SEED_CATALOG;
        await kvSet('supplier_catalog', JSON.stringify(catalog));
      }
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
      return res.status(200).json(catalog);
    }

    if (req.method === 'POST') {
      const { action } = req.body;
      if (action === 'reseed') {
        await kvSet('supplier_catalog', JSON.stringify(SEED_CATALOG));
        return res.status(200).json({ success: true, message: 'Catalog reseeded' });
      }
      if (action === 'update_product') {
        const catalog = await kvGet('supplier_catalog') || SEED_CATALOG;
        const { supplier_sku, updates } = req.body;
        const idx = catalog.products.findIndex(p => p.supplier_sku === supplier_sku);
        if (idx === -1) return res.status(404).json({ error: 'Product not found' });
        Object.assign(catalog.products[idx], updates);
        await kvSet('supplier_catalog', JSON.stringify(catalog));
        return res.status(200).json({ success: true, product: catalog.products[idx] });
      }
      if (action === 'add_product') {
        const catalog = await kvGet('supplier_catalog') || SEED_CATALOG;
        catalog.products.push(req.body.product);
        await kvSet('supplier_catalog', JSON.stringify(catalog));
        return res.status(200).json({ success: true, total: catalog.products.length });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'GET or POST' });
  } catch (err) {
    console.error('supplier-catalog error:', err);
    return res.status(500).json({ error: err.message });
  }
};
