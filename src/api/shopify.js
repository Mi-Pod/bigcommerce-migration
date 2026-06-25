const axios = require("axios");
require("dotenv").config();

const shopify_store = process.env.SHOPIFY_STORE;
const shopify_api_token = process.env.SHOPIFY_API_TOKEN;
const shopify_api_version = process.env.SHOPIFY_API_VERSION;

exports.shopifyQl = async (query, input) => {
  try {
    const url = `https://${shopify_store}.myshopify.com/admin/api/${shopify_api_version}/graphql.json`;
    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopify_api_token,
    };
    const res = await axios.post(url, {query, variables: input}, {headers});
    return res.data;
  } catch (error) {
    throw error;
  }
};
