const fs = require('fs');
const path = require('path');

const SHOP = '97850c.myshopify.com';
const API_VERSION = '2024-10';
const LOCATION_ID = 'gid://shopify/Location/64242647083';

async function kvGet(key) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}`, {
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
  if (!url || !token) return;
  await fetch(`${url}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value]),
  });
}

async function shopifyGQL(query, variables = {}) {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) throw new Error('SHOPIFY_ADMIN_TOKEN not set');
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function fetchAllProducts() {
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await shopifyGQL(`{
      products(first: 50${afterClause}, sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title productType status
            featuredImage { url }
            variants(first: 100) {
              edges {
                node {
                  id title sku price
                  inventoryItem { id }
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`);
    for (const edge of data.products.edges) {
      products.push(edge.node);
    }
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}

module.exports = async function handler(req, res) {
  try {
    let staticStock = { products: [] };
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'stock.json'), 'utf8');
      staticStock = JSON.parse(raw);
    } catch {}

    const staticByName = {};
    for (const p of staticStock.products || []) {
      staticByName[p.product] = p;
    }

    const shopifyProducts = await fetchAllProducts();

    const products = [];
    const categoriesSet = new Set();
    const materialTypesSet = new Set();
    let totalSkus = 0, inStock = 0, lowStock = 0, outOfStock = 0;

    for (const sp of shopifyProducts) {
      const productName = sp.title;
      const staticP = staticByName[productName] || {};

      const productType = sp.productType || staticP.product_type || '';
      const materialType = staticP.material_type || 'Sterling Silver';
      const isLive = sp.status === 'ACTIVE';

      if (productType) categoriesSet.add(productType);
      if (materialType) materialTypesSet.add(materialType);

      const variants = sp.variants.edges.map(ve => {
        const v = ve.node;
        const staticVariant = (staticP.variants || []).find(sv => sv.sku === v.sku);
        totalSkus++;
        const qty = v.inventoryQuantity ?? 0;
        if (qty <= 0) outOfStock++;
        else if (qty <= 3) lowStock++;
        else inStock++;

        return {
          title: v.title,
          sku: v.sku || '',
          supplier_sku: staticVariant?.supplier_sku || '',
          quantity: qty,
        };
      });

      const totalQuantity = variants.reduce((s, v) => s + v.quantity, 0);
      const variantsOos = variants.filter(v => v.quantity <= 0).length;
      const variantsLow = variants.filter(v => v.quantity > 0 && v.quantity <= 3).length;

      const price = sp.variants.edges[0]?.node.price
        ? parseFloat(sp.variants.edges[0].node.price)
        : staticP.price || 0;

      products.push({
        product: productName,
        product_type: productType,
        material_type: materialType,
        price,
        image: sp.featuredImage?.url || staticP.image || '',
        supplier_sku: staticP.supplier_sku || '',
        supplier: staticP.supplier || '',
        is_live: isLive,
        total_quantity: totalQuantity,
        variants_oos: variantsOos,
        variants_low: variantsLow,
        variants,
        components: staticP.components || null,
        is_component: staticP.is_component || false,
        component_of: staticP.component_of || null,
        notes: staticP.notes || null,
      });
    }

    // --- Stock change detection ---
    const now = new Date().toISOString();
    const currentSnapshot = {};
    for (const p of products) {
      for (const v of p.variants) {
        if (v.sku) currentSnapshot[v.sku] = { qty: v.quantity, product: p.product, variant: v.title };
      }
    }

    let changelog = [];
    try {
      const [prevSnapshot, prevLog] = await Promise.all([
        kvGet('stock_snapshot'),
        kvGet('stock_changelog'),
      ]);
      changelog = prevLog || [];

      if (prevSnapshot) {
        const allSkus = new Set([...Object.keys(prevSnapshot), ...Object.keys(currentSnapshot)]);
        for (const sku of allSkus) {
          const prev = prevSnapshot[sku];
          const curr = currentSnapshot[sku];
          if (!prev && curr) {
            changelog.unshift({ timestamp: now, product: curr.product, variant: curr.variant, sku, before: 0, after: curr.qty, change: curr.qty, reason: 'New product added', source: 'Shopify' });
          } else if (prev && !curr) {
            changelog.unshift({ timestamp: now, product: prev.product, variant: prev.variant, sku, before: prev.qty, after: 0, change: -prev.qty, reason: 'Product removed', source: 'Shopify' });
          } else if (prev && curr && prev.qty !== curr.qty) {
            const diff = curr.qty - prev.qty;
            const reason = diff < 0 ? 'Sale / adjustment' : 'Restock / adjustment';
            changelog.unshift({ timestamp: now, product: curr.product, variant: curr.variant, sku, before: prev.qty, after: curr.qty, change: diff, reason, source: 'Shopify' });
          }
        }
      }

      // No cap — full permanent record
      await Promise.all([
        kvSet('stock_snapshot', JSON.stringify(currentSnapshot)),
        kvSet('stock_changelog', JSON.stringify(changelog)),
      ]);
    } catch (e) {
      console.warn('Stock changelog error:', e.message);
    }

    const result = {
      last_updated: now,
      summary: {
        total_products: products.length,
        total_skus: totalSkus,
        in_stock: inStock,
        low_stock: lowStock,
        out_of_stock: outOfStock,
      },
      categories: [...categoriesSet].sort(),
      material_types: [...materialTypesSet],
      products,
      changelog: changelog.slice(0, 50),
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (err) {
    console.error('stock error:', err);
    return res.status(500).json({ error: err.message });
  }
};
