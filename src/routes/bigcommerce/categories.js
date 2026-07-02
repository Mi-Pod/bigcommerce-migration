const express = require("express");
const router = express.Router();
const { categories } = require("@mipod/bigcommerce");

// ── Categories ───────────────────────────────────────────────
router.get("/", async (req, res) => {
  const { site, ...params } = req.query;
  try {
    const data = await categories.getList(site, params);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  const { site } = req.query;
  try {
    const data = await categories.getOne(site, req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  const { site, ...body } = req.body;
  try {
    const data = await categories.create(site, body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  const { site, ...body } = req.body;
  try {
    const data = await categories.update(site, req.params.id, body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  const { site } = req.query;
  try {
    await categories.remove(site, req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
