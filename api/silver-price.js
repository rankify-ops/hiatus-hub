module.exports = async function handler(req, res) {
  try {
    const range = req.query.range || '1y';
    const intervalMap = {
      '1w': '15m', '1mo': '1d', '3mo': '1d', '6mo': '1d',
      '1y': '1d', '5y': '1wk', 'max': '1mo',
    };
    const interval = intervalMap[range] || '1d';

    // Yahoo Finance silver futures — free, no API key
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/SI=F?range=${range}&interval=${interval}&includePrePost=false`;
    const yahooRes = await fetch(yahooUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!yahooRes.ok) throw new Error(`Yahoo Finance ${yahooRes.status}`);
    const yahoo = await yahooRes.json();
    const result = yahoo.chart?.result?.[0];
    if (!result) throw new Error('No data from Yahoo Finance');

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const meta = result.meta || {};

    // Current price
    const currentUSD = meta.regularMarketPrice || closes[closes.length - 1] || 0;
    const prevClose = meta.chartPreviousClose || closes[0] || currentUSD;

    // Get AUD exchange rate
    let audRate = 1.55;
    try {
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD');
      if (fxRes.ok) {
        const fxData = await fxRes.json();
        audRate = fxData.rates?.AUD || 1.55;
      }
    } catch {}

    // Build historical data points
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      const price = closes[i];
      if (price === null || price === undefined) continue;
      history.push({
        t: timestamps[i] * 1000,
        usd: Math.round(price * 100) / 100,
        aud: Math.round(price * audRate * 100) / 100,
      });
    }

    const currentAUD = currentUSD * audRate;
    const change = currentUSD - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    // Period high/low
    const validCloses = closes.filter(c => c !== null && c !== undefined);
    const periodHigh = Math.max(...validCloses);
    const periodLow = Math.min(...validCloses);

    const output = {
      current: {
        usd_oz: Math.round(currentUSD * 100) / 100,
        aud_oz: Math.round(currentAUD * 100) / 100,
        aud_gram: Math.round((currentAUD / 31.1035) * 100) / 100,
        usd_aud_rate: Math.round(audRate * 10000) / 10000,
      },
      change: {
        usd: Math.round(change * 100) / 100,
        pct: Math.round(changePct * 100) / 100,
        direction: change >= 0 ? 'up' : 'down',
      },
      period: {
        range,
        high_usd: Math.round(periodHigh * 100) / 100,
        low_usd: Math.round(periodLow * 100) / 100,
        high_aud: Math.round(periodHigh * audRate * 100) / 100,
        low_aud: Math.round(periodLow * audRate * 100) / 100,
      },
      history,
      updated: new Date().toISOString(),
    };

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(output);
  } catch (err) {
    console.error('silver-price error:', err);
    return res.status(500).json({ error: err.message });
  }
};
