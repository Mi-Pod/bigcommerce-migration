require("dotenv").config();
const { importProducts, countProducts } = require("../scripts/bulk-migrate");
const logger = require("../utils/logger");

const [, , batchSizeArg, maxBatchesArg, skipArg] = process.argv;

const batch_size = parseInt(batchSizeArg, 10) || 10;
const max_batches = parseInt(maxBatchesArg, 10) || 0;
const skip = parseInt(skipArg, 10) || 0;

(async () => {
  try {
    const { count } = await countProducts();
    const willProcess = max_batches > 0 ? Math.min(max_batches * batch_size, count - skip) : count - skip;
    logger.notice("cli", `Total Shopify products: ${count}`);
    logger.notice("cli", `Config — batch_size: ${batch_size}, max_batches: ${max_batches || "∞"}, skip: ${skip}`);
    logger.notice("cli", `Estimated products to process: ~${willProcess}`);

    const result = await importProducts({ batch_size, max_batches, skip });

    logger.notice("cli", "── Summary ──────────────────────────────");
    logger.notice("cli", `  Batches processed : ${result.batches_processed}`);
    logger.notice("cli", `  Total processed   : ${result.total_processed}`);
    logger.success("cli", `  Succeeded         : ${result.succeeded}`);
    if (result.failed > 0) {
      logger.failure("cli", `  Failed            : ${result.failed}`);
      logger.warning("cli", "Failed products:");
      result.results
        .filter((r) => r.status === "failed")
        .forEach((r) => logger.warning("cli", `    "${r.title}" — ${r.error}`));
    }
    logger.notice("cli", `  Results saved     : migration/bulk-import-results.json`);
    if (result.last_cursor) {
      logger.notice("cli", `  Resume with skip  : ${skip + result.total_processed}`);
    }

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (err) {
    logger.failure("cli", "Migration failed", err);
    process.exit(1);
  }
})();
