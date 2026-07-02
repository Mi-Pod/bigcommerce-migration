const fs = require("fs");
const path = require("path");
const { getCount, getPage, getOne } = require("../graphql/pages");
const logger = require("../utils/logger");

const EXPORTS_DIR = path.join(__dirname, "../../exports/content/pages");
const DATA_DIR = path.join(EXPORTS_DIR, "data");
const CSV_PATH = path.join(EXPORTS_DIR, "index.csv");
const CSV_HEADERS = "id,title,handle,is_published,published_at,updated_at,template_suffix,exported_at\n";

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
    `"${(node.title || "").replace(/"/g, '""')}"`,
    node.handle,
    node.isPublished,
    node.publishedAt || "",
    node.updatedAt,
    node.templateSuffix || "",
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

exports.exportOne = async (site, { id }) => {
  if (!id) throw new Error("id is required");
  ensureDirs();
  logger.notice("export-pages", `Fetching page ${id}...`);

  const page = await getOne(site, id);
  if (!page) throw new Error(`Page not found: ${id}`);
  const filePath = saveJson(page);

  logger.success("export-pages", `Saved → ${filePath}`);
  return { exported: page, filePath };
};

exports.countPages = async (site) => {
  const count = await getCount(site);
  logger.notice("export-pages", `Shopify page count: ${count}`);
  return { count };
};

exports.exportAll = async (site, { batch_size = 50, skip = 0, max_batches = 0 } = {}) => {
  ensureDirs();
  const reqId = "export-pages";
  logger.notice(reqId, `Starting bulk export — batch_size: ${batch_size}, skip: ${skip}, max_batches: ${max_batches || "∞"}`);

  let cursor = null;
  let hasNextPage = true;

  if (skip > 0) {
    let remaining = skip;
    while (remaining > 0 && hasNextPage) {
      const take = Math.min(remaining, 250);
      const p = await getPage(site, take, cursor);
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

    const pg = await getPage(site, batch_size, cursor);
    cursor = pg.endCursor;
    hasNextPage = pg.hasNextPage;

    for (const node of pg.nodes) {
      try {
        saveJson(node);
        fs.appendFileSync(CSV_PATH, toCsvRow(node));
        totalExported++;
      } catch (err) {
        totalFailed++;
        logger.failure(reqId, `Failed to save ${node.id}`, err);
      }
    }

    logger.info(reqId, `Batch ${batchNum}: exported ${pg.nodes.length} pages (total ${totalExported})`);
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
