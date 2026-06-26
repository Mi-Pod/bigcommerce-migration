const express = require("express");
const router = express.Router();

const categoryService = require("../../services/bigcommerce/category.service");

// ── Categories ───────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const data = await categoryService.getList(req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await categoryService.getOne(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await categoryService.create(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const data = await categoryService.update(req.params.id, req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await categoryService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
