const { shopifyQl } = require("../api/shopify");

exports.getCount = async (site) => {
  const res = await shopifyQl(site, /* GraphQL */ `query { articlesCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.articlesCount.count;
};

exports.getPage = async (site, first, after = null) => {
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
            author { name }
            image { url altText }
            blog { id handle title }
          }
        }
      }
    }
  `;
  const res = await shopifyQl(site, query, { first, ...(after ? { after } : {}) });
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

exports.getOne = async (site, id) => {
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
        author { name }
        image { url altText }
        blog { id handle title }
      }
    }
  `;
  const res = await shopifyQl(site, query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.article;
};
