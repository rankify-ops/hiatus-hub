const fs = require('fs');
const path = require('path');

const SHOP = '97850c.myshopify.com';
const API_VERSION = '2024-10';
const SQUARE_BASE = 'https://connect.squareup.com/v2';

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

async function getSquareRevenue() {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return { total: 0, count: 0 };
  try {
    const locRes = await fetch(`${SQUARE_BASE}/locations`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': '2024-10-17' },
    });
    const locData = await locRes.json();
    const locationIds = (locData.locations || []).map(l => l.id);
    if (!locationIds.length) return { total: 0, count: 0 };

    const ordersRes = await fetch(`${SQUARE_BASE}/orders/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Square-Version': '2024-10-17',
      },
      body: JSON.stringify({
        location_ids: locationIds,
        query: {
          filter: { state_filter: { states: ['COMPLETED'] } },
          sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' },
        },
        limit: 500,
      }),
    });
    const ordersData = await ordersRes.json();
    const orders = ordersData.orders || [];
    const total = orders.reduce((sum, o) => sum + ((o.total_money?.amount || 0) / 100), 0);
    return { total, count: orders.length };
  } catch (e) {
    console.warn('Square revenue fetch failed:', e.message);
    return { total: 0, count: 0 };
  }
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

module.exports = async function handler(req, res) {
  try {
    let staticOverview = {};
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'overview.json'), 'utf8');
      staticOverview = JSON.parse(raw);
    } catch {}

    const [shopifyData, ordersData, square] = await Promise.all([
      shopifyGQL(`{
        productsCount: productsCount { count }
        ordersCount: ordersCount { count }
        pendingOrders: ordersCount(query: "fulfillment_status:unfulfilled") { count }
      }`),
      shopifyGQL(`{
        allTimeOrders: orders(first: 250, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
          edges {
            node {
              totalPriceSet { shopMoney { amount } }
              createdAt
            }
          }
        }
      }`),
      getSquareRevenue(),
    ]);

    const monthStart = startOfMonth();
    const allOrders = ordersData.allTimeOrders.edges.map(e => e.node);
    const shopifyAllTime = allOrders.reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0);
    const shopifyMTD = allOrders
      .filter(o => o.createdAt >= monthStart)
      .reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0);

    const metrics = {
      monthly_revenue: Math.round(shopifyMTD * 100) / 100,
      all_time_revenue: Math.round(shopifyAllTime * 100) / 100,
      shopify_revenue: Math.round(shopifyAllTime * 100) / 100,
      market_revenue: Math.round(square.total * 100) / 100,
      combined_revenue: Math.round((shopifyAllTime + square.total) * 100) / 100,
      total_orders: shopifyData.ordersCount.count,
      market_sales: square.count,
      combined_sales: shopifyData.ordersCount.count + square.count,
      pending_orders: shopifyData.pendingOrders.count,
      total_products: shopifyData.productsCount.count,
      monthly_costs: staticOverview.metrics?.monthly_costs ?? 0,
    };

    const result = {
      last_updated: new Date().toISOString(),
      status: staticOverview.status || {},
      alerts: staticOverview.alerts || [],
      metrics,
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (err) {
    console.error('overview error:', err);
    return res.status(500).json({ error: err.message });
  }
};
