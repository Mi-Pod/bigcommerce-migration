const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { exportOne, exportAll, listTypes } = require("../../scripts/export-metaobjects");

// GET /api/content/metaobjects/types — list all metaobject definition types
router.get("/types", async (req, res) => {
  try {
    const defs = await listTypes();
    res.json({ count: defs.length, types: defs });
  } catch (error) {
    logger.failure("export-metaobjects", "Failed to list types", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/content/metaobjects/one?type={type} — export one sample metaobject
router.get("/one", async (req, res) => {
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: "type query param is required" });
  try {
    const result = await exportOne({ type });
    res.json(result);
  } catch (error) {
    logger.failure("export-metaobjects", "exportOne failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/content/metaobjects/bulk — export all metaobjects
// Body: { type?: string, batch_size?: number, skip?: number, max_batches?: number }
router.post("/bulk", async (req, res) => {
  const { type = null, batch_size = 50, skip = 0, max_batches = 0 } = req.body ?? {};
  try {
    const result = await exportAll({ type, batch_size, skip, max_batches });
    res.json(result);
  } catch (error) {
    logger.failure("export-metaobjects", "exportAll failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
