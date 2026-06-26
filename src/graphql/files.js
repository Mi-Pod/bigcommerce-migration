const { shopifyQl } = require("../api/shopify");

// Total file count across all types.
exports.getCount = async () => {
  const res = await shopifyQl(/* GraphQL */ `query { filesCount { count } }`, null);
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.filesCount.count;
};

// Fetch one page of files (MediaImage | Video | GenericFile union).
// Returns { nodes, hasNextPage, endCursor }.
exports.getPage = async (first, after = null) => {
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
              filename
              mimeType
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
  const res = await shopifyQl(query, { first, ...(after ? { after } : {}) });
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

// Fetch a single file by GID via the node interface (no dedicated file(id:) root query exists).
exports.getOne = async (id) => {
  const query = /* GraphQL */ `
    query GetFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id alt createdAt updatedAt fileStatus mimeType
          image { url width height }
        }
        ... on Video {
          id alt createdAt updatedAt fileStatus filename mimeType
          sources { url mimeType format height width }
        }
        ... on GenericFile {
          id alt createdAt updatedAt fileStatus url mimeType originalFileSize
        }
      }
    }
  `;
  const res = await shopifyQl(query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.node;
};
