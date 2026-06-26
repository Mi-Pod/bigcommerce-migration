const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { fetchShopifyCollections } = require("../../scripts/shopify-collections");
const { mapNavCollections } = require("../../scripts/nav-collection-map");
const { mapCollectionVisibility } = require("../../scripts/collection-visibility-map");

// GET /api/migrate/shopify/collections — fetch all Shopify collections → migration/data/shopify-collections.json
router.get("/collections", async (req, res) => {
  try {
    const result = await fetchShopifyCollections();
    res.json(result);
  } catch (error) {
    logger.failure("shopify-collections", "Failed to fetch Shopify collections", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/shopify/collection-visibility-map — compare collections vs BC categories, flag hidden & visibility mismatches
router.get("/collection-visibility-map", async (req, res) => {
  try {
    const result = await mapCollectionVisibility();
    res.json(result);
  } catch (error) {
    logger.failure("collection-visibility-map", "Failed to map collection visibility", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/shopify/nav-collection-map — match nav items to collections → migration/data/nav-collection-map.json
router.get("/nav-collection-map", async (req, res) => {
  try {
    const result = await mapNavCollections();
    res.json(result);
  } catch (error) {
    logger.failure("nav-collection-map", "Failed to map nav collections", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
