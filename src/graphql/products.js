const { shopifyQl } = require("../api/shopify");

// Each entry maps a stable alias (used as a field alias in GraphQL) to its namespace+key.
// The singular `metafield(namespace, key)` field works for any app-owned or admin-set metafield.
const METAFIELD_DEFS = [
  { alias: "mf_order_limits_order_maximum", namespace: "order_limits", key: "order_maximum" },
  { alias: "mf_filter_built_in_usa",        namespace: "filter",       key: "built_in_usa" },
  { alias: "mf_filter_product_category",    namespace: "filter",       key: "product_category" },
  { alias: "mf_filter_flavor",              namespace: "filter",       key: "flavor" },
  { alias: "mf_filter_type",               namespace: "filter",       key: "type" },
  { alias: "mf_filter_product_brand",       namespace: "filter",       key: "product_brand" },
  { alias: "mf_filter_product_line",        namespace: "filter",       key: "product_line" },
  { alias: "mf_custom_contains",            namespace: "custom",       key: "contains" },
];

// Collect the aliased metafield fields from a product object into a flat array.
// Drops any that weren't set on the product (null positions).
exports.collectMetafields = (product) =>
  METAFIELD_DEFS.map(({ alias }) => product[alias]).filter(Boolean);

// Total product count — lightweight, no product data fetched.
exports.getCount = async () => {
  const res = await shopifyQl(/* GraphQL */ `query { productsCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.productsCount.count;
};

// Fetch one page of product stubs (id + title + handle + status) for cursor-based iteration.
// Returns { nodes, hasNextPage, endCursor }.
exports.getPage = async (first, after = null) => {
  const query = /* GraphQL */ `
    query getProductPage($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id title handle status } }
      }
    }
  `;
  const res = await shopifyQl(query, { first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.products;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

// Advance the cursor by `count` positions without fetching full product data.
// Used to implement a `skip` offset before bulk import starts.
exports.advanceCursor = async (count) => {
  let cursor = null;
  let remaining = count;
  while (remaining > 0) {
    const take = Math.min(remaining, 250);
    const page = await exports.getPage(take, cursor);
    cursor = page.endCursor;
    remaining -= take;
    if (!page.hasNextPage) break;
  }
  return cursor;
};

// Fetch every collection a product belongs to, paginated.
// Kept separate from getOne so it can be called independently and handles >10 memberships.
exports.getProductCollections = async (productId) => {
  const all = [];
  let cursor = null;

  do {
    const query = /* GraphQL */ `
      query getProductCollections($id: ID!, $cursor: String) {
        product(id: $id) {
          collections(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges { node { id handle title } }
          }
        }
      }
    `;
    const res = await shopifyQl(query, { id: productId, ...(cursor ? { cursor } : {}) });

    if (!res.data && res.errors?.length) {
      const messages = res.errors.map((e) => e.message).join("; ");
      throw new Error(`Shopify GraphQL error: ${messages}`);
    }

    const { edges, pageInfo } = res.data.product.collections;
    all.push(...edges.map((e) => e.node));
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return all;
};

exports.listAll = async (parameters) => {
  const query = /* GraphQL */ `
    query ManyProducts {
      products(${parameters}) {
        edges {
          node {
            id
            handle
            title
            status
            descriptionHtml
            tags
            seo {
              title
              description
            }
            images(first: 20) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            options {
              name
              position
              values
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryQuantity
                  image {
                    url
                  }
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
          cursor
        }
      }
    }
  `;

  const input = null;
  const res = await shopifyQl(query, input);
  return res.data;
};

exports.getOne = async (object_id) => {
  // Step 1: get the exact variant count so we don't truncate
  const countQuery = /* GraphQL */ `
    query ProductVariantCount {
      product(id: "${object_id}") {
        variantsCount { count }
      }
    }
  `;
  const countRes = await shopifyQl(countQuery, null);
  const variantCount = countRes.data?.product?.variantsCount?.count ?? 250;

  // Step 2: fetch full product using the real count (Shopify max: 250)
  const query = /* GraphQL */ `
    query OneProduct {
      product(id: "${object_id}") {
        id
        handle
        title
        descriptionHtml
        status
        productType
        vendor
        tags
        seo {
          title
          description
        }
        images(first: 20) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
        options {
          name
          position
          values
        }
        variants(first: ${variantCount}) {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              image {
                url
              }
              selectedOptions {
                name
                value
              }
            }
          }
        }
        ${METAFIELD_DEFS.map(
          ({ alias, namespace, key }) =>
            `${alias}: metafield(namespace: "${namespace}", key: "${key}") { namespace key value type }`
        ).join("\n        ")}
      }
    }
  `;
  const res = await shopifyQl(query, null);

  if (!res.data && res.errors?.length) {
    const messages = res.errors.map((e) => e.message).join("; ");
    throw new Error(`Shopify GraphQL error: ${messages}`);
  }

  return res.data;
};
