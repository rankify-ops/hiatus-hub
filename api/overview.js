const fs = require('fs');
const path = require('path');

const SHOP = '97850c.myshopify.com';
const API_VERSION = '2024-10';

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

    const data = await shopifyGQL(`{
      productsCount: productsCount { count }
      orders: orders(first: 1, sortKey: CREATED_AT, reverse: true) {
        edges { node { id } }
      }
      ordersCount: ordersCount { count }
      pendingOrders: ordersCount(query: "fulfillment_status:unfulfilled") { count }
    }`);

    const monthStart = startOfMonth();
    const ordersData = await shopifyGQL(`{
      allTimeOrders: orders(first: 250, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
        edges {
          node {
            totalPriceSet { shopMoney { amount } }
            createdAt
          }
        }
      }
    }`);

    const allOrders = ordersData.allTimeOrders.edges.map(e => e.node);
    const allTimeRevenue = allOrders.reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0);
    const monthlyRevenue = allOrders
      .filter(o => o.createdAt >= monthStart)
      .reduce((sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount), 0);

    const metrics = {
      monthly_revenue: Math.round(monthlyRevenue * 100) / 100,
      all_time_revenue: Math.round(allTimeRevenue * 100) / 100,
      total_orders: data.ordersCount.count,
      pending_orders: data.pendingOrders.count,
      total_products: data.productsCount.count,
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
