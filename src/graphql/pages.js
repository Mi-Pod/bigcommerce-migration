const { shopifyQl } = require("../api/shopify");

exports.getCount = async (site) => {
  const res = await shopifyQl(site, /* GraphQL */ `query { pagesCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.pagesCount.count;
};

exports.getPage = async (site, first, after = null) => {
  const query = /* GraphQL */ `
    query GetPagesPage($first: Int!, $after: String) {
      pages(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            handle
            isPublished
            publishedAt
            createdAt
            updatedAt
            body
            templateSuffix
          }
        }
      }
    }
  `;
  const res = await shopifyQl(site, query, { first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.pages;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

exports.getOne = async (site, id) => {
  const query = /* GraphQL */ `
    query GetPage($id: ID!) {
      page(id: $id) {
        id
        title
        handle
        isPublished
        publishedAt
        createdAt
        updatedAt
        author
        body
        bodySummary
        templateSuffix
      }
    }
  `;
  const res = await shopifyQl(site, query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.page;
};
