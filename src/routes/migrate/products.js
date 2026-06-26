const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { migrateProduct } = require("../../scripts/migrate");
const { countProducts, importProducts } = require("../../scripts/bulk-migrate");

// GET /api/migrate/products/count — total Shopify product count
router.get("/count", async (req, res) => {
  try {
    const result = await countProducts();
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/products/bulk — bulk import with batching
// Body: { batch_size: 10, skip: 0, max_batches: 0 }
router.post("/bulk", async (req, res) => {
  const { batch_size = 10, skip = 0, max_batches = 0 } = req.body ?? {};
  try {
    const result = await importProducts({ batch_size, skip, max_batches });
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate", "Bulk import failed", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/single", async (req, res) => {
  const { shopifyProductId, outputJson = true } = req.body;
  if (!shopifyProductId) {
    return res.status(400).json({ error: "shopifyProductId is required" });
  }
  try {
    const result = await migrateProduct(shopifyProductId, { outputJson });
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate", "Product migration failed", error);
    res.status(500).json({ error: error.message });
  }
});


module.exports = router;
