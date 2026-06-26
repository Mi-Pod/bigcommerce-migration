const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const inventoryService = require("../../services/bigcommerce/inventory.service");
const { getInventory, wipeInventory, setInventory } = require("../../scripts/inventory");

// ── Inventory ────────────────────────────────────────────────
router.get("/locations", async (req, res) => {
  try {
    res.json(await inventoryService.getLocations(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/items", async (req, res) => {
  try {
    res.json(await inventoryService.getItems(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/absolute", async (req, res) => {
  try {
    res.json(await inventoryService.setAbsolute(req.body.items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/relative", async (req, res) => {
  try {
    res.json(await inventoryService.adjustRelative(req.body.items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// GET /api/bigcommerce/inventory — locations + top 5 items
router.get("/", async (req, res) => {
  try {
    const result = await getInventory();
    res.json(result);
  } catch (error) {
    logger.failure("inventory-get", "Inventory fetch failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bigcommerce/inventory/wipe — set all quantities to 0
router.get("/wipe", async (req, res) => {
  try {
    const result = await wipeInventory();
    res.json(result);
  } catch (error) {
    logger.failure("inventory-wipe", "Inventory wipe failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bigcommerce/inventory/set/:type/:value
//   type:  "absolute" | "relative"
//   value: number | "rand" (picks random 1–5)
router.get("/set/:type/:value", async (req, res) => {
  try {
    const result = await setInventory({ type: req.params.type, value: req.params.value });
    res.json(result);
  } catch (error) {
    logger.failure("inventory-set", "Inventory set failed", error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
