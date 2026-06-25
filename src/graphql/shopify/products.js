const { shopifyQl } = require("../../api/shopify");

exports.listAll = async (parameters) => {
  const query = /* GraphQL */ `
    query ManyProducts {
      products(${parameters}) {
        edges {
          node {
            id
            handle
            title
            status
            descriptionHtml
            tags
            seo {
              title
              description
            }
            images(first: 20) {
              edges {
                node {
                  id
                  url
                  altText
                }
              }
            }
            options {
              name
              position
              values
            }
            variants(first: 100) {
              edges {
                node {
                  id
                  sku
                  price
                  inventoryQuantity
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
          }
          cursor
        }
      }
    }
  `;

  const input = null;
  const res = await shopifyQl(query, input);
  return res.data;
};

exports.getOne = async (object_id) => {
  // Step 1: get the exact variant count so we don't truncate
  const countQuery = /* GraphQL */ `
    query ProductVariantCount {
      product(id: "${object_id}") {
        variantsCount { count }
      }
    }
  `;
  const countRes = await shopifyQl(countQuery, null);
  const variantCount = countRes.data?.product?.variantsCount?.count ?? 250;

  // Step 2: fetch full product using the real count (Shopify max: 250)
  const query = /* GraphQL */ `
    query OneProduct {
      product(id: "${object_id}") {
        id
        handle
        title
        descriptionHtml
        status
        productType
        vendor
        tags
        seo {
          title
          description
        }
        images(first: 20) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
        options {
          name
          position
          values
        }
        variants(first: ${variantCount}) {
          edges {
            node {
              id
              sku
              price
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
        metafields(first: 20) {
          edges {
            node {
              namespace
              key
              value
              type
            }
          }
        }
      }
    }
  `;
  const res = await shopifyQl(query, null);

  if (!res.data && res.errors?.length) {
    const messages = res.errors.map((e) => e.message).join("; ");
    throw new Error(`Shopify GraphQL error: ${messages}`);
  }

  return res.data;
};
