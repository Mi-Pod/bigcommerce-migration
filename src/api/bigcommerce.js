const axios = require("axios");
require("dotenv").config();

exports.makeRequest = async (site, method, path, { params, data } = {}) => {
  const storeHash = process.env[`${site}_BIGCOMMERCE_STORE_HASH`];
  const token = process.env[`${site}_BIGCOMMERCE_CLIENT_ACCESS_TOKEN`];
  const baseUrl = `https://api.bigcommerce.com/stores/${storeHash}`;
  try {
    const res = await axios({
      method,
      url: `${baseUrl}${path}`,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Auth-Token": token,
      },
      params,
      data,
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.title || error.message;
    const errors = error.response?.data?.errors;
    const detail = errors ? ` — ${JSON.stringify(errors)}` : "";
    throw new Error(`BigCommerce API error [${status}]: ${message}${detail}`);
  }
};
