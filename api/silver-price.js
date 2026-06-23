module.exports = async function handler(req, res) {
  try {
    // metals.live is free, no API key needed
    const response = await fetch('https://api.metals.live/v1/spot/silver');
    if (!response.ok) throw new Error(`metals.live ${response.status}`);
    const data = await response.json();
    // Returns array of {timestamp, price} — latest first
    const latest = data[0] || data;
    const priceUSD = latest.price || latest;

    // Convert USD to AUD (fetch exchange rate)
    let audRate = 1.55; // fallback
    try {
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        audRate = fxData.rates?.AUD || 1.55;
      }
    } catch {}

    const priceAUD = (typeof priceUSD === 'number' ? priceUSD : parseFloat(priceUSD)) * audRate;
    const pricePerGram = priceAUD / 31.1035; // troy oz to grams

    const result = {
      silver_usd_oz: typeof priceUSD === 'number' ? priceUSD : parseFloat(priceUSD),
      silver_aud_oz: Math.round(priceAUD * 100) / 100,
      silver_aud_gram: Math.round(pricePerGram * 100) / 100,
      usd_aud_rate: Math.round(audRate * 10000) / 10000,
      updated: new Date().toISOString(),
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('silver-price error:', err);
    return res.status(500).json({ error: err.message });
  }
};
