const express = require("express");
const router = express.Router();
const brandService = require("../../services/bigcommerce/brand.service");

// ── Brands ───────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const data = await brandService.getList(req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await brandService.getOne(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await brandService.create(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const data = await brandService.update(req.params.id, req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await brandService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
