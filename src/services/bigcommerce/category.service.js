const { makeRequest } = require("../../api/bigcommerce");

const BASE = "/v3/catalog/categories";

exports.getList = async (params = {}) => {
  return makeRequest("GET", BASE, { params });
};

exports.getOne = async (categoryId) => {
  return makeRequest("GET", `${BASE}/${categoryId}`);
};

exports.create = async (categoryData) => {
  return makeRequest("POST", BASE, { data: categoryData });
};

exports.update = async (categoryId, categoryData) => {
  return makeRequest("PUT", `${BASE}/${categoryId}`, { data: categoryData });
};

exports.remove = async (categoryId) => {
  return makeRequest("DELETE", `${BASE}/${categoryId}`);
};
