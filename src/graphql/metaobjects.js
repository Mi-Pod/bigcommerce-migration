const { shopifyQl } = require("../api/shopify");

exports.getDefinitions = async (site) => {
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
    const res = await shopifyQl(site, query, { first: 50, ...(cursor ? { after: cursor } : {}) });
    if (!res.data && res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join("; "));
    }
    const { edges, pageInfo } = res.data.metaobjectDefinitions;
    all.push(...edges.map((e) => e.node));
    cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return all;
};

exports.getCount = async (site, type) => {
  const res = await shopifyQl(site, /* GraphQL */ `query CountMetaobjects($type: String!) { metaobjectsCount(type: $type) { count } }`, { type });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.metaobjectsCount.count;
};

exports.getPage = async (site, type, first, after = null) => {
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
  const res = await shopifyQl(site, query, { type, first, ...(after ? { after } : {}) });
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

exports.getOne = async (site, id) => {
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
  const res = await shopifyQl(site, query, { id });
  if (!res.data && res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return res.data.metaobject;
};
