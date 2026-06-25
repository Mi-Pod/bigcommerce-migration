const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const productService = require("../services/bigcommerce/product.service");
const customerService = require("../services/bigcommerce/customer.service");
const { fieldValidation, translateProduct, migrateImages } = require("../scripts/test");

router.get("/bigcommerce", async (req, res) => {
  const reqId = "bc-test";

  try {
    logger.notice(reqId, "Starting BigCommerce test — fetching first 5 products and customers");

    logger.info(reqId, "Fetching first 5 products...");
    const productsRes = await productService.getList({ limit: 5 });
    const products = productsRes.data;
    logger.success(reqId, `Retrieved ${products.length} products`);
    products.forEach((p) => logger.trace(reqId, `Product: [${p.id}] ${p.name}`));

    logger.info(reqId, "Fetching first 5 customers...");
    const customersRes = await customerService.getList({ limit: 5 });
    const customers = customersRes.data;
    logger.success(reqId, `Retrieved ${customers.length} customers`);
    customers.forEach((c) =>
      logger.trace(reqId, `Customer: [${c.id}] ${c.first_name} ${c.last_name} — ${c.email}`)
    );

    logger.notice(reqId, "BigCommerce test complete");

    res.json({ products, customers });
  } catch (error) {
    logger.failure(reqId, "BigCommerce test failed", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/field-validation", async (req, res) => {
  try {
    const result = await fieldValidation();
    res.json(result);
  } catch (error) {
    logger.failure("field-validation", "Field validation failed", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/translate-product", async (req, res) => {
  try {
    const result = await translateProduct();
    res.json(result);
  } catch (error) {
    logger.failure("translate-product", "Product translation failed", error);
    res.status(500).json({ error: error.message });
  }
});

// bcProductId passed as query param: /api/test/migrate-images?bcProductId=123
router.get("/migrate-images", async (req, res) => {
  try {
    const { bcProductId } = req.query;
    const result = await migrateImages(bcProductId);
    res.json(result);
  } catch (error) {
    logger.failure("migrate-images", "Image migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
