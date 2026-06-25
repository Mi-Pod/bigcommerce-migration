const { makeRequest } = require("../../api/bigcommerce");

const BASE = "/v3/catalog/products";

exports.getList = async (params = {}) => {
  return makeRequest("GET", BASE, { params });
};

exports.getOne = async (productId) => {
  return makeRequest("GET", `${BASE}/${productId}`);
};

exports.create = async (productData) => {
  return makeRequest("POST", BASE, { data: productData });
};

exports.update = async (productId, productData) => {
  return makeRequest("PUT", `${BASE}/${productId}`, { data: productData });
};

exports.remove = async (productId) => {
  return makeRequest("DELETE", `${BASE}/${productId}`);
};
