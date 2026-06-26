const fs = require("fs");
const path = require("path");
const { getCount, getPage, getOne } = require("../graphql/shopify/articles");
const logger = require("../utils/logger");

const EXPORTS_DIR = path.join(__dirname, "../../exports/content/blog_posts");
const DATA_DIR = path.join(EXPORTS_DIR, "data");
const CSV_PATH = path.join(EXPORTS_DIR, "index.csv");
const CSV_HEADERS = "id,blog_id,blog_handle,blog_title,title,handle,author,is_published,published_at,updated_at,tags,exported_at\n";

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV_PATH) || fs.readFileSync(CSV_PATH, "utf8").trim() === "") {
    fs.writeFileSync(CSV_PATH, CSV_HEADERS);
  }
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function toCsvRow(node) {
  const exportedAt = new Date().toISOString();
  const fields = [
    node.id,
    node.blog?.id || "",
    node.blog?.handle || "",
    `"${(node.blog?.title || "").replace(/"/g, '""')}"`,
    `"${(node.title || "").replace(/"/g, '""')}"`,
    node.handle,
    `"${(node.author?.name || "").replace(/"/g, '""')}"`,
    node.isPublished,
    node.publishedAt || "",
    node.updatedAt,
    `"${(node.tags || []).join("|")}"`,
    exportedAt,
  ];
  return fields.join(",") + "\n";
}

function saveJson(node) {
  const slug = sanitizeFilename(node.handle || node.id.split("/").pop());
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(node, null, 2));
  return filePath;
}

// Fetch and export a single article by GID.
exports.exportOne = async ({ id }) => {
  if (!id) throw new Error("id is required");
  ensureDirs();
  logger.notice("export-articles", `Fetching article ${id}...`);

  const article = await getOne(id);
  if (!article) throw new Error(`Article not found: ${id}`);
  const filePath = saveJson(article);

  logger.success("export-articles", `Saved → ${filePath}`);
  return { exported: article, filePath };
};

// Count total articles.
exports.countArticles = async () => {
  const count = await getCount();
  logger.notice("export-articles", `Shopify article count: ${count}`);
  return { count };
};

// Bulk export all articles.
//   batch_size  — articles per page (default 50)
//   skip        — number of articles to skip at start
//   max_batches — stop after N batches (0 = no limit)
exports.exportAll = async ({ batch_size = 50, skip = 0, max_batches = 0 } = {}) => {
  ensureDirs();
  const reqId = "export-articles";
  logger.notice(reqId, `Starting bulk export — batch_size: ${batch_size}, skip: ${skip}, max_batches: ${max_batches || "∞"}`);

  let cursor = null;
  let hasNextPage = true;

  // Advance cursor past skip
  if (skip > 0) {
    let remaining = skip;
    while (remaining > 0 && hasNextPage) {
      const take = Math.min(remaining, 250);
      const p = await getPage(take, cursor);
      cursor = p.endCursor;
      hasNextPage = p.hasNextPage;
      remaining -= take;
    }
  }

  let batchNum = 0;
  let totalExported = 0;
  let totalFailed = 0;
  hasNextPage = true;

  while (hasNextPage) {
    if (max_batches > 0 && batchNum >= max_batches) break;
    batchNum++;

    const page = await getPage(batch_size, cursor);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;

    for (const node of page.nodes) {
      try {
        saveJson(node);
        fs.appendFileSync(CSV_PATH, toCsvRow(node));
        totalExported++;
      } catch (err) {
        totalFailed++;
        logger.failure(reqId, `Failed to save ${node.id}`, err);
      }
    }

    logger.info(reqId, `Batch ${batchNum}: exported ${page.nodes.length} articles (total ${totalExported})`);
  }

  const summary = {
    params: { batch_size, skip, max_batches },
    batches_processed: batchNum,
    total_exported: totalExported,
    total_failed: totalFailed,
    last_cursor: cursor,
    csv_path: CSV_PATH,
  };

  logger.notice(reqId, `Bulk export complete — ${totalExported} exported, ${totalFailed} failed. CSV → ${CSV_PATH}`);
  return summary;
};
