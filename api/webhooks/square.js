const SHOP = '97850c.myshopify.com';
const API_VERSION = '2024-10';
const SQUARE_BASE = 'https://connect.squareup.com/v2';
const LOCATION_ID = '64242647083';

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

async function squareAPI(method, path) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) throw new Error('SQUARE_ACCESS_TOKEN not set');
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Square-Version': '2024-10-17',
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Square ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json;
}

async function decrementShopifyInventory(sku, quantity) {
  // Find the inventory item by SKU
  const data = await shopifyGQL(`{
    productVariants(first: 5, query: "sku:${sku}") {
      edges {
        node {
          id
          inventoryItem {
            id
            inventoryLevel(locationId: "gid://shopify/Location/${LOCATION_ID}") {
              id
              quantities(names: ["available"]) {
                quantity
              }
            }
          }
        }
      }
    }
  }`);

  const variant = data.productVariants.edges[0]?.node;
  if (!variant?.inventoryItem?.inventoryLevel) {
    console.warn(`No inventory found for SKU: ${sku}`);
    return null;
  }

  const inventoryItemId = variant.inventoryItem.id;
  const adjustResult = await shopifyGQL(`mutation {
    inventoryAdjustQuantities(input: {
      reason: "correction"
      name: "available"
      changes: [{
        delta: -${quantity}
        inventoryItemId: "${inventoryItemId}"
        locationId: "gid://shopify/Location/${LOCATION_ID}"
      }]
    }) {
      inventoryAdjustmentGroup {
        changes {
          name
          delta
        }
      }
      userErrors {
        field
        message
      }
    }
  }`);

  return adjustResult;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const event = req.body;
    const eventType = event.type;

    // We care about payment.completed events
    if (eventType !== 'payment.completed' && eventType !== 'payment.created') {
      return res.status(200).json({ message: 'Event ignored', type: eventType });
    }

    const payment = event.data?.object?.payment;
    if (!payment) {
      return res.status(200).json({ message: 'No payment data in event' });
    }

    const orderId = payment.order_id;
    if (!orderId) {
      return res.status(200).json({ message: 'No order_id on payment' });
    }

    // Fetch the full order from Square to get line items
    const orderData = await squareAPI('GET', `/orders/${orderId}`);
    const order = orderData.order;

    if (!order?.line_items?.length) {
      return res.status(200).json({ message: 'Order has no line items' });
    }

    const results = [];

    for (const item of order.line_items) {
      const sku = item.catalog_object_id ? null : item.variation_name;
      const qty = parseInt(item.quantity, 10) || 1;

      // Try to get SKU from catalog
      let itemSku = null;
      if (item.catalog_object_id) {
        try {
          const catalogItem = await squareAPI('GET', `/catalog/object/${item.catalog_object_id}`);
          itemSku = catalogItem.object?.item_variation_data?.sku;
        } catch (e) {
          console.warn('Could not fetch catalog item:', e.message);
        }
      }

      if (itemSku) {
        try {
          const adjustResult = await decrementShopifyInventory(itemSku, qty);
          results.push({ sku: itemSku, quantity: qty, status: 'decremented', result: adjustResult });
        } catch (err) {
          results.push({ sku: itemSku, quantity: qty, status: 'error', error: err.message });
        }
      } else {
        results.push({ item: item.name, quantity: qty, status: 'skipped_no_sku' });
      }
    }

    console.log('Square webhook processed:', JSON.stringify({
      order_id: orderId,
      results,
    }));

    return res.status(200).json({
      message: 'Processed',
      order_id: orderId,
      items_processed: results.length,
      results,
    });
  } catch (err) {
    console.error('Square webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};
