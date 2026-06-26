const express = require("express");
const router = express.Router();
const customerGroupService = require("../../services/bigcommerce/customer-group.service");

// ── Customer Groups ──────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const data = await customerGroupService.getList(req.query);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const data = await customerGroupService.getOne(req.params.id);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await customerGroupService.create(req.body);
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const data = await customerGroupService.update(req.params.id, req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await customerGroupService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
