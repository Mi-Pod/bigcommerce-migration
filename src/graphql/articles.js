const { shopifyQl } = require("../api/shopify");

// Total article count across all blogs.
exports.getCount = async () => {
  const res = await shopifyQl(/* GraphQL */ `query { articlesCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.articlesCount.count;
};

// Fetch one page of articles across all blogs.
// Returns { nodes, hasNextPage, endCursor }.
exports.getPage = async (first, after = null) => {
  const query = /* GraphQL */ `
    query GetArticlesPage($first: Int!, $after: String) {
      articles(first: $first, after: $after) {
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
            tags
            body
            bodySummary
            author { name email }
            image { url altText }
            blog { id handle title }
          }
        }
      }
    }
  `;
  const res = await shopifyQl(query, { first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.articles;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

// Fetch a single article by GID.
exports.getOne = async (id) => {
  const query = /* GraphQL */ `
    query GetArticle($id: ID!) {
      article(id: $id) {
        id
        title
        handle
        isPublished
        publishedAt
        createdAt
        updatedAt
        tags
        body
        bodySummary
        author { name email }
        image { url altText }
        blog { id handle title }
      }
    }
  `;
  const res = await shopifyQl(query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.article;
};
