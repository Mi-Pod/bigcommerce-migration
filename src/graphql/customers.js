const { shopifyQl } = require("../api/shopify");

const CUSTOMER_METAFIELD_DEFS = [
  { alias: "mf_avatax_customer_type",               namespace: "avatax_excise", key: "customer_type" },
  { alias: "mf_avatax_customer_no",                 namespace: "avatax_excise", key: "customer_no" },
  { alias: "mf_adv_reg_ein_field",                  namespace: "adv_reg",       key: "EIN-Field" },
  { alias: "mf_limits_exempt_order_limits",         namespace: "limits",        key: "exempt_order_limits" },
  { alias: "mf_configuration_disable_cart_buttons", namespace: "configuration", key: "disable_cart_buttons" },
  { alias: "mf_custom_purchasing_list_subscription",namespace: "custom",        key: "purchasing_list_subscription" },
];

// Collect the aliased metafield fields from a customer object into a flat array.
// Drops any that weren't set on the customer (null positions).
exports.collectMetafields = (customer) =>
  CUSTOMER_METAFIELD_DEFS.map(({ alias }) => customer[alias]).filter(Boolean);

// Total customer count — lightweight, no customer data fetched.
exports.getCount = async () => {
  const res = await shopifyQl(/* GraphQL */ `query { customersCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.customersCount.count;
};

// Fetch one page of customer stubs (id + email + name + state) for cursor-based iteration.
// Returns { nodes, hasNextPage, endCursor }.
exports.getPage = async (first, after = null) => {
  const query = /* GraphQL */ `
    query CustomerPage($first: Int!, $after: String) {
      customers(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id email firstName lastName state createdAt amountSpent { amount } } }
      }
    }
  `;
  const res = await shopifyQl(query, { first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.customers;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

// Advance the cursor by `count` positions without fetching full customer data.
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

// Fetch a single customer by numeric ID or full GID.
exports.getOne = async (customerId) => {
  const id = String(customerId).startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;

  const query = /* GraphQL */ `
    query OneCustomer($id: ID!) {
      customer(id: $id) {
        id
        firstName
        lastName
        email
        phone
        note
        state
        taxExempt
        tags
        createdAt
        updatedAt

        emailMarketingConsent {
          marketingState
          marketingOptInLevel
          consentUpdatedAt
        }

        smsMarketingConsent {
          marketingState
          marketingOptInLevel
          consentUpdatedAt
        }

        defaultAddress {
          id
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
        }

        addresses {
          id
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
        }

        storeCreditAccounts(first: 5) {
          edges {
            node {
              balance {
                amount
                currencyCode
              }
            }
          }
        }

        ${CUSTOMER_METAFIELD_DEFS.map(
          ({ alias, namespace, key }) =>
            `${alias}: metafield(namespace: "${namespace}", key: "${key}") { namespace key value type }`
        ).join("\n        ")}
      }
    }
  `;

  const res = await shopifyQl(query, { id });

  if (!res.data && res.errors?.length) {
    const messages = res.errors.map((e) => e.message).join("; ");
    throw new Error(`Shopify GraphQL error: ${messages}`);
  }

  return res.data;
};
