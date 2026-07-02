const fs = require("fs");
const path = require("path");
const { getMenusPage, getMenu } = require("../graphql/navigation");
const logger = require("../utils/logger");

const EXPORTS_DIR = path.join(__dirname, "../../exports/content/menus");
const DATA_DIR = path.join(EXPORTS_DIR, "data");
const CSV_PATH = path.join(EXPORTS_DIR, "index.csv");
const CSV_HEADERS = "id,title,handle,items_count,exported_at\n";

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV_PATH) || fs.readFileSync(CSV_PATH, "utf8").trim() === "") {
    fs.writeFileSync(CSV_PATH, CSV_HEADERS);
  }
}

function countItems(items = []) {
  return items.reduce((acc, item) => acc + 1 + countItems(item.items), 0);
}

function toCsvRow(node) {
  const exportedAt = new Date().toISOString();
  const fields = [
    node.id,
    `"${(node.title || "").replace(/"/g, '""')}"`,
    node.handle,
    countItems(node.items),
    exportedAt,
  ];
  return fields.join(",") + "\n";
}

function saveJson(node) {
  const filePath = path.join(DATA_DIR, `${node.handle}.json`);
  fs.writeFileSync(filePath, JSON.stringify(node, null, 2));
  return filePath;
}

exports.exportOne = async (site, { id }) => {
  if (!id) throw new Error("id (GID) is required");
  ensureDirs();
  logger.notice("export-menus", `Fetching menu ${id}...`);

  const data = await getMenu(site, id);
  const menu = data.menu;
  if (!menu) throw new Error(`Menu not found: ${id}`);
  const filePath = saveJson(menu);

  logger.success("export-menus", `Saved → ${filePath}`);
  return { exported: menu, filePath };
};

exports.exportAll = async (site) => {
  ensureDirs();
  const reqId = "export-menus";
  logger.notice(reqId, "Fetching all menus...");

  const all = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await getMenusPage(site, 50, cursor);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;
    all.push(...page.nodes);
  }

  let totalExported = 0;
  let totalFailed = 0;

  for (const node of all) {
    try {
      saveJson(node);
      fs.appendFileSync(CSV_PATH, toCsvRow(node));
      totalExported++;
      logger.info(reqId, `  Exported: "${node.title}" (${node.handle})`);
    } catch (err) {
      totalFailed++;
      logger.failure(reqId, `Failed to save menu ${node.id}`, err);
    }
  }

  const summary = {
    total_exported: totalExported,
    total_failed: totalFailed,
    csv_path: CSV_PATH,
  };

  logger.notice(reqId, `Bulk export complete — ${totalExported} menus exported. CSV → ${CSV_PATH}`);
  return summary;
};
