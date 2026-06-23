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

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const costs = await kvGet('product_costs') || {};
      const history = await kvGet('cost_history') || [];
      return res.status(200).json({ costs, history });
    }

    if (req.method === 'POST') {
      const { sku, cost_price, sell_price, note } = req.body;
      if (!sku) return res.status(400).json({ error: 'SKU required' });

      const costs = await kvGet('product_costs') || {};
      const history = await kvGet('cost_history') || [];

      const prev = costs[sku] || {};
      const entry = {
        sku,
        timestamp: new Date().toISOString(),
        old_cost: prev.cost_price || null,
        new_cost: cost_price !== undefined ? parseFloat(cost_price) : prev.cost_price,
        old_sell: prev.sell_price || null,
        new_sell: sell_price !== undefined ? parseFloat(sell_price) : prev.sell_price,
        note: note || '',
      };

      costs[sku] = {
        cost_price: entry.new_cost,
        sell_price: entry.new_sell,
        updated: entry.timestamp,
      };

      history.unshift(entry);
      // No cap — full permanent record

      await kvSet('product_costs', JSON.stringify(costs));
      await kvSet('cost_history', JSON.stringify(history));

      return res.status(200).json({ success: true, sku, costs: costs[sku], entry });
    }

    if (req.method === 'PUT') {
      // Bulk update
      const { items } = req.body;
      if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

      const costs = await kvGet('product_costs') || {};
      const history = await kvGet('cost_history') || [];
      const now = new Date().toISOString();

      for (const item of items) {
        if (!item.sku) continue;
        const prev = costs[item.sku] || {};
        const entry = {
          sku: item.sku,
          timestamp: now,
          old_cost: prev.cost_price || null,
          new_cost: item.cost_price !== undefined ? parseFloat(item.cost_price) : prev.cost_price,
          old_sell: prev.sell_price || null,
          new_sell: item.sell_price !== undefined ? parseFloat(item.sell_price) : prev.sell_price,
          note: item.note || 'Bulk update',
        };
        costs[item.sku] = {
          cost_price: entry.new_cost,
          sell_price: entry.new_sell,
          updated: now,
        };
        history.unshift(entry);
      }

      // No cap — full permanent record
      await kvSet('product_costs', JSON.stringify(costs));
      await kvSet('cost_history', JSON.stringify(history));

      return res.status(200).json({ success: true, updated: items.length });
    }

    return res.status(405).json({ error: 'GET, POST, or PUT' });
  } catch (err) {
    console.error('costs error:', err);
    return res.status(500).json({ error: err.message });
  }
};
