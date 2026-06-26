const express = require("express");
const router = express.Router();
const logger = require("../utils/logger");
const productService = require("../services/bigcommerce/product.service");
const customerService = require("../services/bigcommerce/customer.service");
const { makeRequest } = require("../api/bigcommerce");
const { fieldValidation, translateProduct, migrateImages } = require("../scripts/test");
const { extractSampleCustomers, composeCustomer } = require("../scripts/customers");

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

router.get("/extract-customers", async (req, res) => {
  try {
    const result = await extractSampleCustomers();
    res.json(result);
  } catch (error) {
    logger.failure("extract-customers", "Customer extraction failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/test/compose-customer?id=2852474519615
router.get("/compose-customer", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id query param is required" });
  try {
    const result = await composeCustomer(id);
    res.json(result);
  } catch (error) {
    logger.failure("compose-customer", "Customer composition failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/test/bc-customer?id=123
router.get("/bc-customer", async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: "id query param is required" });
  }
  try {
    const [customerRes, addressRes, metafieldRes] = await Promise.all([
      customerService.getOne(id),
      makeRequest("GET", "/v3/customers/addresses", { params: { "customer_id:in": id } }),
      makeRequest("GET", `/v3/customers/${id}/metafields`),
    ]);
    res.json({
      customer: customerRes.data?.[0] ?? null,
      addresses: addressRes.data ?? [],
      metafields: metafieldRes.data ?? [],
    });
  } catch (error) {
    logger.failure("bc-customer", "BC customer fetch failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/test/product-metafields?bcProductId=123
router.get("/product-metafields", async (req, res) => {
  const { bcProductId } = req.query;
  if (!bcProductId) {
    return res.status(400).json({ error: "bcProductId query param is required" });
  }
  try {
    const result = await makeRequest("GET", `/v3/catalog/products/${bcProductId}/metafields`);
    res.json({ bc_product_id: Number(bcProductId), metafields: result.data ?? [] });
  } catch (error) {
    logger.failure("product-metafields", "Metafield fetch failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
