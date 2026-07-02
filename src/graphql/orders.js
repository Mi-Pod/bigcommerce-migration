const { shopifyQl } = require("../api/shopify");

const ADDRESS_FIELDS = /* GraphQL */ `
  firstName
  lastName
  company
  address1
  address2
  city
  province
  provinceCode
  country
  countryCodeV2
  zip
  phone
`;

exports.getCount = async (site) => {
  const res = await shopifyQl(site, /* GraphQL */ `query { ordersCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.ordersCount.count;
};

exports.getPage = async (site, first, after = null) => {
  const query = /* GraphQL */ `
    query OrderPage($first: Int!, $after: String) {
      orders(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            name
            createdAt
            cancelledAt
            test
            displayFinancialStatus
            displayFulfillmentStatus
            customer { email }
            currentTotalPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  `;
  const res = await shopifyQl(site, query, { first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.orders;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

exports.advanceCursor = async (site, count) => {
  let cursor = null;
  let remaining = count;
  while (remaining > 0) {
    const take = Math.min(remaining, 250);
    const page = await exports.getPage(site, take, cursor);
    cursor = page.endCursor;
    remaining -= take;
    if (!page.hasNextPage) break;
  }
  return cursor;
};

exports.getOne = async (site, orderId) => {
  const id = String(orderId).startsWith("gid://")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  const query = /* GraphQL */ `
    query OneOrder($id: ID!) {
      order(id: $id) {
        id
        name
        note
        tags
        createdAt
        cancelledAt
        test
        displayFinancialStatus
        displayFulfillmentStatus
        currentTotalPriceSet { shopMoney { amount } }

        customer {
          id
          email
          firstName
          lastName
        }

        billingAddress { ${ADDRESS_FIELDS} }
        shippingAddress { ${ADDRESS_FIELDS} }

        shippingLine { title }

        lineItems(first: 100) {
          edges {
            node {
              sku
              title
              variantTitle
              quantity
              originalUnitPriceSet { shopMoney { amount } }
            }
          }
        }
      }
    }
  `;

  const res = await shopifyQl(site, query, { id });

  if (!res.data && res.errors?.length) {
    const messages = res.errors.map((e) => e.message).join("; ");
    throw new Error(`Shopify GraphQL error: ${messages}`);
  }

  return res.data;
};
