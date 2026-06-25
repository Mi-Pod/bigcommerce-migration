const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const { migrateProduct } = require("../scripts/migrate");

router.post("/product", async (req, res) => {
  const { shopifyProductId } = req.body;
  if (!shopifyProductId) {
    return res.status(400).json({ error: "shopifyProductId is required" });
  }
  try {
    const result = await migrateProduct(shopifyProductId);
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate", "Product migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
