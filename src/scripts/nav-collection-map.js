const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");
const DATA_DIR = path.join(MIGRATION_DIR, "data");

// Recursively flatten a menu's items into a plain array with depth + menu label.
const flattenItems = (items, menuHandle, depth = 1, parent = null) => {
  const result = [];
  for (const item of items) {
    result.push({ menu: menuHandle, depth, parent_title: parent, ...item });
    if (item.items?.length) {
      result.push(...flattenItems(item.items, menuHandle, depth + 1, item.title));
    }
  }
  return result;
};

// Extract collection handle from a Shopify /collections/{handle} URL.
const handleFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/^\/collections\/([^/?#]+)/);
  return match ? match[1] : null;
};

exports.mapNavCollections = async () => {
  const reqId = "nav-collection-map";

  // Load nav files
  const dskPath = path.join(MIGRATION_DIR, "nav-dsk-nav-21.json");
  const sidePath = path.join(MIGRATION_DIR, "nav-sidebar-menu.json");
  const collectionsPath = path.join(DATA_DIR, "shopify-collections.json");

  if (!fs.existsSync(dskPath) || !fs.existsSync(sidePath)) {
    throw new Error("Nav JSON files missing — run GET /api/migrate/navigation/validate first");
  }
  if (!fs.existsSync(collectionsPath)) {
    throw new Error("shopify-collections.json missing — run GET /api/migrate/shopify/collections first");
  }

  const dskMenu = JSON.parse(fs.readFileSync(dskPath, "utf8"));
  const sideMenu = JSON.parse(fs.readFileSync(sidePath, "utf8"));
  const collections = JSON.parse(fs.readFileSync(collectionsPath, "utf8"));

  // Build lookup maps
  const byId = new Map(collections.map((c) => [c.id, c]));
  const byHandle = new Map(collections.map((c) => [c.handle, c]));

  // Flatten all items from both menus
  const allItems = [
    ...flattenItems(dskMenu.items, "dsk-nav-21"),
    ...flattenItems(sideMenu.items, "sidebar-menu"),
  ];

  logger.info(reqId, `Mapping ${allItems.length} nav items against ${collections.length} collections`);

  const mapped = allItems.map((item) => {
    let collection = null;

    if (item.type === "COLLECTION" && item.resourceId) {
      collection = byId.get(item.resourceId) ?? null;
    } else if (item.type === "HTTP") {
      const handle = handleFromUrl(item.url);
      if (handle) collection = byHandle.get(handle) ?? null;
    }

    return {
      menu: item.menu,
      depth: item.depth,
      parent_title: item.parent_title ?? null,
      title: item.title,
      type: item.type,
      url: item.url ?? null,
      resourceId: item.resourceId ?? null,
      is_collection: collection !== null,
      collection: collection
        ? { id: collection.id, handle: collection.handle, title: collection.title }
        : null,
    };
  });

  // Summary stats
  const isCollection = mapped.filter((i) => i.is_collection);
  const notCollection = mapped.filter((i) => !i.is_collection);

  logger.notice(
    reqId,
    `${mapped.length} total nav items | ${isCollection.length} matched to collections | ${notCollection.length} unmatched`
  );

  if (notCollection.length) {
    logger.info(reqId, "Unmatched nav items:");
    notCollection.forEach((i) =>
      logger.trace(reqId, `  [${i.menu} depth:${i.depth}] "${i.title}" (${i.type}) ${i.url ?? ""}`)
    );
  }

  const result = {
    summary: {
      total: mapped.length,
      matched_collections: isCollection.length,
      unmatched: notCollection.length,
    },
    items: mapped,
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const filepath = path.join(DATA_DIR, "nav-collection-map.json");
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  logger.success(reqId, `Saved → ${filepath}`);

  return result;
};
