const { makeRequest } = require("../../api/bigcommerce");

// List inventory locations (BC supports multi-location; default location id is 1)
exports.getLocations = async (params = {}) => {
  return makeRequest("GET", "/v3/inventory/locations", { params });
};

// Get current inventory levels — filter by sku, variant_id, location_id, etc.
exports.getItems = async (params = {}) => {
  return makeRequest("GET", "/v3/inventory/items", { params });
};

// Set inventory to an exact quantity (overwrites current level)
// items: [{ sku, location_id, quantity }]
exports.setAbsolute = async (items) => {
  return makeRequest("PUT", "/v3/inventory/adjustments/absolute", {
    data: { items },
  });
};

// Adjust inventory by a delta (positive = add, negative = subtract)
// items: [{ sku, location_id, quantity }]
exports.adjustRelative = async (items) => {
  return makeRequest("POST", "/v3/inventory/adjustments/relative", {
    data: { items },
  });
};
