const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { migrateProduct } = require("../../scripts/migrate");
const { countProducts, importProducts } = require("../../scripts/bulk-migrate");

// GET /api/migrate/products/count — total Shopify product count
router.get("/count", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await countProducts(site);
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/products/bulk — bulk import with batching
// Body: { site: "B2B", batch_size: 10, skip: 0, max_batches: 0 }
router.post("/bulk", async (req, res) => {
  const { site, batch_size = 10, skip = 0, max_batches = 0 } = req.body ?? {};
  try {
    const result = await importProducts(site, { batch_size, skip, max_batches });
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate", "Bulk import failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/products/single
// Body: { site: "B2B", shopifyProductId: "gid://shopify/Product/123", outputJson: true }
router.post("/single", async (req, res) => {
  const { site, shopifyProductId, outputJson = true } = req.body;
  if (!shopifyProductId) {
    return res.status(400).json({ error: "shopifyProductId is required" });
  }
  try {
    const result = await migrateProduct(site, shopifyProductId, { outputJson });
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate", "Product migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
