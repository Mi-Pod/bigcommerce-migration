const fs = require("fs");
const path = require("path");
const { getMenu } = require("../graphql/navigation");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

const KNOWN_MENUS = [
  { handle: "sidebar-menu", role: "Mobile Main Nav",  id: "113748344895" },
  { handle: "dsk-nav-21",   role: "Desktop Main Nav", id: "179918012479" },
];

const EXPECTED_TYPES = new Set(["COLLECTION", "PRODUCT", "PAGE", "BLOG", "HTTP", "FRONTPAGE", "SEARCH"]);

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

exports.extractNav = async (site, handle, { menuId } = {}) => {
  const reqId = "nav-extract";
  logger.notice(reqId, `Fetching Shopify menu: "${handle}"`);

  let gid;
  if (menuId) {
    gid = String(menuId).startsWith("gid://") ? menuId : `gid://shopify/Menu/${menuId}`;
  } else {
    const known = KNOWN_MENUS.find((m) => m.handle === handle);
    if (!known) {
      throw new Error(
        `Unknown menu handle "${handle}". Known handles: ${KNOWN_MENUS.map((m) => m.handle).join(", ")}. Pass ?menuId=<shopify_id> to use a custom handle.`
      );
    }
    gid = `gid://shopify/Menu/${known.id}`;
  }
  const data = await getMenu(site, gid);
  const menu = data?.menu;

  if (!menu) throw new Error(`Menu not found: "${handle}"`);

  const topCount = menu.items.length;
  const nestedCount = menu.items.reduce((sum, item) => sum + (item.items?.length ?? 0), 0);

  logger.success(reqId, `"${menu.title}" — ${topCount} top-level items, ${nestedCount} nested items`);
  menu.items.forEach((item) =>
    logger.trace(reqId, `  [${item.type}] ${item.title}${item.items?.length ? ` (${item.items.length} children)` : ""}`)
  );

  const filepath = saveJson(`nav-${handle}.json`, menu);
  logger.success(reqId, `Saved → ${filepath}`);

  return menu;
};

exports.validateNavs = async (site) => {
  const reqId = "nav-validate";
  logger.notice(reqId, `Validating ${KNOWN_MENUS.length} known menus...`);

  const menus = [];
  const summaries = [];

  for (const { handle, role } of KNOWN_MENUS) {
    logger.info(reqId, `Fetching "${handle}" (${role})...`);

    const menu = await exports.extractNav(site, handle);

    const allItems = [
      ...menu.items,
      ...menu.items.flatMap((item) => item.items ?? []),
    ];

    const typeBreakdown = {};
    for (const item of allItems) {
      typeBreakdown[item.type] = (typeBreakdown[item.type] ?? 0) + 1;
    }

    const httpItems = allItems
      .filter((item) => item.type === "HTTP")
      .map((item) => ({ title: item.title, url: item.url }));

    const unknownTypes = [...new Set(allItems.map((i) => i.type))].filter(
      (t) => !EXPECTED_TYPES.has(t)
    );

    if (httpItems.length > 0) {
      logger.warning(reqId, `"${handle}" has ${httpItems.length} HTTP item(s) — manual review needed`);
      httpItems.forEach((i) => logger.trace(reqId, `  HTTP: "${i.title}" → ${i.url}`));
    }
    if (unknownTypes.length > 0) {
      logger.warning(reqId, `"${handle}" has unexpected item type(s): ${unknownTypes.join(", ")}`);
    }

    menus.push(menu);
    summaries.push({
      handle,
      role,
      title: menu.title,
      shopify_id: menu.id,
      itemCount: menu.items.length,
      nestedCount: menu.items.reduce((sum, item) => sum + (item.items?.length ?? 0), 0),
      totalItems: allItems.length,
      typeBreakdown,
      httpItems,
      unknownTypes,
    });
  }

  const result = { menus, summary: summaries };

  const filepath = saveJson("nav-validation.json", result);
  logger.success(reqId, `Validation complete — saved → ${filepath}`);

  return result;
};
