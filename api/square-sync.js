const SHOP = '97850c.myshopify.com';
const API_VERSION = '2024-10';
const SQUARE_BASE = 'https://connect.squareup.com/v2';

async function shopifyGQL(query) {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) throw new Error('SHOPIFY_ADMIN_TOKEN not set');
  const res = await fetch(`https://${SHOP}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Shopify ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function squareAPI(method, path, body) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN not set');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Square-Version': '2024-10-17',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SQUARE_BASE}${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(`Square ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json;
}

async function fetchAllShopifyProducts() {
  const products = [];
  let cursor = null;
  let hasNext = true;
  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await shopifyGQL(`{
      products(first: 50, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            title handle productType
            featuredImage { url }
            variants(first: 100) {
              edges {
                node {
                  title sku price
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`);
    for (const edge of data.products.edges) products.push(edge.node);
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}

function toSquareMoney(price) {
  return Math.round(parseFloat(price) * 100);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only — this pushes Shopify products into Square' });
  }

  try {
    const shopifyProducts = await fetchAllShopifyProducts();

    // Get existing Square catalog to avoid duplicates
    const existing = await squareAPI('POST', '/catalog/search', {
      object_types: ['ITEM'],
      limit: 100,
    });
    const existingNames = new Set((existing.objects || []).map(o => o.item_data?.name));

    const batches = [];
    let batchObjects = [];

    for (const product of shopifyProducts) {
      if (existingNames.has(product.title)) continue;

      const variants = product.variants.edges.map(e => e.node);
      const itemId = `#shopify_${product.handle}`;

      const itemVariations = variants.map((v, i) => ({
        type: 'ITEM_VARIATION',
        id: `${itemId}_var_${i}`,
        item_variation_data: {
          item_id: itemId,
          name: v.title || 'Default',
          sku: v.sku || '',
          pricing_type: 'FIXED_PRICING',
          price_money: {
            amount: toSquareMoney(v.price),
            currency: 'AUD',
          },
          track_inventory: true,
        },
      }));

      batchObjects.push({
        type: 'ITEM',
        id: itemId,
        item_data: {
          name: product.title,
          product_type: product.productType || 'REGULAR',
          variations: itemVariations,
        },
      });

      if (batchObjects.length >= 10) {
        batches.push([...batchObjects]);
        batchObjects = [];
      }
    }
    if (batchObjects.length > 0) batches.push(batchObjects);

    const results = { synced: 0, skipped: existingNames.size, errors: [] };

    for (const batch of batches) {
      try {
        const idempotencyKey = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await squareAPI('POST', '/catalog/batch-upsert', {
          idempotency_key: idempotencyKey,
          batches: [{ objects: batch }],
        });
        results.synced += batch.length;
      } catch (err) {
        results.errors.push(err.message);
      }
    }

    // Sync inventory quantities
    if (results.synced > 0) {
      // Get locations to find the default one
      const locations = await squareAPI('GET', '/locations');
      const locationId = locations.locations?.[0]?.id;

      if (locationId) {
        // Re-fetch catalog to get real Square IDs for newly created items
        const catalog = await squareAPI('POST', '/catalog/search', {
          object_types: ['ITEM_VARIATION'],
          limit: 1000,
        });

        const inventoryChanges = [];
        for (const obj of (catalog.objects || [])) {
          const sku = obj.item_variation_data?.sku;
          if (!sku) continue;

          // Find matching Shopify variant
          for (const product of shopifyProducts) {
            for (const edge of product.variants.edges) {
              if (edge.node.sku === sku && edge.node.inventoryQuantity > 0) {
                inventoryChanges.push({
                  type: 'PHYSICAL_COUNT',
                  physical_count: {
                    catalog_object_id: obj.id,
                    location_id: locationId,
                    quantity: String(edge.node.inventoryQuantity),
                    state: 'IN_STOCK',
                    occurred_at: new Date().toISOString(),
                  },
                });
              }
            }
          }
        }

        if (inventoryChanges.length > 0) {
          const invKey = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await squareAPI('POST', '/inventory/batch-change', {
            idempotency_key: invKey,
            changes: inventoryChanges,
          });
          results.inventory_synced = inventoryChanges.length;
        }
      }
    }

    return res.status(200).json({
      message: `Synced ${results.synced} products from Shopify to Square. ${results.skipped} already existed.`,
      ...results,
    });
  } catch (err) {
    console.error('square-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
};
