const shopify = require("../../graphql/products");

exports.getList = async (filter) => {
  const data = await shopify.listAll(filter);

  return data;
};

exports.getOne = async (product_id) => {
  const data = await shopify.getOne(product_id);

  return data;
};
