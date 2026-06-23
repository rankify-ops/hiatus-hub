module.exports = async function handler(req, res) {
  const clientId = process.env.XERO_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'XERO_CLIENT_ID not set' });

  const host = req.headers.host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/xero/callback`;

  const scopes = [
    'openid', 'profile', 'email', 'offline_access',
    'accounting.transactions.read',
    'accounting.reports.read',
    'accounting.contacts.read',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: 'hiatus_xero_auth',
  });

  res.writeHead(302, { Location: `https://login.xero.com/identity/connect/authorize?${params}` });
  res.end();
};
