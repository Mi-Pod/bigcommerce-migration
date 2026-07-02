const fs = require("fs");
const path = require("path");
const { getDefinitions, getCount, getPage, getOne } = require("../graphql/metaobjects");
const logger = require("../utils/logger");

const EXPORTS_DIR = path.join(__dirname, "../../exports/content/metaobjects");
const DATA_DIR = path.join(EXPORTS_DIR, "data");
const CSV_PATH = path.join(EXPORTS_DIR, "index.csv");
const CSV_HEADERS = "id,type,handle,display_name,fields_count,updated_at,exported_at\n";

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CSV_PATH) || fs.readFileSync(CSV_PATH, "utf8").trim() === "") {
    fs.writeFileSync(CSV_PATH, CSV_HEADERS);
  }
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function toCsvRow(obj) {
  const exportedAt = new Date().toISOString();
  const fields = [
    obj.id,
    obj.type,
    obj.handle,
    `"${(obj.displayName || "").replace(/"/g, '""')}"`,
    (obj.fields || []).length,
    obj.updatedAt,
    exportedAt,
  ];
  return fields.join(",") + "\n";
}

function saveJson(obj) {
  const slug = sanitizeFilename(obj.handle || obj.id.split("/").pop());
  const filePath = path.join(DATA_DIR, `${slug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
  return filePath;
}

exports.exportOne = async (site, { type }) => {
  if (!type) throw new Error("type is required");
  ensureDirs();
  logger.notice("export-metaobjects", `Fetching one metaobject of type "${type}"...`);

  const page = await getPage(site, type, 1);
  if (!page.nodes.length) throw new Error(`No metaobjects found for type "${type}"`);

  const obj = page.nodes[0];
  const full = await getOne(site, obj.id);
  const filePath = saveJson(full);

  logger.success("export-metaobjects", `Saved → ${filePath}`);
  return { exported: full, filePath };
};

exports.listTypes = async (site) => {
  const defs = await getDefinitions(site);
  logger.notice("export-metaobjects", `Found ${defs.length} metaobject type(s): ${defs.map((d) => d.type).join(", ")}`);
  return defs;
};

exports.exportAll = async (site, { type = null, batch_size = 50, skip = 0, max_batches = 0 } = {}) => {
  ensureDirs();
  const reqId = "export-metaobjects";

  const types = type ? [type] : (await getDefinitions(site)).map((d) => d.type);
  logger.notice(reqId, `Exporting ${types.length} type(s): ${types.join(", ")}`);

  const summary = { params: { type, batch_size, skip, max_batches }, types: {} };

  for (const t of types) {
    logger.info(reqId, `Type "${t}" — starting export`);
    let cursor = null;
    let batchNum = 0;
    let hasNextPage = true;
    let typeExported = 0;
    let typeFailed = 0;

    if (skip > 0) {
      let remaining = skip;
      while (remaining > 0 && hasNextPage) {
        const take = Math.min(remaining, 250);
        const p = await getPage(site, t, take, cursor);
        cursor = p.endCursor;
        hasNextPage = p.hasNextPage;
        remaining -= take;
      }
    }

    hasNextPage = true;

    while (hasNextPage) {
      if (max_batches > 0 && batchNum >= max_batches) break;
      batchNum++;

      const page = await getPage(site, t, batch_size, cursor);
      cursor = page.endCursor;
      hasNextPage = page.hasNextPage;

      for (const node of page.nodes) {
        try {
          saveJson(node);
          fs.appendFileSync(CSV_PATH, toCsvRow(node));
          typeExported++;
        } catch (err) {
          typeFailed++;
          logger.failure(reqId, `Failed to save ${node.id}`, err);
        }
      }

      logger.info(reqId, `Type "${t}" batch ${batchNum}: exported ${page.nodes.length} (total ${typeExported})`);
    }

    summary.types[t] = { exported: typeExported, failed: typeFailed, batches: batchNum };
    logger.success(reqId, `Type "${t}" complete — ${typeExported} exported`);
  }

  summary.csv_path = CSV_PATH;
  logger.notice(reqId, `Bulk export complete. CSV → ${CSV_PATH}`);
  return summary;
};
