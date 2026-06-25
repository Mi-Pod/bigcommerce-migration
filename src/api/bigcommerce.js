const axios = require("axios");
require("dotenv").config();

const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
const accessToken = process.env.BIGCOMMERCE_CLIENT_ACCESS_TOKEN;

const BASE_URL = `https://api.bigcommerce.com/stores/${storeHash}`;

const defaultHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "X-Auth-Token": accessToken,
};

exports.makeRequest = async (method, path, { params, data } = {}) => {
  try {
    const res = await axios({
      method,
      url: `${BASE_URL}${path}`,
      headers: defaultHeaders,
      params,
      data,
    });
    return res.data;
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.title || error.message;
    throw new Error(`BigCommerce API error [${status}]: ${message}`);
  }
};
