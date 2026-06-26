const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { exportOne, countArticles, exportAll } = require("../../scripts/export-articles");

// GET /api/content/articles/count — total article count
router.get("/count", async (req, res) => {
  try {
    const result = await countArticles();
    res.json(result);
  } catch (error) {
    logger.failure("export-articles", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/content/articles/one?id={gid} — export one article by GID
router.get("/one", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id query param (GID) is required" });
  try {
    const result = await exportOne({ id });
    res.json(result);
  } catch (error) {
    logger.failure("export-articles", "exportOne failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/content/articles/bulk — export all articles
// Body: { batch_size?: number, skip?: number, max_batches?: number }
router.post("/bulk", async (req, res) => {
  const { batch_size = 50, skip = 0, max_batches = 0 } = req.body ?? {};
  try {
    const result = await exportAll({ batch_size, skip, max_batches });
    res.json(result);
  } catch (error) {
    logger.failure("export-articles", "exportAll failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
