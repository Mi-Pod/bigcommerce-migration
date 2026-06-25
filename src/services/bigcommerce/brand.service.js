const { makeRequest } = require("../../api/bigcommerce");

const BASE = "/v3/catalog/brands";

exports.getList = async (params = {}) => {
  return makeRequest("GET", BASE, { params });
};

exports.getOne = async (brandId) => {
  return makeRequest("GET", `${BASE}/${brandId}`);
};

exports.create = async (brandData) => {
  return makeRequest("POST", BASE, { data: brandData });
};

exports.update = async (brandId, brandData) => {
  return makeRequest("PUT", `${BASE}/${brandId}`, { data: brandData });
};

exports.remove = async (brandId) => {
  return makeRequest("DELETE", `${BASE}/${brandId}`);
};
