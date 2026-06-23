const SHOP = '97850c.myshopify.com';
const API_VERSION = '2024-10';

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
  if (!url || !token) throw new Error('Vercel KV not configured');
  const res = await fetch(`${url}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value]),
  });
  if (!res.ok) throw new Error(`KV set failed: ${res.status}`);
}

async function refreshTokens(stored) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: stored.refresh_token }),
  });
  if (!res.ok) throw new Error('Token refresh failed — re-authorize at /api/xero/auth');
  const tokens = await res.json();
  const updated = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    tenant_id: stored.tenant_id,
  };
  await kvSet('xero_tokens', JSON.stringify(updated));
  return updated;
}

async function getTokens() {
  let stored = await kvGet('xero_tokens');
  if (!stored) throw new Error('Xero not connected — visit /api/xero/auth');
  if (Date.now() > stored.expires_at - 120000) {
    stored = await refreshTokens(stored);
  }
  return stored;
}

async function xeroRequest(method, path, accessToken, tenantId, body) {
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://api.xero.com/api.xro/2.0${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`Xero ${res.status}: ${text}`);
  return JSON.parse(text);
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
            variants(first: 100) {
              edges {
                node {
                  title sku price
                  inventoryQuantity
                  inventoryItem {
                    unitCost { amount }
                  }
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only — syncs Shopify inventory to Xero' });
  }

  try {
    const tokens = await getTokens();
    const { access_token, tenant_id } = tokens;

    // Fetch existing Xero items to avoid duplicates
    const existingData = await xeroRequest('GET', '/Items', access_token, tenant_id);
    const existingItems = existingData.Items || [];
    const existingByCodes = {};
    for (const item of existingItems) {
      existingByCodes[item.Code] = item;
    }

    // Fetch Shopify products and KV cost prices
    const [shopifyProducts, kvCosts] = await Promise.all([
      fetchAllShopifyProducts(),
      kvGet('product_costs').then(c => c || {}),
    ]);

    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const product of shopifyProducts) {
      const variants = product.variants.edges.map(e => e.node);

      for (const variant of variants) {
        const sku = variant.sku;
        if (!sku) { results.skipped++; continue; }

        const itemCode = sku.substring(0, 30);
        const name = variants.length === 1
          ? product.title
          : `${product.title} — ${variant.title}`;
        const sellPrice = parseFloat(variant.price) || 0;
        const costPrice = kvCosts[sku]?.cost_price || 0;
        const qty = variant.inventoryQuantity || 0;

        const itemPayload = {
          Code: itemCode,
          Name: name.substring(0, 50),
          Description: name,
          PurchaseDescription: name,
          PurchaseDetails: {
            UnitPrice: costPrice,
            AccountCode: '300',
          },
          SalesDetails: {
            UnitPrice: sellPrice,
            AccountCode: '200',
          },
          IsTrackedAsInventory: true,
          InventoryAssetAccountCode: '630',
          QuantityOnHand: qty,
        };

        try {
          if (existingByCodes[itemCode]) {
            // Update — can't change QuantityOnHand via Items endpoint after creation
            const updatePayload = { ...itemPayload };
            delete updatePayload.QuantityOnHand;
            delete updatePayload.IsTrackedAsInventory;
            delete updatePayload.InventoryAssetAccountCode;
            await xeroRequest('POST', '/Items', access_token, tenant_id, { Items: [updatePayload] });
            results.updated++;
          } else {
            await xeroRequest('PUT', `/Items/${encodeURIComponent(itemCode)}`, access_token, tenant_id, itemPayload);
            results.created++;
          }
        } catch (err) {
          results.errors.push({ sku: itemCode, name, error: err.message });
        }
      }
    }

    return res.status(200).json({
      message: `Synced ${results.created} new, ${results.updated} updated, ${results.skipped} skipped (no SKU)`,
      ...results,
    });
  } catch (err) {
    console.error('xero-stock-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
};
