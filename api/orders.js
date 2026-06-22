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

async function fetchAllOrders() {
  const orders = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await shopifyGQL(`{
      orders(first: 100, sortKey: CREATED_AT, reverse: true${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            totalPriceSet { shopMoney { amount } }
            customer { displayName }
            lineItems(first: 50) {
              edges { node { title quantity } }
            }
          }
        }
      }
    }`);
    for (const edge of data.orders.edges) {
      orders.push(edge.node);
    }
    hasNext = data.orders.pageInfo.hasNextPage;
    cursor = data.orders.pageInfo.endCursor;
  }
  return orders;
}

module.exports = async function handler(req, res) {
  try {
    const allOrders = await fetchAllOrders();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    let totalPaid = 0, totalRefunded = 0, totalPending = 0;
    let revMtd = 0, revQtd = 0, revYtd = 0, revAll = 0;
    const monthlyRevenue = {};
    const productSales = {};

    for (const o of allOrders) {
      const status = (o.displayFinancialStatus || '').toLowerCase();
      const fulfillment = (o.displayFulfillmentStatus || '').toLowerCase();
      const amount = parseFloat(o.totalPriceSet.shopMoney.amount);
      const created = new Date(o.createdAt);
      const yearMonth = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`;

      if (status === 'paid' || status === 'partially_paid') {
        totalPaid++;
        revAll += amount;
        monthlyRevenue[yearMonth] = (monthlyRevenue[yearMonth] || 0) + amount;
        if (created >= monthStart) revMtd += amount;
        if (created >= quarterStart) revQtd += amount;
        if (created >= yearStart) revYtd += amount;

        for (const li of o.lineItems.edges) {
          const name = li.node.title;
          const qty = li.node.quantity;
          if (!productSales[name]) productSales[name] = { units: 0, revenue: 0 };
          productSales[name].units += qty;
          productSales[name].revenue += amount;
        }
      } else if (status === 'refunded' || status === 'partially_refunded') {
        totalRefunded++;
      } else {
        totalPending++;
      }
    }

    const unfulfilled = allOrders.filter(o =>
      (o.displayFulfillmentStatus || '').toLowerCase() !== 'fulfilled'
      && (o.displayFinancialStatus || '').toLowerCase() !== 'refunded'
    ).length;

    const topProducts = Object.entries(productSales)
      .map(([name, d]) => ({ name, units: d.units, revenue: Math.round(d.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    const recentOrders = allOrders.slice(0, 30).map(o => {
      const orderNum = (o.name || '').replace('#', '');
      const items = o.lineItems.edges.map(e => e.node.title).join(', ');
      const status = (o.displayFinancialStatus || '').toLowerCase().replace('_', ' ');
      const fulfillment = (o.displayFulfillmentStatus || '').toLowerCase().replace('_', ' ');
      return {
        order_number: parseInt(orderNum, 10) || orderNum,
        created_at: o.createdAt.split('T')[0],
        customer: o.customer?.displayName || 'Guest',
        items,
        total: parseFloat(o.totalPriceSet.shopMoney.amount),
        financial_status: status === 'partially paid' ? 'paid' : status,
        fulfillment_status: fulfillment === 'unfulfilled' ? 'unfulfilled' : fulfillment,
        shopify_url: `https://${SHOP}/admin/orders/${o.name?.replace('#', '')}`,
      };
    });

    const round2 = n => Math.round(n * 100) / 100;
    const sortedMonthly = {};
    for (const k of Object.keys(monthlyRevenue).sort()) {
      sortedMonthly[k] = round2(monthlyRevenue[k]);
    }

    const result = {
      last_updated: new Date().toISOString(),
      orders: {
        total: allOrders.length,
        paid: totalPaid,
        pending: unfulfilled,
        refunded: totalRefunded,
      },
      revenue: {
        mtd: round2(revMtd),
        qtd: round2(revQtd),
        ytd: round2(revYtd),
        all_time: round2(revAll),
      },
      monthly_revenue: sortedMonthly,
      recent_orders: recentOrders,
      top_products: topProducts,
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (err) {
    console.error('orders error:', err);
    return res.status(500).json({ error: err.message });
  }
};
