const fs = require("fs");
const path = require("path");
const categoryService = require("../services/bigcommerce/category.service");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

const ensureMigrationDir = () => {
  if (!fs.existsSync(MIGRATION_DIR)) {
    fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  }
};

const saveJson = (filename, data) => {
  ensureMigrationDir();
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

// ── Migrate Navigation ────────────────────────────────────────────
// Reads composed-nav.json, backs up existing BC categories, then
// creates categories in two passes (top-level first, then nested)
// resolving {{_ref}} parent placeholders to real BC IDs.
// Output: migration/nav-backup.json + migration/migrated-navigation.json
exports.migrateNavigation = async () => {
  const reqId = "migrate-nav";

  const composedPath = path.join(MIGRATION_DIR, "composed-nav.json");
  if (!fs.existsSync(composedPath)) {
    throw new Error("composed-nav.json not found — run POST /api/migrate/navigation/compose first");
  }

  const { categories } = JSON.parse(fs.readFileSync(composedPath, "utf8"));
  logger.notice(reqId, `Loaded ${categories.length} categories from composed-nav.json`);

  // Backup existing BC categories before touching anything
  logger.info(reqId, "Backing up existing BC categories...");
  const existing = await categoryService.getList({ limit: 250 });
  const existingCategories = existing.data ?? [];
  saveJson("nav-backup.json", existingCategories);
  logger.info(reqId, `Backed up ${existingCategories.length} existing categories → migration/nav-backup.json`);

  // Pass 1: top-level categories (parent_id === 0)
  const topLevel = categories.filter((c) => c.parent_id === 0);
  const nested = categories.filter((c) => c.parent_id !== 0);

  const refToId = {};
  const created = [];

  logger.notice(reqId, `Pass 1 — creating ${topLevel.length} top-level categories...`);
  for (const cat of topLevel) {
    const result = await categoryService.create({
      name: cat.name,
      parent_id: 0,
      sort_order: cat.sort_order,
      is_visible: cat.is_visible,
    });
    const bcId = result.data.id;
    refToId[cat._ref] = bcId;
    created.push({ _ref: cat._ref, bc_id: bcId, name: cat.name, parent_bc_id: 0 });
    logger.success(reqId, `  "${cat.name}" → BC id: ${bcId}`);
  }

  // Pass 2: nested categories — resolve {{_ref}} to real BC IDs
  logger.notice(reqId, `Pass 2 — creating ${nested.length} nested categories...`);
  for (const cat of nested) {
    const parentRef = cat.parent_id.replace(/\{\{|\}\}/g, "");
    const parentBcId = refToId[parentRef];

    if (!parentBcId) {
      logger.warning(reqId, `  No BC ID for parent ref "{{${parentRef}}}" — skipping "${cat.name}"`);
      continue;
    }

    const result = await categoryService.create({
      name: cat.name,
      parent_id: parentBcId,
      sort_order: cat.sort_order,
      is_visible: cat.is_visible,
    });
    const bcId = result.data.id;
    refToId[cat._ref] = bcId;
    created.push({ _ref: cat._ref, bc_id: bcId, name: cat.name, parent_bc_id: parentBcId });
    logger.success(reqId, `  "${cat.name}" (parent: ${parentBcId}) → BC id: ${bcId}`);
  }

  const output = { migrated_at: new Date().toISOString(), total: created.length, categories: created };
  const filepath = saveJson("migrated-navigation.json", output);
  logger.notice(reqId, `Migration complete — ${created.length} categories created → ${filepath}`);

  return output;
};

// ── Reset Navigation ─────────────────────────────────────────────
// Deletes all categories created by migrateNavigation, in reverse
// order (children before parents). Never deletes categories that
// existed before the migration (guarded by nav-backup.json).
exports.resetNavigation = async () => {
  const reqId = "reset-nav";

  const resultPath = path.join(MIGRATION_DIR, "migrated-navigation.json");
  if (!fs.existsSync(resultPath)) {
    throw new Error("migrated-navigation.json not found — nothing to reset");
  }

  const { categories } = JSON.parse(fs.readFileSync(resultPath, "utf8"));

  const backupPath = path.join(MIGRATION_DIR, "nav-backup.json");
  const preExisting = fs.existsSync(backupPath)
    ? new Set(JSON.parse(fs.readFileSync(backupPath, "utf8")).map((c) => c.id))
    : new Set();

  logger.notice(reqId, `Deleting ${categories.length} categories (children-first)...`);

  const toDelete = [...categories].reverse();
  const deleted = [];
  const skipped = [];

  for (const cat of toDelete) {
    if (preExisting.has(cat.bc_id)) {
      logger.warning(reqId, `  Skipping "${cat.name}" (BC id: ${cat.bc_id}) — existed before migration`);
      skipped.push(cat);
      continue;
    }
    await categoryService.remove(cat.bc_id);
    deleted.push(cat);
    logger.success(reqId, `  Deleted "${cat.name}" (BC id: ${cat.bc_id})`);
  }

  logger.notice(reqId, `Reset complete — ${deleted.length} deleted, ${skipped.length} skipped`);

  return { deleted, skipped };
};
