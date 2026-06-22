const SQUARE_BASE = 'https://connect.squareup.com/v2';

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

module.exports = async function handler(req, res) {
  try {
    // Get locations for market name mapping
    const locData = await squareAPI('GET', '/locations');
    const locations = {};
    for (const loc of (locData.locations || [])) {
      locations[loc.id] = loc.name;
    }

    // Fetch orders from Square — last 12 months
    const since = new Date();
    since.setMonth(since.getMonth() - 12);

    const searchBody = {
      location_ids: Object.keys(locations),
      query: {
        filter: {
          state_filter: { states: ['COMPLETED'] },
          date_time_filter: {
            created_at: { start_at: since.toISOString() },
          },
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' },
      },
      limit: 500,
    };

    const ordersData = await squareAPI('POST', '/orders/search', searchBody);
    const orders = ordersData.orders || [];

    const sales = [];
    let totalRevenue = 0;
    const marketTotals = {};

    for (const order of orders) {
      if (!order.line_items?.length) continue;

      const locationName = locations[order.location_id] || 'Unknown';
      const total = (order.total_money?.amount || 0) / 100;
      const date = order.created_at?.slice(0, 10) || '';
      const paymentMethod = order.tenders?.[0]?.type || 'OTHER';

      const items = order.line_items.map(li => ({
        name: li.name || 'Unknown Item',
        qty: parseInt(li.quantity, 10) || 1,
        price: (li.base_price_money?.amount || 0) / 100,
      }));

      // Customer from tenders or fulfillments
      const customerName = order.tenders?.[0]?.customer_id ? 'Card Customer' : 'Walk-in';

      sales.push({
        id: `SQ-${order.id.slice(-6).toUpperCase()}`,
        date,
        market_name: locationName,
        customer: customerName,
        items,
        total,
        payment_method: paymentMethod === 'CARD' ? 'Card' : paymentMethod === 'CASH' ? 'Cash' : paymentMethod,
        square_order_id: order.id,
      });

      totalRevenue += total;
      marketTotals[locationName] = (marketTotals[locationName] || 0) + total;
    }

    const marketsAttended = Object.keys(marketTotals).length;
    const avgPerMarket = marketsAttended > 0 ? totalRevenue / marketsAttended : 0;

    const result = {
      last_updated: new Date().toISOString(),
      source: 'Square POS',
      summary: {
        total_sales: sales.length,
        total_revenue: totalRevenue,
        total_markets_attended: marketsAttended,
        avg_per_market: avgPerMarket,
        by_market: marketTotals,
      },
      sales,
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(result);
  } catch (err) {
    console.error('market-sales error:', err);
    return res.status(500).json({ error: err.message });
  }
};
