const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { exportOne, exportAll } = require("../../scripts/export-menus");

// GET /api/content/menus/one?site={site}&id={gid} — export one menu by GID
router.get("/one", async (req, res) => {
  const { site, id } = req.query;
  if (!id) return res.status(400).json({ error: "id query param (GID) is required" });
  try {
    const result = await exportOne(site, { id });
    res.json(result);
  } catch (error) {
    logger.failure("export-menus", "exportOne failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/content/menus/bulk — export all menus
// Body: { site: "B2B" }
router.post("/bulk", async (req, res) => {
  const { site } = req.body ?? {};
  try {
    const result = await exportAll(site);
    res.json(result);
  } catch (error) {
    logger.failure("export-menus", "exportAll failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
