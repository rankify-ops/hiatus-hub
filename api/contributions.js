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

const KV_KEY = 'hiatus_contributions';

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await kvGet(KV_KEY) || { entries: [] };
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const { action } = req.body;

      if (action === 'add') {
        const { entry } = req.body;
        if (!entry || !entry.amount || !entry.date) return res.status(400).json({ error: 'amount and date required' });
        const data = await kvGet(KV_KEY) || { entries: [] };
        entry.id = Date.now().toString();
        entry.created = new Date().toISOString();
        data.entries.push(entry);
        data.updated = new Date().toISOString();
        await kvSet(KV_KEY, JSON.stringify(data));
        return res.status(200).json({ success: true, entry });
      }

      if (action === 'delete') {
        const { id } = req.body;
        const data = await kvGet(KV_KEY) || { entries: [] };
        data.entries = data.entries.filter(e => e.id !== id);
        data.updated = new Date().toISOString();
        await kvSet(KV_KEY, JSON.stringify(data));
        return res.status(200).json({ success: true });
      }

      if (action === 'update') {
        const { id, updates } = req.body;
        const data = await kvGet(KV_KEY) || { entries: [] };
        const idx = data.entries.findIndex(e => e.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
        Object.assign(data.entries[idx], updates);
        data.updated = new Date().toISOString();
        await kvSet(KV_KEY, JSON.stringify(data));
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'GET or POST' });
  } catch (err) {
    console.error('contributions error:', err);
    return res.status(500).json({ error: err.message });
  }
};
