const { makeRequest } = require("../../api/bigcommerce");

const BASE = "/v2/customer_groups";

exports.getList = async (params = {}) => {
  return makeRequest("GET", BASE, { params });
};

exports.getOne = async (groupId) => {
  return makeRequest("GET", `${BASE}/${groupId}`);
};

exports.create = async (groupData) => {
  return makeRequest("POST", BASE, { data: groupData });
};

exports.update = async (groupId, groupData) => {
  return makeRequest("PUT", `${BASE}/${groupId}`, { data: groupData });
};

exports.remove = async (groupId) => {
  return makeRequest("DELETE", `${BASE}/${groupId}`);
};
