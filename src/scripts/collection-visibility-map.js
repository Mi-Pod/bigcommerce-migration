const fs = require("fs");
const path = require("path");
const { makeRequest } = require("../api/bigcommerce");
const logger = require("../utils/logger");

const MIGRATION_DIR = path.join(__dirname, "../../migration");
const DATA_DIR = path.join(MIGRATION_DIR, "data");

const fetchBcCategories = async (site) => {
  const all = [];
  let page = 1;

  while (true) {
    const res = await makeRequest(site, "GET", "/v3/catalog/categories", {
      params: { limit: 250, page },
    });
    const items = res.data ?? [];
    all.push(...items);
    if (items.length < 250) break;
    page++;
  }

  return all;
};

const norm = (s) => (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");

exports.mapCollectionVisibility = async (site) => {
  const reqId = "collection-visibility-map";

  const collectionsPath = path.join(DATA_DIR, "shopify-collections.json");
  const navMapPath = path.join(DATA_DIR, "nav-collection-map.json");

  if (!fs.existsSync(collectionsPath)) {
    throw new Error("shopify-collections.json missing — run GET /api/migrate/shopify/collections first");
  }
  if (!fs.existsSync(navMapPath)) {
    throw new Error("nav-collection-map.json missing — run GET /api/migrate/shopify/nav-collection-map first");
  }

  const allCollections = JSON.parse(fs.readFileSync(collectionsPath, "utf8"));
  const { items: navItems } = JSON.parse(fs.readFileSync(navMapPath, "utf8"));

  const navCollectionIds = new Set(
    navItems.filter((i) => i.is_collection).map((i) => i.collection.id)
  );

  logger.info(reqId, `${allCollections.length} Shopify collections | ${navCollectionIds.size} appear in nav`);

  logger.info(reqId, "Fetching BC categories...");
  const bcCategories = await fetchBcCategories(site);
  logger.info(reqId, `${bcCategories.length} BC categories found`);

  const bcByName = new Map(bcCategories.map((c) => [norm(c.name), c]));
  const bcByUrl = new Map(
    bcCategories
      .filter((c) => c.custom_url?.url)
      .map((c) => {
        const handle = c.custom_url.url.replace(/^\/|\/$/g, "").split("/").pop();
        return [handle, c];
      })
  );

  const navCollections = [];
  const hiddenCollections = [];

  for (const col of allCollections) {
    const inNav = navCollectionIds.has(col.id);

    let bcMatch =
      bcByName.get(norm(col.title)) ??
      bcByUrl.get(col.handle) ??
      null;

    const expectedVisibility = inNav;
    const currentVisibility = bcMatch?.is_visible ?? null;
    const needsVisibilityUpdate =
      bcMatch !== null && currentVisibility !== expectedVisibility;

    const entry = {
      shopify_id: col.id,
      handle: col.handle,
      title: col.title,
      in_nav: inNav,
      bc_match: bcMatch
        ? {
            id: bcMatch.id,
            name: bcMatch.name,
            is_visible: bcMatch.is_visible,
            url: bcMatch.custom_url?.url ?? null,
          }
        : null,
      expected_visibility: expectedVisibility,
      needs_visibility_update: needsVisibilityUpdate,
    };

    if (inNav) {
      navCollections.push(entry);
    } else {
      hiddenCollections.push(entry);
    }
  }

  const missingFromBc = [...navCollections, ...hiddenCollections].filter(
    (e) => e.bc_match === null
  );
  const visibilityMismatches = [...navCollections, ...hiddenCollections].filter(
    (e) => e.needs_visibility_update
  );

  logger.notice(
    reqId,
    `Nav collections: ${navCollections.length} | Hidden collections: ${hiddenCollections.length} | ` +
      `Missing from BC: ${missingFromBc.length} | Visibility mismatches: ${visibilityMismatches.length}`
  );

  if (visibilityMismatches.length) {
    logger.warning(reqId, "Visibility mismatches (BC needs updating):");
    visibilityMismatches.forEach((e) =>
      logger.trace(
        reqId,
        `  "${e.title}" — BC is_visible=${e.bc_match.is_visible}, expected=${e.expected_visibility} (BC id: ${e.bc_match.id})`
      )
    );
  }

  if (missingFromBc.length) {
    logger.warning(reqId, "Collections with no BC category yet:");
    missingFromBc.forEach((e) =>
      logger.trace(reqId, `  "${e.title}" (${e.handle}) — ${e.in_nav ? "NAV" : "HIDDEN"}`)
    );
  }

  const result = {
    summary: {
      shopify_total: allCollections.length,
      nav_collections: navCollections.length,
      hidden_collections: hiddenCollections.length,
      missing_from_bc: missingFromBc.length,
      visibility_mismatches: visibilityMismatches.length,
    },
    nav_collections: navCollections,
    hidden_collections: hiddenCollections,
  };

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const filepath = path.join(DATA_DIR, "collection-visibility-map.json");
  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  logger.success(reqId, `Saved → ${filepath}`);

  return result;
};
