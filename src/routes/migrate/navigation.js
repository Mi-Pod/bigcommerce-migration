const express = require("express");
const router = express.Router();
const logger = require("../../utils/logger");
const { extractNav, validateNavs } = require("../../scripts/navigation");
const { composeNav } = require("../../scripts/compose-nav");
const { migrateNavigation, resetNavigation } = require("../../scripts/migrate-navigation");
const { compareNav } = require("../../scripts/compare-nav");

// POST /api/migrate/navigation/migrate — create BC categories from composed-nav.json
router.post("/migrate", async (req, res) => {
  try {
    const result = await migrateNavigation();
    res.status(201).json(result);
  } catch (error) {
    logger.failure("migrate-nav", "Nav migration failed", error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/migrate/navigation/reset — delete migrated categories (undo)
router.post("/reset", async (req, res) => {
  try {
    const result = await resetNavigation();
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

// GET /api/migrate/navigation/validate — validate all known menus (sidebar-menu + dsk-nav-21)
router.get("/validate", async (req, res) => {
  try {
    const result = await validateNavs();
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

// GET /api/migrate/navigation/:handle — fetch a single Shopify menu by handle
router.get("/:handle", async (req, res) => {
  try {
    const result = await extractNav(req.params.handle);
    res.json(result);
  } catch (error) {
    logger.failure("nav-extract", "Nav extraction failed", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
