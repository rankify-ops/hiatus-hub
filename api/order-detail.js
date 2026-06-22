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

module.exports = async function handler(req, res) {
  try {
    const orderName = req.query.name;
    if (!orderName) return res.status(400).json({ error: 'Missing ?name= parameter' });

    const searchName = orderName.startsWith('#') ? orderName : `#${orderName}`;

    const data = await shopifyGQL(`{
      orders(first: 1, query: "name:${searchName}") {
        edges {
          node {
            id name createdAt cancelledAt cancelReason closedAt
            displayFinancialStatus displayFulfillmentStatus
            note tags
            totalPriceSet { shopMoney { amount currencyCode } }
            subtotalPriceSet { shopMoney { amount currencyCode } }
            totalShippingPriceSet { shopMoney { amount currencyCode } }
            totalTaxSet { shopMoney { amount currencyCode } }
            totalDiscountsSet { shopMoney { amount currencyCode } }
            totalRefundedSet { shopMoney { amount currencyCode } }
            discountCode
            paymentGatewayNames
            customer {
              displayName email phone
              ordersCount { count }
              totalSpentV2 { amount currencyCode }
            }
            shippingAddress {
              name address1 address2 city province zip country phone
            }
            billingAddress {
              name address1 address2 city province zip country
            }
            lineItems(first: 50) {
              edges {
                node {
                  title variantTitle quantity sku
                  originalUnitPriceSet { shopMoney { amount } }
                  discountedUnitPriceSet { shopMoney { amount } }
                  totalDiscountSet { shopMoney { amount } }
                  image { url }
                  product { id }
                }
              }
            }
            fulfillments {
              status displayStatus createdAt
              trackingInfo { number url company }
            }
            refunds {
              createdAt
              note
              totalRefundedSet { shopMoney { amount } }
              refundLineItems(first: 20) {
                edges {
                  node {
                    quantity
                    lineItem { title variantTitle }
                  }
                }
              }
            }
            transactions(first: 10) {
              kind status gateway
              amountSet { shopMoney { amount } }
              processedAt
            }
          }
        }
      }
    }`);

    const orderNode = data.orders.edges[0]?.node;
    if (!orderNode) return res.status(404).json({ error: 'Order not found' });

    const money = s => s?.shopMoney ? parseFloat(s.shopMoney.amount) : 0;
    const currency = orderNode.totalPriceSet?.shopMoney?.currencyCode || 'AUD';

    const result = {
      name: orderNode.name,
      created_at: orderNode.createdAt,
      cancelled_at: orderNode.cancelledAt,
      cancel_reason: orderNode.cancelReason,
      closed_at: orderNode.closedAt,
      financial_status: (orderNode.displayFinancialStatus || '').toLowerCase(),
      fulfillment_status: (orderNode.displayFulfillmentStatus || '').toLowerCase(),
      note: orderNode.note,
      tags: orderNode.tags || [],
      currency,
      shopify_url: `https://${SHOP}/admin/orders/${(orderNode.name || '').replace('#', '')}`,

      totals: {
        subtotal: money(orderNode.subtotalPriceSet),
        shipping: money(orderNode.totalShippingPriceSet),
        tax: money(orderNode.totalTaxSet),
        discounts: money(orderNode.totalDiscountsSet),
        total: money(orderNode.totalPriceSet),
        refunded: money(orderNode.totalRefundedSet),
      },

      discount_code: orderNode.discountCode,
      payment_gateways: orderNode.paymentGatewayNames || [],

      customer: orderNode.customer ? {
        name: orderNode.customer.displayName,
        email: orderNode.customer.email,
        phone: orderNode.customer.phone,
        order_count: orderNode.customer.ordersCount?.count || 0,
        total_spent: money(orderNode.customer.totalSpentV2),
      } : null,

      shipping_address: orderNode.shippingAddress,
      billing_address: orderNode.billingAddress,

      line_items: orderNode.lineItems.edges.map(e => ({
        title: e.node.title,
        variant: e.node.variantTitle,
        quantity: e.node.quantity,
        sku: e.node.sku,
        unit_price: money(e.node.originalUnitPriceSet),
        discounted_price: money(e.node.discountedUnitPriceSet),
        discount: money(e.node.totalDiscountSet),
        image: e.node.image?.url || '',
      })),

      fulfillments: (orderNode.fulfillments || []).map(f => ({
        status: f.displayStatus || f.status,
        created_at: f.createdAt,
        tracking: (f.trackingInfo || []).map(t => ({
          number: t.number,
          url: t.url,
          company: t.company,
        })),
      })),

      refunds: (orderNode.refunds || []).map(r => ({
        created_at: r.createdAt,
        note: r.note,
        amount: money(r.totalRefundedSet),
        items: r.refundLineItems.edges.map(e => ({
          title: e.node.lineItem.title,
          variant: e.node.lineItem.variantTitle,
          quantity: e.node.quantity,
        })),
      })),

      transactions: (orderNode.transactions || []).map(t => ({
        kind: t.kind,
        status: t.status,
        gateway: t.gateway,
        amount: money(t.amountSet),
        processed_at: t.processedAt,
      })),
    };

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(result);
  } catch (err) {
    console.error('order-detail error:', err);
    return res.status(500).json({ error: err.message });
  }
};
