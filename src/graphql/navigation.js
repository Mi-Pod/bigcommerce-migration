const { shopifyQl } = require("../api/shopify");

exports.getMenusPage = async (site, first, after = null) => {
  const query = /* GraphQL */ `
    query GetMenusPage($first: Int!, $after: String) {
      menus(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            items {
              id
              title
              url
              type
              resourceId
              items {
                id
                title
                url
                type
                resourceId
              }
            }
          }
        }
      }
    }
  `;
  const res = await shopifyQl(site, query, { first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.menus;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

exports.getMenu = async (site, id) => {
  const query = /* GraphQL */ `
    query getMenu($id: ID!) {
      menu(id: $id) {
        id
        title
        handle
        items {
          id
          title
          url
          type
          resourceId
          items {
            id
            title
            url
            type
            resourceId
            items {
              id
              title
              url
              type
              resourceId
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
