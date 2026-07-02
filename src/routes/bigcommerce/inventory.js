const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { inventory } = require("@mipod/bigcommerce");
const { getInventory, wipeInventory, setInventory } = require("../../scripts/inventory");

// ── Inventory ────────────────────────────────────────────────
router.get("/locations", async (req, res) => {
  const { site, ...params } = req.query;
  try {
    res.json(await inventory.getLocations(site, params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/items", async (req, res) => {
  const { site, ...params } = req.query;
  try {
    res.json(await inventory.getItems(site, params));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/absolute", async (req, res) => {
  const { site, items } = req.body;
  try {
    res.json(await inventory.setAbsolute(site, items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/relative", async (req, res) => {
  const { site, items } = req.body;
  try {
    res.json(await inventory.adjustRelative(site, items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/bigcommerce/inventory — locations + top 5 items
router.get("/", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await getInventory(site);
    res.json(result);
  } catch (error) {
    logger.failure("inventory-get", "Inventory fetch failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bigcommerce/inventory/wipe
router.get("/wipe", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await wipeInventory(site);
    res.json(result);
  } catch (error) {
    logger.failure("inventory-wipe", "Inventory wipe failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bigcommerce/inventory/set/:type/:value
router.get("/set/:type/:value", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await setInventory(site, { type: req.params.type, value: req.params.value });
    res.json(result);
  } catch (error) {
    logger.failure("inventory-set", "Inventory set failed", error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
