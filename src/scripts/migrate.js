const shopify = require("../graphql/products");
const { collectMetafields, getProductCollections } = shopify;
const productService = require("../services/bigcommerce/product.service");
const brandService = require("../services/bigcommerce/brand.service");
const categoryService = require("../services/bigcommerce/category.service");
const { makeRequest } = require("../api/bigcommerce");
const CUSTOMER_GROUPS = require("../config/customer-groups");
const logger = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const MIGRATION_DIR = path.join(__dirname, "../../migration");

const saveJson = (filename, data) => {
  if (!fs.existsSync(MIGRATION_DIR)) fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  const filepath = path.join(MIGRATION_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

// ── Helpers ──────────────────────────────────────────────────

// Find or create a Price List by name, then link it to a customer group.
// BC uses Price Lists as the mechanism for per-SKU, per-group fixed pricing.
const findOrCreatePriceList = async (name) => {
  const res = await makeRequest("GET", "/v3/pricelists", { params: { name } });
  const match = res.data?.find((pl) => pl.name === name);
  if (match) return match.id;
  const created = await makeRequest("POST", "/v3/pricelists", {
    data: { name, active: true },
  });
  return created.data.id;
};

const linkPriceListToGroup = async (priceListId, customerGroupId) => {
  const group = await makeRequest("GET", `/v2/customer_groups/${customerGroupId}`);
  if (group.price_list_id === priceListId) return;
  await makeRequest("PUT", `/v2/customer_groups/${customerGroupId}`, {
    data: { price_list_id: priceListId },
  });
};

const setPriceRecord = async (priceListId, sku, price) => {
  await makeRequest("PUT", `/v3/pricelists/${priceListId}/records`, {
    data: [{ sku, currency: "USD", price }],
  });
};

const findOrCreateBrand = async (name) => {
  if (!name) return null;
  const res = await brandService.getList({ name });
  const match = res.data?.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (match) {
    logger.trace("migrate", `Brand found: "${name}" -> id ${match.id}`);
    return match.id;
  }
  const created = await brandService.create({ name });
  logger.success("migrate", `Brand created: "${name}" -> id ${created.data.id}`);
  return created.data.id;
};

// Load collection-visibility-map once and cache for the process lifetime.
// Returns { byId, byHandle } Maps, or null if the file hasn't been generated yet.
let _collectionMap = null;
let _collectionHandleMap = null;
const loadCollectionMap = () => {
  if (_collectionMap) return _collectionMap;
  const mapPath = path.join(MIGRATION_DIR, "data/collection-visibility-map.json");
  if (!fs.existsSync(mapPath)) return null;
  const { nav_collections, hidden_collections } = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const all = [...nav_collections, ...hidden_collections];
  _collectionMap = new Map(all.map((e) => [e.shopify_id, e]));
  _collectionHandleMap = new Map(all.map((e) => [e.handle, e]));
  return _collectionMap;
};

// Replace Shopify /collections/{handle} hrefs in HTML with the matching BC category URL.
// Handles relative prefixes (../../, ../../../../, etc.) and absolute /collections/ paths.
// Falls back to /collections/{handle} for any handle not found in the map.
const COLLECTION_HREF_RE = /href="(?:[^"]*\/)?collections\/([a-z0-9-]+)([^"]*)"/gi;

const rewriteDescriptionUrls = (html, reqId) => {
  if (!html) return html;
  loadCollectionMap(); // ensure handle map is populated
  const overrides = loadOverrides();

  let rewrites = 0;
  const result = html.replace(COLLECTION_HREF_RE, (_, handle, rest) => {
    // Override bc_url takes priority over the map
    const overrideUrl = overrides[handle]?.bc_url;
    if (overrideUrl) {
      rewrites++;
      return `href="${overrideUrl.replace(/\/$/, "")}${rest}"`;
    }

    const entry = _collectionHandleMap?.get(handle);
    const bcUrl = entry?.bc_match?.url;
    if (bcUrl) {
      rewrites++;
      // Strip trailing slash from bcUrl before appending any anchor/query from `rest`
      return `href="${bcUrl.replace(/\/$/, "")}${rest}"`;
    }
    // Not in map — rewrite to a clean absolute path so it at least isn't a broken relative URL
    logger.warning(reqId ?? "migrate", `Description URL not in collection map: /collections/${handle}`);
    return `href="/collections/${handle}${rest}"`;
  });

  if (rewrites > 0) logger.info(reqId ?? "migrate", `Rewrote ${rewrites} collection URL(s) in description`);
  return result;
};

// Load migration/tasks/override.json — keyed by Shopify collection handle.
// Re-read on every call so edits take effect without restarting the server.
const OVERRIDE_FILE = path.join(MIGRATION_DIR, "tasks/override.json");
const loadOverrides = () => {
  if (!fs.existsSync(OVERRIDE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(OVERRIDE_FILE, "utf8")).collections ?? {};
  } catch {
    logger.warning("migrate", "Failed to parse override.json — overrides skipped");
    return {};
  }
};

// Accumulates categories created on-the-fly during this process run (keyed by shopify_id to dedupe).
const _createdCategories = new Map();
const NEW_CATEGORIES_FILE = path.join(MIGRATION_DIR, "data/new-categories.json");

const flushNewCategories = () => {
  if (_createdCategories.size === 0) return;
  const dataDir = path.join(MIGRATION_DIR, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(NEW_CATEGORIES_FILE, JSON.stringify([..._createdCategories.values()], null, 2));
};

// Resolve Shopify collections → BC category IDs.
// Uses collection-visibility-map when available; creates missing categories on the fly
// with is_visible: false (hidden collections never appear in the storefront nav).
const resolveCategories = async (productCollections, reqId) => {
  const collectionMap = loadCollectionMap();
  const overrides = loadOverrides();
  const categoryIds = [];

  for (const col of productCollections) {
    const override = overrides[col.handle];

    // Override: skip — don't assign this collection as a category at all
    if (override?.skip) {
      logger.trace(reqId, `Skipping collection "${col.title}" (override: skip)`);
      continue;
    }

    // Override: explicit bc_id — use it directly, no lookup or create
    if (override?.bc_id != null) {
      logger.trace(reqId, `Using override bc_id ${override.bc_id} for "${col.title}"`);
      categoryIds.push(override.bc_id);
      continue;
    }

    const entry = collectionMap?.get(col.id);

    if (entry?.bc_match) {
      // Override: force is_visible on an already-existing category if specified
      if (override?.is_visible != null && entry.bc_match.is_visible !== override.is_visible) {
        logger.warning(reqId, `Updating visibility for "${col.title}" -> is_visible: ${override.is_visible} (override)`);
        await categoryService.update(entry.bc_match.id, { is_visible: override.is_visible });
      }
      logger.trace(reqId, `Category found: "${col.title}" -> bc_id ${entry.bc_match.id}`);
      categoryIds.push(entry.bc_match.id);
      continue;
    }

    // Already created earlier in this run — reuse without hitting the API again
    if (_createdCategories.has(col.id)) {
      const cached = _createdCategories.get(col.id);
      logger.trace(reqId, `Category reused (created this run): "${col.title}" -> bc_id ${cached.bc_id}`);
      categoryIds.push(cached.bc_id);
      continue;
    }

    // Not in map — create; is_visible override takes priority over map default
    const isVisible = override?.is_visible ?? entry?.in_nav ?? false;
    logger.warning(reqId, `Category missing in BC: "${col.title}" — creating (is_visible: ${isVisible})`);
    const created = await categoryService.create({ name: col.title, parent_id: 0, is_visible: isVisible });
    const newId = created.data.id;
    logger.success(reqId, `Category created: "${col.title}" -> bc_id ${newId}`);
    categoryIds.push(newId);

    const newEntry = {
      shopify_id: col.id,
      handle: col.handle,
      title: col.title,
      bc_id: newId,
      is_visible: isVisible,
    };

    _createdCategories.set(col.id, newEntry);
    flushNewCategories();

    // Patch the in-memory map so subsequent products in the same run reuse this ID
    if (collectionMap) {
      collectionMap.set(col.id, {
        shopify_id: col.id,
        handle: col.handle,
        title: col.title,
        in_nav: isVisible,
        bc_match: { id: newId, name: col.title, is_visible: isVisible },
      });
    }
  }

  return categoryIds;
};

// ── Main ────────────────────────────────────────────────────

exports.migrateProduct = async (shopifyProductId, { outputJson = true } = {}) => {
  const reqId = "migrate";
  logger.notice(reqId, `Starting migration: ${shopifyProductId}`);

  // 1. Fetch from Shopify
  logger.info(reqId, "Fetching product from Shopify...");
  const data = await shopify.getOne(shopifyProductId);
  const p = data?.product;
  if (!p) throw new Error(`Shopify product not found: ${shopifyProductId}`);
  logger.success(reqId, `Fetched: "${p.title}"`);

  const variants = p.variants.edges.map((e) => e.node);
  const images = p.images.edges.map((e) => e.node);
  const metafields = collectMetafields(p);

  // 2. Brand & categories
  logger.info(reqId, `Resolving brand: "${p.vendor}"`);
  const brandId = await findOrCreateBrand(p.vendor);

  logger.info(reqId, `Fetching product collections from Shopify...`);
  const productCollections = await getProductCollections(shopifyProductId);
  logger.info(reqId, `Product is in ${productCollections.length} collection(s): ${productCollections.map((c) => c.title).join(", ") || "none"}`);

  const categoryIds = await resolveCategories(productCollections, reqId);

  // 3. Separate CPG option from physical variants
  const cpgOption = p.options.find((o) => o.position === 1);
  const pricingByGroup = {};
  const bcVariants = [];
  const seenSkus = new Set();

  for (const v of variants) {
    const cpgValue = v.selectedOptions.find((o) => o.name === cpgOption?.name)?.value;
    const physOpts = v.selectedOptions.filter((o) => o.name !== cpgOption?.name);
    const skuBase = physOpts.map((o) => o.value).join("-") || v.sku;

    if (cpgValue) {
      if (!pricingByGroup[cpgValue]) pricingByGroup[cpgValue] = [];
      pricingByGroup[cpgValue].push({ sku: v.sku, price: parseFloat(v.price) });
    }

    if (!seenSkus.has(skuBase)) {
      seenSkus.add(skuBase);
      bcVariants.push({
        sku: v.sku,
        price: 0,
        weight: 1,
        inventory_level: v.inventoryQuantity ?? 0,
        ...(v.image?.url ? { image_url: v.image.url } : {}),
        option_values: physOpts.map((o) => ({
          option_display_name: o.name,
          label: o.value,
        })),
      });
    }
  }

  // 4. Build product payload
  // A product is "simple" when every physical variant has no option_values after
  // stripping the CPG option — i.e. CPG was the only option on the Shopify product.
  // BC rejects variants with empty option_values, so simple products must be sent
  // without a variants array and with sku/inventory at the product level instead.
  const isSimple = bcVariants.length === 1 && bcVariants[0].option_values.length === 0;

  const description = rewriteDescriptionUrls(p.descriptionHtml, reqId);

  const bcPayload = {
    name: p.title,
    type: "physical",
    price: 0,
    weight: 1,
    brand_id: brandId,
    categories: categoryIds,
    description,
    is_visible: p.status === "ACTIVE",
    page_title: p.seo?.title || p.title,
    meta_description: p.seo?.description || "",
    custom_url: { url: `/${p.handle}`, is_customized: true },
    tags: p.tags.join(","),
    images: images.map((img, i) => ({
      image_url: img.url,
      description: img.altText || "",
      is_thumbnail: i === 0,
      sort_order: i,
    })),
    ...(isSimple
      ? {
          sku: bcVariants[0].sku,
          inventory_tracking: "product",
          inventory_level: bcVariants[0].inventory_level,
        }
      : {
          inventory_tracking: "variant",
          variants: bcVariants,
        }),
  };

  // 5. Create product in BC — or find + update if the URL already exists
  logger.info(reqId, `Creating ${isSimple ? "simple" : `${bcVariants.length}-variant`} product in BigCommerce: "${p.title}"`);

  let bcProductId;
  let action = "created";

  try {
    const productRes = await productService.create(bcPayload);
    bcProductId = productRes.data.id;
    logger.success(reqId, `Product created -> bc_id: ${bcProductId}`);
  } catch (createErr) {
    if (!createErr.message.includes("[409]")) throw createErr;

    // Duplicate URL — locate the existing product and update it instead
    logger.warning(reqId, `Duplicate URL — searching for existing product with handle "/${p.handle}"...`);
    const searchRes = await productService.getList({ name: p.title });
    const existing = (searchRes.data ?? []).find((prod) => prod.custom_url?.url === `/${p.handle}`);
    if (!existing) {
      throw new Error(`409 conflict but no existing product found for handle "/${p.handle}". Check BigCommerce manually.`);
    }

    bcProductId = existing.id;
    action = "updated";
    logger.notice(reqId, `Found existing product -> bc_id: ${bcProductId}. Updating...`);

    // Exclude custom_url (already correct, retriggers 409) and images (would duplicate).
    // Variants are not re-synced on update — pricing is idempotent and covers price changes.
    const { custom_url: _url, images: _img, variants: _v, ...updateFields } = bcPayload;
    await productService.update(bcProductId, updateFields);
    logger.success(reqId, `Product updated -> bc_id: ${bcProductId}`);
  }

  // 6. Metafields — POST on create, upsert (GET → PUT/POST) on update to avoid duplicates
  const validMetafields = metafields.filter((m) => m.value !== null);
  if (validMetafields.length) {
    logger.info(reqId, `Writing ${validMetafields.length} metafields...`);

    let existingMfById = {};
    if (action === "updated") {
      const existingMfRes = await makeRequest("GET", `/v3/catalog/products/${bcProductId}/metafields`);
      existingMfById = (existingMfRes.data ?? []).reduce((acc, m) => {
        acc[`${m.namespace}:${m.key}`] = m.id;
        return acc;
      }, {});
    }

    for (const m of validMetafields) {
      const existingId = existingMfById[`${m.namespace}:${m.key}`];
      if (existingId) {
        await makeRequest("PUT", `/v3/catalog/products/${bcProductId}/metafields/${existingId}`, {
          data: { value: m.value },
        });
      } else {
        await makeRequest("POST", `/v3/catalog/products/${bcProductId}/metafields`, {
          data: { namespace: m.namespace, key: m.key, value: m.value, permission_set: "read" },
        });
      }
    }
    logger.success(reqId, "Metafields written");
  }

  // 7. Customer group pricing via Price Lists
  // Each CPG group gets its own Price List. The list is linked to the BC customer
  // group once, then per-SKU price records are upserted for every product.
  const unresolvedGroups = [];
  let pricingGroupsSet = 0;

  for (const [groupName, entries] of Object.entries(pricingByGroup)) {
    const customerGroupId = CUSTOMER_GROUPS[groupName];
    if (customerGroupId == null) {
      unresolvedGroups.push(groupName);
      continue;
    }

    logger.info(reqId, `Price list: "${groupName}"...`);
    const priceListId = await findOrCreatePriceList(groupName);
    await linkPriceListToGroup(priceListId, customerGroupId);

    for (const { sku, price } of entries) {
      await setPriceRecord(priceListId, sku, price);
    }

    pricingGroupsSet++;
  }

  if (unresolvedGroups.length) {
    logger.warning(reqId, `Unresolved CPG groups (not in config): ${unresolvedGroups.join(", ")}`);
  }
  if (pricingGroupsSet) logger.success(reqId, `Pricing set for ${pricingGroupsSet} groups`);

  // 8. Save result
  const result = {
    shopify_id: shopifyProductId,
    bc_product_id: bcProductId,
    action,
    name: p.title,
    brand_id: brandId,
    category_ids: categoryIds,
    collections: productCollections.map((c) => ({ shopify_id: c.id, handle: c.handle, title: c.title })),
    is_simple: isSimple,
    variants_created: isSimple ? 0 : bcVariants.length,
    pricing_groups_set: pricingGroupsSet,
    metafields_written: validMetafields.length,
    unresolved_groups: unresolvedGroups,
  };

  if (outputJson) {
    const filepath = saveJson(`migrated_${bcProductId}.json`, result);
    logger.notice(reqId, `Done -> ${filepath}`);
  } else {
    logger.notice(reqId, "Done (outputJson disabled — no file written)");
  }

  return result;
};
