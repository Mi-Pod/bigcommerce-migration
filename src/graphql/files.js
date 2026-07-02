const { shopifyQl } = require("../api/shopify");

exports.getCount = async (site) => {
  const res = await shopifyQl(site, /* GraphQL */ `query { filesCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.filesCount.count;
};

exports.getPage = async (site, first, after = null) => {
  const query = /* GraphQL */ `
    query GetFilesPage($first: Int!, $after: String) {
      files(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            alt
            createdAt
            updatedAt
            fileStatus
            ... on MediaImage {
              mimeType
              image { url width height }
            }
            ... on Video {
              sources { url mimeType format height width }
            }
            ... on GenericFile {
              url
              mimeType
              originalFileSize
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
  const { edges, pageInfo } = res.data.files;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

exports.getOne = async (site, id) => {
  const query = /* GraphQL */ `
    query GetFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id alt createdAt updatedAt fileStatus mimeType
          image { url width height }
        }
        ... on Video {
          id alt createdAt updatedAt fileStatus
          sources { url mimeType format height width }
        }
        ... on GenericFile {
          id alt createdAt updatedAt fileStatus url mimeType originalFileSize
        }
      }
    }
  `;
  const res = await shopifyQl(site, query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.node;
};
