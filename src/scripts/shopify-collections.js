const fs = require("fs");
const path = require("path");
const { getAllCollections } = require("../graphql/shopify/collections");
const logger = require("../utils/logger");

const DATA_DIR = path.join(__dirname, "../../migration/data");
const OUTPUT_FILE = path.join(DATA_DIR, "shopify-collections.json");

exports.fetchShopifyCollections = async () => {
  const reqId = "shopify-collections";

  logger.info(reqId, "Fetching all Shopify collections...");
  const collections = await getAllCollections();
  logger.success(reqId, `Fetched ${collections.length} collections`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collections, null, 2));
  logger.success(reqId, `Saved → ${OUTPUT_FILE}`);

  return { count: collections.length, collections };
};
