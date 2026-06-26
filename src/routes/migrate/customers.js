const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { migrateCustomer } = require("../../scripts/customers");

// POST /api/migrate/customers/single
// Body: { shopifyCustomerId: "2147081748549" }
router.post("/single", async (req, res) => {
  const { shopifyCustomerId } = req.body;
  if (!shopifyCustomerId) {
    return res.status(400).json({ error: "shopifyCustomerId is required" });
  }
  try {
    const result = await migrateCustomer(shopifyCustomerId);
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate-customer", "Customer migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
