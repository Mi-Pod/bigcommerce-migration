const { makeRequest } = require("../../api/bigcommerce");

const BASE = "/v3/customers";

exports.getList = async (params = {}) => {
  return makeRequest("GET", BASE, { params });
};

exports.getOne = async (customerId) => {
  return makeRequest("GET", BASE, { params: { "id:in": customerId } });
};

exports.create = async (customerData) => {
  return makeRequest("POST", BASE, { data: [customerData] });
};

exports.update = async (customerId, customerData) => {
  return makeRequest("PUT", BASE, { data: [{ id: customerId, ...customerData }] });
};

exports.remove = async (customerId) => {
  return makeRequest("DELETE", BASE, { params: { "id:in": customerId } });
};
