const { shopifyQl } = require("../api/shopify");

// List all metaobject definitions (types) in the store.
exports.getDefinitions = async () => {
  const query = /* GraphQL */ `
    query GetMetaobjectDefinitions($first: Int!, $after: String) {
      metaobjectDefinitions(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            type
            name
            displayNameKey
            fieldDefinitions {
              key
              required
              type { name }
            }
          }
        }
      }
    }
  `;

  const all = [];
  let cursor = null;

  do {
    const res = await shopifyQl(query, { first: 50, ...(cursor ? { after: cursor } : {}) });
    if (!res.data && res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join("; "));
    }
    const { edges, pageInfo } = res.data.metaobjectDefinitions;
    all.push(...edges.map((e) => e.node));
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return all;
};

// Count instances of a given metaobject type.
exports.getCount = async (type) => {
  const res = await shopifyQl(/* GraphQL */ `query CountMetaobjects($type: String!) { metaobjectsCount(type: $type) { count } }`, { type });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.metaobjectsCount.count;
};

// Fetch one page of metaobject instances for a given type.
// Returns { nodes, hasNextPage, endCursor }.
exports.getPage = async (type, first, after = null) => {
  const query = /* GraphQL */ `
    query GetMetaobjectPage($type: String!, $first: Int!, $after: String) {
      metaobjects(type: $type, first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            type
            handle
            displayName
            updatedAt
            fields { key value type }
          }
        }
      }
    }
  `;
  const res = await shopifyQl(query, { type, first, ...(after ? { after } : {}) });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const { edges, pageInfo } = res.data.metaobjects;
  return {
    nodes: edges.map((e) => e.node),
    hasNextPage: pageInfo.hasNextPage,
    endCursor: pageInfo.endCursor,
  };
};

// Fetch a single metaobject by GID.
exports.getOne = async (id) => {
  const query = /* GraphQL */ `
    query GetMetaobject($id: ID!) {
      metaobject(id: $id) {
        id
        type
        handle
        displayName
        updatedAt
        fields { key value type }
      }
    }
  `;
  const res = await shopifyQl(query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.metaobject;
};
