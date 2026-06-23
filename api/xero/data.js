const XERO_API = 'https://api.xero.com/api.xro/2.0';

function parseXeroDate(d) {
  if (!d) return '';
  // Xero returns "/Date(1234567890000+0000)/" format
  const match = d.match(/\/Date\((\d+)/);
  if (match) return new Date(parseInt(match[1])).toISOString().split('T')[0];
  // Already ISO
  if (d.includes('-')) return d.split('T')[0];
  return d;
}

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

async function refreshTokens(stored) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    }),
  });

  if (!res.ok) throw new Error('Token refresh failed — re-authorize at /api/xero/auth');
  const tokens = await res.json();

  const updated = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
    tenant_id: stored.tenant_id,
  };
  await kvSet('xero_tokens', JSON.stringify(updated));
  return updated;
}

async function getTokens() {
  let stored = await kvGet('xero_tokens');
  if (!stored) throw new Error('Xero not connected — visit /api/xero/auth');
  if (Date.now() > stored.expires_at - 120000) {
    stored = await refreshTokens(stored);
  }
  return stored;
}

async function xeroGet(path, accessToken, tenantId) {
  const res = await fetch(`${XERO_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Xero ${res.status}: ${await res.text()}`);
  return res.json();
}

module.exports = async function handler(req, res) {
  try {
    const tokens = await getTokens();
    const { access_token, tenant_id } = tokens;
    const report = req.query.report || 'summary';
    const period = req.query.period || 'ytd';

    if (report === 'status') {
      return res.status(200).json({ connected: true, tenant_id });
    }

    // Calculate date range from period
    const now = new Date();
    let fromDate, toDate = now.toISOString().split('T')[0];
    if (period === 'month') {
      fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      fromDate = `${now.getFullYear()}-${String(qMonth + 1).padStart(2, '0')}-01`;
    } else if (period === 'year') {
      fromDate = `${now.getFullYear()}-01-01`;
    } else if (period === 'all') {
      fromDate = '2020-01-01';
    } else {
      fromDate = `${now.getFullYear()}-01-01`;
    }

    if (report === 'pnl') {
      const data = await xeroGet(`/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`, access_token, tenant_id);
      return res.status(200).json(data);
    }

    if (report === 'balance') {
      const data = await xeroGet('/Reports/BalanceSheet', access_token, tenant_id);
      return res.status(200).json(data);
    }

    // Default: full summary
    const [pnl, bank, invoices, repeating] = await Promise.all([
      xeroGet(`/Reports/ProfitAndLoss?fromDate=${fromDate}&toDate=${toDate}`, access_token, tenant_id),
      xeroGet('/BankTransactions?order=Date%20DESC&pageSize=30', access_token, tenant_id),
      xeroGet('/Invoices?order=Date%20DESC&pageSize=20&Statuses=AUTHORISED,PAID', access_token, tenant_id),
      xeroGet('/RepeatingInvoices', access_token, tenant_id).catch(() => ({ RepeatingInvoices: [] })),
    ]);

    // Parse P&L report rows
    const pnlRows = pnl.Reports?.[0]?.Rows || [];
    let totalIncome = 0, totalExpenses = 0, netProfit = 0;
    const incomeLines = [], expenseLines = [];

    for (const section of pnlRows) {
      if (section.RowType === 'Section') {
        const title = (section.Title || '').toLowerCase();
        const rows = section.Rows || [];
        for (const row of rows) {
          if (row.RowType === 'Row' && row.Cells) {
            const name = row.Cells[0]?.Value || '';
            const amount = parseFloat(row.Cells[1]?.Value) || 0;
            if (amount === 0) continue;
            if (title.includes('income') || title.includes('revenue')) {
              incomeLines.push({ name, amount });
            } else if (title.includes('expense') || title.includes('cost') || title.includes('operating')) {
              expenseLines.push({ name, amount });
            }
          }
          if (row.RowType === 'SummaryRow' && row.Cells) {
            const amount = parseFloat(row.Cells[1]?.Value) || 0;
            if (title.includes('income') || title.includes('revenue')) totalIncome = amount;
            else if (title.includes('expense') || title.includes('cost') || title.includes('operating')) totalExpenses = amount;
          }
        }
      }
      if (section.RowType === 'Section' && (section.Title || '').toLowerCase().includes('net')) {
        const summaryRow = (section.Rows || []).find(r => r.RowType === 'SummaryRow');
        if (summaryRow?.Cells) netProfit = parseFloat(summaryRow.Cells[1]?.Value) || 0;
      }
    }

    // Parse bank transactions
    const recentTransactions = (bank.BankTransactions || []).map(t => ({
      date: parseXeroDate(t.DateString || t.Date),
      type: t.Type,
      description: t.Contact?.Name || t.Reference || 'Unknown',
      amount: t.Total || 0,
      account: t.BankAccount?.Name || '',
      reference: t.Reference || '',
      status: t.Status,
      is_reconciled: t.IsReconciled,
    }));

    // Parse invoices
    const recentInvoices = (invoices.Invoices || []).map(i => ({
      number: i.InvoiceNumber,
      date: parseXeroDate(i.DateString || i.Date),
      due_date: parseXeroDate(i.DueDateString || i.DueDate),
      contact: i.Contact?.Name || '',
      total: i.Total || 0,
      amount_due: i.AmountDue || 0,
      amount_paid: i.AmountPaid || 0,
      status: i.Status,
      type: i.Type,
    }));

    // Parse repeating invoices (subscriptions)
    const subscriptions = (repeating.RepeatingInvoices || []).map(r => {
      const schedule = r.Schedule || {};
      const lineTotal = (r.LineItems || []).reduce((sum, li) => sum + (li.UnitAmount || 0) * (li.Quantity || 1), 0);
      return {
        name: r.Contact?.Name || (r.LineItems || [])[0]?.Description || 'Unknown',
        description: (r.LineItems || []).map(li => li.Description).filter(Boolean).join(', '),
        amount: r.Total || lineTotal,
        tax: r.TotalTax || 0,
        period: schedule.Period || 1,
        unit: (schedule.Unit || 'MONTHLY').toLowerCase(),
        next_date: parseXeroDate(schedule.NextScheduledDate),
        start_date: parseXeroDate(schedule.StartDate),
        status: r.Status,
        type: r.Type,
      };
    }).filter(s => s.status === 'AUTHORISED');

    const result = {
      connected: true,
      last_updated: new Date().toISOString(),
      period: `${fromDate} to ${toDate}`,
      period_label: period,
      profit_and_loss: {
        total_income: totalIncome,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        income_lines: incomeLines,
        expense_lines: expenseLines,
      },
      recent_transactions: recentTransactions,
      recent_invoices: recentInvoices,
      subscriptions: subscriptions,
    };

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json(result);
  } catch (err) {
    console.error('xero-data error:', err);
    if (err.message.includes('not connected') || err.message.includes('re-authorize')) {
      return res.status(200).json({ connected: false, error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
};
