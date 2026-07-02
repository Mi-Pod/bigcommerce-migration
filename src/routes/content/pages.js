const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { exportOne, countPages, exportAll } = require("../../scripts/export-pages");

// GET /api/content/pages/count — total page count
router.get("/count", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await countPages(site);
    res.json(result);
  } catch (error) {
    logger.failure("export-pages", "Count failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/content/pages/one?site={site}&id={gid} — export one page by GID
router.get("/one", async (req, res) => {
  const { site, id } = req.query;
  if (!id) return res.status(400).json({ error: "id query param (GID) is required" });
  try {
    const result = await exportOne(site, { id });
    res.json(result);
  } catch (error) {
    logger.failure("export-pages", "exportOne failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/content/pages/bulk — export all pages
// Body: { site: "B2B", batch_size?: number, skip?: number, max_batches?: number }
router.post("/bulk", async (req, res) => {
  const { site, batch_size = 50, skip = 0, max_batches = 0 } = req.body ?? {};
  try {
    const result = await exportAll(site, { batch_size, skip, max_batches });
    res.json(result);
  } catch (error) {
    logger.failure("export-pages", "exportAll failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
