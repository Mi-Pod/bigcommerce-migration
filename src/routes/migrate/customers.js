const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { migrateCustomer, countCustomers, importCustomers, syncCustomerAddresses } = require("../../scripts/customers");

// GET /api/migrate/customers/count
router.get("/count", async (req, res) => {
  try {
    const result = await countCustomers();
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate-customers", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/customers/bulk
// Body: { batch_size: 50, skip: 0, max_batches: 0 }
router.post("/bulk", async (req, res) => {
  const { batch_size = 50, skip = 0, max_batches = 0, save = true } = req.body ?? {};
  try {
    const result = await importCustomers({ batch_size, skip, max_batches, save });
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate-customers", "Bulk import failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/customers/sync-addresses
// Body: { shopifyCustomerId: "2147081748549", bcCustomerId: 123 (optional) }
router.post("/sync-addresses", async (req, res) => {
  const { shopifyCustomerId, bcCustomerId = null } = req.body ?? {};
  if (!shopifyCustomerId) {
    return res.status(400).json({ error: "shopifyCustomerId is required" });
  }
  try {
    const result = await syncCustomerAddresses(shopifyCustomerId, bcCustomerId);
    res.json(result);
  } catch (error) {
    logger.failure("sync-customer-addresses", "Address sync failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/customers/single
// Body: { shopifyCustomerId: "2147081748549" }
router.post("/single", async (req, res) => {
  const { shopifyCustomerId, save = true } = req.body ?? {};
  if (!shopifyCustomerId) {
    return res.status(400).json({ error: "shopifyCustomerId is required" });
  }
  try {
    const result = await migrateCustomer(shopifyCustomerId, { save });
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate-customer", "Customer migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
