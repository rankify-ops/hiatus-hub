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

async function fetchAllProducts() {
  const products = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const data = await shopifyGQL(`{
      products(first: 50, sortKey: TITLE, query: "status:active"${afterClause}) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            title handle productType status
            featuredImage { url }
            variants(first: 100) {
              edges {
                node {
                  price
                  inventoryQuantity
                }
              }
            }
            metafield(namespace: "custom", key: "material") { value }
          }
        }
      }
    }`);
    for (const edge of data.products.edges) {
      products.push(edge.node);
    }
    hasNext = data.products.pageInfo.hasNextPage;
    cursor = data.products.pageInfo.endCursor;
  }
  return products;
}

const STORE_DOMAIN = 'hiatuscollection.com.au';

module.exports = async function handler(req, res) {
  try {
    const shopifyProducts = await fetchAllProducts();

    const catalogue = shopifyProducts.map(p => {
      const variants = p.variants.edges.map(e => e.node);
      const price = variants[0]?.price ? parseFloat(variants[0].price) : 0;
      const totalStock = variants.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0);
      const material = p.metafield?.value || guessMaterial(p.title);

      return {
        title: p.title,
        type: p.productType || 'Other',
        material,
        price,
        image: p.featuredImage?.url || '',
        url: `https://${STORE_DOMAIN}/products/${p.handle}`,
        variant_count: variants.length,
        total_stock: totalStock,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(catalogue);
  } catch (err) {
    console.error('catalogue error:', err);
    return res.status(500).json({ error: err.message });
  }
};

function guessMaterial(title) {
  const t = (title || '').toUpperCase();
  if (t.includes('BRASS') || t.includes('GOLD')) return 'Brass 2.5G Micron';
  if (t.includes('MICRON')) return 'S/Silver 2.5G Micron';
  return 'Sterling Silver';
}
