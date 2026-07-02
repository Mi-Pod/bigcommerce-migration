const fs = require("fs");
const path = require("path");
const { getCount, getPage, advanceCursor } = require("../graphql/products");
const { migrateProduct } = require("./migrate");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

exports.countProducts = async (site) => {
  const count = await getCount(site);
  logger.notice("bulk-migrate", `Shopify product count: ${count}`);
  return { count };
};

exports.importProducts = async (site, { batch_size = 10, skip = 0, max_batches = 0 } = {}) => {
  const reqId = "bulk-migrate";

  logger.notice(reqId, `Starting bulk import — batch_size: ${batch_size}, skip: ${skip}, max_batches: ${max_batches || "∞"}`);

  let cursor = null;
  if (skip > 0) {
    logger.info(reqId, `Advancing cursor past ${skip} products...`);
    cursor = await advanceCursor(site, skip);
    logger.info(reqId, `Cursor advanced — starting from product ${skip + 1}`);
  }

  const results = [];
  let batchNum = 0;
  let hasNextPage = true;
  let totalArchived = 0;

  while (hasNextPage) {
    if (max_batches > 0 && batchNum >= max_batches) {
      logger.info(reqId, `Reached max_batches limit (${max_batches}) — stopping`);
      break;
    }

    batchNum++;
    logger.info(reqId, `Batch ${batchNum}${max_batches ? `/${max_batches}` : ""} — fetching ${batch_size} product IDs...`);

    const page = await getPage(site, batch_size, cursor);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;

    const active = page.nodes.filter((n) => n.status !== "ARCHIVED");
    const skippedArchived = page.nodes.length - active.length;
    totalArchived += skippedArchived;
    if (skippedArchived > 0) logger.info(reqId, `Batch ${batchNum}: skipping ${skippedArchived} archived product(s)`);
    logger.info(reqId, `Batch ${batchNum}: ${active.length} products to migrate`);

    for (const stub of active) {
      logger.info(reqId, `  Migrating: "${stub.title}" (${stub.id})`);
      try {
        const result = await migrateProduct(site, stub.id, { outputJson: false });
        results.push({ status: "success", shopify_id: stub.id, title: stub.title, bc_product_id: result.bc_product_id, action: result.action });
        logger.success(reqId, `  ✓ "${stub.title}" -> bc_id ${result.bc_product_id} (${result.action})`);
      } catch (err) {
        results.push({ status: "failed", shopify_id: stub.id, title: stub.title, error: err.message });
        logger.failure(reqId, `  ✗ "${stub.title}"`, err);
      }
    }
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "failed").length;

  logger.notice(reqId, `Bulk import complete — ${succeeded} succeeded, ${failed} failed, ${totalArchived} archived skipped across ${batchNum} batch(es)`);

  const summary = {
    params: { batch_size, skip, max_batches },
    batches_processed: batchNum,
    total_processed: results.length,
    succeeded,
    failed,
    archived_skipped: totalArchived,
    last_cursor: cursor,
    results,
  };

  if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  const outFile = path.join(MIGRATION_DIR, "bulk-import-results.json");
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  logger.success(reqId, `Results saved → ${outFile}`);

  return summary;
};
