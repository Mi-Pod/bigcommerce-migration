const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { extractNav, validateNavs } = require("../../scripts/navigation");
const { composeNav } = require("../../scripts/compose-nav");
const { migrateNavigation, resetNavigation } = require("../../scripts/migrate-navigation");
const { compareNav } = require("../../scripts/compare-nav");

// POST /api/migrate/navigation/migrate — create BC categories from composed-nav.json
// Body: { site: "B2B" }
router.post("/migrate", async (req, res) => {
  const { site } = req.body ?? {};
  try {
    const result = await migrateNavigation(site);
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate-nav", "Nav migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/navigation/reset — delete migrated categories (undo)
// Body: { site: "B2B" }
router.post("/reset", async (req, res) => {
  const { site } = req.body ?? {};
  try {
    const result = await resetNavigation(site);
    res.json(result);
  } catch (error) {
    logger.failure("reset-nav", "Nav reset failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/navigation/compare — diff live BC categories against composed-nav.json
router.get("/compare", async (req, res) => {
  try {
    const result = await compareNav();
    res.json(result);
  } catch (error) {
    logger.failure("nav-compare", "Nav comparison failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/navigation/validate — validate all known menus
router.get("/validate", async (req, res) => {
  const { site } = req.query;
  try {
    const result = await validateNavs(site);
    res.json(result);
  } catch (error) {
    logger.failure("nav-validate", "Nav validation failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/navigation/compose — compose BC category create payload from extracted nav
router.get("/compose", async (req, res) => {
  try {
    const result = await composeNav();
    res.json(result);
  } catch (error) {
    logger.failure("nav-compose", "Nav composition failed", error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migrate/navigation/:handle?site=B2C&menuId=179918012479
// menuId is optional — required only when the handle isn't in KNOWN_MENUS
router.get("/:handle", async (req, res) => {
  const { site, menuId } = req.query;
  try {
    const result = await extractNav(site, req.params.handle, { menuId });
    res.json(result);
  } catch (error) {
    logger.failure("nav-extract", "Nav extraction failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
