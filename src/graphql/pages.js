const { shopifyQl } = require("../api/shopify");

// Total page count.
exports.getCount = async () => {
  const res = await shopifyQl(/* GraphQL */ `query { pagesCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.pagesCount.count;
};

// Fetch one page of online store pages.
// Returns { nodes, hasNextPage, endCursor }.
exports.getPage = async (first, after = null) => {
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
            author
            body
            bodySummary
            templateSuffix
          }
        }
      }
    }
  `;
  const res = await shopifyQl(query, { first, ...(after ? { after } : {}) });
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

// Fetch a single page by GID.
exports.getOne = async (id) => {
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
  const res = await shopifyQl(query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.page;
};
