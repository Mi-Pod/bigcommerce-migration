const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { migrateCustomer, countCustomers, importCustomers, syncCustomerAddresses } = require("../../scripts/customers");

// GET /api/migrate/customers/count
router.get("/count", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await countCustomers(site);
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate-customers", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/customers/bulk
// Body: { site: "B2B", batch_size: 50, skip: 0, max_batches: 0 }
router.post("/bulk", async (req, res) => {
  const { site, batch_size = 50, skip = 0, max_batches = 0, save = true } = req.body ?? {};
  try {
    const result = await importCustomers(site, { batch_size, skip, max_batches, save });
    res.json(result);
  } catch (error) {
    logger.failure("bulk-migrate-customers", "Bulk import failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/customers/sync-addresses
// Body: { site: "B2B", shopifyCustomerId: "2147081748549", bcCustomerId: 123 (optional) }
router.post("/sync-addresses", async (req, res) => {
  const { site, shopifyCustomerId, bcCustomerId = null } = req.body ?? {};
  if (!shopifyCustomerId) {
    return res.status(400).json({ error: "shopifyCustomerId is required" });
  }
  try {
    const result = await syncCustomerAddresses(site, shopifyCustomerId, bcCustomerId);
    res.json(result);
  } catch (error) {
    logger.failure("sync-customer-addresses", "Address sync failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/customers/single
// Body: { site: "B2B", shopifyCustomerId: "2147081748549" }
router.post("/single", async (req, res) => {
  const { site, shopifyCustomerId, save = true } = req.body ?? {};
  if (!shopifyCustomerId) {
    return res.status(400).json({ error: "shopifyCustomerId is required" });
  }
  try {
    const result = await migrateCustomer(site, shopifyCustomerId, { save });
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate-customer", "Customer migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
