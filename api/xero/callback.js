async function kvSet(key, value) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Vercel KV not configured');
  const res = await fetch(`${url}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`KV set failed: ${res.status}`);
}

module.exports = async function handler(req, res) {
  const { code, state } = req.query;
  if (state !== 'hiatus_xero_auth' || !code) {
    return res.status(400).json({ error: 'Invalid callback' });
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Xero credentials not set' });

  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/xero/callback`;

  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return res.status(500).json({ error: 'Token exchange failed', detail: err });
  }

  const tokens = await tokenRes.json();

  // Get tenant ID (Xero org)
  const connRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const connections = await connRes.json();
  const tenantId = connections[0]?.tenantId;

  await kvSet('xero_tokens', JSON.stringify({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    tenant_id: tenantId,
  }));

  res.writeHead(302, { Location: '/?xero=connected' });
  res.end();
};
