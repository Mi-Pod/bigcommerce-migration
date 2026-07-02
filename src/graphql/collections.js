const { shopifyQl } = require("../api/shopify");

const QUERY = /* GraphQL */ `
  query getCollections($cursor: String) {
    collections(first: 250, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
          description
          image {
            url
            altText
          }
        }
      }
    }
  }
`;

exports.getAllCollections = async (site) => {
  const all = [];
  let cursor = null;

  do {
    const res = await shopifyQl(site, QUERY, cursor ? { cursor } : {});

    if (!res.data && res.errors?.length) {
      const messages = res.errors.map((e) => e.message).join("; ");
      throw new Error(`Shopify GraphQL error: ${messages}`);
    }

    const { edges, pageInfo } = res.data.collections;
    all.push(...edges.map((e) => e.node));
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return all;
};
