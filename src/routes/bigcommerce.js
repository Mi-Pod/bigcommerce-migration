const express = require("express");
const router = express.Router();
const customerGroupService = require("../services/bigcommerce/customer-group.service");
const categoryService = require("../services/bigcommerce/category.service");
const brandService = require("../services/bigcommerce/brand.service");
const inventoryService = require("../services/bigcommerce/inventory.service");

// ── Customer Groups ──────────────────────────────────────────
router.get("/customer-groups", async (req, res) => {
  try {
    const data = await customerGroupService.getList(req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/customer-groups/:id", async (req, res) => {
  try {
    const data = await customerGroupService.getOne(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/customer-groups", async (req, res) => {
  try {
    const data = await customerGroupService.create(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/customer-groups/:id", async (req, res) => {
  try {
    const data = await customerGroupService.update(req.params.id, req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/customer-groups/:id", async (req, res) => {
  try {
    await customerGroupService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Categories ───────────────────────────────────────────────
router.get("/categories", async (req, res) => {
  try {
    const data = await categoryService.getList(req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/categories/:id", async (req, res) => {
  try {
    const data = await categoryService.getOne(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/categories", async (req, res) => {
  try {
    const data = await categoryService.create(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/categories/:id", async (req, res) => {
  try {
    const data = await categoryService.update(req.params.id, req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/categories/:id", async (req, res) => {
  try {
    await categoryService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Brands ───────────────────────────────────────────────────
router.get("/brands", async (req, res) => {
  try {
    const data = await brandService.getList(req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/brands/:id", async (req, res) => {
  try {
    const data = await brandService.getOne(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/brands", async (req, res) => {
  try {
    const data = await brandService.create(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/brands/:id", async (req, res) => {
  try {
    const data = await brandService.update(req.params.id, req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/brands/:id", async (req, res) => {
  try {
    await brandService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Inventory ────────────────────────────────────────────────
router.get("/inventory/locations", async (req, res) => {
  try {
    res.json(await inventoryService.getLocations(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/inventory/items", async (req, res) => {
  try {
    res.json(await inventoryService.getItems(req.query));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/inventory/absolute", async (req, res) => {
  try {
    res.json(await inventoryService.setAbsolute(req.body.items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/inventory/relative", async (req, res) => {
  try {
    res.json(await inventoryService.adjustRelative(req.body.items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
