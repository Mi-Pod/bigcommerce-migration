const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { migrateOrder, countOrders, importOrders, validateOrders } = require("../../scripts/orders");

// GET /api/migrate/orders/count
router.get("/count", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await countOrders(site);
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate-orders", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/orders/validate
// Query: site=B2B&batch_size=50&max_batches=1
router.get("/validate", async (req, res) => {
  const { site, batch_size = 50, max_batches = 1 } = req.query;
  try {
    const result = await validateOrders(site, {
      batch_size: Number(batch_size),
      max_batches: Number(max_batches),
    });
    res.json(result);
  } catch (error) {
    logger.failure("validate-orders", "Validation failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/orders/single
// Body: { site: "B2B", shopifyOrderId: "5147081748549" }
router.post("/single", async (req, res) => {
  const { site, shopifyOrderId, save = true } = req.body ?? {};
  if (!shopifyOrderId) {
    return res.status(400).json({ error: "shopifyOrderId is required" });
  }
  try {
    const result = await migrateOrder(site, shopifyOrderId, { save });
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate-order", "Order migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/orders/bulk
// Body: { site: "B2B", batch_size: 50, skip: 0, max_batches: 0 }
router.post("/bulk", async (req, res) => {
  const { site, batch_size = 50, skip = 0, max_batches = 0, save = true } = req.body ?? {};
  try {
    const result = await importOrders(site, { batch_size, skip, max_batches, save });
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate-orders", "Bulk import failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
