const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();
const { makeRequest } = require("../../api/bigcommerce");

const BC_BASE_URL = `https://api.bigcommerce.com/stores/${process.env.BIGCOMMERCE_STORE_HASH}`;
const BC_AUTH = {
  Accept: "application/json",
  "X-Auth-Token": process.env.BIGCOMMERCE_CLIENT_ACCESS_TOKEN,
};

const imagesPath = (productId) => `/v3/catalog/products/${productId}/images`;

exports.getList = async (productId) => {
  return makeRequest("GET", imagesPath(productId));
};

exports.remove = async (productId, imageId) => {
  return makeRequest("DELETE", `${imagesPath(productId)}/${imageId}`);
};

// Strategy 1 — URL passthrough
// BC fetches the image from the URL and stores it on the BC CDN.
// Fastest approach. Works as long as the source URL is publicly accessible.
exports.uploadFromUrl = async (productId, { image_url, description = "", is_thumbnail = false, sort_order = 0 }) => {
  return makeRequest("POST", imagesPath(productId), {
    data: { image_url, description, is_thumbnail, sort_order },
  });
};

// Strategy 2 — Download + re-upload
// Downloads the image as a buffer then POSTs it to BC as multipart form data.
// Use this when source URLs may expire or be restricted after the migration.
exports.uploadFromBuffer = async (productId, sourceUrl, { description = "", is_thumbnail = false, sort_order = 0 } = {}) => {
  const imageRes = await axios.get(sourceUrl, { responseType: "arraybuffer" });
  const buffer = Buffer.from(imageRes.data);
  const ext = sourceUrl.split("?")[0].split(".").pop().toLowerCase() || "jpg";
  const filename = `product_${productId}_${sort_order}.${ext}`;

  const form = new FormData();
  form.append("image_file", buffer, {
    filename,
    contentType: imageRes.headers["content-type"] || "image/jpeg",
  });
  form.append("description", description);
  form.append("is_thumbnail", String(is_thumbnail));
  form.append("sort_order", String(sort_order));

  const res = await axios.post(`${BC_BASE_URL}${imagesPath(productId)}`, form, {
    headers: { ...BC_AUTH, ...form.getHeaders() },
  });
  return res.data;
};
